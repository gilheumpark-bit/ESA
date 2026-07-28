import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * IPFS 타임스탬프 등록은 아직 **꺼진 기능**이다(`RECEIPT_NOTARIZE: false`).
 * 켜기 전에 닫아야 했던 구멍 둘은 2026-07-28 에 닫혔다:
 *
 *  ① `/api/notarize` POST 가 돌려주는 `verifyUrl`(`/receipt/{id}?verify=true`)의
 *     쿼리를 **아무도 읽지 않았다** — "검증 페이지 열기" 를 눌러도 같은 화면이
 *     다시 떴다(§2.8 스텁 어포던스). 이제 `TimestampVerificationGate` 가 읽는다.
 *  ② 증명 레지스트리 대조 `verifyProof` 가 **호출처 0** 이었다. 이제
 *     `GET /api/notarize` 가 부른다.
 *
 * 앞선 판의 이 파일은 두 구멍이 **열려 있음**을 잠갔다 — "닫으면 깨지도록"
 * 이 설계였고, 실제로 그렇게 깨졌다. 이제 **거꾸로** 잠근다: 둘 중 하나라도
 * 다시 끊기면 등록 성공 화면의 링크가 다시 죽은 버튼이 된다.
 *
 * 대조가 실제로 되는지는 여기서 보지 않는다 — 그건
 * `src/app/api/notarize/__tests__/verify-route.test.ts` 가 실행으로 본다.
 * 여기는 **배선이 끊기지 않았는지**만 본다.
 */
const REPO = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');
const PAGE = 'src/app/(with-nav)/receipt/[id]/page.tsx';

describe('IPFS 타임스탬프 — 휴면 선언', () => {
  it('플래그는 아직 꺼져 있다 — 켜기 전 남은 조건은 대장에 있다', () => {
    expect(read('src/lib/feature-flags.ts')).toMatch(/RECEIPT_NOTARIZE:\s*false/);
  });

  it('대장이 켜기 전 남은 조건을 적고 있다', () => {
    const manifest = read('docs/DORMANT_MANIFEST.md');
    expect(manifest).toContain('RECEIPT_NOTARIZE=true');
    // 닫힌 구멍 둘은 이름으로 남아 있어야 한다 — 왜 닫았는지가 재검토의 근거다.
    expect(manifest).toContain('verifyUrl');
    expect(manifest).toContain('verifyProof');
  });

  /**
   * ① 링크가 가는 곳(`?verify=true`)을 읽는 코드. 이게 사라지면 "검증
   * 페이지 열기" 는 다시 아무 일도 하지 않는 버튼이 된다.
   */
  it('① `?verify=true` 를 읽는 곳이 있다', () => {
    const page = read(PAGE);
    expect(page).toContain('useSearchParams');
    expect(page).toMatch(/searchParams\.get\(['"]verify['"]\)/);
  });

  it('① 그 쿼리가 실제로 검증 패널을 띄운다 — 읽기만 하고 버리지 않는다', () => {
    const page = read(PAGE);
    expect(page).toMatch(/<TimestampVerificationGate\b/);
    expect(page).toMatch(/<TimestampVerification\b\s+receiptId=/);
    // 패널은 GET 을 실제로 부른다. 이 경로가 끊기면 화면만 남고 대조가 없다.
    expect(page).toMatch(/authenticatedFetch\(\s*`\/api\/notarize\?receiptId=/);
  });

  /** ② 증명 대조에 호출처가 있다. */
  it('② `verifyProof` 를 부르는 곳이 있다', () => {
    const callers = execSync(
      'git grep -l "verifyProof" -- src/app src/components src/lib || true',
      { cwd: REPO, encoding: 'utf8' },
    )
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((f) => !f.includes('lib/blockchain.ts') && !f.includes('__tests__'));
    expect(callers).toContain('src/app/api/notarize/route.ts');
  });

  /**
   * 켜기 전이라도 이건 지금 지켜야 한다 — 등록 버튼이나 검증 패널이 플래그
   * 밖으로 새면 꺼진 기능의 표면이 사용자에게 도달한다.
   *
   * 구조가 아니라 **관계**를 본다: 앞선 판은 `&& <TimestampRegistrationButton`
   * 을 정규식으로 붙잡았다가 그 사이에 조각(`<>`)이 들어오자 깨졌다 — 배선은
   * 멀쩡한데 검사만 깨진 오탐이었다(2026-07-28).
   */
  it.each(['TimestampRegistrationButton', 'TimestampVerificationGate'])(
    '%s 는 플래그 뒤에 있다',
    (component) => {
      const page = read(PAGE);
      const guard = page.indexOf("isFeatureEnabled('RECEIPT_NOTARIZE')");
      const usage = page.indexOf(`<${component} receiptId=`);
      expect(guard).toBeGreaterThan(-1);
      expect(usage).toBeGreaterThan(guard);
      // 게이트와 사용처 사이에 다른 최상위 블록이 끼어들지 않았는지 — 같은
      // 반환식 안이어야 한다.
      expect(page.slice(guard, usage)).not.toContain('return (');
    },
  );

  /** 서버도 같은 플래그 뒤에 있어야 한다 — 화면만 막는 건 막는 게 아니다. */
  it('GET·POST 둘 다 서버에서 플래그를 본다', () => {
    const route = read('src/app/api/notarize/route.ts');
    const guards = route.match(/isFeatureEnabledServer\('RECEIPT_NOTARIZE'\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });
});
