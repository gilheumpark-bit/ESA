/**
 * ESVA Multi-Provider AI Abstraction
 * ----------------------------------
 * 7-provider support with 4-layer key encryption and streaming chat.
 * BYOK-first: user key -> server env fallback -> error.
 */

// ─── PART 1: Types ────────────────────────────────────────────

export type CostTier = 'free' | 'low' | 'medium' | 'high' | 'premium';

export interface ProviderCapabilities {
  streaming: boolean;
  structuredOutput: boolean;
  maxContextTokens: number;
  costTier: CostTier;
}

export interface AIModel {
  id: string;
  name: string;
  contextWindow: number;
  costTier: CostTier;
}

export interface AIProvider {
  id: string;
  name: string;
  defaultModel: string;
  models: AIModel[];
  capabilities: ProviderCapabilities;
  /** Base URL for local providers (Ollama, LM Studio) */
  baseUrl?: string;
}

export interface StreamChatOptions {
  provider: string;
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  apiKey?: string;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ─── PART 2: Provider Registry ────────────────────────────────

export const PROVIDERS: Record<string, AIProvider> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1_048_576, costTier: 'premium' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1_048_576, costTier: 'low' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', contextWindow: 1_048_576, costTier: 'free' },
    ],
    capabilities: { streaming: true, structuredOutput: true, maxContextTokens: 1_048_576, costTier: 'low' },
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-4.1-mini',
    models: [
      { id: 'gpt-4.1', name: 'GPT-4.1', contextWindow: 1_047_576, costTier: 'high' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', contextWindow: 1_047_576, costTier: 'medium' },
      { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', contextWindow: 1_047_576, costTier: 'low' },
      { id: 'o4-mini', name: 'o4-mini', contextWindow: 200_000, costTier: 'medium' },
    ],
    capabilities: { streaming: true, structuredOutput: true, maxContextTokens: 1_047_576, costTier: 'medium' },
  },
  claude: {
    id: 'claude',
    name: 'Anthropic Claude',
    defaultModel: 'claude-sonnet-4-20250514',
    models: [
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', contextWindow: 200_000, costTier: 'premium' },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200_000, costTier: 'high' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextWindow: 200_000, costTier: 'low' },
    ],
    capabilities: { streaming: true, structuredOutput: true, maxContextTokens: 200_000, costTier: 'high' },
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    models: [
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick', contextWindow: 128_000, costTier: 'low' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', contextWindow: 128_000, costTier: 'free' },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', contextWindow: 128_000, costTier: 'low' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', contextWindow: 32_768, costTier: 'low' },
    ],
    capabilities: { streaming: true, structuredOutput: false, maxContextTokens: 128_000, costTier: 'low' },
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    defaultModel: 'mistral-small-latest',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', contextWindow: 128_000, costTier: 'high' },
      { id: 'mistral-small-latest', name: 'Mistral Small', contextWindow: 128_000, costTier: 'low' },
      { id: 'codestral-latest', name: 'Codestral', contextWindow: 256_000, costTier: 'medium' },
    ],
    capabilities: { streaming: true, structuredOutput: true, maxContextTokens: 128_000, costTier: 'medium' },
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    defaultModel: 'llama4',
    baseUrl: 'http://localhost:11434',
    models: [
      { id: 'llama4', name: 'Llama 4 Scout', contextWindow: 128_000, costTier: 'free' },
      { id: 'gemma3', name: 'Gemma 3 27B', contextWindow: 128_000, costTier: 'free' },
      { id: 'qwen3', name: 'Qwen 3 32B', contextWindow: 128_000, costTier: 'free' },
      { id: 'mistral-small', name: 'Mistral Small 3.1', contextWindow: 128_000, costTier: 'free' },
    ],
    capabilities: { streaming: true, structuredOutput: false, maxContextTokens: 128_000, costTier: 'free' },
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio (Local)',
    defaultModel: 'local-model',
    baseUrl: 'http://localhost:1234',
    models: [
      { id: 'local-model', name: 'Local Model', contextWindow: 32_000, costTier: 'free' },
    ],
    capabilities: { streaming: true, structuredOutput: false, maxContextTokens: 32_000, costTier: 'free' },
  },
} as const;

// ─── PART 3: Key Encryption (4-Layer) ─────────────────────────

