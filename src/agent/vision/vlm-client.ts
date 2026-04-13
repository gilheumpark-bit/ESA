/**
 * VLM Client — 실제 비전 모델 API 호출
 * ---------------------------------------
 * Gemini 2.5 Flash Vision / OpenAI GPT-4.1 Vision 실 연동.
 * BYOK 기반 — 사용자의 API 키로 호출.
 *
 * PART 1: Provider abstraction + config
 * PART 2: Retry + key validation
 * PART 3: Gemini Vision
 * PART 4: OpenAI Vision
 * PART 5: Unified interface
 */

import type { ExtractedComponent, ExtractedConnection } from '../teams/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Provider Abstraction + Configurable Params
// ═══════════════════════════════════════════════════════════════════════════════

export type VLMProvider = 'gemini' | 'openai';

export interface VLMOptions {
  provider: VLMProvider;
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** 최대 재시도 횟수 (기본 2) */
  maxRetries?: number;
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

/** VLM 호출 설정 — 하드코딩 대신 중앙 관리 */
const VLM_CONFIG = {
  gemini: {
    defaultModel: 'gemini-2.5-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultTemp: 0.1,
    defaultMaxTokens: 8192,
  },
  openai: {
    defaultModel: 'gpt-4.1',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultTemp: 0.1,
    defaultMaxTokens: 8192,
  },
} as const;

const SLD_VISION_PROMPT = `You are an expert electrical engineer analyzing a single-line diagram (SLD) / schematic.

Extract ALL electrical components and connections from this drawing section.

Return ONLY valid JSON (no markdown):
{
  "components": [
    {"id": "unique-id", "type": "transformer|breaker|motor|panel|bus|generator|load|cable_tray|switch|fuse|spd|ground|meter|contactor|vfd|ct|vt|relay|rcd|capacitor|reactor|pv_module|pv_inverter|ev_charger|ups|ats|pdu|battery", "label": "component label/name", "rating": "rating if visible (e.g. 500kVA, 100A)", "x": approx_x_position, "y": approx_y_position, "confidence": 0.0-1.0}
  ],
  "connections": [
    {"from": "component-id-1", "to": "component-id-2", "cableType": "cable spec if visible", "length": meters_if_shown}
  ]
}

Rules:
- Include EVERY symbol, text annotation, and connection line
- Use standardized type names from the list above
- Rating must include units (kVA, A, V, kW, mm², AWG)
- confidence: 1.0=certain, 0.5=uncertain
- If text is Korean, preserve as-is in label field`;

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

async function analyzeWithGemini(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  model?: string,
  temperature?: number,
  maxTokens?: number,
): Promise<VLMAnalysisResult> {
  const start = Date.now();
  const cfg = VLM_CONFIG.gemini;
  const finalModel = model ?? cfg.defaultModel;
  const url = `${cfg.endpoint}/${finalModel}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: SLD_VISION_PROMPT },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      }],
      generationConfig: {
        temperature: temperature ?? cfg.defaultTemp,
        maxOutputTokens: maxTokens ?? cfg.defaultMaxTokens,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini Vision API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

  return parseVLMResponse(text, finalModel, Date.now() - start);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — OpenAI Vision
// ═══════════════════════════════════════════════════════════════════════════════

async function analyzeWithOpenAI(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  model?: string,
  temperature?: number,
  maxTokens?: number,
): Promise<VLMAnalysisResult> {
  const start = Date.now();
  const cfg = VLM_CONFIG.openai;
  const finalModel = model ?? cfg.defaultModel;

  const response = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: finalModel,
      messages: [
        { role: 'system', content: SLD_VISION_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } },
            { type: 'text', text: 'Analyze this electrical drawing. Return JSON only.' },
          ],
        },
      ],
      temperature: temperature ?? cfg.defaultTemp,
      max_tokens: maxTokens ?? cfg.defaultMaxTokens,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI Vision API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? '{}';

  return parseVLMResponse(text, finalModel, Date.now() - start);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Unified Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * VLM JSON 응답 파싱.
 * 형식 불일치 시 graceful 빈 결과 반환.
 */
function parseVLMResponse(
  rawText: string,
  model: string,
  durationMs: number,
): VLMAnalysisResult {
  try {
    const parsed = JSON.parse(rawText);
    const components: ExtractedComponent[] = (parsed.components ?? []).map((c: Record<string, unknown>, i: number) => ({
      id: (c.id as string) ?? `vlm-${i}`,
      type: (c.type as string) ?? 'unknown',
      label: (c.label as string) ?? '',
      rating: c.rating as string | undefined,
      position: (c.x != null && c.y != null) ? { x: Number(c.x), y: Number(c.y) } : undefined,
      confidence: Number(c.confidence ?? 0.7),
    }));

    const connections: ExtractedConnection[] = (parsed.connections ?? []).map((conn: Record<string, unknown>) => ({
      from: String(conn.from ?? ''),
      to: String(conn.to ?? ''),
      cableType: conn.cableType as string | undefined,
      length: conn.length != null ? Number(conn.length) : undefined,
    }));

    const avgConf = components.length > 0
      ? components.reduce((s, c) => s + c.confidence, 0) / components.length
      : 0;

    return { components, connections, rawText, confidence: avgConf, model, durationMs };
  } catch {
    return { components: [], connections: [], rawText, confidence: 0, model, durationMs };
  }
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
  // 1) 키 검증
  validateApiKey(options.provider, options.apiKey);

  // 2) Base64 변환
  const base64 = arrayBufferToBase64(imageBuffer);

  // 3) 재시도 래핑
  const maxRetries = options.maxRetries ?? 2;

  const { result, retryCount } = await withRetry(async () => {
    switch (options.provider) {
      case 'gemini':
        return analyzeWithGemini(base64, mimeType, options.apiKey, options.model, options.temperature, options.maxTokens);
      case 'openai':
        return analyzeWithOpenAI(base64, mimeType, options.apiKey, options.model, options.temperature, options.maxTokens);
      default:
        throw new Error(`Unsupported VLM provider: ${options.provider}`);
    }
  }, maxRetries);

  return { ...result, retryCount };
}
