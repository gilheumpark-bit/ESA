/**
 * VLM Client — 실제 비전 모델 API 호출
 * ---------------------------------------
 * Gemini / OpenAI / Anthropic Vision 실 연동.
 * BYOK 기반 — 사용자의 API 키로 호출.
 *
 * PART 1: Provider abstraction + config
 * PART 2: Retry + key validation
 * PART 3: Gemini Vision
 * PART 4: OpenAI Vision
 * PART 5: Unified interface
 */

import type { ExtractedComponent, ExtractedConnection } from '../teams/types';
import { ROLE_PROMPTS } from './role-prompts';
import { parseRoleReviewData, type RoleReviewData } from './review-types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Provider Abstraction + Configurable Params
// ═══════════════════════════════════════════════════════════════════════════════

export type VLMProvider = 'gemini' | 'openai' | 'claude';

export interface VLMOptions {
  provider: VLMProvider;
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** 최대 재시도 횟수 (기본 2) */
  maxRetries?: number;
  /** 호출 취소를 위한 외부 signal */
  signal?: AbortSignal;
  /** 요청별 제한 시간(ms, 기본 30초) */
  timeoutMs?: number;
}

export interface VLMAnalysisResult {
  components: ExtractedComponent[];
  connections: ExtractedConnection[];
  rawText: string;
  confidence: number;
  model: string;
  durationMs: number;
  retryCount?: number;
}

export interface VLMRoleAnalysisResult {
  role: keyof typeof ROLE_PROMPTS;
  data: RoleReviewData;
  rawText: string;
  model: string;
  durationMs: number;
  retryCount: number;
}

/** VLM 호출 설정 — 하드코딩 대신 중앙 관리 */
const VLM_CONFIG = {
  gemini: {
    defaultModel: 'gemini-3.5-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultTemp: 0.1,
    defaultMaxTokens: 8192,
  },
  openai: {
    defaultModel: 'gpt-5.6-terra',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultTemp: 0.1,
    defaultMaxTokens: 8192,
  },
  claude: {
    defaultModel: 'claude-sonnet-5',
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultTemp: 0.1,
    defaultMaxTokens: 8192,
  },
} as const;

const SLD_VISION_PROMPT = `You are an expert electrical engineer analyzing a single-line diagram (SLD) / schematic.

Extract ALL electrical components and connections from this drawing section.

Return ONLY valid JSON (no markdown):
{
  "components": [
    {"id": "unique-id", "type": "transformer|breaker|motor|panel|bus|generator|load|cable_tray|switch|fuse|spd|ground|meter|contactor|vfd|ct|vt|relay|rcd|capacitor|reactor|pv_module|pv_inverter|ev_charger|ups|ats|pdu|battery", "label": "component label/name", "rating": "rating if visible (e.g. 500kVA, 100A)", "x": 0_to_1000, "y": 0_to_1000, "confidence": 0.0-1.0}
  ],
  "connections": [
    {"from": "component-id-1", "to": "component-id-2", "cableType": "cable spec if visible", "length": meters_if_shown}
  ]
}

Rules:
- Include EVERY symbol, text annotation, and connection line
- Use standardized type names from the list above
- Rating must include units (kVA, A, V, kW, mm², AWG)
- x and y are required integers from 0 to 1000, relative to this cropped image; origin is top-left
- Only include connection length when a numeric length with a unit is explicitly printed in the crop
- Convert an explicitly printed connection length to meters; never infer length from pixels or spacing
- confidence: 1.0=certain, 0.5=uncertain
- If text is Korean, preserve as-is in label field`;

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

interface RawProviderJsonResult {
  rawText: string;
  model: string;
}

interface RawVLMJsonResult extends RawProviderJsonResult {
  retryCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Retry Logic + Key Validation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * API 키 기본 검증 (포맷 체크, 빈값 방지).
 * 실제 유효성은 API 호출로만 확인 가능.
 */
function validateApiKey(provider: VLMProvider, apiKey: string): void {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(`[VLM] ${provider} API key is empty. BYOK 설정에서 키를 등록하세요.`);
  }
  if (provider === 'openai' && !apiKey.startsWith('sk-')) {
    throw new Error(`[VLM] OpenAI API key must start with "sk-". 키 형식을 확인하세요.`);
  }
  if (provider === 'gemini' && apiKey.length < 20) {
    throw new Error(`[VLM] Gemini API key appears too short. 키를 다시 확인하세요.`);
  }
  if (provider === 'claude' && apiKey.length < 20) {
    throw new Error(`[VLM] Anthropic API key appears too short. 키를 다시 확인하세요.`);
  }
}