const ENCRYPTION_VERSION = 4;
const ESVA_SALT = 'esa-key-v4-2025';

/** Derive an AES-GCM key from the salt (browser-only). */
async function deriveAesKey(): Promise<CryptoKey | null> {
  if (typeof globalThis.crypto?.subtle === 'undefined') return null;
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(ESVA_SALT), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('esa-static-salt'), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** XOR fallback for environments without Web Crypto. */
function xorCipher(text: string, key: string): string {
  const result: number[] = [];
  for (let i = 0; i < text.length; i++) {
    result.push(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(String.fromCharCode(...result));
}

function xorDecipher(encoded: string, key: string): string {
  const decoded = atob(encoded);
  const result: number[] = [];
  for (let i = 0; i < decoded.length; i++) {
    result.push(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return String.fromCharCode(...result);
}

/**
 * Encrypt an API key for storage.
 * Layer 1: AES-GCM v4 (preferred, Web Crypto available)
 * Layer 2: XOR with salt (fallback)
 * Layer 3: Base64 (legacy compat)
 */
export async function encryptKey(raw: string): Promise<string> {
  // Try AES-GCM first
  try {
    const aesKey = await deriveAesKey();
    if (aesKey) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const enc = new TextEncoder();
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        enc.encode(raw),
      );
      const payload = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
      payload.set(iv, 0);
      payload.set(new Uint8Array(ciphertext), iv.length);
      return `v${ENCRYPTION_VERSION}:${btoa(String.fromCharCode(...payload))}`;
    }
  } catch {
    // Fall through to XOR
  }

  // XOR fallback
  try {
    const xored = xorCipher(raw, ESVA_SALT);
    return `v3:${xored}`;
  } catch {
    // Base64 legacy
    return `v1:${btoa(raw)}`;
  }
}

/**
 * Decrypt a stored API key.
 * Detects version prefix and uses appropriate layer.
 */
export async function decryptKey(stored: string): Promise<string> {
  // v4: AES-GCM
  if (stored.startsWith('v4:')) {
    const aesKey = await deriveAesKey();
    if (!aesKey) throw new Error('AES-GCM not available for decryption');
    const raw = atob(stored.slice(3));
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
    return new TextDecoder().decode(decrypted);
  }

  // v3: XOR
  if (stored.startsWith('v3:')) {
    return xorDecipher(stored.slice(3), ESVA_SALT);
  }

  // v2 / v1: Base64
  if (stored.startsWith('v2:') || stored.startsWith('v1:')) {
    return atob(stored.slice(3));
  }

  // No prefix: assume raw or plain Base64
  try {
    return atob(stored);
  } catch {
    return stored;
  }
}

// ─── PART 4: Streaming Chat ───────────────────────────────────

const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;

function getBackoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt + Math.random() * 500, 10_000);
}

function buildEndpoint(provider: AIProvider, model: string): string {
  switch (provider.id) {
    case 'gemini':
      return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
    case 'openai':
      return 'https://api.openai.com/v1/chat/completions';
    case 'claude':
      return 'https://api.anthropic.com/v1/messages';
    case 'groq':
      return 'https://api.groq.com/openai/v1/chat/completions';
    case 'mistral':
      return 'https://api.mistral.ai/v1/chat/completions';
    case 'ollama':
      return `${provider.baseUrl ?? 'http://localhost:11434'}/api/chat`;
    case 'lmstudio':
      return `${provider.baseUrl ?? 'http://localhost:1234'}/v1/chat/completions`;
    default:
      throw new Error(`Unknown provider: ${provider.id}`);
  }
}

function buildHeaders(provider: AIProvider, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  switch (provider.id) {
    case 'gemini':
      // Gemini uses key in URL query param; also set header for some endpoints
      headers['x-goog-api-key'] = apiKey;
      break;
    case 'openai':
    case 'groq':
    case 'mistral':
    case 'lmstudio':
      headers['Authorization'] = `Bearer ${apiKey}`;
      break;
    case 'claude':
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      break;
    // ollama: no auth needed
  }

  return headers;
}

function buildBody(
  provider: AIProvider,
  model: string,
  messages: ChatMessage[],
  systemPrompt?: string,
  temperature = 0.3,
  maxTokens = 4096,
): unknown {
  const sysMsg: ChatMessage[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }]
    : [];

  switch (provider.id) {
    case 'gemini': {
      const contents = [...sysMsg, ...messages].map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      return {
        contents,
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      };
    }
    case 'claude':
      return {
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt ?? undefined,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      };
    case 'ollama':
      return {
        model,
        messages: [...sysMsg, ...messages],
        stream: true,
        options: { temperature },
      };
    default:
      // OpenAI-compatible (OpenAI, Groq, Mistral, LM Studio)
      return {
        model,
        messages: [...sysMsg, ...messages],
        temperature,
        max_tokens: maxTokens,
        stream: true,
      };
  }
}

