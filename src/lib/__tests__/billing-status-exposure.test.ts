import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getBillingStatus } from '@/lib/billing';

/**
 * 결제 상태가 **구성 내부를 알려 주지 않는지** 본다.
 *
 * `/api/billing/status` 는 인증이 없다. 누구나 부를 수 있다. 그래서 응답이
 * "결제가 켜져 있나" 이상을 말하면 안 된다 — 어떤 키가 빠졌는지, 어떤
 * 상품이 등록돼 있는지는 공격자에게 우리 구성을 알려 주는 것이다.
 *
 * 현재 구현은 옳다: `getBillingStatus` 는 `reason`('disabled' · 'incomplete'
 * · 'ready')을 계산하지만 라우트가 그걸 **떨어뜨리고** `enabled` 와 `plans`
 * 만 낸다. 그리고 미구성이면 `plans` 도 빈 배열이다.
 *
 * 지금 맞다는 것과 계속 맞다는 것은 다르다. 응답에 필드를 하나 더 얹는
 * 것은 쉽고, 그게 `reason` 이면 조용히 새어 나간다.
 */
const ROUTE = readFileSync(
  join(__dirname, '..', '..', 'app', 'api', 'billing', 'status', 'route.ts'),
  'utf8',
);

describe('결제 상태 노출 범위', () => {
  const withEnv = <T>(env: Record<string, string | undefined>, run: () => T): T => {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env)) {
      saved[k] = process.env[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      return run();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  it('결제가 꺼져 있으면 상품 목록을 내지 않는다', () => {
    const s = withEnv({ STRIPE_BILLING_ENABLED: 'false' }, getBillingStatus);
    expect(s.enabled).toBe(false);
    expect(s.plans).toEqual([]);
  });

  /**
   * 켜 놓고 키가 빠진 상태 — 여기서 "무엇이 빠졌는지" 가 새면 안 된다.
   *
   * **상품을 실제로 등록해 두고 본다.** 처음엔 그냥 `plans` 가 비었는지만
   * 봤는데, 미구성 환경에서는 어차피 비어 있어 "감춘다" 와 "원래 없다" 가
   * 구분되지 않았다 — 감추기를 없애는 변이가 안 걸렸다. 등록된 상품이
   * 있는데도 감추는지를 봐야 한다.
   */
  it('켜져 있어도 구성이 덜 되면 꺼진 것으로 보고하고 등록된 상품도 감춘다', () => {
    const registered = {
      STRIPE_BILLING_ENABLED: 'true',
      STRIPE_PRICE_PRO_MONTHLY: 'price_registered',
      STRIPE_PRICE_TEAM_MONTHLY: 'price_registered_team',
    };
    // 먼저 이 환경에서 상품이 실제로 잡히는지 확인한다 — 안 잡히면 아래
    // 검사가 빈 배열끼리 비교하는 공회전이 된다.
    const ready = withEnv({
      ...registered,
      STRIPE_SECRET_KEY: 'sk-test-placeholder',
      STRIPE_WEBHOOK_SECRET: 'whsec-test',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
    }, getBillingStatus);
    expect(ready.enabled).toBe(true);
    expect(ready.plans.length).toBeGreaterThan(0);

    // 같은 상품 등록 상태에서 웹훅 시크릿만 빼면 전부 감춰야 한다.
    const incomplete = withEnv({
      ...registered,
      STRIPE_SECRET_KEY: 'sk-test-placeholder',
      STRIPE_WEBHOOK_SECRET: undefined,
    }, getBillingStatus);
    expect(incomplete.enabled).toBe(false);
    expect(incomplete.plans).toEqual([]);
  });

  it('라우트는 enabled·plans 만 내보낸다 — reason 은 응답에 없다', () => {
    expect(ROUTE).toContain('enabled: status.enabled');
    expect(ROUTE).toContain('plans: status.plans');
    expect(ROUTE).not.toMatch(/reason/);
    // 통째로 펼치면 나중에 필드가 늘 때 같이 새어 나간다.
    expect(ROUTE).not.toMatch(/\.\.\.status/);
  });

  it('환경변수 이름이나 값을 응답 구성에 쓰지 않는다', () => {
    expect(ROUTE).not.toMatch(/process\.env/);
  });

  it('캐시하지 않는다 — 구성이 바뀌면 바로 반영돼야 한다', () => {
    expect(ROUTE).toContain("'no-store'");
    expect(ROUTE).toContain("dynamic = 'force-dynamic'");
  });
});
