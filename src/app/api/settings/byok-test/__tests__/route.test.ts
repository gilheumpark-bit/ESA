import { NextRequest } from 'next/server';
import { POST } from '../route';

const requestKey = ['secret', 'test', 'key', '123456'].join('-');

function makeRequest(
  provider: string,
  apiKey = requestKey,
  origin = 'http://localhost:3000',
  extra: Record<string, unknown> = {},
): NextRequest {
  return new NextRequest('http://localhost:3000/api/settings/byok-test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify({ provider, apiKey, ...extra }),
  });
}

describe('POST /api/settings/byok-test', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('rejects cross-origin key transmission before provider contact', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('provider must not be contacted'),
    );

    const response = await POST(makeRequest('openai', undefined, 'https://attacker.example'));

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('rejects providers outside the fixed cloud allowlist', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('provider must not be contacted'),
    );

    const response = await POST(makeRequest('ollama'));

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('sends a Gemini key in a header, never in the URL', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        models: [
          { name: 'models/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding-004', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const response = await POST(makeRequest('gemini'));
    const body = await response.json() as { data?: { models?: Array<{ id: string; name: string }> } };

    expect(response.status).toBe(200);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models');
    expect(String(url)).not.toContain('secret-test-key');
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe(requestKey);
    expect(body.data?.models).toEqual([
      { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
    ]);
  });

  test('returns selectable models from OpenAI-compatible model-list responses', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        data: [
          { id: 'gpt-5.6-terra' },
          { id: 'text-embedding-3-large' },
          { id: '../unsafe-model' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const response = await POST(makeRequest('openai'));
    const body = await response.json() as { data?: { models?: Array<{ id: string; name: string }> } };

    expect(body.data?.models).toEqual([{ id: 'gpt-5.6-terra', name: 'gpt-5.6-terra' }]);
  });

  test('does not accept a Claude method error as proof of a valid key', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 405 }),
    );

    const response = await POST(makeRequest('claude'));

    expect(response.status).toBe(502);
  });

  test('returns an explicit invalid result for provider authentication failures', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 401 }),
    );

    const response = await POST(makeRequest('openai'));
    const body = await response.json() as { data?: { valid?: boolean } };

    expect(response.status).toBe(200);
    expect(body.data?.valid).toBe(false);
  });

  test('probes one Gemini model for both text and image-input compatibility', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'OK' }] } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: 'Image input is not supported' },
      }), { status: 400, headers: { 'Content-Type': 'application/json' } }));

    const response = await POST(makeRequest('gemini', requestKey, undefined, {
      action: 'probe-model',
      model: 'gemini-3.5-flash',
    }));
    const body = await response.json() as {
      data?: {
        model?: string;
        text?: { status?: string };
        vision?: { status?: string; detail?: string };
      };
    };

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchSpy.mock.calls) {
      expect(String(url)).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
      );
      expect(String(url)).not.toContain(requestKey);
      expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe(requestKey);
    }
    expect(body.data).toMatchObject({
      model: 'gemini-3.5-flash',
      text: { status: 'success' },
      vision: { status: 'failed', detail: 'Image input is not supported' },
    });
  });

  test('rejects unsafe or non-Gemini model probe targets before provider contact', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('provider must not be contacted'),
    );

    const response = await POST(makeRequest('gemini', requestKey, undefined, {
      action: 'probe-model',
      model: '../unsafe-model',
    }));

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('does not mark image-only candidates as compatible with text-based ESA analysis', async () => {
    const imageOnly = new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'abc' } }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(imageOnly)
      .mockResolvedValueOnce(imageOnly.clone());

    const response = await POST(makeRequest('gemini', requestKey, undefined, {
      action: 'probe-model',
      model: 'gemini-image-only',
    }));
    const body = await response.json() as {
      data?: { text?: { status?: string }; vision?: { status?: string } };
    };

    expect(body.data?.text?.status).toBe('failed');
    expect(body.data?.vision?.status).toBe('failed');
  });

  test('puts max-token responses without final text on hold instead of declaring incompatibility', async () => {
    const maxTokens = () => new Response(JSON.stringify({
      candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(maxTokens())
      .mockResolvedValueOnce(maxTokens());

    const response = await POST(makeRequest('gemini', requestKey, undefined, {
      action: 'probe-model',
      model: 'gemini-thinking-model',
    }));
    const body = await response.json() as {
      data?: { text?: { status?: string }; vision?: { status?: string } };
    };

    expect(body.data?.text?.status).toBe('hold');
    expect(body.data?.vision?.status).toBe('hold');
  });
});
