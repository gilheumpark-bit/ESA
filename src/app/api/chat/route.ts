/**
 * ESVA Chat API — /api/chat
 * ─────────────────────────
 * POST: LLM streaming endpoint with BYOK support.
 * Adapted from eh-universe pattern: user key -> env -> error.
 *
 * PART 1: Types & constants
 * PART 2: CSRF + rate limit
 * PART 3: Token budget enforcement
 * PART 4: Streaming response builder
 * PART 5: POST handler
 */

import { NextRequest } from 'next/server';
import { esaResponseHeaders, jsonWithEsa } from '@/lib/esa-http';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { resolveProviderKey, validateLocalProviderUrl, getLocalProviderUrl } from '@/lib/server-ai';
import { checkPromptInjectionSafety } from '@/lib/safety-policies';
import { PROVIDERS, type ChatMessage } from '@/lib/ai-providers';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { validateOnpremiseTarget } from '@/lib/onpremise-policy';
import { filterLLMOutput } from '@/engine/llm/output-filter';
import { isRequestOriginAllowed } from '@/lib/request-origin';
import {
  resolveChatCalculationEvidence,
  resolveChatCalculationShortfall,
  type ChatCalculationEvidence,
} from '@/lib/chat-calculation-evidence';
import { buildElectricalAssistantPrompt } from '@/lib/electrical-chat';
import { withRequestLog } from '@/lib/api/with-request-log';

// ─── PART 1: Types & Constants ──────────────────────────────────

interface ChatRequestBody {
  messages: ChatMessage[];
  provider: string;
  model: string;
  apiKey?: string;
  language?: 'ko' | 'en';
  temperature?: number;
  maxTokens?: number;
  /** provider==='onpremise'일 때: settings/onpremise 저장 설정(사설 IP만 허용) */
  onpremise?: {
    serverUrl: string;
    apiType: 'ollama' | 'vllm' | 'localai' | 'openai-compat';
    apiKey?: string;
  };
}

/** Daily token budget per IP: 500K tokens */
const DAILY_TOKEN_BUDGET = 500_000;

/** In-memory daily token usage tracker — 최대 10,000 엔트리 */
const MAX_TOKEN_ENTRIES = 10_000;
const tokenUsage = new Map<string, { tokens: number; resetAt: number }>();

// ─── PART 2: Token Budget Check ─────────────────────────────────

function checkTokenBudget(ip: string, estimatedTokens: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = tokenUsage.get(ip);

  // Reset at midnight UTC
  const midnightUtc = new Date();
  midnightUtc.setUTCHours(24, 0, 0, 0);
  const resetAt = midnightUtc.getTime();

  if (!entry || now >= entry.resetAt) {
    if (estimatedTokens > DAILY_TOKEN_BUDGET) {
      return { allowed: false, remaining: DAILY_TOKEN_BUDGET };
    }
    tokenUsage.set(ip, { tokens: estimatedTokens, resetAt });
    return { allowed: true, remaining: DAILY_TOKEN_BUDGET - estimatedTokens };
  }

  if (entry.tokens + estimatedTokens > DAILY_TOKEN_BUDGET) {
    return { allowed: false, remaining: DAILY_TOKEN_BUDGET - entry.tokens };
  }

  entry.tokens += estimatedTokens;
  return { allowed: true, remaining: DAILY_TOKEN_BUDGET - entry.tokens };
}

// Lazy cleanup every 10 minutes
let lastTokenCleanup = Date.now();
function cleanupTokenUsage() {
  const now = Date.now();
  if (now - lastTokenCleanup < 600_000 && tokenUsage.size < MAX_TOKEN_ENTRIES) return;
  lastTokenCleanup = now;
  for (const [key, entry] of tokenUsage) {
    if (now >= entry.resetAt) tokenUsage.delete(key);
  }
  // 크기 초과 시 가장 오래된 엔트리 삭제
  if (tokenUsage.size > MAX_TOKEN_ENTRIES) {
    const oldest = [...tokenUsage.entries()]
      .sort((a, b) => a[1].resetAt - b[1].resetAt)
      .slice(0, tokenUsage.size - MAX_TOKEN_ENTRIES);
    for (const [key] of oldest) tokenUsage.delete(key);
  }
}

