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

interface ProviderModelOption {
  id: string;
  name: string;
}

type ModelProbeStatus = 'success' | 'failed' | 'hold';

interface ModelProbeOutcome {
  status: ModelProbeStatus;
  detail: string;
  latencyMs: number;
}

const MODEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;
const NON_GENERATIVE_MODEL = /(embedding|moderation|whisper|transcri|speech|tts)/i;
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function safeModelId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.startsWith('models/') ? value.slice('models/'.length) : value;
  return MODEL_ID_PATTERN.test(normalized) && !normalized.includes('..') && !normalized.includes('//')
    ? normalized
    : null;
}

function providerModels(provider: CloudProvider, payload: unknown): ProviderModelOption[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const entries = provider === 'gemini' ? record.models : record.data;
  if (!Array.isArray(entries)) return [];

  const unique = new Map<string, ProviderModelOption>();
  for (const item of entries.slice(0, 500)) {
    if (!item || typeof item !== 'object') continue;
    const model = item as Record<string, unknown>;
    if (provider === 'gemini' && Array.isArray(model.supportedGenerationMethods)
      && !model.supportedGenerationMethods.includes('generateContent')) continue;
    const id = safeModelId(provider === 'gemini' ? model.name : model.id);
    if (!id || NON_GENERATIVE_MODEL.test(id)) continue;
    const displayName = typeof model.displayName === 'string'
      ? model.displayName
      : typeof model.display_name === 'string'
        ? model.display_name
        : id;
    unique.set(id, { id, name: displayName.slice(0, 160) });
    if (unique.size >= 200) break;
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function providerErrorDetail(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const error = (payload as Record<string, unknown>).error;
  if (!error || typeof error !== 'object') return fallback;
  const message = (error as Record<string, unknown>).message;
  return typeof message === 'string' && message.trim()
    ? message.trim().slice(0, 180)
    : fallback;
}

function hasTextCandidate(payload: Record<string, unknown> | null): boolean {
  if (!Array.isArray(payload?.candidates)) return false;
  return payload.candidates.some((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== 'object') return false;
    const parts = (content as Record<string, unknown>).parts;
    return Array.isArray(parts) && parts.some((part) => (
      part
      && typeof part === 'object'
      && (part as Record<string, unknown>).thought !== true
      && typeof (part as Record<string, unknown>).text === 'string'
      && ((part as Record<string, unknown>).text as string).trim().length > 0
    ));
  });
}

function exhaustedOutputBudget(payload: Record<string, unknown> | null): boolean {
  if (!Array.isArray(payload?.candidates)) return false;
  return payload.candidates.some((candidate) => (
    candidate
    && typeof candidate === 'object'
    && (candidate as Record<string, unknown>).finishReason === 'MAX_TOKENS'
  ));
}

async function probeGeminiCapability(
  apiKey: string,
  model: string,
  vision: boolean,
): Promise<ModelProbeOutcome> {
  const startedAt = Date.now();
  const parts: Array<Record<string, unknown>> = [
    { text: vision ? '이 작은 테스트 이미지를 입력으로 받았다면 OK만 답하세요.' : 'OK만 답하세요.' },
  ];
  if (vision) {
    parts.push({ inlineData: { mimeType: 'image/png', data: TINY_PNG_BASE64 } });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0, maxOutputTokens: 256 },
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      },
    );
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    const latencyMs = Date.now() - startedAt;

    if (response.ok) {
      if (hasTextCandidate(payload)) {
        return { status: 'success', detail: '응답 생성 확인', latencyMs };
      }
      return exhaustedOutputBudget(payload)
        ? { status: 'hold', detail: '출력 토큰 한도 안에 최종 텍스트를 만들지 못했습니다.', latencyMs }
        : { status: 'failed', detail: '호출은 성공했지만 텍스트 응답이 없습니다.', latencyMs };
    }
    if (response.status === 429 || response.status >= 500) {
      return {
        status: 'hold',
        detail: providerErrorDetail(payload, `공급자 일시 오류 (${response.status})`),
        latencyMs,
      };
    }
    return {
      status: 'failed',
      detail: providerErrorDetail(payload, `지원하지 않는 호출 (${response.status})`),
      latencyMs,
    };
  } catch {
    return { status: 'hold', detail: '15초 안에 응답하지 않았습니다.', latencyMs: Date.now() - startedAt };
  }
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

    const body = await request.json() as {
      provider?: unknown;
      apiKey?: unknown;
      action?: unknown;
      model?: unknown;
    };
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
    const apiKey = body.apiKey.trim();

    if (body.action === 'probe-model') {
      const model = safeModelId(body.model);
      if (provider !== 'gemini' || !model) {
        return ctx.error('ESA-4003', '검사할 Google 모델이 올바르지 않습니다.', 400);
      }
      const [text, vision] = await Promise.all([
        probeGeminiCapability(apiKey, model, false),
        probeGeminiCapability(apiKey, model, true),
      ]);
      return ctx.ok({ provider, model, text, vision });
    }

    const probe = PROVIDER_PROBES[provider];

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
        const payload = await response.json().catch(() => null);
        return ctx.ok({ provider, valid: true, models: providerModels(provider, payload) });
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
