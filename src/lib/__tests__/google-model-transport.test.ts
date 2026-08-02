import {
  googleApiKeyHeaders,
  googleCandidateText,
  googleGenerateContentEndpoint,
  sanitizeGoogleErrorText,
} from '@/lib/google-model-transport';

describe('fixed Google model transport', () => {
  it('routes Agent Platform and Gemini Developer API to different fixed hosts', () => {
    expect(googleGenerateContentEndpoint('google-agent-platform', 'gemini-3.6-flash')).toBe(
      'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.6-flash:generateContent',
    );
    expect(googleGenerateContentEndpoint('gemini', 'gemini-3.6-flash')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
    );
  });

  it.each(['bad/../model', 'bad//model', '?key=secret', ''])(
    'rejects unsafe model id %p before constructing a request URL',
    (model) => {
      expect(() => googleGenerateContentEndpoint('google-agent-platform', model)).toThrow(
        /model id/i,
      );
    },
  );

  it('keeps the API key in a header and out of the endpoint', () => {
    const apiKey = ['request', 'scoped', 'google', 'key'].join('-');
    const endpoint = googleGenerateContentEndpoint('google-agent-platform', 'gemini-3.6-flash');

    expect(endpoint).not.toContain(apiKey);
    expect(googleApiKeyHeaders(apiKey)).toEqual({
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    });
  });

  it('redacts request keys and bounds provider error text', () => {
    const apiKey = ['provider', 'echoed', 'secret', 'key'].join('-');

    const sanitized = sanitizeGoogleErrorText(`${apiKey} ${'x'.repeat(1_000)}`, apiKey);

    expect(sanitized).not.toContain(apiKey);
    expect(sanitized).toContain('[REDACTED]');
    expect(sanitized.length).toBeLessThanOrEqual(400);
  });

  it('ignores Gemini thought parts and returns only final response text', () => {
    expect(googleCandidateText({
      candidates: [{
        content: {
          parts: [
            { thought: true, text: 'internal reasoning' },
            { text: '{"components":[],' },
            { text: '"connections":[]}' },
          ],
        },
      }],
    })).toBe('{"components":[],"connections":[]}');
  });
});
