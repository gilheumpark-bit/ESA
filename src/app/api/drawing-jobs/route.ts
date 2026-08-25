/**
 * POST /api/drawing-jobs — full-document analysis job (multi-page).
 * Does not store original file bytes in the response (AC-14).
 */

import { createHash, randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit';
import { getFormFile } from '@/lib/api';
import { isRequestOriginAllowed } from '@/lib/request-origin';
import { runDocumentAnalysis } from '@/agent/drawing/document-orchestrator';
import { readSymbolLibraryPart } from '@/lib/symbol-library-form';
import { cancelOwnedJob, createJob, getOwnedJob, isDrawingJobStoreAvailable, updateOwnedJob } from '@/agent/drawing/drawing-job-store';
import { createSourceLease, isSourceLeaseAvailable, releaseSourceLease } from '@/agent/drawing/source-lease-store';
import { applyDrawingOwnerCookie, resolveDrawingOwner } from '@/agent/drawing/drawing-api-owner';
import { enumerateDrawingPageCount } from '@/agent/drawing/drawing-source';
import { withRequestLog } from '@/lib/api/with-request-log';
import {
  DrawingVisionRequestError,
  resolveDrawingVisionRequest,
} from '@/lib/drawing-vision-request';
import { drawingDocumentDeadlineMs } from '@/lib/drawing-reasoning-effort';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 600;

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const DEFAULT_VISION_CALL_BUDGET_PER_PAGE = 110;

function allowedDrawing(file: File): 'image' | 'pdf' | 'dxf' | null {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp'].includes(extension ?? '')
    && ['image/png', 'image/jpeg', 'image/webp', ''].includes(file.type)) return 'image';
  if (extension === 'pdf' && ['application/pdf', ''].includes(file.type)) return 'pdf';
  if (extension === 'dxf' && ['', 'application/dxf', 'image/vnd.dxf', 'application/octet-stream', 'text/plain'].includes(file.type)) return 'dxf';
  return null;
}

function parseRequestedPages(value: FormDataEntryValue | null): 'all' | number[] | null {
  if (value === null || value === 'all') return 'all';
  if (typeof value !== 'string' || !/^\d+(?:\s*,\s*\d+)*$/.test(value.trim())) return null;
  const pages = [...new Set(value.split(',').map((part) => Number(part.trim()) - 1))];
  return pages.length > 0 && pages.length <= 500 && pages.every((page) => Number.isSafeInteger(page) && page >= 0)
    ? pages
    : null;
}

function userError(message: string, status = 400) {
  return privateJson({ success: false, error: { message } }, { status });
}

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store');
  return NextResponse.json(body, { ...init, headers });
}

function hasValidDrawingSignature(kind: 'image' | 'pdf' | 'dxf', bytes: ArrayBuffer, fileName: string): boolean {
  const view = new Uint8Array(bytes);
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (kind === 'pdf') return view.length >= 5 && Buffer.from(view.subarray(0, 5)).toString('ascii') === '%PDF-';
  if (kind === 'image') {
    if (extension === 'png') return view.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => view[index] === byte);
    if (extension === 'jpg' || extension === 'jpeg') return view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff;
    if (extension === 'webp') return view.length >= 12
      && Buffer.from(view.subarray(0, 4)).toString('ascii') === 'RIFF'
      && Buffer.from(view.subarray(8, 12)).toString('ascii') === 'WEBP';
    return false;
  }
  const header = Buffer.from(view.subarray(0, Math.min(view.length, 4096))).toString('latin1');
  return header.startsWith('AutoCAD Binary DXF') || /(?:^|\r?\n)\s*0\s*\r?\n\s*SECTION(?:\r?\n|$)/i.test(header);
}

