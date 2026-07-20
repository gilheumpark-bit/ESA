import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { RATE_LIMIT_PROFILES } from '@/lib/rate-limit';

describe('proxy rate-limit response contract', () => {
  test('returns the common nested error shape and a user-facing message', async () => {
    const makeRequest = () => new NextRequest('http://localhost/api/calculate', {
      headers: { 'x-forwarded-for': '198.51.100.77' },
    });

    for (let i = 0; i < RATE_LIMIT_PROFILES.default.maxRequests; i++) {
      expect(proxy(makeRequest()).status).not.toBe(429);
    }

    const blocked = proxy(makeRequest());
    const body = await blocked.json();

    expect(blocked.status).toBe(429);
    expect(body).toEqual({
      success: false,
      error: {
        code: 'ESVA-2005',
        message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      },
    });
  });
});
