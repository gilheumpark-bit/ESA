/**
 * User OCR/label corrections — recorded, not used for auto-training (AC design §4.2).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOwnedJob, updateOwnedJobIfDocumentVersion } from '@/agent/drawing/drawing-job-store';
import { applyDrawingCorrection } from '@/agent/drawing/apply-drawing-correction';
import { resolveDrawingOwner } from '@/agent/drawing/drawing-api-owner';
import { applyRateLimit } from '@/lib/rate-limit';
import { isRequestOriginAllowed } from '@/lib/request-origin';

export const runtime = 'nodejs';

function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store');
  return NextResponse.json(body, { ...init, headers });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
) {
  if (!isRequestOriginAllowed(req.headers.get('origin'), req.url, undefined, req.headers.get('host'), req.headers.get('x-forwarded-proto'))) {
    return privateJson({ success: false, error: { message: 'Invalid origin' } }, { status: 403 });
  }
  const blocked = applyRateLimit(req, 'sld');
  if (blocked) return blocked;
  const owner = await resolveDrawingOwner(req, false);
  if (!owner) return privateJson({ success: false, error: { message: '작업 세션이 만료되었습니다.' } }, { status: 401 });
  const { jobId } = await ctx.params;
  const job = getOwnedJob(jobId, owner.ownerId);
  if (!job?.document) {
    return privateJson({ success: false, error: { message: 'job not found' } }, { status: 404 });
  }

  const body = await req.json().catch(() => null) as {
    targetDisplayId?: string;
    originalCandidates?: string[];
    selectedValue?: string;
    correctionKind?: 'text' | 'type' | 'label';
    expectedUpdatedAt?: string;
    idempotencyKey?: string;
  } | null;

  if (!body?.targetDisplayId || !/^P\d{2,}-[STL]\d{3,}$/.test(body.targetDisplayId)
    || !body.selectedValue || body.selectedValue.length > 200 || /[\u0000-\u001f]/.test(body.selectedValue)
    || !body.correctionKind || !['text', 'type', 'label'].includes(body.correctionKind)
    || !body.expectedUpdatedAt || Number.isNaN(Date.parse(body.expectedUpdatedAt))
    || !body.idempotencyKey || !/^[a-zA-Z0-9_-]{8,128}$/.test(body.idempotencyKey)) {
    return privateJson({ success: false, error: { message: '수정 대상, 종류, 문서 버전 및 요청 고유키가 필요합니다.' } }, { status: 400 });
  }
  const existing = job.document.userCorrections.find((item) => item.idempotencyKey === body.idempotencyKey);
  if (existing) return privateJson({ success: true, data: { correction: existing, document: job.document, resumeAvailable: job.document.jobStatus === 'PARTIAL' && Boolean(job.sourceLease) } });
  if (!['COMPLETE', 'PARTIAL'].includes(job.status)) {
    return privateJson({ success: false, error: { message: '분석 진행 중에는 결과를 수정할 수 없습니다. 분석이 끝난 뒤 다시 시도해주세요.' } }, { status: 409 });
  }
  if (job.document.updatedAt !== body.expectedUpdatedAt) {
    return privateJson({ success: false, error: { message: '다른 수정이 먼저 반영되었습니다. 최신 결과를 확인한 뒤 다시 시도해주세요.' } }, { status: 409 });
  }
  const textTarget = job.document.evidenceGraph.texts.find((item) => item.displayId === body.targetDisplayId);
  const symbolTarget = job.document.evidenceGraph.symbols.find((item) => item.displayId === body.targetDisplayId);
  if (!textTarget && !symbolTarget) {
    return privateJson({ success: false, error: { message: '수정할 근거 항목을 찾지 못했습니다.' } }, { status: 404 });
  }
  if ((body.correctionKind === 'text' && !textTarget)
    || (body.correctionKind !== 'text' && !symbolTarget)) {
    return privateJson({ success: false, error: { message: '수정 종류와 근거 항목이 일치하지 않습니다.' } }, { status: 400 });
  }
  const document = applyDrawingCorrection(job.document, {
    targetDisplayId: body.targetDisplayId,
    selectedValue: body.selectedValue,
    correctionKind: body.correctionKind,
    idempotencyKey: body.idempotencyKey,
    correctedBy: owner.authenticated ? 'authenticated-user' : 'anonymous-session',
    sourceAvailable: Boolean(job.sourceLease),
  });
  const correction = document.userCorrections.at(-1)!;

  const updated = updateOwnedJobIfDocumentVersion(jobId, owner.ownerId, body.expectedUpdatedAt, { document, status: document.jobStatus });
  if (!updated) return privateJson({ success: false, error: { message: '다른 수정이 먼저 반영되었습니다. 최신 결과를 확인한 뒤 다시 시도해주세요.' } }, { status: 409 });
  return privateJson({
    success: true,
    data: {
      correction,
      document,
      resumeAvailable: document.jobStatus === 'PARTIAL' && Boolean(job.sourceLease),
    },
  });
}
