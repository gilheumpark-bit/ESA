import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { checkRateLimit, getClientIp, RATE_LIMIT_PROFILES, resetRateLimits } from '@/lib/rate-limit';

const HEADERS = { 'x-forwarded-for': '198.51.100.77' };
const apiRequest = (path: string) => new NextRequest(`http://localhost${path}`, { headers: HEADERS });

describe('proxy rate-limit response contract', () => {
  beforeEach(() => resetRateLimits());

  test('returns the common nested error shape and a user-facing message', async () => {
    for (let i = 0; i < RATE_LIMIT_PROFILES.proxy.maxRequests; i++) {
      expect(proxy(apiRequest('/api/calculate')).status).not.toBe(429);
    }

    const blocked = proxy(apiRequest('/api/calculate'));
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

  /**
   * 전체 문서 판독 화면은 작업 상태를 1.5초마다 조회한다(분당 40회). 바깥 한도가
   * 모든 /api 를 합쳐 분당 60회였을 때는 이 조회만으로 한도 대부분을 썼고,
   * 라우트가 따로 둔 작업 전용 한도(분당 120회)는 닿을 수 없었다.
   */
  test('작업 상태 조회는 일반 바깥 한도에 막히지 않고 작업 전용 한도까지 간다', () => {
    const jobLimit = RATE_LIMIT_PROFILES['proxy-job'].maxRequests;
    expect(jobLimit).toBeGreaterThanOrEqual(RATE_LIMIT_PROFILES['sld-job'].maxRequests);

    for (let i = 0; i < jobLimit; i++) {
      expect(proxy(apiRequest('/api/drawing-jobs?jobId=job-1')).status).not.toBe(429);
    }
    expect(proxy(apiRequest('/api/drawing-jobs?jobId=job-1')).status).toBe(429);

    // 작업 조회가 일반 API 한도를 대신 깎지도 않는다.
    expect(proxy(apiRequest('/api/calculate')).status).not.toBe(429);
  });

  /**
   * 바깥 한도와 라우트의 'default' 한도가 같은 버킷(`ip:default`)을 쓰면 요청 하나가
   * 두 번 세어질 수 있다. 바깥 한도는 자기 버킷만 쓴다.
   */
  test('바깥 한도는 라우트의 default 버킷을 깎지 않는다', () => {
    for (let i = 0; i < RATE_LIMIT_PROFILES.proxy.maxRequests; i++) proxy(apiRequest('/api/calculate'));

    const routeLevel = checkRateLimit(getClientIp(new Headers(HEADERS)), 'default');
    expect(routeLevel.allowed).toBe(true);
    expect(routeLevel.remaining).toBe(RATE_LIMIT_PROFILES.default.maxRequests - 1);
  });
});
