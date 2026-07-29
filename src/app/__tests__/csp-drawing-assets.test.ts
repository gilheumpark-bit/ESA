import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import nextConfig from '../../../next.config';
import { buildContentSecurityPolicy, buildSecurityHeaders } from '@/lib/security-headers';

const prod = buildContentSecurityPolicy(true);
const dev = buildContentSecurityPolicy(false);
const directive = (policy: string, name: string) =>
  policy.split('; ').find((d) => d.startsWith(`${name} `));

describe('drawing source CSP contract', () => {
  it('allows browser-local blob URLs used by the source-linked overlay', () => {
    expect(directive(prod, 'img-src')).toContain('blob:');
  });

  it('blocks plugin objects and constrains document base/form targets', () => {
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("base-uri 'self'");
    expect(prod).toContain("form-action 'self'");
  });

  /**
   * X-Frame-Options 만으로는 부족하다 — 최신 브라우저는 CSP 가 있으면
   * `frame-ancestors` 를 보고 X-Frame-Options 를 무시한다. 즉 CSP 를 켠
   * 상태에서 `frame-ancestors` 가 없으면 **프레임 차단이 오히려 약해진다**.
   */
  it('클릭재킹을 두 헤더 모두로 막는다', () => {
    expect(prod).toContain("frame-ancestors 'none'");
    expect(buildSecurityHeaders(true).find((h) => h.key === 'X-Frame-Options')?.value)
      .toBe('DENY');
  });

  /**
   * HSTS — 한 번 HTTPS 로 온 브라우저를 평문으로 되돌리지 않는다.
   *
   * **이 값은 이미 배포돼 있다.** `preload` 는 브라우저 내장 목록 등재를
   * 신청하는 표시라 빼는 데 몇 달이 걸린다 — 약하게 바꾸는 쪽이 더 위험하므로
   * 배포된 값을 정본으로 둔다.
   */
  it('HSTS 를 2년 · 서브도메인 포함 · preload 로 건다', () => {
    const hsts = buildSecurityHeaders(true)
      .find((h) => h.key === 'Strict-Transport-Security')?.value;
    expect(Number(/max-age=(\d+)/.exec(hsts ?? '')?.[1] ?? 0)).toBeGreaterThanOrEqual(63_072_000);
    expect(hsts).toContain('includeSubDomains');
    expect(hsts).toContain('preload');
  });

  /**
   * **목록이 하나여야 한다.** proxy(미들웨어)와 설정 파일이 따로 적고 있었고
   * 실제로 어긋나 있었다 — proxy 만 HSTS 를 걸어서 proxy 가 건너뛰는 경로
   * (`/_next`·`/static`·`favicon.ico`)에는 HSTS 가 없었다.
   */
  it('proxy 와 설정 파일이 같은 목록을 쓴다', async () => {
    const proxySrc = readFileSync(join(__dirname, '..', '..', 'proxy.ts'), 'utf8');
    expect(proxySrc).toMatch(/buildSecurityHeaders\(/);
    // proxy 가 자기 목록을 다시 적지 않는지 — 값이 코드에 박히면 또 갈린다.
    expect(proxySrc).not.toMatch(/max-age=/);

    const fromConfig = (await nextConfig.headers?.())
      ?.find((r) => r.source === '/(.*)')?.headers ?? [];
    const fromModule = buildSecurityHeaders(process.env.NODE_ENV === 'production');
    expect(fromConfig).toEqual(fromModule);
  });

  /**
   * `unsafe-eval` 은 dev 전용이다(React Fast Refresh 가 콜스택을 되짚을 때
   * 쓴다). 프로덕션 분기에 새어 들어가면 CSP 가 남은 몫마저 잃는다.
   */
  it('eval 은 dev 에만 있다', () => {
    expect(directive(prod, 'script-src')).not.toContain("'unsafe-eval'");
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'");
  });

  /**
   * **남은 구멍을 검사로 적어 둔다.**
   *
   * `script-src` 에 `'unsafe-inline'` 이 있는 한 CSP 는 XSS 를 거의 막지
   * 못한다. 지금 빼지 못하는 이유는 `security-headers.ts` 머리말에 적혀 있다.
   * 이 검사는 "막혔다" 가 아니라 **"아직 안 막혔다"** 를 고정한다 — 누군가
   * nonce 를 붙이면 여기서 깨지고, 그때 이 검사와 그 문단을 함께 지운다.
   */
  it('[알려진 구멍] script-src 가 아직 unsafe-inline 이다', () => {
    expect(directive(prod, 'script-src')).toContain("'unsafe-inline'");
  });

  /** 설정 파일이 실제로 이 헤더들을 내보내는지 — 모듈만 맞고 배선이 빠지면 소용없다. */
  it('next.config 가 이 헤더를 전 경로에 건다', async () => {
    const rules = await nextConfig.headers?.();
    const global = rules?.find((r) => r.source === '/(.*)');
    const keys = global?.headers.map((h) => h.key) ?? [];
    expect(keys).toEqual(expect.arrayContaining([
      'Content-Security-Policy',
      'Strict-Transport-Security',
      // 카메라·마이크·위치·결제 API 를 통째로 끈다. 앞서는 proxy 만 걸어서
      // 정적 자산 응답에는 없었다.
      'Permissions-Policy',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
    ]));
  });
});
