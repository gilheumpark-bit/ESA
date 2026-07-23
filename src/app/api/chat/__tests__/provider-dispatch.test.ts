import { NextRequest } from 'next/server';
import { POST } from '../route';

const openAIResponsesModelMock = jest.fn((_model: string) => ({}));
const openAIChatModelMock = jest.fn((_model: string) => ({}));
const openAIProviderMock = Object.assign(openAIResponsesModelMock, {
  chat: openAIChatModelMock,
});
const createOpenAIMock = jest.fn((_options?: unknown) => openAIProviderMock);
const streamTextMock = jest.fn((_options?: unknown) => ({
  textStream: (async function* textStream() { yield 'ok'; })(),
  finishReason: Promise.resolve('stop'),
}));

jest.mock('ai', () => ({
  streamText: (options: unknown) => streamTextMock(options),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: (options?: unknown) => createOpenAIMock(options),
}));

jest.mock('@/lib/auth-helpers', () => ({
  extractVerifiedUserId: jest.fn(),
}));

function request(
  provider: string,
  model: string,
  ip: string,
  message = 'hello',
  systemPrompt?: string,
): NextRequest {
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
      apiKey: ['openai', 'groq'].includes(provider) ? `test-${provider}-key` : undefined,
      messages: [{ role: 'user', content: message }],
      systemPrompt,
    }),
  });
}

describe('POST /api/chat advertised provider dispatch', () => {
  beforeEach(() => {
    createOpenAIMock.mockClear();
    openAIResponsesModelMock.mockClear();
    openAIChatModelMock.mockClear();
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
    expect(openAIChatModelMock).toHaveBeenCalledWith('openai/gpt-oss-20b');
    expect(openAIResponsesModelMock).not.toHaveBeenCalled();
  });

  test.each([
    ['ollama', 'llama4', 'http://localhost:11434/v1', '198.51.100.62'],
    ['lmstudio', 'local-model', 'http://localhost:1234/v1', '198.51.100.63'],
  ])('%s uses the validated local OpenAI-compatible endpoint', async (provider, model, baseURL, ip) => {
    const response = await POST(request(provider, model, ip));
    await response.text();

    expect(response.status).toBe(200);
    expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: 'local-provider', baseURL });
    expect(openAIChatModelMock).toHaveBeenCalledWith(model);
    expect(openAIResponsesModelMock).not.toHaveBeenCalled();
  });

  test('runs the deterministic calculator and emits its execution receipt', async () => {
    const response = await POST(request(
      'openai',
      'gpt-5.6-luna',
      '198.51.100.64',
      '전압강하 계산: 3상 380V 100A 50m 35mm2 Cu 역률 0.9',
    ));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('"calculation"');
    expect(body).toContain('"calculatorId":"voltage-drop"');
  });

  test('builds the system instruction on the server instead of trusting the client', async () => {
    const response = await POST(request(
      'openai',
      'gpt-5.6-luna',
      '198.51.100.65',
      'VCB 역할을 설명해줘',
      'CLIENT_CONTROLLED_SYSTEM_PROMPT',
    ));
    await response.text();

    const options = streamTextMock.mock.calls.at(-1)?.[0] as { instructions?: string };
    expect(options.instructions).toContain('ESVA 전기 직무 보조 AI');
    expect(options.instructions).not.toContain('CLIENT_CONTROLLED_SYSTEM_PROMPT');
  });
});