async function POST__impl(req: NextRequest) {
  if (!isRequestOriginAllowed(
    req.headers.get('origin'),
    req.url,
    undefined,
    req.headers.get('host'),
    req.headers.get('x-forwarded-proto'),
  )) {
    return privateJson({ success: false, error: { message: 'Invalid origin' } }, { status: 403 });
  }
  const blocked = applyRateLimit(req, 'sld');
  if (blocked) return blocked;

  try {
    const owner = await resolveDrawingOwner(req, true);
    if (!owner) return userError('작업 세션을 만들 수 없습니다.', 401);
    // multipart 가 아닌 본문(JSON 등)은 호출자 잘못이다. formData() 가
    // 던지게 두면 바깥 catch 가 500 으로 뭉갠다 — pdf-drawing 과 같은 규범.
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return privateJson(
        { success: false, error: { message: '요청 본문을 읽지 못했습니다 — multipart/form-data(file 필드에 도면 파일)인지 확인하세요.' } },
        { status: 400 },
      );
    }
    const filePart = getFormFile(form, 'file');
    if (!filePart.ok) {
      return privateJson({ success: false, error: { message: filePart.message } }, { status: 400 });
    }
    const file = filePart.file;
    if (!file) {
      return privateJson({ success: false, error: { message: 'file required' } }, { status: 400 });
    }
    const drawingKind = allowedDrawing(file);
    if (!drawingKind) return userError('PNG, JPG, WEBP, PDF 또는 DXF 도면만 분석할 수 있습니다.');
    const byteLimit = drawingKind === 'image' ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
    if (file.size > byteLimit) return userError(`도면 파일이 너무 큽니다. 최대 ${byteLimit / 1024 / 1024}MB입니다.`);

    const bytes = await file.arrayBuffer();
    if (!hasValidDrawingSignature(drawingKind, bytes, file.name)) {
      return userError('파일 확장자와 실제 도면 형식이 일치하지 않습니다. 원본 파일을 확인해주세요.');
    }
    const requestedPages = parseRequestedPages(form.get('pages'));
    if (!requestedPages) return userError('페이지는 all 또는 1,2,3 형식으로 입력해야 합니다.');

    const maxVlmCallsEntry = form.get('maxVlmCalls');
    const hasExplicitVlmBudget = maxVlmCallsEntry !== null && String(maxVlmCallsEntry).trim() !== '';
    const maxVlmCalls = Number(hasExplicitVlmBudget ? maxVlmCallsEntry : 120);
    if (!Number.isSafeInteger(maxVlmCalls) || maxVlmCalls < 0 || maxVlmCalls > 10_000) {
      return userError('AI 호출 예산은 0~10000 사이의 정수여야 합니다.');
    }
    const budget = {
      maxPages: 50,
      maxVlmCalls,
      maxPixels: 40_000_000,
      deadlineMs: drawingDocumentDeadlineMs(
        String(form.get('provider') ?? 'gemini'),
        String(form.get('effort') ?? ''),
      ),
    };
    if (!isDrawingJobStoreAvailable()) {
      return userError('지속형 작업 저장소가 설정되지 않아 도면 분석 작업을 시작할 수 없습니다.', 503);
    }
    // 고객사 심볼 라이브러리(선택) — deferred 분기가 아래에서 조기 반환하므로
    // 그 이전에 읽는다. 뒤에서 읽으면 로그인(deferred) 사용자의 라이브러리가
    // 조용히 증발한다. 무효면 400.
    const libraryRead = await readSymbolLibraryPart(form.get('symbolLibrary'));
    if (!libraryRead.ok) {
      return userError(libraryRead.message, 400);
    }
    if (form.get('deferred') === '1') {
      if (!owner.authenticated) {
        return userError('취소·재개용 도면 보관은 로그인이 필요합니다.', 401);
      }
      if (!isSourceLeaseAvailable()) return userError('암호화 원본 임시 보관소가 설정되지 않아 취소·재개 작업을 시작할 수 없습니다.', 503);
      let availablePages: number;
      try {
        availablePages = await enumerateDrawingPageCount({
          bytes,
          mimeType: file.type || 'application/octet-stream',
          fileName: file.name,
          signal: req.signal,
          budget: { maxPages: 500, maxPixels: 1, deadlineMs: 30_000 },
        });
      } catch {
        return userError('도면의 페이지 구조를 읽을 수 없습니다. 원본 파일을 확인해주세요.');
      }
      if (requestedPages !== 'all' && requestedPages.some((page) => page >= availablePages)) {
        return userError(`요청 페이지가 도면 범위를 벗어났습니다. 전체 ${availablePages}페이지입니다.`);
      }
      const estimatedPages = requestedPages === 'all' ? availablePages : requestedPages.length;
      // A clean page needs the four independent readers, triple text read,
      // precision grids, and the post-review coverage audit (19 calls at 2x2).
      // Page, pixel, and deadline caps must also grow with the enumerated source;
      // otherwise an 83-page teaching document is accepted as "all" but is
      // structurally stopped at page 50 before analysis starts.
      const deferredBudget = {
        ...budget,
        maxPages: Math.min(500, Math.max(budget.maxPages, estimatedPages)),
        maxVlmCalls: hasExplicitVlmBudget
          ? budget.maxVlmCalls
          : Math.min(10_000, Math.max(120, estimatedPages * DEFAULT_VISION_CALL_BUDGET_PER_PAGE)),
        maxPixels: Math.min(1_000_000_000, Math.max(budget.maxPixels, estimatedPages * 6_000_000)),
        deadlineMs: Math.min(3_600_000, Math.max(budget.deadlineMs, estimatedPages * 60_000)),
      };
      const documentHash = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
      const job = createJob({
        documentHash,
        ownerId: owner.ownerId,
        budget: deferredBudget,
        estimatedPages,
      });
      const created = createSourceLease(bytes, documentHash, owner.ownerId);
      if ('error' in created) return userError('암호화 원본 임시 보관소가 준비되지 않았습니다.', 503);
      updateOwnedJob(job.jobId, owner.ownerId, {
        sourceLease: { leaseId: created.leaseId, expiresAt: created.expiresAt },
        sourceMetadata: {
          mimeType: file.type || 'application/octet-stream',
          fileName: file.name,
          requestedPages,
          ...(libraryRead.library ? { symbolLibrary: libraryRead.library } : {}),
        },
      });
      const response = privateJson({
        success: true,
        data: { jobId: job.jobId, status: job.status, estimated: job.estimated, lease: { expiresAt: created.expiresAt } },
      }, { status: 202 });
      applyDrawingOwnerCookie(response, owner);
      return response;
    }
    if (form.get('leaseSource') === '1' && !owner.authenticated) {
      return userError('취소·재개용 도면 보관은 로그인이 필요합니다.', 401);
    }
    // 벡터 전용(무 AI) 실행 — DXF·벡터 PDF 는 파서·토폴로지·KEC 검토가 전부
    // 기하 연산이라 VLM 없이 성립한다. 오케스트레이터도 vision 부재를 설계로
    // 지원한다(runVectorPass 가 커버리지를 소유). 익명 무키 사용자를 여기서
    // 401 로 막을 이유가 없다 — VLM 비용이 0 인 실행이다. 이미지에는 열지
    // 않는다: 픽셀은 AI 없이 읽을 수 없고, 그런 척은 §2.10 위반이다.
    const vectorOnly = form.get('vectorOnly') === '1';
    if (vectorOnly && allowedDrawing(file) === 'image') {
      return userError('vectorOnly 는 DXF·PDF 전용입니다 — 이미지 분석에는 AI 연결이 필요합니다.', 400);
    }
    let vision;
    try {
      vision = vectorOnly ? undefined : await resolveDrawingVisionRequest(form, req, owner.authenticated);
    } catch (error) {
      if (error instanceof DrawingVisionRequestError) {
        return userError(error.message, error.status);
      }
      throw error;
    }

    const { job, document } = await runDocumentAnalysis({
      bytes,
      mimeType: file.type || 'application/octet-stream',
      fileName: file.name,
      requestedPages,
      budget,
      vision,
      ownerId: owner.ownerId,
      signal: req.signal,
      ...(libraryRead.library ? { symbolLibrary: libraryRead.library } : {}),
    });
    updateOwnedJob(job.jobId, owner.ownerId, {
      sourceMetadata: {
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name,
        requestedPages,
        ...(libraryRead.library ? { symbolLibrary: libraryRead.library } : {}),
      },
    });

    let lease: { expiresAt: number } | { unavailable: true } | undefined;
    if (form.get('leaseSource') === '1' && document.jobStatus === 'PARTIAL') {
      if (!isSourceLeaseAvailable()) {
        lease = { unavailable: true };
      } else {
        const created = createSourceLease(bytes, document.documentHash, owner.ownerId);
        if ('error' in created) lease = { unavailable: true };
        else {
          updateOwnedJob(job.jobId, owner.ownerId, { sourceLease: { leaseId: created.leaseId, expiresAt: created.expiresAt } });
          lease = { expiresAt: created.expiresAt };
        }
      }
    }

    const response = privateJson({
      success: true,
      data: {
        jobId: job.jobId,
        status: job.status,
        estimated: job.estimated,
        document, // V3 report only — no file bytes
        lease,
        resumeAvailable: document.jobStatus === 'PARTIAL' && Boolean(lease && !('unavailable' in lease)),
      },
    });
    applyDrawingOwnerCookie(response, owner);
    return response;
  } catch (err) {
    const reference = randomUUID();
    console.error('[drawing-jobs]', { reference, errorType: err instanceof Error ? err.name : 'UnknownError' });
    return privateJson({ success: false, error: { message: '도면 분석을 완료하지 못했습니다.', reference } }, { status: 500 });
  }
}

