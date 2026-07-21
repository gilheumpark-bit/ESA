import { NextRequest } from 'next/server';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { POST } from '../route';

jest.mock('@/lib/auth-helpers', () => ({
  extractVerifiedUserId: jest.fn(),
}));

const mockExtractVerifiedUserId = jest.mocked(extractVerifiedUserId);

function makeRequest(serverUrl: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/settings/onpremise-test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
    },
    body: JSON.stringify({
      serverUrl,
      apiType: 'ollama',
      modelName: 'audit-model',
      timeout: 1,
    }),
  });
}

describe('POST /api/settings/onpremise-test security boundary', () => {
  const originalAllowlist = process.env.ONPREMISE_ALLOWED_ORIGINS;

  beforeEach(() => {
    jest.restoreAllMocks();
    mockExtractVerifiedUserId.mockReset();
    delete process.env.ONPREMISE_ALLOWED_ORIGINS;
  });

  afterAll(() => {
    if (originalAllowlist === undefined) {
      delete process.env.ONPREMISE_ALLOWED_ORIGINS;
    } else {
      process.env.ONPREMISE_ALLOWED_ORIGINS = originalAllowlist;
    }
  });

  test('rejects an unauthenticated request before contacting the target', async () => {
    mockExtractVerifiedUserId.mockResolvedValue(null);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('target fetch must not run'),
    );

    const response = await POST(makeRequest('http://127.0.0.1:11434'));

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('rejects an authenticated target that is not explicitly allowlisted', async () => {
    mockExtractVerifiedUserId.mockResolvedValue('firebase-user-1');
    process.env.ONPREMISE_ALLOWED_ORIGINS = 'http://127.0.0.1:11434';
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('target fetch must not run'),
    );

    const response = await POST(makeRequest('http://127.0.0.1:9999'));

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('preserves an authenticated connection to an exact allowlisted origin', async () => {
    mockExtractVerifiedUserId.mockResolvedValue('firebase-user-1');
    process.env.ONPREMISE_ALLOWED_ORIGINS = 'http://127.0.0.1:11434';
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const response = await POST(makeRequest('http://127.0.0.1:11434'));

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
