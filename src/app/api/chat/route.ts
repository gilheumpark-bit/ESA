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

// ─── PART 1: Types & Constants ──────────────────────────────────

interface ChatRequestBody {
  messages: ChatMessage[];
  provider: string;
  model: string;
  apiKey?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/** Daily token budget per IP: 500K tokens */
const DAILY_TOKEN_BUDGET = 500_000;

/** In-memory daily token usage tracker — 최대 10,000 엔트리 */
const MAX_TOKEN_ENTRIES = 10_000;
const tokenUsage = new Map<string, { tokens: number; resetAt: number }>();

const ALLOWED_ORIGINS = new Set([
  'https://esva.engineer',
  'https://www.esva.engineer',
  'http://localhost:3000',
  'http://localhost:3001',
]);

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (/^https:\/\/.*\.vercel\.app$/.test(origin)) return true;
  return false;
}

// ─── PART 2: Token Budget Check ─────────────────────────────────

function checkTokenBudget(ip: string, estimatedTokens: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = tokenUsage.get(ip);

  // Reset at midnight UTC
  const midnightUtc = new Date();
  midnightUtc.setUTCHours(24, 0, 0, 0);
  const resetAt = midnightUtc.getTime();

  if (!entry || now >= entry.resetAt) {
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
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();

  // Build the full message array with system prompt
  const fullMessages: ChatMessage[] = [];
  if (systemPrompt) {
    fullMessages.push({ role: 'system', content: systemPrompt });
  }
  fullMessages.push(...messages);

  // Use Vercel AI SDK for streaming
  const { streamText } = await import('ai');

  let sdkProvider;
  switch (provider) {
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai');
      sdkProvider = createOpenAI({ apiKey });
      break;
    }
    case 'claude': {
      const { createAnthropic } = await import('@ai-sdk/anthropic');
      sdkProvider = createAnthropic({ apiKey });
      break;
    }
    case 'gemini': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
      sdkProvider = createGoogleGenerativeAI({ apiKey });
      break;
    }
    case 'mistral': {
      const { createMistral } = await import('@ai-sdk/mistral');
      sdkProvider = createMistral({ apiKey });
      break;
    }
    case 'deepseek': {
      const { createDeepSeek } = await import('@ai-sdk/deepseek');
      sdkProvider = createDeepSeek({ apiKey });
      break;
    }
    default: {
      throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  const result = streamText({
    model: sdkProvider(model),
    messages: fullMessages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    temperature,
    maxOutputTokens: maxTokens,
  });

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const part of result.textStream) {
          const chunk = encoder.encode(`data: ${JSON.stringify({ text: part })}\n\n`);
          controller.enqueue(chunk);
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Stream error';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`),
        );
        controller.close();
      }
    },
  });
}

// ─── PART 5: POST Handler ───────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // CSRF origin check
    const origin = request.headers.get('origin');
    if (!isOriginAllowed(origin)) {
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
    const body: ChatRequestBody = await request.json();

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

    // Validate provider
    const providerConfig = PROVIDERS[body.provider];
    if (!providerConfig) {
      return jsonWithEsa(
        { success: false, error: { code: 'ESVA-3013', message: `Unknown provider: ${body.provider}` } },
        { status: 400 },
      );
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

    // Token budget check
    cleanupTokenUsage();
    const estimatedTokens = body.messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
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

    // Resolve API key: BYOK -> env -> error
    let resolvedKey: string;
    try {
      const resolved = resolveProviderKey(body.provider, body.apiKey);
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
      body.systemPrompt,
      resolvedKey,
      temperature,
      maxTokens,
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
