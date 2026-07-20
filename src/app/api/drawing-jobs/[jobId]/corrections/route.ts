/**
 * User OCR/label corrections — recorded, not used for auto-training (AC design §4.2).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJob, updateJob } from '@/agent/drawing/drawing-job-store';
import type { UserCorrection } from '@/agent/drawing/types-v3';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await ctx.params;
  const job = getJob(jobId);
  if (!job?.document) {
    return NextResponse.json({ success: false, error: { message: 'job not found' } }, { status: 404 });
  }

  const body = await req.json().catch(() => null) as {
    targetDisplayId?: string;
    originalCandidates?: string[];
    selectedValue?: string;
    correctedBy?: string;
  } | null;

  if (!body?.targetDisplayId || !body.selectedValue) {
    return NextResponse.json({ success: false, error: { message: 'targetDisplayId and selectedValue required' } }, { status: 400 });
  }

  const correction: UserCorrection = {
    correctionId: `corr-${Date.now().toString(36)}`,
    targetDisplayId: body.targetDisplayId,
    originalCandidates: body.originalCandidates ?? [],
    selectedValue: body.selectedValue,
    correctedAt: new Date().toISOString(),
    correctedBy: body.correctedBy ?? 'user',
    affectedEntityIds: [body.targetDisplayId],
    goldenEligible: false,
  };

  const document = {
    ...job.document,
    userCorrections: [...job.document.userCorrections, correction],
    evidenceGraph: {
      ...job.document.evidenceGraph,
      texts: job.document.evidenceGraph.texts.map((t) => {
        if (t.displayId !== body.targetDisplayId) return t;
        return {
          ...t,
          confirmedText: body.selectedValue,
          certainty: 'confirmed' as const,
          holdCode: undefined,
        };
      }),
      symbols: job.document.evidenceGraph.symbols.map((s) => {
        if (s.displayId !== body.targetDisplayId) return s;
        return {
          ...s,
          rawLabel: body.selectedValue,
          certainty: 'confirmed' as const,
        };
      }),
    },
    updatedAt: new Date().toISOString(),
  };

  updateJob(jobId, { document });
  return NextResponse.json({ success: true, data: { correction, document } });
}
