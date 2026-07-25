/**
 * 횡단 로깅 래퍼의 계약.
 *
 * 이 래퍼는 49개 라우트 전부에 걸린다. 그래서 "무엇을 기록하는가"보다
 * **"무엇을 절대 깨뜨리지 않는가"** 가 더 중요한 계약이다. 첫 구현이 정확히
 * 그 지점에서 실패했다 — headers 가 없는 요청에서 래퍼가 터져 라우트 8개가
 * 죽었고, 전체 스위트가 그걸 잡았다.
 */

import { withRequestLog } from '../with-request-log';

describe('withRequestLog — 응답을 그대로 통과시킨다', () => {
  let logSpy: jest.SpyInstance;
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { logSpy.mockRestore(); errSpy.mockRestore(); });

  const req = (init: Partial<Request> = {}) =>
    ({ url: 'http://localhost/api/thing', method: 'GET', headers: new Headers(), ...init }) as Request;

  it('핸들러의 응답 객체를 바꾸지 않는다', async () => {
    const original = new Response('body', { status: 201 });
    const wrapped = withRequestLog(async () => original);

    const result = await wrapped(req());
    expect(result).toBe(original);
    expect(result.status).toBe(201);
  });

  it('추가 인자(라우트 params)를 그대로 전달한다', async () => {
    const seen: unknown[] = [];
    const wrapped = withRequestLog(async (_r: Request, ctx: { params: { id: string } }) => {
      seen.push(ctx);
      return new Response('ok');
    });

    await wrapped(req(), { params: { id: '42' } });
    expect(seen).toEqual([{ params: { id: '42' } }]);
  });

  it('예외를 삼키지 않고 그대로 다시 던진다 — Next 의 오류 처리를 보존한다', async () => {
    const boom = new Error('handler exploded');
    const wrapped = withRequestLog(async () => { throw boom; });

    await expect(wrapped(req())).rejects.toBe(boom);
    expect(errSpy).toHaveBeenCalled();
  });
});

describe('withRequestLog — 관측이 제품을 이기지 않는다', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { jest.restoreAllMocks(); });

  it('headers 가 없는 요청에서도 핸들러를 정상 실행한다 (실측 회귀)', async () => {
    const wrapped = withRequestLog(async () => new Response('ok', { status: 200 }));
    // 테스트·내부 호출이 넘기는 최소 mock 요청. 표준 Request 가 아니다.
    const minimal = { url: 'http://localhost/api/x', method: 'GET' } as Request;

    const res = await wrapped(minimal);
    expect(res.status).toBe(200);
  });

  it('url 이 URL 이 아니어도 죽지 않는다', async () => {
    const wrapped = withRequestLog(async () => new Response('ok'));
    const res = await wrapped({ url: 'not-a-url', method: 'POST' } as Request);
    expect(res.status).toBe(200);
  });

  it('요청 객체가 통째로 비어도 핸들러 결과를 돌려준다', async () => {
    // 204 는 바디를 가질 수 없다 — null 이어야 한다.
    const wrapped = withRequestLog(async () => new Response(null, { status: 204 }));
    const res = await wrapped({} as Request);
    expect(res.status).toBe(204);
  });

  it('요청 바디를 읽지 않는다 — 읽으면 핸들러가 빈 바디를 본다', async () => {
    const real = new Request('http://localhost/api/x', { method: 'POST', body: 'payload' });
    const wrapped = withRequestLog(async (r: Request) => new Response(await r.text()));

    const res = await wrapped(real);
    expect(await res.text()).toBe('payload');
  });
});
