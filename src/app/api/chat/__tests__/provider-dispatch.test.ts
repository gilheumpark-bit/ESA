import { NextRequest } from 'next/server';
import { POST } from '../route';

const openAIResponsesModelMock = jest.fn((_model: string) => ({}));
const openAIChatModelMock = jest.fn((_model: string) => ({}));
const openAIProviderMock = Object.assign(openAIResponsesModelMock, {
  chat: openAIChatModelMock,
});
const createOpenAIMock = jest.fn((_options?: unknown) => openAIProviderMock);
const vertexModelMock = jest.fn((_model: string) => ({}));
const createVertexMock = jest.fn((_options?: unknown) => vertexModelMock);
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

jest.mock('@ai-sdk/google-vertex', () => ({
  createVertex: (options?: unknown) => createVertexMock(options),
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
      apiKey: ['openai', 'groq', 'google-agent-platform'].includes(provider) ? `test-${provider}-key` : undefined,
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
    createVertexMock.mockClear();
    vertexModelMock.mockClear();
    streamTextMock.mockClear();
  });

  test('Agent Platform uses Vertex Express Mode without dispatching to Gemini Developer API', async () => {
    const response = await POST(request(
      'google-agent-platform',
      'gemini-3.6-flash',
      '198.51.100.60',
    ));
    await response.text();

    expect(response.status).toBe(200);
    expect(createVertexMock).toHaveBeenCalledWith({
      apiKey: 'test-google-agent-platform-key',
    });
    expect(vertexModelMock).toHaveBeenCalledWith('gemini-3.6-flash');
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

  /**
   * **이 검사는 앞서 BYOK 요청으로 429 를 기대했다.** `request()` 가 openai
   * 요청에 사용자 키를 실어 보내는데도 예산에 막히기를 기대한 것이고, 그건
   * 예산 검사가 키 해석보다 먼저 돌던 시절의 동작이다. 예산이 지키는 것은
   * 배포자의 청구서이므로 자기 키로 부르는 요청은 대상이 아니다 —
   * 그래서 여기서는 **서버 키 경로**로 확인한다.
   */
  test('서버 키 요청이 하루 예산을 통째로 넘기면 모델을 부르지 않는다', async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    const originalHeader = process.env.TRUSTED_CLIENT_IP_HEADER;
    process.env.OPENAI_API_KEY = 'server-side-key';
    process.env.TRUSTED_CLIENT_IP_HEADER = 'x-forwarded-for';
    try {
      const response = await POST(new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
          'X-Forwarded-For': '198.51.100.250',
        },
        body: JSON.stringify({
          provider: 'openai',
          model: 'gpt-5.6-luna',
          messages: [{ role: 'user', content: 'a'.repeat(2_000_100) }],
        }),
      }));

      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error.code).toBe('ESVA-3014');
      expect(streamTextMock).not.toHaveBeenCalled();
    } finally {
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
      if (originalHeader === undefined) delete process.env.TRUSTED_CLIENT_IP_HEADER;
      else process.env.TRUSTED_CLIENT_IP_HEADER = originalHeader;
    }
  });

  /** 같은 양을 자기 키로 보내면 통과한다 — 예산이 지갑을 따라간다. */
  test('BYOK 요청은 같은 양이어도 예산에 막히지 않는다', async () => {
    const response = await POST(request(
      'openai',
      'gpt-5.6-luna',
      '198.51.100.251',
      'a'.repeat(2_000_100),
    ));
    expect(response.status).toBe(200);
    await response.text();
  });
});
