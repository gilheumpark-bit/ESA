import { NextRequest } from 'next/server';

import { StoreUnavailableError, isStoreUnavailable } from '@/lib/supabase';
import { withApiHandler } from '@/lib/api/api-handler';

/**
 * **의존성이 없는 것과 우리 코드가 깨진 것은 다른 사건이다.**
 *
 * 라이브 실측(2026-07-29 · dev, Supabase 미구성):
 *
 *   GET /api/community        → 500  ESVA-7050
 *   GET /api/calculate/{id}   → 500  ESVA-4999
 *
 * 둘 다 코드 회귀가 아니라 **배포 설정**이 없어서 났다. 500 은 온콜을 깨우고
 * 릴리스를 되짚게 만든다 — 503 이면 "의존성 부재" 로 바로 읽힌다.
 * `/api/health` 는 이미 이 구분을 하고 있었고(critical down → 503) API
 * 라우트만 안 했다. 원인은 설정 게이트가 평범한 `Error` 를 던져 모든 catch 가
 * 500 으로 뭉갠 것.
 *
 * **이 파일의 첫 판은 소스 문자열 검사였다.** `toContain('isStoreUnavailable')`
 * 은 조건문을 `if (false)` 로 바꿔도 import 줄 때문에 통과했다 — 변이에서
 * 발각됐다(§2.2). 그래서 전부 **실제로 호출해서** 상태 코드를 본다.
 */

const throwsStore = () => {
  throw new StoreUnavailableError('서버 저장 서비스를 사용할 수 없습니다.');
};

const req = (url = 'http://localhost:3000/api/x') => new NextRequest(url, {
  headers: { Origin: 'http://localhost:3000' },
});

describe('저장소 부재 판별', () => {
  it('전용 타입을 알아본다', () => {
    expect(isStoreUnavailable(new StoreUnavailableError('x'))).toBe(true);
  });

  it.each([
    ['평범한 Error', new Error('boom')],
    ['문자열', 'boom'],
    ['null', null],
  ])('%s 는 저장소 부재가 아니다 — 과분류하면 진짜 500 을 숨긴다', (_l, value) => {
    expect(isStoreUnavailable(value)).toBe(false);
  });

  /** 번들 경계를 넘으면 instanceof 가 흔들린다 — name 으로도 잡는다. */
  it('다른 realm 에서 온 같은 오류도 알아본다', () => {
    const crossRealm = Object.assign(new Error('x'), { name: 'StoreUnavailableError' });
    expect(isStoreUnavailable(crossRealm)).toBe(true);
  });
});

describe('중앙 핸들러 — 실제로 호출해서 상태 코드를 본다', () => {
  it('저장소 부재는 503 · ESVA-5030', async () => {
    const handler = withApiHandler({ rateLimit: null }, async () => throwsStore());
    const res = await handler(req());
    const body = await res.json();
    expect(res.status).toBe(503);
    // 응답 키가 error 여야 한다 — 클라이언트가 그걸 읽는다. 삽입 스크립트가
    // key 까지 변수명으로 바꿔 놔 err 로 나가던 것을 이 검사가 잡았다.
    expect(body.error?.code).toBe('ESVA-5030');
  });

  /** 다른 오류까지 503 이 되면 진짜 장애가 "설정 문제" 로 묻힌다. */
  it('그 밖의 오류는 여전히 500 이다', async () => {
    const handler = withApiHandler({ rateLimit: null }, async () => {
      throw new Error('진짜 코드 버그');
    });
    expect((await handler(req())).status).toBe(500);
  });

  it('정상 응답은 그대로 200', async () => {
    const handler = withApiHandler({ rateLimit: null }, async (_r, ctx) => ctx.ok({ ok: true }));
    expect((await handler(req())).status).toBe(200);
  });
});

/**
 * 실측으로 500 이 났던 두 라우트. 저장소 계층을 목으로 세워 그 예외만 주고
 * **라우트가 실제로 무엇을 응답하는지** 본다.
 */
jest.mock('@/lib/community', () => ({
  getQuestions: jest.fn(async () => { throw new StoreUnavailableError('서버 저장 서비스를 사용할 수 없습니다.'); }),
  createQuestion: jest.fn(),
}));
jest.mock('@/lib/auth-helpers', () => ({ extractVerifiedUserId: jest.fn(async () => null) }));

describe('라우트 — 저장소가 없을 때', () => {
  it('GET /api/community 는 503 을 낸다', async () => {
    const { GET } = await import('@/app/api/community/route');
    const res = await GET(req('http://localhost:3000/api/community'));
    const body = await res.json();
    expect(res.status).toBe(503);
    // 응답 키가 error 여야 한다 — 클라이언트가 그걸 읽는다. 삽입 스크립트가
    // key 까지 변수명으로 바꿔 놔 err 로 나가던 것을 이 검사가 잡았다.
    expect(body.error?.code).toBe('ESVA-5030');
  });
});
