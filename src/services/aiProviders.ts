// ============================================================
// ESVA Server-Side AI Provider Streaming
// ============================================================
// API Route에서 사용하는 서버사이드 멀티 프로바이더 스트리밍.
// OpenAI-compatible(OpenAI/Groq/Mistral), Claude, Gemini 지원.
// 원본: eh-universe-web/src/services/aiProviders.ts

const OPENAI_COMPAT_URLS: Record<string, string> = {
  openai:  'https://api.openai.com/v1/chat/completions',
  groq:    'https://api.groq.com/openai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
};

export async function streamOpenAICompat(
  provider: string, apiKey: string, model: string,
  system: string, messages: { role: string; content: string }[], temperature: number,
  customBaseUrl?: string,
): Promise<ReadableStream> {
  const url = customBaseUrl
    ? `${customBaseUrl.replace(/\/$/, '')}/v1/chat/completions`
    : OPENAI_COMPAT_URLS[provider];
  if (!url) throw new Error(`Unknown provider: ${provider}`);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey && !customBaseUrl) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      temperature,
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`${provider} API ${res.status}: ${err}`);
  }

  if (!res.body) throw new Error('Empty response body');
  return res.body;
}

export async function streamClaude(
  apiKey: string, model: string,
  system: string, messages: { role: string; content: string }[], temperature: number,
  maxTokens?: number,
): Promise<ReadableStream> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ model, max_tokens: maxTokens ?? 8192, system, messages, temperature, stream: true }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Claude API ${res.status}: ${err}`);
  }

  if (!res.body) throw new Error('Empty response body');
  return res.body;
}

export async function dispatchStream(
  provider: string, apiKey: string, model: string,
  system: string, messages: { role: string; content: string }[],
  temperature: number, maxTokens?: number,
): Promise<{ ok: true; stream: ReadableStream } | { ok: false; error: string }> {
  try {
    switch (provider) {
      case 'openai':
      case 'groq':
      case 'mistral':
        return { ok: true, stream: await streamOpenAICompat(provider, apiKey, model, system, messages, temperature) };
      case 'ollama':
      case 'lmstudio':
        return { ok: false, error: 'Local providers must use /api/local-proxy' };
      case 'claude':
        return { ok: true, stream: await streamClaude(apiKey, model, system, messages, temperature, maxTokens) };
      default:
        return { ok: false, error: `Unsupported provider: ${provider}` };
    }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
