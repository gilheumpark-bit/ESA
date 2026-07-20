/**
 * User OCR/label corrections — recorded, not used for auto-training (AC design §4.2).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOwnedJob, updateOwnedJob } from '@/agent/drawing/drawing-job-store';
import { applyDrawingCorrection } from '@/agent/drawing/apply-drawing-correction';
import { resolveDrawingOwner } from '@/agent/drawing/drawing-api-owner';
import { applyRateLimit } from '@/lib/rate-limit';
import { isRequestOriginAllowed } from '@/lib/request-origin';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
) {
  if (!isRequestOriginAllowed(req.headers.get('origin'), req.url, undefined, req.headers.get('host'), req.headers.get('x-forwarded-proto'))) {
    return NextResponse.json({ success: false, error: { message: 'Invalid origin' } }, { status: 403 });
  }
  const blocked = applyRateLimit(req, 'sld');
  if (blocked) return blocked;
  const owner = await resolveDrawingOwner(req, false);
  if (!owner) return NextResponse.json({ success: false, error: { message: '작업 세션이 만료되었습니다.' } }, { status: 401 });
  const { jobId } = await ctx.params;
  const job = getOwnedJob(jobId, owner.ownerId);
  if (!job?.document) {
    return NextResponse.json({ success: false, error: { message: 'job not found' } }, { status: 404 });
  }

  const body = await req.json().catch(() => null) as {
    targetDisplayId?: string;
    originalCandidates?: string[];
    selectedValue?: string;
  } | null;

  if (!body?.targetDisplayId || !/^P\d{2,}-[STL]\d{3,}$/.test(body.targetDisplayId)
    || !body.selectedValue || body.selectedValue.length > 200 || /[\u0000-\u001f]/.test(body.selectedValue)) {
    return NextResponse.json({ success: false, error: { message: 'targetDisplayId and selectedValue required' } }, { status: 400 });
  }
  const textTarget = job.document.evidenceGraph.texts.find((item) => item.displayId === body.targetDisplayId);
  const symbolTarget = job.document.evidenceGraph.symbols.find((item) => item.displayId === body.targetDisplayId);
  if (!textTarget && !symbolTarget) {
    return NextResponse.json({ success: false, error: { message: '수정할 근거 항목을 찾지 못했습니다.' } }, { status: 404 });
  }
  const document = applyDrawingCorrection(job.document, {
    targetDisplayId: body.targetDisplayId,
    selectedValue: body.selectedValue,
    correctedBy: owner.authenticated ? 'authenticated-user' : 'anonymous-session',
    sourceAvailable: Boolean(job.sourceLease),
  });
  const correction = document.userCorrections.at(-1)!;

  updateOwnedJob(jobId, owner.ownerId, { document, status: document.jobStatus });
  return NextResponse.json({
    success: true,
    data: {
      correction,
      document,
      resumeAvailable: document.jobStatus === 'PARTIAL' && Boolean(job.sourceLease),
    },
  });
}
