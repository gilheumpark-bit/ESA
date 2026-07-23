import { NextRequest } from 'next/server';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { POST } from '../route';

let streamParts = ['ok'];
interface StreamTextOptions {
  instructions?: string;
  messages: Array<{ role: string; content: string }>;
}

const streamTextMock = jest.fn((_options: StreamTextOptions) => ({
  textStream: (async function* textStream() {
    for (const part of streamParts) yield part;
  })(),
}));

jest.mock('@/lib/auth-helpers', () => ({
  extractVerifiedUserId: jest.fn(),
}));

jest.mock('ai', () => ({
  streamText: (options: StreamTextOptions) => streamTextMock(options),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => () => ({}),
}));

const mockExtractVerifiedUserId = jest.mocked(extractVerifiedUserId);

function makeRequest(serverUrl: string, content = 'hello'): NextRequest {
  return new NextRequest('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
      'X-Forwarded-For': '198.51.100.50',
    },
    body: JSON.stringify({
      provider: 'onpremise',
      model: 'audit-model',
      messages: [{ role: 'user', content }],
      systemPrompt: 'system rules',
      onpremise: { serverUrl, apiType: 'ollama' },
    }),
  });
}

describe('POST /api/chat on-premise security boundary', () => {
  const originalAllowlist = process.env.ONPREMISE_ALLOWED_ORIGINS;

  beforeEach(() => {
    mockExtractVerifiedUserId.mockReset();
    streamTextMock.mockClear();
    streamParts = ['ok'];
    delete process.env.ONPREMISE_ALLOWED_ORIGINS;
  });

  afterAll(() => {
    if (originalAllowlist === undefined) {
      delete process.env.ONPREMISE_ALLOWED_ORIGINS;
    } else {
      process.env.ONPREMISE_ALLOWED_ORIGINS = originalAllowlist;
    }
  });

  test('rejects unauthenticated use of a private target', async () => {
    mockExtractVerifiedUserId.mockResolvedValue(null);

    const response = await POST(makeRequest('http://127.0.0.1:11434'));

    expect(response.status).toBe(401);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  test('rejects a private target outside the deployment allowlist', async () => {
    mockExtractVerifiedUserId.mockResolvedValue('firebase-user-1');
    process.env.ONPREMISE_ALLOWED_ORIGINS = 'http://127.0.0.1:11434';

    const response = await POST(makeRequest('http://127.0.0.1:9999'));

    expect(response.status).toBe(403);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  test('never emits an unsafe raw model token before output filtering', async () => {
    mockExtractVerifiedUserId.mockResolvedValue('firebase-user-1');
    process.env.ONPREMISE_ALLOWED_ORIGINS = 'http://127.0.0.1:11434';
    streamParts = ['정격은 ', '999A입니다.'];

    const response = await POST(makeRequest('http://127.0.0.1:11434'));
    const streamBody = await response.text();

    expect(response.status).toBe(200);
    expect(streamBody).not.toContain('999A');
    expect(streamBody).toContain('[BLOCKED: Tool 호출 필요');
  });

  test('passes the system prompt through SDK instructions, not a system message', async () => {
    mockExtractVerifiedUserId.mockResolvedValue('firebase-user-1');
    process.env.ONPREMISE_ALLOWED_ORIGINS = 'http://127.0.0.1:11434';

    const response = await POST(makeRequest('http://127.0.0.1:11434'));
    await response.text();

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const options = streamTextMock.mock.calls[0][0];
    expect(options.instructions).toBe('system rules');
    expect(options.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  test('injects a deterministic calculator receipt for a complete calculation query', async () => {
    mockExtractVerifiedUserId.mockResolvedValue('firebase-user-1');
    process.env.ONPREMISE_ALLOWED_ORIGINS = 'http://127.0.0.1:11434';

    const query = '전압강하 계산: 3상 380V 100A 50m 35mm2 Cu 역률 0.9';
    const response = await POST(makeRequest('http://127.0.0.1:11434', query));
    await response.text();

    const options = streamTextMock.mock.calls[0][0];
    expect(options.instructions).toContain('검증된 ESA 계산기 영수증');
    expect(options.instructions).toContain('[SOURCE: ESA_CALCULATOR:voltage-drop]');
    expect(options.messages).toEqual([{ role: 'user', content: query }]);
  });
});
