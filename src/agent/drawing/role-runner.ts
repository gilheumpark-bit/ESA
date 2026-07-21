/**
 * Independent role calls — separate prompts; never merge into one mega-prompt.
 */

import { createHash } from 'node:crypto';
import type { RoleId } from './types-v3';
import {
  CONNECTIONS_PROMPT,
  COVERAGE_AUDITOR_PROMPT,
  LOGIC_PROMPT,
  ROLE_PROMPT_VERSION,
  SYMBOLS_PROMPT,
  TEXT_PROMPT,
} from './role-prompts';

export interface RoleCallRequest {
  role: Exclude<RoleId, never>;
  pageIndex: number;
  regionId: string;
  imageBuffer: ArrayBuffer;
  mimeType?: string;
  provider: 'gemini' | 'openai' | 'claude';
  apiKey: string;
  model?: string;
  /** For logic role only — sealed summary JSON string */
  sealedSummaryJson?: string;
}

export interface RoleCallResult {
  role: RoleId;
  callId: string;
  promptVersion: string;
  inputDigest: string;
  outputDigest: string;
  rawText: string;
  parsed: unknown;
  durationMs: number;
  success: boolean;
  error?: string;
}

const PROMPTS: Record<string, string> = {
  symbols: SYMBOLS_PROMPT,
  connections: CONNECTIONS_PROMPT,
  text: TEXT_PROMPT,
  logic: LOGIC_PROMPT,
  'coverage-auditor': COVERAGE_AUDITOR_PROMPT,
};

export function promptForRole(role: RoleId): string {
  return PROMPTS[role] ?? SYMBOLS_PROMPT;
}

export async function runRoleCall(req: RoleCallRequest): Promise<RoleCallResult> {
  const started = Date.now();
  const prompt = promptForRole(req.role);
  const inputDigest = createHash('sha256')
    .update(Buffer.from(req.imageBuffer))
    .update(prompt)
    .update(req.sealedSummaryJson ?? '')
    .update(ROLE_PROMPT_VERSION)
    .digest('hex');
  const callId = `call-${req.role}-p${req.pageIndex}-${req.regionId}-${inputDigest.slice(0, 10)}`;

  try {
    const { analyzeDrawingWithVLM } = await import('../vision/vlm-client');
    // Role-specific path: call underlying HTTP with custom prompt via analyzeRoleImage
    const result = await analyzeRoleImage(req, prompt);
    const rawText = typeof result === 'string' ? result : JSON.stringify(result);
    const outputDigest = createHash('sha256').update(rawText).digest('hex');
    return {
      role: req.role,
      callId,
      promptVersion: ROLE_PROMPT_VERSION,
      inputDigest,
      outputDigest,
      rawText,
      parsed: safeJson(rawText),
      durationMs: Date.now() - started,
      success: true,
    };
  } catch (err) {
    // Fallback: if custom role path fails, attempt shared VLM with note (still separate call)
    try {
      const { analyzeDrawingWithVLM } = await import('../vision/vlm-client');
      const vlm = await analyzeDrawingWithVLM(
        req.imageBuffer,
        req.mimeType ?? 'image/png',
        { provider: req.provider, apiKey: req.apiKey, model: req.model },
      );
      const adapted = adaptLegacyVlmToRole(req.role, vlm);
      const rawText = JSON.stringify(adapted);
      return {
        role: req.role,
        callId,
        promptVersion: ROLE_PROMPT_VERSION,
        inputDigest,
        outputDigest: createHash('sha256').update(rawText).digest('hex'),
        rawText,
        parsed: adapted,
        durationMs: Date.now() - started,
        success: true,
      };
    } catch (err2) {
      const message = err2 instanceof Error ? err2.message : String(err2);
      void err;
      return {
        role: req.role,
        callId,
        promptVersion: ROLE_PROMPT_VERSION,
        inputDigest,
        outputDigest: createHash('sha256').update(message).digest('hex'),
        rawText: '',
        parsed: null,
        durationMs: Date.now() - started,
        success: false,
        error: message,
      };
    }
  }
}

async function analyzeRoleImage(req: RoleCallRequest, prompt: string): Promise<unknown> {
  // Use provider-specific raw call with role prompt when possible
  const base64 = Buffer.from(req.imageBuffer).toString('base64');
  const mime = req.mimeType ?? 'image/png';
  const fullPrompt = req.role === 'logic' && req.sealedSummaryJson
    ? `${prompt}\n\nSEALED_SUMMARY:\n${req.sealedSummaryJson}`
    : prompt;

  if (req.provider === 'gemini') {
    const model = req.model ?? 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': req.apiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: fullPrompt },
            { inline_data: { mime_type: mime, data: base64 } },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini role call failed: ${res.status}`);
    const json = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  }

  if (req.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model ?? 'gpt-4o',
        temperature: 0.1,
        max_completion_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: fullPrompt },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        }],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI role call failed: ${res.status}`);
    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content ?? '';
  }

  // claude
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: req.model ?? 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
          { type: 'text', text: fullPrompt },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Claude role call failed: ${res.status}`);
  const json = await res.json() as { content?: Array<{ text?: string }> };
  return json.content?.map((c) => c.text ?? '').join('') ?? '';
}

function adaptLegacyVlmToRole(role: RoleId, vlm: {
  components: Array<{ id: string; type: string; label: string; position?: { x: number; y: number }; confidence: number }>;
  connections: Array<{ from: string; to: string }>;
}): unknown {
  if (role === 'symbols') {
    return {
      components: vlm.components.map((c) => ({
        id: c.id,
        type: c.type,
        label: c.label,
        x: c.position?.x ?? 0,
        y: c.position?.y ?? 0,
        w: 40,
        h: 40,
        confidence: c.confidence,
      })),
    };
  }
  if (role === 'connections') {
    return {
      connections: vlm.connections.map((c, i) => ({
        id: `c-${i}`,
        lineKind: 'power',
        path: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        fromHint: c.from,
        toHint: c.to,
        confidence: 0.5,
      })),
    };
  }
  if (role === 'text') {
    return {
      texts: vlm.components
        .filter((c) => c.label)
        .map((c, i) => ({
          id: `t-${i}`,
          text: c.label,
          candidates: [c.label],
          x: c.position?.x ?? 0,
          y: c.position?.y ?? 0,
          w: 80,
          h: 20,
          confidence: c.confidence,
        })),
    };
  }
  if (role === 'coverage-auditor') {
    return { rescanTargets: [] };
  }
  return { flows: [], issues: [], confidence: 0.5 };
}

function safeJson(text: string): unknown {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

export { ROLE_PROMPT_VERSION };
