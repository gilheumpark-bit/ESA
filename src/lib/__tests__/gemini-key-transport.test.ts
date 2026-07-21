import { analyzeDrawingWithVLM } from '@/agent/vision/vlm-client';
import { clearEmbeddingCache, generateEmbedding } from '../embedding';
import { recognizeNameplate } from '../ocr-nameplate';
import { analyzeSLD } from '../sld-recognition';

const GEMINI_KEY = 'gemini-secret-key-must-not-be-in-url';
const originalFetch = global.fetch;

jest.mock('../server-ai', () => ({
  resolveProviderKey: jest.fn(() => ({ key: GEMINI_KEY, source: 'env' })),
}));

function geminiResponse(content: string): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: content }] } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Gemini API key transport', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    clearEmbeddingCache();
  });

  test('keeps keys out of URLs for all vision and embedding paths', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(geminiResponse('{"components":[],"connections":[]}'))
      .mockResolvedValueOnce(geminiResponse('{"components":[],"connections":[],"confidence":0}'))
      .mockResolvedValueOnce(geminiResponse('{"rawText":"220V","confidence":0.8,"language":"ko"}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ embeddings: [{ values: [0.1, 0.2] }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    global.fetch = fetchMock as typeof fetch;

    await analyzeDrawingWithVLM(new Uint8Array([137, 80, 78, 71]).buffer, 'image/png', {
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      apiKey: GEMINI_KEY,
      maxRetries: 0,
    });
    await analyzeSLD('iVBORw0KGgo=', {
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      apiKey: GEMINI_KEY,
    });
    await recognizeNameplate('iVBORw0KGgo=', {
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      apiKey: GEMINI_KEY,
    });
    await generateEmbedding('unique transport contract text', 'gemini');

    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain(GEMINI_KEY);
      expect((init?.headers as Record<string, string>)['x-goog-api-key']).toBe(GEMINI_KEY);
    }
  });
});
