/**
 * 라우트 핸들러 요청/응답 로깅 래퍼
 * ─────────────────────────────────────────────────────────────────────────
 * 감사에서 "api-logger 가 49개 라우트 중 5개에만 배선"으로 지적된 관측 공백을 닫는다.
 * 실측 커버리지는 조금 달랐다 — withApiHandler(8개)가 이미 전체 라이프사이클을
 * 로깅하고 있었고, apiLog 직접 호출(5개)이 그 위에 이벤트를 얹고 있었다.
 *
 * **withApiHandler 를 나머지에 그대로 씌우지 않은 이유**: 그 래퍼는 로깅만
 * 하는 게 아니라 CORS origin 검사·레이트리밋·바디 크기 제한을 함께 **강제**한다.
 * 41개 라우트에 씌우면 관측이 아니라 동작이 바뀌고, 기존 클라이언트가 403/429 를
 * 받기 시작할 수 있다. 관측 공백을 메우자고 새 차단을 도입하는 건 요청 범위 밖이다.
 *
 * 그래서 이 래퍼는 **아무것도 막지 않는다**. 시간을 재고, 결과를 기록하고,
 * 예외는 기록 후 그대로 다시 던진다. 응답도 핸들러가 만든 것을 그대로 통과시킨다.
 *
 * 비밀값은 apiLog 의 마스킹 계약이 처리한다(lib/api-logger.ts). 이 래퍼는 요청
 * 바디를 읽지 않는다 — 읽으면 스트림이 소비돼 핸들러가 빈 바디를 보게 되고,
 * 무엇보다 바디에는 BYOK 키가 실려 온다.
 */

import { apiLog, createRequestTimer } from '@/lib/api-logger';

/**
 * 요청 타입을 제네릭으로 둔다. 라우트 핸들러는 대부분 NextRequest 를 받는데
 * 여기서 Request 로 고정하면 감싸는 순간 타입이 좁아져 cookies·nextUrl 이
 * 사라진다(첫 적용에서 41개 라우트가 전부 TS2345 로 실측됐다).
 */
type RouteHandler<R extends Request, A extends unknown[]> = (
  request: R,
  ...rest: A
) => Promise<Response> | Response;

/**
 * 관측 메타데이터 추출은 **절대 던지지 않는다.**
 *
 * 이 래퍼는 모든 라우트에 걸리는 횡단 장치다. 로그 한 줄을 남기려다 요청을
 * 실패시키면 관측을 얻는 대신 제품을 잃는다. 실제로 첫 구현이 그랬다 —
 * request.headers 가 없는 호출(테스트의 최소 mock 요청)에서 래퍼가 터져
 * 라우트 8개가 죽었다. 그 계약을 여기 못 박는다.
 */
function describeRequest(request: unknown): { route: string; method: string; requestId?: string } {
  const req = request as Partial<Request> | undefined;
  let route = 'unknown';
  try {
    if (typeof req?.url === 'string') route = new URL(req.url).pathname;
  } catch {
    /* URL 이 아니면 unknown 으로 둔다 */
  }
  let requestId: string | undefined;
  try {
    requestId = req?.headers?.get?.('x-esa-request-id') ?? undefined;
  } catch {
    /* headers 가 표준 Headers 가 아니면 포기한다 */
  }
  return { route, method: typeof req?.method === 'string' ? req.method : 'unknown', requestId };
}

export function withRequestLog<R extends Request, A extends unknown[]>(
  handler: RouteHandler<R, A>,
): (request: R, ...rest: A) => Promise<Response> {
  return async (request: R, ...rest: A): Promise<Response> => {
    const timer = createRequestTimer();
    const { route, method, requestId } = describeRequest(request);

    /** 로깅 실패가 요청을 죽이지 않는다. 기록은 부수효과지 계약이 아니다. */
    const safeLog = (entry: Parameters<typeof apiLog>[0]) => {
      try {
        apiLog(entry);
      } catch {
        /* 관측이 제품을 이기지 않는다 */
      }
    };

    try {
      const response = await handler(request, ...rest);
      const status = typeof response?.status === 'number' ? response.status : 0;
      safeLog({
        level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        event: 'request',
        route,
        requestId,
        status,
        durationMs: timer.elapsed(),
        meta: { method },
      });
      return response;
    } catch (error) {
      // 기록만 하고 그대로 던진다 — 삼키면 Next 의 오류 처리가 사라진다.
      safeLog({
        level: 'error',
        event: 'request',
        route,
        requestId,
        durationMs: timer.elapsed(),
        error: error instanceof Error ? error.message : String(error),
        meta: { method },
      });
      throw error;
    }
  };
}

// IDENTITY_SEAL: lib/api/with-request-log | role=라우트 요청/응답 로깅(차단 없음) | inputs=RouteHandler | outputs=RouteHandler