async function GET__impl(req: NextRequest) {
  const blocked = applyRateLimit(req, 'sld-job');
  if (blocked) return blocked;
  const owner = await resolveDrawingOwner(req, false);
  if (!owner) return userError('작업 세션이 만료되었습니다.', 401);
  if (!isDrawingJobStoreAvailable()) return userError('지속형 작업 저장소가 설정되지 않아 작업을 조회할 수 없습니다.', 503);
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return privateJson({ success: false, error: { message: 'jobId required' } }, { status: 400 });
  }
  const job = getOwnedJob(jobId, owner.ownerId);
  if (!job) {
    return privateJson({ success: false, error: { message: 'not found' } }, { status: 404 });
  }
  return privateJson({
    success: true,
    data: {
      jobId: job.jobId,
      status: job.status,
      estimated: job.estimated,
      document: job.document,
      vlmCallsUsed: job.vlmCallsUsed,
      // never source bytes
    },
  });
}

async function DELETE__impl(req: NextRequest) {
  if (!isRequestOriginAllowed(req.headers.get('origin'), req.url, undefined, req.headers.get('host'), req.headers.get('x-forwarded-proto'))) {
    return userError('Invalid origin', 403);
  }
  const blocked = applyRateLimit(req, 'sld');
  if (blocked) return blocked;
  const owner = await resolveDrawingOwner(req, false);
  if (!owner) return userError('작업 세션이 만료되었습니다.', 401);
  if (!isDrawingJobStoreAvailable()) return userError('지속형 작업 저장소가 설정되지 않아 작업을 취소할 수 없습니다.', 503);
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return userError('jobId required');
  const job = getOwnedJob(jobId, owner.ownerId);
  if (!job || !cancelOwnedJob(jobId, owner.ownerId)) return userError('not found', 404);
  if (job.sourceLease) releaseSourceLease(job.sourceLease.leaseId, owner.ownerId);
  updateOwnedJob(jobId, owner.ownerId, { sourceLease: undefined });
  return privateJson({ success: true, data: { status: 'CANCELLED' } });
}

export const GET = withRequestLog(GET__impl);
export const POST = withRequestLog(POST__impl);
export const DELETE = withRequestLog(DELETE__impl);
