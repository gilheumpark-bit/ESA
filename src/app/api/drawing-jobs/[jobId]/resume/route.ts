import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { resolveDrawingOwner } from '@/agent/drawing/drawing-api-owner';
import { claimOwnedJobRun, getOwnedJob, nextPendingRequestedPage, updateOwnedJob } from '@/agent/drawing/drawing-job-store';
import { runDocumentAnalysis } from '@/agent/drawing/document-orchestrator';
import { readSourceLease, releaseSourceLease } from '@/agent/drawing/source-lease-store';
import { applyRateLimit } from '@/lib/rate-limit';
import { isRequestOriginAllowed } from '@/lib/request-origin';
import { withRequestLog } from '@/lib/api/with-request-log';
import {
  DrawingVisionRequestError,
  resolveDrawingVisionRequest,
} from '@/lib/drawing-vision-request';

export const runtime = 'nodejs';
export const maxDuration = 1800;

function userError(message: string, status: number) {
  return privateJson({ success: false, error: { message } }, { status });
}

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store');
  return NextResponse.json(body, { ...init, headers });
}

async function POST__impl(req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isRequestOriginAllowed(req.headers.get('origin'), req.url, undefined, req.headers.get('host'), req.headers.get('x-forwarded-proto'))) {
    return userError('Invalid origin', 403);
  }
  const blocked = applyRateLimit(req, 'sld-job');
  if (blocked) return blocked;
  const owner = await resolveDrawingOwner(req, false);
  if (!owner) return userError('작업 세션이 만료되었습니다.', 401);

  const { jobId } = await ctx.params;
  const job = getOwnedJob(jobId, owner.ownerId);
  if (!job?.document || !job.sourceLease || !job.sourceMetadata) {
    return userError('재개할 작업을 찾지 못했습니다.', 404);
  }
  if (job.document.jobStatus === 'COMPLETE') return userError('이미 전체 판독이 완료된 작업입니다.', 409);
  // 형제인 `run` 과 같게 400 으로 거절한다. 이 라우트만 파싱이 바깥 try
  // 안에 있어서, 깨진 본문이 그 catch 로 흘러 **500** 이 나갔다 —
  // "서버 잘못" 이라는 뜻이라 운영 알람을 울리고 호출자에게는 무엇을
  // 고쳐야 하는지 안 알려 준다(실측 2026-07-28).
  const form = await req.formData().catch(() => null);
  if (!form) return userError('요청 형식이 올바르지 않습니다.', 400);

  try {
    let vision;
    try {
      vision = await resolveDrawingVisionRequest(form, req, owner.authenticated);
    } catch (error) {
      if (error instanceof DrawingVisionRequestError) {
        return userError(error.message, error.status);
      }
      throw error;
    }
    const bytes = readSourceLease(job.sourceLease.leaseId, owner.ownerId);
    if (!bytes) {
      updateOwnedJob(jobId, owner.ownerId, { status: 'FAILED', error: 'SOURCE_LEASE_EXPIRED', sourceLease: undefined });
      return userError('암호화된 원본 보관 시간이 만료되었습니다. 원본을 다시 올려주세요.', 410);
    }
    if (!claimOwnedJobRun(jobId, owner.ownerId, ['PARTIAL'])) return userError('이미 재개 중이거나 재개할 수 없는 작업입니다.', 409);

    const result = await runDocumentAnalysis({
      bytes,
      mimeType: job.sourceMetadata.mimeType,
      fileName: job.sourceMetadata.fileName,
      requestedPages: job.sourceMetadata.requestedPages,
      preparationPages: [nextPendingRequestedPage(job) ?? 0],
      budget: job.budget,
      vision,
      ownerId: owner.ownerId,
      jobId,
      maxPagesPerRun: 1,
      signal: req.signal,
      ...(job.sourceMetadata.symbolLibrary ? { symbolLibrary: job.sourceMetadata.symbolLibrary } : {}),
    });
    if (result.document.jobStatus === 'COMPLETE') {
      releaseSourceLease(job.sourceLease.leaseId, owner.ownerId);
      updateOwnedJob(jobId, owner.ownerId, { sourceLease: undefined });
    }
    return privateJson({
      success: true,
      data: {
        jobId,
        status: result.document.jobStatus,
        document: result.document,
        resumeAvailable: result.document.jobStatus === 'PARTIAL',
      },
    });
  } catch (cause) {
    const reference = randomUUID();
    updateOwnedJob(jobId, owner.ownerId, { status: 'PARTIAL', error: reference });
    console.error('[drawing-job-resume]', { reference, errorType: cause instanceof Error ? cause.name : 'UnknownError' });
    return privateJson({ success: false, error: { message: '도면 분석을 재개하지 못했습니다.', reference } }, { status: 500 });
  }
}

export const POST = withRequestLog(POST__impl);
