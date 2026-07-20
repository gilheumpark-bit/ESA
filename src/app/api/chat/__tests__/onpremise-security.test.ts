import { NextRequest } from 'next/server';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { POST } from '../route';

let streamParts = ['ok'];
const streamTextMock = jest.fn(() => ({
  textStream: (async function* textStream() {
    for (const part of streamParts) yield part;
  })(),
}));

jest.mock('@/lib/auth-helpers', () => ({
  extractVerifiedUserId: jest.fn(),
}));

jest.mock('ai', () => ({
  streamText: () => streamTextMock(),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => () => ({}),
}));

const mockExtractVerifiedUserId = jest.mocked(extractVerifiedUserId);

function makeRequest(serverUrl: string): NextRequest {
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
      messages: [{ role: 'user', content: 'hello' }],
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
});
