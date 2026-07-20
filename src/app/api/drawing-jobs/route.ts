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
import { cancelOwnedJob, createJob, getOwnedJob, updateOwnedJob } from '@/agent/drawing/drawing-job-store';
import { createSourceLease, isSourceLeaseAvailable, releaseSourceLease } from '@/agent/drawing/source-lease-store';
import { applyDrawingOwnerCookie, resolveDrawingOwner } from '@/agent/drawing/drawing-api-owner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
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
  return NextResponse.json({ success: false, error: { message } }, { status });
}

export async function POST(req: NextRequest) {
  if (!isRequestOriginAllowed(
    req.headers.get('origin'),
    req.url,
    undefined,
    req.headers.get('host'),
    req.headers.get('x-forwarded-proto'),
  )) {
    return NextResponse.json({ success: false, error: { message: 'Invalid origin' } }, { status: 403 });
  }
  const blocked = applyRateLimit(req, 'sld');
  if (blocked) return blocked;

  try {
    const owner = await resolveDrawingOwner(req, true);
    if (!owner) return userError('작업 세션을 만들 수 없습니다.', 401);
    const form = await req.formData();
    const filePart = getFormFile(form, 'file');
    if (!filePart.ok) {
      return NextResponse.json({ success: false, error: { message: filePart.message } }, { status: 400 });
    }
    const file = filePart.file;
    if (!file) {
      return NextResponse.json({ success: false, error: { message: 'file required' } }, { status: 400 });
    }
    const drawingKind = allowedDrawing(file);
    if (!drawingKind) return userError('PNG, JPG, WEBP, PDF 또는 DXF 도면만 분석할 수 있습니다.');
    const byteLimit = drawingKind === 'image' ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
    if (file.size > byteLimit) return userError(`도면 파일이 너무 큽니다. 최대 ${byteLimit / 1024 / 1024}MB입니다.`);

    const bytes = await file.arrayBuffer();
    const requestedPages = parseRequestedPages(form.get('pages'));
    if (!requestedPages) return userError('페이지는 all 또는 1,2,3 형식으로 입력해야 합니다.');

    const maxVlmCalls = Number(form.get('maxVlmCalls') ?? 120);
    if (!Number.isSafeInteger(maxVlmCalls) || maxVlmCalls < 0 || maxVlmCalls > 10_000) {
      return userError('AI 호출 예산은 0~10000 사이의 정수여야 합니다.');
    }
    const budget = {
      maxPages: 50,
      maxVlmCalls,
      maxPixels: 40_000_000,
      deadlineMs: 270_000,
    };
    if (form.get('deferred') === '1') {
      if (!isSourceLeaseAvailable()) return userError('암호화 원본 임시 보관소가 설정되지 않아 취소·재개 작업을 시작할 수 없습니다.', 503);
      const documentHash = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
      const job = createJob({
        documentHash,
        ownerId: owner.ownerId,
        budget,
        estimatedPages: requestedPages === 'all' ? 1 : requestedPages.length,
      });
      const created = createSourceLease(bytes, documentHash, owner.ownerId);
      if ('error' in created) return userError('암호화 원본 임시 보관소가 준비되지 않았습니다.', 503);
      updateOwnedJob(job.jobId, owner.ownerId, {
        sourceLease: { leaseId: created.leaseId, expiresAt: created.expiresAt },
        sourceMetadata: { mimeType: file.type || 'application/octet-stream', fileName: file.name, requestedPages },
      });
      const response = NextResponse.json({
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
    if (form.get('leaseSource') === '1') {
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

    const response = NextResponse.json({
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
    return NextResponse.json({ success: false, error: { message: '도면 분석을 완료하지 못했습니다.', reference } }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const blocked = applyRateLimit(req, 'sld');
  if (blocked) return blocked;
  const owner = await resolveDrawingOwner(req, false);
  if (!owner) return userError('작업 세션이 만료되었습니다.', 401);
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ success: false, error: { message: 'jobId required' } }, { status: 400 });
  }
  const job = getOwnedJob(jobId, owner.ownerId);
  if (!job) {
    return NextResponse.json({ success: false, error: { message: 'not found' } }, { status: 404 });
  }
  return NextResponse.json({
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
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return userError('jobId required');
  const job = getOwnedJob(jobId, owner.ownerId);
  if (!job || !cancelOwnedJob(jobId, owner.ownerId)) return userError('not found', 404);
  if (job.sourceLease) releaseSourceLease(job.sourceLease.leaseId, owner.ownerId);
  updateOwnedJob(jobId, owner.ownerId, { sourceLease: undefined });
  return NextResponse.json({ success: true, data: { status: 'CANCELLED' } });
}