/**
 * 지수 백오프 재시도.
 * 429 (Rate Limit) / 5xx (Server Error) 에서만 재시도.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
): Promise<{ result: T; retryCount: number }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, retryCount: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // 재시도 불가능한 에러 (401, 403) → 즉시 throw
      const errMsg = lastError.message;
      if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('invalid_api_key')) {
        throw lastError;
      }

      // 마지막 시도면 throw
      if (attempt >= maxRetries) break;

      // 지수 백오프: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error('[VLM] Unknown error after retries');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Gemini Vision
// ═══════════════════════════════════════════════════════════════════════════════

function validateImageInput(imageBuffer: ArrayBuffer, mimeType: string): void {
  if (!(imageBuffer instanceof ArrayBuffer) || imageBuffer.byteLength < 1 || imageBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('[VLM] image input exceeds the allowed byte limit.');
  }
  if (typeof mimeType !== 'string' || mimeType.trim().length === 0 || mimeType.length > 128) {
    throw new Error('[VLM] image MIME type must be a bounded string.');
  }
}

function validateTimeout(timeoutMs: number | undefined): number {
  const value = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
    throw new Error('[VLM] timeout must be a positive bounded integer.');
  }
  return value;
}

function sanitizeErrorText(value: unknown, apiKey: string, limit = 300): string {
  const message = value instanceof Error ? value.message : String(value);
  return message.split(apiKey).join('[REDACTED]').slice(0, limit);
}

function responseByteLength(text: string): number {
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(text, 'utf8');
  return new TextEncoder().encode(text).byteLength;
}

async function readResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error('[VLM] provider response exceeds the allowed byte limit.');
  }
  if (!response.body) {
    const text = await response.text();
    if (responseByteLength(text) > MAX_RESPONSE_BYTES) {
      throw new Error('[VLM] provider response exceeds the allowed byte limit.');
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('[VLM] provider response exceeds the allowed byte limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  if (responseByteLength(text) > MAX_RESPONSE_BYTES) {
    throw new Error('[VLM] provider response exceeds the allowed byte limit.');
  }
  return text;
}

async function fetchWithTimeout(url: string, init: RequestInit, options: VLMOptions): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, validateTimeout(options.timeoutMs));
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener('abort', forwardAbort, { once: true });
  if (options.signal?.aborted) controller.abort();

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error('[VLM] request timed out.');
    throw new Error(options.signal?.aborted ? '[VLM] request aborted.' : sanitizeErrorText(error, options.apiKey));
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', forwardAbort);
  }
}

function parseProviderPayload(provider: string, raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('response is not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`${provider} Vision API returned invalid JSON.`);
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function requestGeminiJson(
  imageBase64: string,
  mimeType: string,
  prompt: string,
  options: VLMOptions,
): Promise<RawProviderJsonResult> {
  const cfg = VLM_CONFIG.gemini;
  const model = options.model ?? cfg.defaultModel;
  const response = await fetchWithTimeout(`${cfg.endpoint}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
      generationConfig: {
        temperature: options.temperature ?? cfg.defaultTemp,
        maxOutputTokens: options.maxTokens ?? cfg.defaultMaxTokens,
        responseMimeType: 'application/json',
      },
    }),
  }, options);
  const raw = await readResponseText(response);
  if (!response.ok) throw new Error(`Gemini Vision API error ${response.status}: ${sanitizeErrorText(raw, options.apiKey)}`);
  const data = parseProviderPayload('Gemini', raw);
  const candidate = Array.isArray(data.candidates) ? recordValue(data.candidates[0]) : undefined;
  const content = candidate ? recordValue(candidate.content) : undefined;
  const firstPart = content && Array.isArray(content.parts) ? recordValue(content.parts[0]) : undefined;
  const rawText = firstPart?.text;
  if (typeof rawText !== 'string') throw new Error('Gemini Vision API returned no text response.');
  return { rawText, model };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — OpenAI Vision
// ═══════════════════════════════════════════════════════════════════════════════

async function requestOpenAIJson(
  imageBase64: string,
  mimeType: string,
  prompt: string,
  options: VLMOptions,
): Promise<RawProviderJsonResult> {
  const cfg = VLM_CONFIG.openai;
  const model = options.model ?? cfg.defaultModel;
  // GPT-5 계열은 임의 temperature를 지원하지 않을 수 있다. 최신 Chat
  // Completions 규격의 max_completion_tokens를 사용하고, 구형 모델에만
  // 요청자가 지정한 temperature를 전달한다.
  const generationControls = model.startsWith('gpt-5')
    ? {}
    : { temperature: options.temperature ?? cfg.defaultTemp };

  const response = await fetchWithTimeout(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } },
            { type: 'text', text: 'Analyze this electrical drawing. Return JSON only.' },
          ],
        },
      ],
      ...generationControls,
      max_completion_tokens: options.maxTokens ?? cfg.defaultMaxTokens,
      response_format: { type: 'json_object' },
    }),
  }, options);

  const raw = await readResponseText(response);
  if (!response.ok) throw new Error(`OpenAI Vision API error ${response.status}: ${sanitizeErrorText(raw, options.apiKey)}`);
  const data = parseProviderPayload('OpenAI', raw);
  const choice = Array.isArray(data.choices) ? recordValue(data.choices[0]) : undefined;
  const message = choice ? recordValue(choice.message) : undefined;
  const rawText = message?.content;
  if (typeof rawText !== 'string') throw new Error('OpenAI Vision API returned no text response.');
  return { rawText, model };
}

async function requestClaudeJson(
  imageBase64: string,
  mimeType: string,
  prompt: string,
  options: VLMOptions,
): Promise<RawProviderJsonResult> {
  const cfg = VLM_CONFIG.claude;
  const model = options.model ?? cfg.defaultModel;
  const response = await fetchWithTimeout(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens ?? cfg.defaultMaxTokens,
      temperature: options.temperature ?? cfg.defaultTemp,
      system: prompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: 'Analyze this electrical drawing. Return JSON only.' },
        ],
      }],
    }),
  }, options);

  const raw = await readResponseText(response);
  if (!response.ok) throw new Error(`Anthropic API error ${response.status}: ${sanitizeErrorText(raw, options.apiKey)}`);
  const data = parseProviderPayload('Anthropic', raw);
  const rawText = Array.isArray(data.content)
    ? data.content.reduce((text, part) => {
      const item = recordValue(part);
      return item?.type === 'text' && typeof item.text === 'string' ? text + item.text : text;
    }, '')
    : '';
  if (!rawText) throw new Error('Anthropic API returned no text response.');
  return { rawText, model };
}

function extractJson(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^\x60{3}(?:json)?\s*([\s\S]*?)\s*\x60{3}$/i);
  return fenced?.[1] ?? trimmed;
}

function retryLimit(value: number | undefined): number {
  const limit = value ?? 2;
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 5) {
    throw new Error('[VLM] maxRetries must be a bounded non-negative integer.');
  }
  return limit;
}

async function callProviderForJson(
  imageBuffer: ArrayBuffer,
  mimeType: string,
  prompt: string,
  options: VLMOptions,
): Promise<RawVLMJsonResult> {
  validateApiKey(options.provider, options.apiKey);
  validateImageInput(imageBuffer, mimeType);
  const imageBase64 = arrayBufferToBase64(imageBuffer);
  const request = () => {
    switch (options.provider) {
      case 'gemini':
        return requestGeminiJson(imageBase64, mimeType, prompt, options);
      case 'openai':
        return requestOpenAIJson(imageBase64, mimeType, prompt, options);
      case 'claude':
        return requestClaudeJson(imageBase64, mimeType, prompt, options);
    }
  };

  try {
    const { result, retryCount } = await withRetry(request, retryLimit(options.maxRetries));
    return { ...result, retryCount };
  } catch (error) {
    throw new Error(sanitizeErrorText(error, options.apiKey));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Unified Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * VLM JSON 응답 파싱.
 * 형식 불일치·범위 이탈·끊긴 연결은 계산 근거로 승격하지 않고 제거한다.
 */
