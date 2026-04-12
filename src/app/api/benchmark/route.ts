/**
 * Benchmark API Endpoint
 *
 * GET /api/benchmark — Runs all 56 calculator benchmarks.
 * Restricted to development mode or admin auth.
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';
import { benchmarkAll, formatBenchmarkReport } from '@/lib/benchmark';

// ---------------------------------------------------------------------------
// Auth check
// ---------------------------------------------------------------------------

function isDevelopment(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function isAdminAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;

  const adminToken = process.env.ADMIN_API_TOKEN;
  if (!adminToken) return false;

  return authHeader === `Bearer ${adminToken}`;
}

// ---------------------------------------------------------------------------
// GET /api/benchmark
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<NextResponse> {
  // 접근 제어: 개발 모드 또는 관리자 인증
  if (!isDevelopment() && !isAdminAuth(request)) {
    return NextResponse.json(
      { error: 'Benchmark endpoint is restricted to development mode or admin access.' },
      { status: 403 },
    );
  }

  try {

    const iterations = 10; // 빠른 응답을 위해 API에서는 10회
    const results = benchmarkAll(iterations);
    const report = formatBenchmarkReport(results);

    // JSON과 마크다운 모두 반환
    const jsonResults: Record<string, unknown> = {};
    for (const [key, value] of results) {
      jsonResults[key] = value;
    }

    return NextResponse.json({
      markdown: report,
      results: jsonResults,
      meta: {
        iterations,
        calculatorCount: results.size,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Benchmark failed: ${message}` },
      { status: 500 },
    );
  }
}
