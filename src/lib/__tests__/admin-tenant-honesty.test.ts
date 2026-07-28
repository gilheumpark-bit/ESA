import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 관리자 화면이 **없는 것을 있는 척하지 않는지** 본다.
 *
 * 테넌트 구성 테이블이 아직 없다. 라우트는 그래서 `tenant: null` 을 내고
 * 소스에 이유를 적어 뒀다 — "테넌트 구성 테이블 미구축 — 목업으로 채우지
 * 않는다". 화면은 `if (!tenant) return <TenantNotConfigured />` 로 받아
 * "구성되지 않음" 을 보여 준다.
 *
 * **지금 맞다.** 잠그는 이유는 이 결정이 되돌리기 쉬워서다. 빈 화면은
 * 미완성처럼 보이고, 목업 조직명·플랜·SSO 발급자를 넣으면 화면이 그럴듯해
 * 진다. 그러면 관리자는 있지도 않은 테넌트 설정을 믿게 된다 — 이 앱이
 * 도면 판정에서 지키는 태도(모르면 UNKNOWN)와 같은 문제다.
 *
 * 참고: 화면 전수 스윕(33 페이지)에서 "화면만 읽고 아무도 안 만드는 필드"
 * 11 건이 나왔으나 실결함은 0 이었다. 나머지는 페이지 자체 상태이거나
 * 페이지 안에서 만들어지는 값이었다(2026-07-28 실측).
 */
const REPO = join(__dirname, '..', '..', '..');
const ROUTE = readFileSync(join(REPO, 'src/app/api/admin/route.ts'), 'utf8');
const PAGE = readFileSync(join(REPO, 'src/app/(with-nav)/admin/page.tsx'), 'utf8');

describe('관리자 테넌트 — 없는 것을 만들지 않는다', () => {
  it('라우트가 테넌트를 목업으로 채우지 않는다', () => {
    // 두 응답 경로 모두 null 이어야 한다(미구성 상태 · 정상 조회).
    expect((ROUTE.match(/tenant:\s*null/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // `tenant: {` 는 타입 선언에도 나온다. 값으로 채우는 흔적만 본다 —
    // 조직명·플랜·발급자 같은 문자열 리터럴이 들어가는 순간이 그 시작이다.
    expect(ROUTE).not.toMatch(/(name|plan|domain|ssoIssuer):\s*['"`]/);
  });

  it('왜 null 인지가 소스에 적혀 있다 — 다음 사람이 실수로 채우지 않게', () => {
    expect(ROUTE).toContain('목업으로 채우지 않는다');
  });

  it('화면이 null 을 빈 칸이 아니라 "구성되지 않음" 으로 받는다', () => {
    expect((PAGE.match(/if \(!tenant\) return <TenantNotConfigured \/>;/g) ?? []).length)
      .toBeGreaterThanOrEqual(2);
    expect(PAGE).toContain('function TenantNotConfigured');
  });

  /**
   * SSO 칸은 테넌트 안에 있다. 테넌트가 null 이면 SSO 도 못 뜬다 —
   * 그게 맞다. 별도 경로로 SSO 만 그리기 시작하면 근거 없이 뜬다.
   */
  it('SSO 표시는 테넌트를 거쳐서만 나온다', () => {
    expect(PAGE).toMatch(/function SSOSection\(\{ tenant \}/);
    expect(PAGE).not.toMatch(/ssoType\s*=\s*['"`]/);
  });

  it('관리자만 볼 수 있다 — 테넌트 구성이 아무에게나 새지 않는다', () => {
    expect(ROUTE).toContain("data?.role === 'admin'");
    expect(ROUTE).toMatch(/status:\s*403/);
    expect(ROUTE).toMatch(/status:\s*401/);
  });
});
