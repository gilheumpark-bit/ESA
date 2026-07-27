import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateEnv } from '@/lib/env';

/**
 * 환경변수 검증이 **실제로 도는지**, 그리고 그 결과가 **새지 않는지**.
 *
 * `validateEnv` 는 잘 만들어져 있었는데 부르는 곳이 없었다(2026-07-28 실측).
 * 설정 누락이 기동 시점에 드러나지 않고 첫 요청에서 런타임 오류로 나타났다.
 * 특히 `STRIPE_BILLING_ENABLED=true` 인데 웹훅 시크릿이 없으면 결제가 조용히
 * 깨진다 — 그건 사용자 돈이 걸린 실패다.
 *
 * 붙이면서 생기는 새 위험은 **정보 누수**다. 어떤 변수가 비어 있는지는
 * 어떤 연동이 구성돼 있는지를 알려 준다. 그래서 공개 응답은 상태만 바꾸고
 * 목록은 `HEALTHCHECK_TOKEN` 뒤에 둔다 — 그 경계를 여기서 잠근다.
 */
const REPO = join(__dirname, '..', '..', '..', '..');
const route = readFileSync(join(REPO, 'src/app/api/health/route.ts'), 'utf8');

describe('헬스체크 환경변수 검증', () => {
  it('헬스 라우트가 검증을 실제로 호출한다', () => {
    expect(route).toContain("import { validateEnv } from '@/lib/env'");
    expect(route).toContain('const env = validateEnv()');
  });

  it('검증 실패가 전체 상태에 반영된다 — 부르기만 하고 안 쓰면 의미 없다', () => {
    expect(route).toMatch(/allDeps\.every\([^)]*\)\s*&&\s*env\.valid/);
  });

  /**
   * 여기가 이 파일의 핵심이다. 누락 변수 목록은 토큰 뒤에만 있어야 한다.
   */
  it('누락 변수 목록은 토큰 게이트 안쪽에만 있다', () => {
    const detailStart = route.indexOf('canViewDetails(req)');
    const detailEnd = route.indexOf(': {}', detailStart);
    expect(detailStart).toBeGreaterThan(-1);
    expect(detailEnd).toBeGreaterThan(detailStart);
    const gated = route.slice(detailStart, detailEnd);
    expect(gated).toContain('missingRequired: env.missing');
    // 게이트 밖(응답 본문 구성부)에는 목록이 없어야 한다.
    const publicBody = route.slice(route.indexOf('return NextResponse.json'));
    expect(publicBody).not.toContain('env.missing');
    expect(publicBody).not.toContain('env.warnings');
  });

  it('설정 실패로 503 을 내지 않는다 — 로드밸런서가 멀쩡한 앱을 빼면 안 된다', () => {
    expect(route).toMatch(/status:\s*hasCriticalDown\s*\?\s*503\s*:\s*200/);
  });
});

describe('validateEnv 자체', () => {
  it('필수·선택을 가려서 본다', () => {
    const r = validateEnv();
    expect(typeof r.valid).toBe('boolean');
    expect(Array.isArray(r.missing)).toBe(true);
    expect(Array.isArray(r.warnings)).toBe(true);
    // 이 스위트는 .env 를 안 읽으므로 필수 몇 개가 비어 있는 게 정상이다.
    // 그 상태를 valid 로 보고하면 검증이 죽은 것이다.
    expect(r.valid).toBe(r.missing.length === 0);
  });

  /**
   * 결제를 켜면 다섯 개가 추가로 필수가 된다. 이 조건부가 죽으면
   * 웹훅 시크릿 없이 결제가 열린다.
   */
  it('결제를 켜면 웹훅 시크릿 등이 필수로 승격된다', () => {
    const before = validateEnv().missing.length;
    const prev = process.env.STRIPE_BILLING_ENABLED;
    process.env.STRIPE_BILLING_ENABLED = 'true';
    try {
      const after = validateEnv().missing;
      expect(after.length).toBeGreaterThan(before);
      expect(after).toContain('STRIPE_WEBHOOK_SECRET');
      expect(after).toContain('STRIPE_SECRET_KEY');
    } finally {
      if (prev === undefined) delete process.env.STRIPE_BILLING_ENABLED;
      else process.env.STRIPE_BILLING_ENABLED = prev;
    }
  });
});
