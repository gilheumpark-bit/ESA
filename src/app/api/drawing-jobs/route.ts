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
import { cancelOwnedJob, createJob, getOwnedJob, isDrawingJobStoreAvailable, updateOwnedJob } from '@/agent/drawing/drawing-job-store';
import { createSourceLease, isSourceLeaseAvailable, releaseSourceLease } from '@/agent/drawing/source-lease-store';
import { applyDrawingOwnerCookie, resolveDrawingOwner } from '@/agent/drawing/drawing-api-owner';
import { enumerateDrawingPageCount } from '@/agent/drawing/drawing-source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const DEFAULT_VISION_CALL_BUDGET_PER_PAGE = 110;
const VISION_PROVIDERS = new Set(['gemini', 'openai', 'claude'] as const);
const MODEL_PATTERN = /^[a-zA-Z0-9._:/-]{1,128}$/;
type VisionProvider = 'gemini' | 'openai' | 'claude';

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

function serverVisionKey(provider: VisionProvider): string {
  if (provider === 'openai') return process.env.OPENAI_API_KEY?.trim() ?? '';
  if (provider === 'claude') return process.env.ANTHROPIC_API_KEY?.trim() ?? '';
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ?? '';
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

export async function POST(req: NextRequest) {
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
    const form = await req.formData();
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
      deadlineMs: 270_000,
    };
    if (!isDrawingJobStoreAvailable()) {
      return userError('지속형 작업 저장소가 설정되지 않아 도면 분석 작업을 시작할 수 없습니다.', 503);
    }
    if (form.get('deferred') === '1') {
      if (!isSourceLeaseAvailable()) return userError('암호화 원본 임시 보관소가 설정되지 않아 취소·재개 작업을 시작할 수 없습니다.', 503);
      let availablePages: number;
      try {
        availablePages = await enumerateDrawingPageCount({
          bytes,
          mimeType: file.type || 'application/octet-stream',
          fileName: file.name,
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
        sourceMetadata: { mimeType: file.type || 'application/octet-stream', fileName: file.name, requestedPages },
      });
      const response = privateJson({
        success: true,
        data: { jobId: job.jobId, status: job.status, estimated: job.estimated, lease: { expiresAt: created.expiresAt } },
      }, { status: 202 });
      applyDrawingOwnerCookie(response, owner);
      return response;
    }
    const providerRaw = String(form.get('provider') ?? 'gemini');
    if (!VISION_PROVIDERS.has(providerRaw as VisionProvider)) return userError('지원하지 않는 Vision 제공자입니다.');
    const provider = providerRaw as VisionProvider;
    const suppliedKey = String(form.get('apiKey') ?? '').trim();
    if (suppliedKey.length > 4096) return userError('Vision 키 형식이 올바르지 않습니다.');
    const apiKey = suppliedKey || serverVisionKey(provider);
    const modelRaw = String(form.get('model') ?? '').trim();
    if (modelRaw && !MODEL_PATTERN.test(modelRaw)) return userError('Vision 모델 이름 형식이 올바르지 않습니다.');

    const vision = apiKey
      ? { provider, apiKey, model: modelRaw || undefined }
      : undefined;

    const { job, document } = await runDocumentAnalysis({
      bytes,
      mimeType: file.type || 'application/octet-stream',
      fileName: file.name,
      requestedPages,
      budget,
      vision,
      ownerId: owner.ownerId,
      signal: req.signal,
    });
    updateOwnedJob(job.jobId, owner.ownerId, {
      sourceMetadata: {
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name,
        requestedPages,
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

export async function GET(req: NextRequest) {
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

export async function DELETE(req: NextRequest) {
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
