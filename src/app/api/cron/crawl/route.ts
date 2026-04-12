// =============================================================================
// Vercel Cron Endpoint — 크롤링 스케줄 실행
// GET /api/cron/crawl
// Auth: CRON_SECRET 헤더 검증
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { runDueJobs } from '@/crawlers/scheduler';

/**
 * Vercel Cron에서 호출하는 크롤링 엔드포인트
 *
 * vercel.json 설정 예시:
 * {
 *   "crons": [{
 *     "path": "/api/cron/crawl",
 *     "schedule": "0 *\/6 * * *"
 *   }]
 * }
 *
 * 인증: Authorization 헤더에 Bearer CRON_SECRET 필요
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // CRON_SECRET 검증 — fail-closed: reject if secret is not configured
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 503 },
    );
  }
  const authHeader = request.headers.get('Authorization') ?? request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const start = Date.now();

  try {
    const results = await runDueJobs();

    const jobsRun = results.length;
    const documentsIngested = results.reduce(
      (sum, r) => sum + r.documentsCount,
      0,
    );
    const errors = results
      .filter((r) => !r.success)
      .map((r) => ({ jobId: r.jobId, error: r.error }));

    return NextResponse.json({
      ok: true,
      jobsRun,
      documentsIngested,
      errors,
      duration: Date.now() - start,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Cron] 크롤링 실행 실패:', errorMsg);

    return NextResponse.json(
      {
        ok: false,
        jobsRun: 0,
        documentsIngested: 0,
        errors: [{ jobId: 'scheduler', error: errorMsg }],
        duration: Date.now() - start,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
