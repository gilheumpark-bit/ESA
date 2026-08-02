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

export function sanitizeGoogleErrorText(
  text: string,
  apiKey: string,
  maxLength = 400,
): string {
  const redacted = apiKey ? text.split(apiKey).join('[REDACTED]') : text;
  return redacted.slice(0, maxLength);
}
