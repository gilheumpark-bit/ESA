export type GoogleModelProvider = 'gemini' | 'google-agent-platform';

const SAFE_MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;

const GOOGLE_MODEL_BASE: Record<GoogleModelProvider, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
  'google-agent-platform': 'https://aiplatform.googleapis.com/v1/publishers/google/models',
};

export function googleGenerateContentEndpoint(
  provider: GoogleModelProvider,
  model: string,
): string {
  if (!SAFE_MODEL_ID.test(model) || model.includes('..') || model.includes('//')) {
    throw new Error('[ESA] Invalid Google model id.');
  }
  return `${GOOGLE_MODEL_BASE[provider]}/${model}:generateContent`;
}

export function googleApiKeyHeaders(apiKey: string): {
  'Content-Type': 'application/json';
  'x-goog-api-key': string;
} {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };
}

/**
 * Gemini 3 계열은 최종 텍스트 앞에 `thought: true` 파트를 둘 수 있다.
 * 사고 파트를 제품 JSON으로 오인하지 않고 첫 후보의 최종 텍스트만 합친다.
 */
export function googleCandidateText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = (payload as Record<string, unknown>).candidates;
  if (!Array.isArray(candidates) || !candidates[0] || typeof candidates[0] !== 'object') return '';
  const content = (candidates[0] as Record<string, unknown>).content;
  if (!content || typeof content !== 'object') return '';
  const parts = (content as Record<string, unknown>).parts;
  if (!Array.isArray(parts)) return '';
  return parts.reduce((text, part) => {
    if (!part || typeof part !== 'object') return text;
    const record = part as Record<string, unknown>;
    return record.thought !== true && typeof record.text === 'string'
      ? text + record.text
      : text;
  }, '');
}

export function sanitizeGoogleErrorText(
  text: string,
  apiKey: string,
  maxLength = 400,
): string {
  const redacted = apiKey ? text.split(apiKey).join('[REDACTED]') : text;
  return redacted.slice(0, maxLength);
}
