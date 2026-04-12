// ============================================================
// ESVA Server-Side Structured JSON Output
// ============================================================
// 계산기 입력 파싱, 법규 검색 결과 정형화 등에 사용.
// OpenAI-compatible, Claude tool_use, 프로바이더별 JSON 스키마 강제.
// 원본: eh-universe-web/src/services/aiProvidersStructured.ts

const OPENAI_COMPAT_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
};
const STRUCTURED_PROVIDER_TIMEOUT_MS = 60_000;

export async function generateJsonOpenAICompat(
  provider: string,
  apiKey: string,
  model: string,
  prompt: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fallback: any,
  baseUrl?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const isLocal = provider === 'ollama' || provider === 'lmstudio';
  const url = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`
    : OPENAI_COMPAT_URLS[provider];
  if (!url) throw new Error(`Unknown provider: ${provider}`);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!isLocal && apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(STRUCTURED_PROVIDER_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You are a structured data generator. Always respond with valid JSON only. No markdown, no explanation.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          response_format: isLocal ? undefined : { type: 'json_object' },
        }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`${provider} API ${res.status}: ${err}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      try {
        return JSON.parse(content);
      } catch {
        return fallback;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const isRetryable = /500|502|503|504|INTERNAL|resource.*exhausted/i.test(msg);
      if (!isRetryable || attempt === MAX_RETRIES) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return fallback;
}

export async function generateJsonClaude(
  apiKey: string,
  model: string,
  prompt: string,
  schema: object | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fallback: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const tool = {
    name: 'structured_output',
    description: 'Return structured JSON data matching the requested format.',
    input_schema: schema || { type: 'object' as const, properties: { result: { type: 'string' as const } } },
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(STRUCTURED_PROVIDER_TIMEOUT_MS),
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'structured_output' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const toolBlock = data.content?.find((b: { type: string }) => b.type === 'tool_use');
  if (toolBlock?.input) return toolBlock.input;
  return fallback;
}

/** 프로바이더 자동 분기 — JSON 스키마 강제 출력 */
export async function dispatchStructuredGeneration(
  provider: string, apiKey: string, model: string, prompt: string, schema: object | undefined, fallback: unknown,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    if (provider === 'ollama' || provider === 'lmstudio') {
      return { ok: false, error: 'Local providers must use /api/local-proxy' };
    }
    if (provider === 'claude') {
      return { ok: true, result: await generateJsonClaude(apiKey, model, prompt, schema, fallback) };
    }
    // OpenAI-compatible
    const schemaHint = schema ? `\n\nRespond with JSON matching this schema:\n${JSON.stringify(schema, null, 2)}` : '';
    return { ok: true, result: await generateJsonOpenAICompat(provider, apiKey, model, prompt + schemaHint, fallback) };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
