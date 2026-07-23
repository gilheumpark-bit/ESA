import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { resolveDrawingOwner } from '@/agent/drawing/drawing-api-owner';
import { claimOwnedJobRun, getOwnedJob, nextPendingRequestedPage, updateOwnedJob } from '@/agent/drawing/drawing-job-store';
import { runDocumentAnalysis } from '@/agent/drawing/document-orchestrator';
import { readSourceLease, releaseSourceLease } from '@/agent/drawing/source-lease-store';
import { applyRateLimit } from '@/lib/rate-limit';
import { isRequestOriginAllowed } from '@/lib/request-origin';
import { isCatalogModel } from '@/lib/ai-providers';

export const runtime = 'nodejs';
export const maxDuration = 1800;

type VisionProvider = 'gemini' | 'openai' | 'claude';
const PROVIDERS = new Set<VisionProvider>(['gemini', 'openai', 'claude']);
const MODEL_PATTERN = /^[a-zA-Z0-9._:/-]{1,128}$/;

function serverKey(provider: VisionProvider): string {
  if (provider === 'openai') return process.env.OPENAI_API_KEY?.trim() ?? '';
  if (provider === 'claude') return process.env.ANTHROPIC_API_KEY?.trim() ?? '';
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ?? '';
}

function userError(message: string, status: number) {
  return privateJson({ success: false, error: { message } }, { status });
}

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store');
  return NextResponse.json(body, { ...init, headers });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
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
  try {
    const form = await req.formData();
    const providerRaw = String(form.get('provider') ?? 'gemini');
    if (!PROVIDERS.has(providerRaw as VisionProvider)) return userError('지원하지 않는 Vision 제공자입니다.', 400);
    const provider = providerRaw as VisionProvider;
    const suppliedKey = String(form.get('apiKey') ?? '').trim();
    if (suppliedKey.length > 4096) return userError('Vision 키 형식이 올바르지 않습니다.', 400);
    if (!suppliedKey && !owner.authenticated) {
      return userError('비로그인 작업 재개에는 Vision BYOK 키가 필요합니다.', 401);
    }
    const apiKey = suppliedKey || serverKey(provider);
    const model = String(form.get('model') ?? '').trim();
    if (model && !MODEL_PATTERN.test(model)) return userError('Vision 모델 이름 형식이 올바르지 않습니다.', 400);
    if (model && !suppliedKey && !isCatalogModel(provider, model)) {
      return userError('서버 Vision 키로 사용할 수 없는 모델입니다.', 400);
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
      vision: apiKey ? { provider, apiKey, model: model || undefined } : undefined,
      ownerId: owner.ownerId,
      jobId,
      maxPagesPerRun: 1,
      signal: req.signal,
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