export function parseVLMResponse(
  rawText: string,
  model: string,
  durationMs: number,
): VLMAnalysisResult {
  try {
    const parsed: unknown = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object') throw new Error('VLM 응답은 객체여야 합니다.');
    const record = parsed as Record<string, unknown>;
    if ((record.components != null && !Array.isArray(record.components)) ||
        (record.connections != null && !Array.isArray(record.connections))) {
      throw new Error('VLM components/connections는 배열이어야 합니다.');
    }

    const componentRows = (record.components ?? []) as unknown[];
    const components: ExtractedComponent[] = [];
    const ids = new Set<string>();
    for (const row of componentRows.slice(0, 2_000)) {
      if (!row || typeof row !== 'object') continue;
      const c = row as Record<string, unknown>;
      const id = safeText(c.id, 128);
      const type = safeText(c.type, 64);
      const x = finiteNumber(c.x);
      const y = finiteNumber(c.y);
      if (!id || ids.has(id) || !type || x == null || y == null || x < 0 || x > 1000 || y < 0 || y > 1000) continue;
      ids.add(id);
      const rawConfidence = finiteNumber(c.confidence) ?? 0.5;
      const rating = safeText(c.rating, 256);
      components.push({
        id,
        type,
        label: safeText(c.label, 256) ?? type,
        ...(rating ? { rating } : {}),
        position: { x, y },
        confidence: Math.max(0, Math.min(1, rawConfidence)),
      });
    }

    const connectionRows = (record.connections ?? []) as unknown[];
    const connections: ExtractedConnection[] = [];
    const seenConnections = new Set<string>();
    for (const row of connectionRows.slice(0, 5_000)) {
      if (!row || typeof row !== 'object') continue;
      const conn = row as Record<string, unknown>;
      const from = safeText(conn.from, 128);
      const to = safeText(conn.to, 128);
      const cableType = safeText(conn.cableType, 256);
      if (!from || !to || from === to || !ids.has(from) || !ids.has(to)) continue;
      const key = `${from}\u0000${to}\u0000${cableType ?? ''}`;
      if (seenConnections.has(key)) continue;
      seenConnections.add(key);
      const rawLength = finiteNumber(conn.length);
      const length = rawLength != null && rawLength > 0 && rawLength <= 1_000_000
        ? rawLength
        : undefined;
      connections.push({
        from,
        to,
        ...(cableType ? { cableType } : {}),
        ...(length != null ? { length, unit: 'm' } : {}),
      });
    }

    const avgConf = components.length > 0
      ? components.reduce((s, c) => s + c.confidence, 0) / components.length
      : 0;

    return { components, connections, rawText, confidence: avgConf, model, durationMs };
  } catch {
    return { components: [], connections: [], rawText, confidence: 0, model, durationMs };
  }
}

function safeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * ArrayBuffer → Base64 (Node.js + Browser 호환)
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // Node.js Buffer available
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  // Browser fallback
  const uint8 = new Uint8Array(buffer);
  const chunks: string[] = [];
  const CHUNK_SIZE = 8192;
  for (let i = 0; i < uint8.length; i += CHUNK_SIZE) {
    const slice = uint8.subarray(i, i + CHUNK_SIZE);
    chunks.push(String.fromCharCode(...slice));
  }
  return btoa(chunks.join(''));
}

/**
 * 통합 VLM 분석 — provider에 따라 Gemini/OpenAI 라우팅.
 * 재시도 + 키 검증 + provider fallback 포함.
 */
export async function analyzeDrawingWithVLM(
  imageBuffer: ArrayBuffer,
  mimeType: string,
  options: VLMOptions,
): Promise<VLMAnalysisResult> {
  const started = Date.now();
  const response = await callProviderForJson(imageBuffer, mimeType, SLD_VISION_PROMPT, options);
  return {
    ...parseVLMResponse(response.rawText, response.model, Date.now() - started),
    retryCount: response.retryCount,
  };
}

export async function analyzeDrawingRole(
  imageBuffer: ArrayBuffer,
  mimeType: string,
  role: keyof typeof ROLE_PROMPTS,
  options: VLMOptions,
): Promise<VLMRoleAnalysisResult> {
  const started = Date.now();
  const response = await callProviderForJson(imageBuffer, mimeType, ROLE_PROMPTS[role], options);
  const parsed = JSON.parse(extractJson(response.rawText));
  return {
    role,
    data: parseRoleReviewData(role, parsed),
    rawText: response.rawText,
    model: response.model,
    durationMs: Date.now() - started,
    retryCount: response.retryCount,
  };
}
