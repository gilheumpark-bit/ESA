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
  if (!job?.sourceLease || !job.sourceMetadata) return userError('실행할 작업을 찾지 못했습니다.', 404);

  const form = await req.formData().catch(() => null);
  if (!form) return userError('요청 형식이 올바르지 않습니다.', 400);
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
    updateOwnedJob(jobId, owner.ownerId, { status: 'FAILED', error: 'SOURCE_LEASE_EXPIRED' });
    return userError('암호화된 원본 보관 시간이 만료되었습니다. 원본을 다시 올려주세요.', 410);
  }
  if (!claimOwnedJobRun(jobId, owner.ownerId, ['QUEUED'])) return userError('이미 실행 중이거나 종료된 작업입니다.', 409);

  try {
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
    });
    if (result.document.jobStatus === 'COMPLETE' || result.document.jobStatus === 'CANCELLED') {
      releaseSourceLease(job.sourceLease.leaseId, owner.ownerId);
      updateOwnedJob(jobId, owner.ownerId, { sourceLease: undefined });
    }
    return privateJson({
      success: true,
      data: {
        jobId,
        status: result.document.jobStatus,
        document: result.document,
        resumeAvailable: result.document.jobStatus === 'PARTIAL' && Boolean(getOwnedJob(jobId, owner.ownerId)?.sourceLease),
      },
    });
  } catch (cause) {
    const reference = randomUUID();
    updateOwnedJob(jobId, owner.ownerId, { status: 'QUEUED', error: reference });
    console.error('[drawing-job-run]', { reference, errorType: cause instanceof Error ? cause.name : 'UnknownError' });
    return privateJson({ success: false, error: { message: '도면 분석을 실행하지 못했습니다.', reference } }, { status: 500 });
  }
}

export const POST = withRequestLog(POST__impl);
