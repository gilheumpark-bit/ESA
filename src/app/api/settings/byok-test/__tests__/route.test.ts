import { NextRequest } from 'next/server';
import { POST } from '../route';

const requestKey = ['secret', 'test', 'key', '123456'].join('-');

function makeRequest(
  provider: string,
  apiKey = requestKey,
  origin = 'http://localhost:3000',
): NextRequest {
  return new NextRequest('http://localhost:3000/api/settings/byok-test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify({ provider, apiKey }),
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
      new Response('{}', { status: 200 }),
    );

    const response = await POST(makeRequest('gemini'));

    expect(response.status).toBe(200);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models');
    expect(String(url)).not.toContain('secret-test-key');
    expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe(requestKey);
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
});
