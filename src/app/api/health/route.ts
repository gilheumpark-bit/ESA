/**
 * GET /api/health — ESVA Dependency Health Dashboard
 * ---------------------------------------------------
 * 모든 외부 의존성 + 내부 시스템 상태를 실시간 진단.
 * 프로덕션 모니터링 + 배포 후 검증 + 로드밸런서 헬스체크.
 *
 * 응답: 200 (healthy/degraded) / 503 (critical 의존성 down)
 */

import { NextResponse } from 'next/server';
import { getPublicRuntimeInfo } from '@/lib/esa-config';
import { esaResponseHeaders } from '@/lib/esa-http';
import { getRateLimitStoreSize } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DepStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  detail?: string;
}

async function checkSupabase(): Promise<DepStatus> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return { name: 'Supabase', status: 'degraded', latencyMs: 0, detail: 'Not configured' };
  const start = Date.now();
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
      signal: AbortSignal.timeout(5000),
    });
    return { name: 'Supabase', status: res.ok ? 'healthy' : 'degraded', latencyMs: Date.now() - start };
  } catch {
    return { name: 'Supabase', status: 'down', latencyMs: Date.now() - start };
  }
}

async function checkWeaviate(): Promise<DepStatus> {
  const url = process.env.WEAVIATE_URL;
  if (!url) return { name: 'Weaviate', status: 'degraded', latencyMs: 0, detail: 'Local fallback active' };
  const start = Date.now();
  try {
    const res = await fetch(`${url}/v1/.well-known/ready`, { signal: AbortSignal.timeout(3000) });
    return { name: 'Weaviate', status: res.ok ? 'healthy' : 'down', latencyMs: Date.now() - start };
  } catch {
    return { name: 'Weaviate', status: 'down', latencyMs: Date.now() - start };
  }
}

function checkProviderKeys(): DepStatus[] {
  const checks: [string, string | undefined][] = [
    ['Gemini', process.env.GOOGLE_GENERATIVE_AI_API_KEY],
    ['OpenAI', process.env.OPENAI_API_KEY],
    ['Anthropic', process.env.ANTHROPIC_API_KEY],
    ['Groq', process.env.GROQ_API_KEY],
  ];
  return checks.map(([name, key]) => ({
    name: `AI:${name}`,
    status: key ? 'healthy' : 'degraded',
    latencyMs: 0,
    detail: key ? 'Key configured' : 'BYOK only',
  }));
}

export async function GET() {
  const start = Date.now();
  const runtimeInfo = getPublicRuntimeInfo();

  const [supabase, weaviate] = await Promise.all([checkSupabase(), checkWeaviate()]);
  const providers = checkProviderKeys();
  const allDeps = [supabase, weaviate, ...providers];

  const hasCriticalDown = allDeps.some(d => d.name === 'Supabase' && d.status === 'down');
  const overallStatus = hasCriticalDown ? 'unhealthy'
    : allDeps.every(d => d.status === 'healthy') ? 'healthy'
    : 'degraded';

  return NextResponse.json(
    {
      success: true,
      data: {
        status: overallStatus,
        ...runtimeInfo,
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        totalLatencyMs: Date.now() - start,
        rateLimitStoreSize: getRateLimitStoreSize(),
        dependencies: allDeps,
      },
    },
    {
      status: hasCriticalDown ? 503 : 200,
      headers: { ...esaResponseHeaders(), 'Cache-Control': 'no-store, max-age=0' },
    },
  );
}
