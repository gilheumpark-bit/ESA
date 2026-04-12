/**
 * VLM Client — 실제 비전 모델 API 호출
 * ---------------------------------------
 * Gemini 2.5 Flash Vision / OpenAI GPT-4.1 Vision 실 연동.
 * BYOK 기반 — 사용자의 API 키로 호출.
 *
 * PART 1: Provider abstraction
 * PART 2: Gemini Vision
 * PART 3: OpenAI Vision
 * PART 4: Unified interface
 */

import type { ExtractedComponent, ExtractedConnection } from '../teams/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Provider Abstraction
// ═══════════════════════════════════════════════════════════════════════════════

export type VLMProvider = 'gemini' | 'openai';

export interface VLMOptions {
  provider: VLMProvider;
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export interface VLMAnalysisResult {
  components: ExtractedComponent[];
  connections: ExtractedConnection[];
  rawText: string;
  confidence: number;
  model: string;
  durationMs: number;
}

const SLD_VISION_PROMPT = `You are an expert electrical engineer analyzing a single-line diagram (SLD) / schematic.

Extract ALL electrical components and connections from this drawing section.

Return ONLY valid JSON (no markdown):
{
  "components": [
    {"id": "unique-id", "type": "transformer|breaker|motor|panel|bus|generator|load|cable_tray|switch|fuse|spd|ground|meter|contactor|vfd", "label": "component label/name", "rating": "rating if visible (e.g. 500kVA, 100A)", "x": approx_x_position, "y": approx_y_position, "confidence": 0.0-1.0}
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
// PART 2 — Gemini Vision
// ═══════════════════════════════════════════════════════════════════════════════

async function analyzeWithGemini(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  model: string = 'gemini-2.5-flash',
): Promise<VLMAnalysisResult> {
  const start = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini Vision API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

  return parseVLMResponse(text, model, Date.now() - start);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — OpenAI Vision
// ═══════════════════════════════════════════════════════════════════════════════

async function analyzeWithOpenAI(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  model: string = 'gpt-4.1',
): Promise<VLMAnalysisResult> {
  const start = Date.now();

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
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
      temperature: 0.1,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI Vision API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? '{}';

  return parseVLMResponse(text, model, Date.now() - start);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Unified Interface
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
 * 통합 VLM 분석 — provider에 따라 Gemini/OpenAI 라우팅.
 *
 * @param imageBuffer — 이미지 바이너리
 * @param mimeType — image/png, image/jpeg 등
 * @param options — provider, apiKey, model
 */
export async function analyzeDrawingWithVLM(
  imageBuffer: ArrayBuffer,
  mimeType: string,
  options: VLMOptions,
): Promise<VLMAnalysisResult> {
  // ArrayBuffer → Base64
  const uint8 = new Uint8Array(imageBuffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  const base64 = btoa(binary);

  switch (options.provider) {
    case 'gemini':
      return analyzeWithGemini(base64, mimeType, options.apiKey, options.model ?? 'gemini-2.5-flash');
    case 'openai':
      return analyzeWithOpenAI(base64, mimeType, options.apiKey, options.model ?? 'gpt-4.1');
    default:
      throw new Error(`Unsupported VLM provider: ${options.provider}`);
  }
}