// ─── PART 3: Firebase Token Extraction (Optional) ───────────────
// Uses shared extractVerifiedUserId from @/lib/auth-helpers

// ─── PART 4: Provider-Specific Streaming ────────────────────────

async function buildStreamingResponse(
  provider: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string | undefined,
  apiKey: string,
  temperature: number,
  maxTokens: number,
  onpremBaseUrl?: string,
  calculationEvidence: ChatCalculationEvidence | null = null,
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();

  // Use Vercel AI SDK for streaming
  const { streamText } = await import('ai');

  let sdkModel: Parameters<typeof streamText>[0]['model'];
  switch (provider) {
    case 'onpremise': {
      // 사설 LLM 서버(ollama/vllm/localai/openai-compat) — 전부 OpenAI 호환
      // /v1 엔드포인트를 노출한다(onpremise-test의 chat 경로와 동일 규약).
      const { createOpenAI } = await import('@ai-sdk/openai');
      const base = (onpremBaseUrl ?? '').replace(/\/+$/, '');
      const baseURL = base.endsWith('/v1') ? base : `${base}/v1`;
      const compatibleProvider = createOpenAI({ apiKey, baseURL });
      sdkModel = compatibleProvider.chat(model);
      break;
    }
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const openaiProvider = createOpenAI({ apiKey });
      sdkModel = openaiProvider(model);
      break;
    }
    case 'groq': {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const groqProvider = createOpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
      sdkModel = groqProvider.chat(model);
      break;
    }
    case 'ollama':
    case 'lmstudio': {
      const { createOpenAI } = await import('@ai-sdk/openai');
      const base = getLocalProviderUrl(provider).replace(/\/+$/, '');
      const baseURL = base.endsWith('/v1') ? base : `${base}/v1`;
      const localProvider = createOpenAI({ apiKey: 'local-provider', baseURL });
      sdkModel = localProvider.chat(model);
      break;
    }
    case 'claude': {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      const anthropicProvider = createAnthropic({ apiKey });
      sdkModel = anthropicProvider(model);
      break;
    }
    case 'gemini': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      const googleProvider = createGoogleGenerativeAI({ apiKey });
      sdkModel = googleProvider(model);
      break;
    }
    case 'mistral': {
      const { createMistral } = await import('@ai-sdk/mistral');
      const mistralProvider = createMistral({ apiKey });
      sdkModel = mistralProvider(model);
      break;
    }
    case 'deepseek': {
      const { createDeepSeek } = await import('@ai-sdk/deepseek');
      const deepseekProvider = createDeepSeek({ apiKey });
      sdkModel = deepseekProvider(model);
      break;
    }
    default: {
      throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  const result = streamText({
    model: sdkModel,
    instructions: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    temperature,
    maxOutputTokens: maxTokens,
  });

  return new ReadableStream({
    async start(controller) {
      let fullText = '';
      try {
        if (calculationEvidence) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                calculation: {
                  calculatorId: calculationEvidence.calculatorId,
                  calculatorName: calculationEvidence.calculatorName,
                  input: calculationEvidence.input,
                  result: calculationEvidence.result,
                },
              })}\n\n`,
            ),
          );
        }

        for await (const part of result.textStream) {
          fullText += part;
        }

        // No model token crosses the API boundary before the complete answer is
        // filtered. This trades token-by-token display for a fail-closed output
        // contract: clients can never briefly render a blocked value.
        const trustedUserInput = messages
          .filter((message) => message.role === 'user')
          .map((message) => message.content)
          .join('\n');
        const filtered = filterLLMOutput(
          fullText,
          [],
          `${trustedUserInput}\n${calculationEvidence?.trustedText ?? ''}`,
        );
        const safeText = filtered.filtered;
        const finishReason = await result.finishReason;
        console.info(JSON.stringify({
          level: 'info',
          event: 'chat_generation_complete',
          provider,
          model,
          rawChars: fullText.length,
          safeChars: safeText.length,
          blockedCount: filtered.blocked.length,
          calculatorId: calculationEvidence?.calculatorId ?? null,
          finishReason,
        }));
        for (let offset = 0; offset < safeText.length; offset += 512) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ text: safeText.slice(offset, offset + 512) })}\n\n`,
            ),
          );
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              filter: filtered.passed
                ? { passed: true }
                : {
                    passed: false,
                    blockedCount: filtered.blocked.length,
                    filteredText: safeText,
                    notice:
                      '출력 필터: 출처 없는 수치·확률적 표현이 차단되었습니다. 계산기·기준서 도구 경로를 사용하세요.',
                  },
            })}\n\n`,
          ),
        );

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        console.error('[ESVA /api/chat] Stream error:', err);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({
            error: 'AI 응답 생성에 실패했습니다. 공급자 설정과 키를 확인해 주세요.',
            code: 'ESVA-3998',
          })}\n\n`),
        );
        controller.close();
      }
    },
  });
}

