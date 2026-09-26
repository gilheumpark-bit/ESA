import type { ChatMessage } from './ai-providers';

/** Hard transport limits are independent of a provider's context/token limit. */
export const MAX_CHAT_BODY_BYTES = 2_000_000;
export const MAX_CHAT_MESSAGES = 100;
export const MAX_CHAT_CONTENT_CHARS = 1_600_000;

export interface ValidatedChatRequest {
  messages: ChatMessage[];
  provider: string;
  model: string;
  apiKey?: string;
  language?: 'ko' | 'en';
  temperature?: number;
  maxTokens?: number;
  onpremise?: {
    serverUrl: string;
    apiType: 'ollama' | 'vllm' | 'localai' | 'openai-compat';
    apiKey?: string;
  };
}

const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** Never coerce caller-controlled strings to numbers before reserving money. */
export function validateChatRequest(value: unknown): value is ValidatedChatRequest {
  if (!record(value) || !text(value.provider, 64) || !text(value.model, 256)) return false;
  if (!Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > MAX_CHAT_MESSAGES) return false;
  let chars = 0;
  for (const message of value.messages) {
    // Client system messages cannot override the server's instructions.
    if (!record(message) || (typeof message.role !== 'string' || !['user', 'assistant'].includes(message.role))
      || !text(message.content, MAX_CHAT_CONTENT_CHARS)) return false;
    chars += message.content.length;
  }
  if (chars > MAX_CHAT_CONTENT_CHARS || !value.messages.some((m) => m.role === 'user')) return false;
  if (value.apiKey !== undefined && (typeof value.apiKey !== 'string' || value.apiKey.length > 4096)) return false;
  if (value.language !== undefined && value.language !== 'ko' && value.language !== 'en') return false;
  if (value.temperature !== undefined && (typeof value.temperature !== 'number'
    || !Number.isFinite(value.temperature) || value.temperature < 0 || value.temperature > 2)) return false;
  if (value.maxTokens !== undefined && (typeof value.maxTokens !== 'number'
    || !Number.isSafeInteger(value.maxTokens) || value.maxTokens < 100 || value.maxTokens > 8192)) return false;
  if (value.onpremise !== undefined) {
    const o = value.onpremise;
    if (!record(o) || !text(o.serverUrl, 2048)
      || (typeof o.apiType !== 'string' || !['ollama', 'vllm', 'localai', 'openai-compat'].includes(o.apiType))
      || (o.apiKey !== undefined && (typeof o.apiKey !== 'string' || o.apiKey.length > 4096))) return false;
  }
  return true;
}

/** Bound the actual body, not just the untrusted Content-Length header. */
export async function readChatBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_CHAT_BODY_BYTES) throw new RangeError('CHAT_BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_CHAT_BODY_BYTES) {
        await reader.cancel();
        throw new RangeError('CHAT_BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); }
  catch { return null; }
}
