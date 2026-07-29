/**
 * 전역 보안 헤더 — `next.config.ts` 가 그대로 내보낸다.
 *
 * 설정 파일 안에 두지 않고 여기로 뺀 이유는 **검사할 수 있게** 하기 위해서다.
 * `next.config.ts` 안에서 `process.env.NODE_ENV` 로 분기하면 jest 트랜스폼이
 * 그 값을 `"test"` 로 인라인해 버려 프로덕션 분기가 영영 안 돌아간다
 * (실측: `Object.defineProperty` 로 바꿔도 삼항의 결과가 안 바뀐다).
 * 환경을 인자로 받으면 두 분기를 다 밟을 수 있다.
 */

export interface SecurityHeader {
  key: string;
  value: string;
}

/**
 * `script-src` 에 아직 `'unsafe-inline'` 이 있다 — 그동안 CSP 는 XSS 를 거의
 * 막지 못한다. 빼지 못하는 이유는 Next App Router 가 페이지마다 하이드레이션
 * 데이터(`self.__next_f.push(...)`)를 인라인 스크립트로 심기 때문이다.
 * 본문이 페이지마다 달라 해시로 잠글 수 없고, nonce 를 쓰려면 미들웨어가
 * 필요한데 그러면 전 페이지가 동적 렌더링으로 떨어진다. 알고 남긴 부채다.
 */
export function buildContentSecurityPolicy(isProduction: boolean): string {
  return [
    "default-src 'self'",
    // dev 는 React Fast Refresh 가 콜스택을 되짚을 때 eval 을 쓴다.
    // 프로덕션에는 절대 새어 들어가면 안 된다.
    isProduction
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    // 출처 연결 SLD 리포트는 브라우저 로컬 IndexedDB 의 도면을
    // object URL 로 그린다.
    "img-src 'self' data: blob: https:",
    "font-src 'self' https://cdn.jsdelivr.net",
    "object-src 'none'",
    // X-Frame-Options 의 CSP 판. 둘 다 두는 이유는 구형 브라우저가
    // frame-ancestors 를 모르고, 최신 브라우저는 CSP 가 있으면
    // X-Frame-Options 쪽을 무시하기 때문이다.
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "connect-src 'self' https://*.supabase.co https://*.googleapis.com https://*.firebaseio.com https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.stripe.com",
    "frame-src 'self' https://js.stripe.com",
  ].join('; ');
}

/**
 * `next.config.ts` 와 `src/proxy.ts` 가 **같은 목록**을 쓴다.
 *
 * 앞서는 둘이 따로 세팅해 어긋나 있었다 — proxy 는 HSTS 를
 * `max-age=63072000 … preload` 로, 설정 파일은 아예 걸지 않아서
 * proxy 가 건너뛰는 경로(`/_next`·`/static`·`favicon.ico`)만 HSTS 가 없었다.
 * 정적 자산이 평문으로 새는 구멍이고, 목록이 둘이면 다음에 또 어긋난다.
 *
 * proxy 는 CSP 를 걸지 않으므로 `withCsp` 로 갈라 둔다 — 라우트 응답에
 * 헤더를 얹는 쪽은 CSP 를 중복해서 실을 필요가 없다(설정 파일이 이미
 * 전 경로에 건다).
 */
export function buildSecurityHeaders(
  isProduction: boolean,
  withCsp = true,
): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-XSS-Protection', value: '1; mode=block' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // 한 번 HTTPS 로 온 브라우저는 이후 평문으로 돌아가지 않는다.
    // `preload` 는 이미 배포된 값이라 유지한다 — 브라우저 목록에서 빼는 데
    // 몇 달이 걸리므로 지금 약하게 바꾸는 쪽이 오히려 위험하다.
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ];
  if (withCsp) {
    headers.push({
      key: 'Content-Security-Policy',
      value: buildContentSecurityPolicy(isProduction),
    });
  }
  return headers;
}