// ─── PART 5: POST Handler ───────────────────────────────────────

async function POST__impl(request: NextRequest) {
  try {
    // CSRF origin check
    const origin = request.headers.get('origin');
    if (!isRequestOriginAllowed(
      origin,
      request.url,
      undefined,
      request.headers.get('host'),
      request.headers.get('x-forwarded-proto'),
    )) {
      return jsonWithEsa(
        { success: false, error: { code: 'ESVA-3001', message: 'Invalid origin' } },
        { status: 403 },
      );
    }

    // Rate limit
    const ip = getClientIp(request.headers);
    const rl = checkRateLimit(ip, 'chat');
    if (!rl.allowed) {
      return jsonWithEsa(
        {
          success: false,
          error: {
            code: 'ESVA-3002',
            message: 'Rate limit exceeded',
            retryAfter: rl.retryAfter,
          },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfter ?? 60) },
        },
      );
    }

    // Parse body
    const raw = await request.json().catch(() => null);
    // 깨진 JSON·빈 본문은 호출자 잘못이다. 던지게 두면 바깥 catch 가
    // 500 으로 뭉개 "우리 잘못" 으로 보고된다(§ 정직 거부).
    if (!raw || typeof raw !== 'object') {
      return jsonWithEsa(
        { success: false, error: { code: 'ESVA-3009', message: 'Request body must be valid JSON' } },
        { status: 400 },
      );
    }
    const body = raw as ChatRequestBody;

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return jsonWithEsa(
        { success: false, error: { code: 'ESVA-3010', message: 'Missing or empty messages array' } },
        { status: 400 },
      );
    }

    if (!body.provider || typeof body.provider !== 'string') {
      return jsonWithEsa(
        { success: false, error: { code: 'ESVA-3011', message: 'Missing provider' } },
        { status: 400 },
      );
    }

    if (!body.model || typeof body.model !== 'string') {
      return jsonWithEsa(
        { success: false, error: { code: 'ESVA-3012', message: 'Missing model' } },
        { status: 400 },
      );
    }

    // Validate provider — 'onpremise'는 클라우드 레지스트리(PROVIDERS) 밖의
    // 사용자 사설 서버 경로다(settings/onpremise 저장 설정 소비 — D2 배선).
    const isOnpremise = body.provider === 'onpremise';
    let onpremiseBaseUrl: string | undefined;
    if (isOnpremise) {
      const userId = await extractVerifiedUserId(request);
      if (!userId) {
        return jsonWithEsa(
          { success: false, error: { code: 'ESVA-1001', message: 'Authentication required for On-Premise AI' } },
          { status: 401 },
        );
      }
      const serverUrl = body.onpremise?.serverUrl;
      if (!serverUrl) {
        return jsonWithEsa(
          { success: false, error: { code: 'ESVA-3016', message: 'onpremise.serverUrl 누락 — 설정 페이지에서 저장 후 사용' } },
          { status: 400 },
        );
      }
      const target = validateOnpremiseTarget(serverUrl);
      if (!target.ok || !target.normalizedUrl) {
        return jsonWithEsa(
          { success: false, error: { code: 'ESVA-3015', message: `SSRF blocked: ${target.reason}` } },
          { status: 403 },
        );
      }
      onpremiseBaseUrl = target.normalizedUrl;
    } else {
      const providerConfig = PROVIDERS[body.provider];
      if (!providerConfig) {
        return jsonWithEsa(
          { success: false, error: { code: 'ESVA-3013', message: `Unknown provider: ${body.provider}` } },
          { status: 400 },
        );
      }
    }

    const lastUser = [...body.messages].reverse().find((m) => m.role === 'user');
    if (lastUser && typeof lastUser.content === 'string') {
      const inj = checkPromptInjectionSafety(lastUser.content);
      if (inj.blocked) {
        return jsonWithEsa(
          { success: false, error: { code: inj.code, message: inj.message } },
          { status: 403 },
        );
      }
    }

    // 앞 turn 의 사용자 발화를 함께 넘긴다 — 마지막 메시지만으로 영수증이
    // 안 나올 때 "길이만 100m 로 바꾸면?" 같은 후속을 이어받기 위해서다.
    // 이어받는 조건은 `resolveFollowUp` 이 좁게 정한다(앞 turn 이 실제로
    // 영수증을 냈고, 후속이 그 계산기의 값을 다시 말했을 때만).
    const priorUserTexts = body.messages
      .filter((message) => message.role === 'user' && typeof message.content === 'string')
      .slice(0, -1)
      .map((message) => message.content);
    const calculationEvidence = lastUser && typeof lastUser.content === 'string'
      ? resolveChatCalculationEvidence(lastUser.content, priorUserTexts)
      : null;
    // 영수증이 없으면 모델이 스스로 계산하고 출력 필터가 그 수치를 지워 문장이
    // 깨진다. 그럴 땐 계산 대신 필요한 입력을 되묻게 한다.
    const calculationShortfall = !calculationEvidence && lastUser && typeof lastUser.content === 'string'
      ? resolveChatCalculationShortfall(lastUser.content)
      : null;
    const responseLanguage = body.language === 'en' ? 'en' : 'ko';
    const calibratedSystemPrompt = `${buildElectricalAssistantPrompt(responseLanguage)}${calculationEvidence?.promptContext ?? calculationShortfall ?? ''}`;

    // Token budget check
    cleanupTokenUsage();
    const estimatedTokens = body.messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0)
      + Math.ceil(calibratedSystemPrompt.length / 4);
    const budget = checkTokenBudget(ip, estimatedTokens);
    if (!budget.allowed) {
      return jsonWithEsa(
        {
          success: false,
          error: {
            code: 'ESVA-3014',
            message: 'Daily token budget exceeded (500K tokens/day). Provide your own API key to continue.',
            remaining: budget.remaining,
          },
        },
        { status: 429 },
      );
    }

    // Resolve API key: BYOK -> env -> error. On-premise providers use their
    // configured server credential; the SDK adapter still requires a non-empty value.
    let resolvedKey: string;
    try {
      const resolved = isOnpremise
        ? { key: body.onpremise?.apiKey || 'onpremise-local' }
        : resolveProviderKey(body.provider, body.apiKey);
      resolvedKey = resolved.key;
    } catch (keyErr) {
      return jsonWithEsa(
        {
          success: false,
          error: {
            code: 'ESVA-1010',
            message: keyErr instanceof Error ? keyErr.message : 'API key resolution failed',
          },
        },
        { status: 401 },
      );
    }

    // Local provider SSRF check
    if (body.provider === 'ollama' || body.provider === 'lmstudio') {
      const baseUrl = getLocalProviderUrl(body.provider);
      const validation = validateLocalProviderUrl(baseUrl);
      if (!validation.valid) {
        return jsonWithEsa(
          { success: false, error: { code: 'ESVA-3015', message: `SSRF blocked: ${validation.reason}` } },
          { status: 403 },
        );
      }
    }

    // Build streaming response
    const temperature = Math.min(2, Math.max(0, body.temperature ?? 0.7));
    const maxTokens = Math.min(8192, Math.max(100, body.maxTokens ?? 4096));

    const stream = await buildStreamingResponse(
      body.provider,
      body.model,
      body.messages,
      calibratedSystemPrompt,
      resolvedKey,
      temperature,
      maxTokens,
      onpremiseBaseUrl,
      calculationEvidence,
    );

    return new Response(stream, {
      status: 200,
      headers: esaResponseHeaders({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store',
        Connection: 'keep-alive',
        'X-RateLimit-Remaining': String(rl.remaining),
        'X-Token-Budget-Remaining': String(budget.remaining),
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ESVA /api/chat] Error:', message);

    return jsonWithEsa(
      { success: false, error: { code: 'ESVA-3999', message: 'Internal chat error' } },
      { status: 500 },
    );
  }
}

export const POST = withRequestLog(POST__impl);
