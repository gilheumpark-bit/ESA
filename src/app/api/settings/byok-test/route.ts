/**
 * POST /api/settings/byok-test
 *
 * Validates a user-supplied cloud provider key against a fixed endpoint
 * allowlist. The key is used for this request only and is never persisted,
 * logged, reflected in a URL, or returned to the client.
 */

import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/api/api-handler';

type CloudProvider = 'openai' | 'claude' | 'gemini' | 'groq' | 'mistral';

interface ProviderProbe {
  url: string;
  headers(apiKey: string): Record<string, string>;
}

const PROVIDER_PROBES: Record<CloudProvider, ProviderProbe> = {
  openai: {
    url: 'https://api.openai.com/v1/models',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  },
  claude: {
    url: 'https://api.anthropic.com/v1/models',
    headers: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }),
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    headers: (apiKey) => ({ 'x-goog-api-key': apiKey }),
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/models',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  },
  mistral: {
    url: 'https://api.mistral.ai/v1/models',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  },
};

function isCloudProvider(value: unknown): value is CloudProvider {
  return typeof value === 'string' && Object.hasOwn(PROVIDER_PROBES, value);
}

export const POST = withApiHandler(
  { rateLimit: 'default', checkOrigin: true },
  async (request: NextRequest, ctx) => {
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > 2_048) {
      return ctx.error('ESA-4002', '요청 크기가 허용 범위를 초과했습니다.', 413);
    }

    const body = await request.json() as { provider?: unknown; apiKey?: unknown };
    if (!isCloudProvider(body.provider)) {
      return ctx.error('ESA-4003', '지원하지 않는 클라우드 공급자입니다.', 400);
    }
    if (
      typeof body.apiKey !== 'string'
      || body.apiKey.trim().length < 8
      || body.apiKey.length > 512
    ) {
      return ctx.error('ESA-4001', 'API 키 형식이 올바르지 않습니다.', 400);
    }

    const provider = body.provider;
    const probe = PROVIDER_PROBES[provider];
    const apiKey = body.apiKey.trim();

    try {
      const response = await fetch(probe.url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...probe.headers(apiKey),
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        return ctx.ok({ provider, valid: true });
      }

      if ([400, 401, 403].includes(response.status)) {
        return ctx.ok({ provider, valid: false });
      }

      return ctx.error(
        'ESA-6001',
        '공급자 키 확인 서비스를 일시적으로 사용할 수 없습니다.',
        502,
      );
    } catch {
      return ctx.error(
        'ESA-6001',
        '공급자 키 확인 요청이 시간 내 완료되지 않았습니다.',
        504,
      );
    }
  },
);