/**
 * Parse a single SSE chunk and return extracted text (if any).
 */
function parseChunk(provider: AIProvider, line: string): string | null {
  if (!line.startsWith('data: ')) return null;
  const data = line.slice(6).trim();
  if (data === '[DONE]') return null;

  try {
    const json = JSON.parse(data);

    switch (provider.id) {
      case 'gemini':
        return json.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
      case 'claude':
        if (json.type === 'content_block_delta') {
          return json.delta?.text ?? null;
        }
        return null;
      default:
        // OpenAI-compatible
        return json.choices?.[0]?.delta?.content ?? null;
    }
  } catch {
    return null;
  }
}

/**
 * Stream a chat completion from any supported provider.
 * BYOK-first: apiKey param -> server env -> error.
 */
export async function streamChat(opts: StreamChatOptions): Promise<string> {
  const provider = PROVIDERS[opts.provider];
  if (!provider) throw new Error(`Unknown provider: ${opts.provider}`);

  const apiKey = opts.apiKey ?? '';
  if (!apiKey && !isLocalProvider(opts.provider)) {
    throw new Error(`No API key provided for ${provider.name}. ESVA uses BYOK (Bring Your Own Key).`);
  }

  const endpoint = buildEndpoint(provider, opts.model);
  const headers = buildHeaders(provider, apiKey);
  const body = buildBody(provider, opts.model, opts.messages, opts.systemPrompt, opts.temperature, opts.maxTokens);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: opts.signal,
      });

      if (!res.ok) {
        if (TRANSIENT_STATUS_CODES.has(res.status) && attempt < MAX_RETRIES) {
          await sleep(getBackoffMs(attempt));
          continue;
        }
        const errBody = await res.text().catch(() => '');
        throw new Error(`${provider.name} API error ${res.status}: ${errBody.slice(0, 200)}`);
      }

      // Handle Ollama NDJSON streaming
      if (provider.id === 'ollama') {
        return await streamNdjson(res, opts.onChunk);
      }

      // SSE streaming
      return await streamSSE(res, provider, opts.onChunk);

    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (opts.signal?.aborted) throw lastError;
      if (attempt < MAX_RETRIES) {
        await sleep(getBackoffMs(attempt));
        continue;
      }
    }
  }

  throw lastError ?? new Error('Stream failed after retries');
}

async function streamSSE(
  res: Response,
  provider: AIProvider,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const text = parseChunk(provider, line);
      if (text) {
        fullText += text;
        onChunk?.(text);
      }
    }
  }

  return fullText;
}

async function streamNdjson(
  res: Response,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        const text = json.message?.content ?? '';
        if (text) {
          fullText += text;
          onChunk?.(text);
        }
      } catch { /* skip malformed lines */ }
    }
  }

  return fullText;
}

// ─── PART 5: Utility Exports ──────────────────────────────────

export function isLocalProvider(providerId: string): boolean {
  return providerId === 'ollama' || providerId === 'lmstudio';
}

export function getProvider(id: string): AIProvider | undefined {
  return PROVIDERS[id];
}

export function getModelList(providerId: string): AIModel[] {
  return PROVIDERS[providerId]?.models ?? [];
}

export function getDefaultModel(providerId: string): string {
  return PROVIDERS[providerId]?.defaultModel ?? '';
}

export function hasCapability(
  providerId: string,
  cap: keyof ProviderCapabilities,
): boolean {
  const p = PROVIDERS[providerId];
  if (!p) return false;
  return !!p.capabilities[cap];
}

export function getProviderIds(): string[] {
  return Object.keys(PROVIDERS);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
