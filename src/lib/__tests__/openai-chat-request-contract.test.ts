import { analyzeDrawingWithVLM } from '@/agent/vision/vlm-client';
import { recognizeNameplate } from '../ocr-nameplate';
import { analyzeSLD } from '../sld-recognition';

const originalFetch = global.fetch;
const requestKey = ['sk', 'proj', 'test', 'key', 'long', 'enough'].join('-');

function responseWith(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestBody(fetchMock: jest.Mock, callIndex: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe('OpenAI current Chat Completions request contract', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uses max_completion_tokens and omits unsupported GPT-5 temperature for every vision path', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(responseWith('{"components":[],"connections":[]}'))
      .mockResolvedValueOnce(responseWith('{"components":[],"connections":[],"confidence":0}'))
      .mockResolvedValueOnce(responseWith('{"rawText":"220V","confidence":0.8,"language":"en"}'));
    global.fetch = fetchMock as typeof fetch;

    await analyzeDrawingWithVLM(new Uint8Array([137, 80, 78, 71]).buffer, 'image/png', {
      provider: 'openai',
      model: 'gpt-5.6-terra',
      apiKey: requestKey,
      maxRetries: 0,
    });
    await analyzeSLD('iVBORw0KGgo=', {
      provider: 'openai',
      model: 'gpt-5.6-terra',
      apiKey: requestKey,
    });
    await recognizeNameplate('iVBORw0KGgo=', {
      provider: 'openai',
      model: 'gpt-5.6-terra',
      apiKey: requestKey,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (let index = 0; index < 3; index += 1) {
      const body = requestBody(fetchMock, index);
      expect(body).toHaveProperty('max_completion_tokens');
      expect(body).not.toHaveProperty('max_tokens');
      expect(body).not.toHaveProperty('temperature');
    }
    expect(requestBody(fetchMock, 1).max_completion_tokens).toBe(8192);
  });
});
