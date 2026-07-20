/**
 * POST /api/drawing-jobs — full-document analysis job (multi-page).
 * Does not store original file bytes in the response (AC-14).
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit';
import { getFormFile } from '@/lib/api';
import { isRequestOriginAllowed } from '@/lib/request-origin';
import { runDocumentAnalysis } from '@/agent/drawing/document-orchestrator';
import { getJob } from '@/agent/drawing/drawing-job-store';
import { createSourceLease, isSourceLeaseAvailable } from '@/agent/drawing/source-lease-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const form = await req.formData();
    const filePart = getFormFile(form, 'file');
    if (!filePart.ok) {
      return NextResponse.json({ success: false, error: { message: filePart.message } }, { status: 400 });
    }
    const file = filePart.file;
    if (!file) {
      return NextResponse.json({ success: false, error: { message: 'file required' } }, { status: 400 });
    }
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: { message: 'max 100MB' } }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const pagesRaw = form.get('pages');
    let requestedPages: 'all' | number[] = 'all';
    if (typeof pagesRaw === 'string' && pagesRaw.trim() && pagesRaw !== 'all') {
      requestedPages = pagesRaw.split(',').map((p) => Number(p.trim()) - 1).filter((n) => n >= 0);
    }

    const maxVlmCalls = Number(form.get('maxVlmCalls') ?? 120);
    const provider = String(form.get('provider') ?? 'gemini') as 'gemini' | 'openai' | 'claude';
    const apiKey = String(form.get('apiKey') ?? '').trim()
      || process.env.GOOGLE_GENERATIVE_AI_API_KEY
      || process.env.OPENAI_API_KEY
      || process.env.ANTHROPIC_API_KEY
      || '';

    const vision = apiKey
      ? { provider, apiKey, model: String(form.get('model') ?? '') || undefined }
      : undefined;

    // Optional lease — never put bytes in JSON
    let lease: { leaseId: string; expiresAt: number } | { unavailable: true } | undefined;
    if (form.get('leaseSource') === '1') {
      if (!isSourceLeaseAvailable()) {
        lease = { unavailable: true };
      } else {
        const created = createSourceLease(bytes, 'pending');
        if ('error' in created) lease = { unavailable: true };
        else lease = { leaseId: created.leaseId, expiresAt: created.expiresAt };
      }
    }

    const { job, document } = await runDocumentAnalysis({
      bytes,
      mimeType: file.type || 'application/octet-stream',
      fileName: file.name,
      requestedPages,
      budget: {
        maxVlmCalls: Number.isFinite(maxVlmCalls) ? maxVlmCalls : 120,
      },
      vision,
    });

    // Estimate shown before would be in a two-phase API; include on response
    return NextResponse.json({
      success: true,
      data: {
        jobId: job.jobId,
        status: job.status,
        estimated: job.estimated,
        document, // V3 report only — no file bytes
        lease,
        resumeAvailable: lease && !('unavailable' in lease),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'drawing job failed';
    console.error('[drawing-jobs]', message);
    return NextResponse.json({ success: false, error: { message } }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ success: false, error: { message: 'jobId required' } }, { status: 400 });
  }
  const job = getJob(jobId);
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
