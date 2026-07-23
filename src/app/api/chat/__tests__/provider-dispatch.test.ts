import { NextRequest } from 'next/server';
import { POST } from '../route';

const createOpenAIMock = jest.fn((_options?: unknown) => (_model: string) => ({}));
const streamTextMock = jest.fn(() => ({
  textStream: (async function* textStream() { yield 'ok'; })(),
  finishReason: Promise.resolve('stop'),
}));

jest.mock('ai', () => ({
  streamText: () => streamTextMock(),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: (options?: unknown) => createOpenAIMock(options),
}));

jest.mock('@/lib/auth-helpers', () => ({
  extractVerifiedUserId: jest.fn(),
}));

function request(provider: string, model: string, ip: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
      'X-Forwarded-For': ip,
    },
    body: JSON.stringify({
      provider,
      model,
      apiKey: provider === 'groq' ? 'test-groq-key' : undefined,
      messages: [{ role: 'user', content: 'hello' }],
    }),
  });
}

describe('POST /api/chat advertised provider dispatch', () => {
  beforeEach(() => {
    createOpenAIMock.mockClear();
    streamTextMock.mockClear();
  });

  test('Groq uses its OpenAI-compatible endpoint', async () => {
    const response = await POST(request('groq', 'openai/gpt-oss-20b', '198.51.100.61'));
    await response.text();

    expect(response.status).toBe(200);
    expect(createOpenAIMock).toHaveBeenCalledWith({
      apiKey: 'test-groq-key',
      baseURL: 'https://api.groq.com/openai/v1',
    });
  });

  test.each([
    ['ollama', 'llama4', 'http://localhost:11434/v1', '198.51.100.62'],
    ['lmstudio', 'local-model', 'http://localhost:1234/v1', '198.51.100.63'],
  ])('%s uses the validated local OpenAI-compatible endpoint', async (provider, model, baseURL, ip) => {
    const response = await POST(request(provider, model, ip));
    await response.text();

    expect(response.status).toBe(200);
    expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: 'local-provider', baseURL });
  });
});
