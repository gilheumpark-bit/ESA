import { runRoleCall } from '@/agent/drawing/role-runner';
import { recognizeNameplate } from '@/lib/ocr-nameplate';
import { analyzeSLD } from '@/lib/sld-recognition';

const apiKey = ['agent', 'platform', 'vision', 'request', 'key'].join('-');
const model = 'gemini-3.6-flash';
const originalFetch = global.fetch;

function googleResponse(text: string): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Agent Platform legacy vision production callers', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('keeps SLD, nameplate OCR, and role calls on the Agent Platform host', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(googleResponse('{"components":[],"connections":[],"confidence":0}'))
      .mockResolvedValueOnce(googleResponse('{"rawText":"220V","confidence":0.8,"language":"ko"}'))
      .mockResolvedValueOnce(googleResponse('{"texts":[],"warnings":[],"confidence":1}'));
    global.fetch = fetchMock as typeof fetch;

    await analyzeSLD('iVBORw0KGgo=', {
      provider: 'google-agent-platform',
      model,
      apiKey,
    });
    await recognizeNameplate('iVBORw0KGgo=', {
      provider: 'google-agent-platform',
      model,
      apiKey,
    });
    const role = await runRoleCall({
      role: 'text',
      pageIndex: 0,
      regionId: 'P01-A01',
      imageBuffer: Uint8Array.from([137, 80, 78, 71]).buffer,
      mimeType: 'image/png',
      provider: 'google-agent-platform',
      model,
      apiKey,
    });

    expect(role.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).toBe(
        'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.6-flash:generateContent',
      );
      expect(String(url)).not.toContain(apiKey);
      expect(String(url)).not.toContain('generativelanguage.googleapis.com');
      expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe(apiKey);
    }
  });
});
