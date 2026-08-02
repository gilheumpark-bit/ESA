/**
 * **요금제 봉인이 실제로 전부 여는지 본다.**
 *
 * OPEN_BETA 는 「모든 사용자에게 Pro 접근을 준다」고 적혀 있었지만 실제로는
 * 절반만 닿았다(실측 2026-08-01):
 *
 *   `isTierAtLeast` 가 `TIER_ORDER[required] <= TIER_ORDER.pro` 로 걸려
 *   team·enterprise 요구는 계속 닫혔다.
 *   `/api/account/tier` 가 OPEN_BETA 를 무시하고 원본 등급을 돌려줘,
 *   API 는 통과하는데 화면은 「엔터프라이즈 전용 기능」을 띄웠다.
 *
 * 「전부 열었다」는 주장은 **모든 등급에 대해** 확인하기 전까지 미검증이다.
 * 이 파일이 그 주장을 등급별로 고정한다.
 *
 * 권한은 이 봉인의 대상이 아니다 — 관리자 API 는 `role === 'admin'` 을 따로
 * 확인하며 요금제 플래그와 무관하다. 요금제와 권한은 다른 축이다.
 */

const TIERS = ['free', 'pro', 'team', 'enterprise'] as const;

/** env 를 바꾼 뒤 모듈을 다시 읽는다 — OPEN_BETA 는 모듈 로드 시 고정된다. */
async function loadGate(openBeta: boolean) {
  jest.resetModules();
  process.env.OPEN_BETA = openBeta ? 'true' : 'false';
  process.env.NEXT_PUBLIC_OPEN_BETA = openBeta ? 'true' : 'false';
  return import('../tier-gate');
}

const ORIGINAL = {
  OPEN_BETA: process.env.OPEN_BETA,
  NEXT_PUBLIC_OPEN_BETA: process.env.NEXT_PUBLIC_OPEN_BETA,
};

afterAll(() => {
  process.env.OPEN_BETA = ORIGINAL.OPEN_BETA;
  process.env.NEXT_PUBLIC_OPEN_BETA = ORIGINAL.NEXT_PUBLIC_OPEN_BETA;
});

describe('요금제 봉인 (OPEN_BETA)', () => {
  it('켜면 모든 등급 요구가 열린다 — pro 까지가 아니다', async () => {
    const gate = await loadGate(true);
    const blocked: string[] = [];
    for (const current of TIERS) {
      for (const required of TIERS) {
        if (!gate.isTierAtLeast(current, required)) blocked.push(`${current} → ${required}`);
      }
    }
    expect(blocked).toEqual([]);
  });

  it('켜면 부여 등급이 최상위다 — 화면 게이트가 enterprise 를 요구한다', async () => {
    const gate = await loadGate(true);
    expect(gate.OPEN_BETA).toBe(true);
    expect(gate.OPEN_BETA_TIER).toBe('enterprise');
    // 관리자 화면이 실제로 쓰는 비교식 그대로 건다.
    expect(gate.OPEN_BETA_TIER !== 'enterprise').toBe(false);
  });

  it('켜면 일일 한도 판정도 통과한다', async () => {
    const gate = await loadGate(true);
    expect(gate.checkCalcAccess('free', 'advanced', 'ko').allowed).toBe(true);
  });

  /**
   * 끄면 원래대로 — 봉인이 «항상 열림» 이면 게이트가 사라진 것이지 봉인이 아니다.
   * 이 검사가 없으면 위 세 건은 늘 참이라 아무것도 증명하지 않는다.
   */
  it('끄면 등급 게이트가 되살아난다 — 공회전 반증', async () => {
    const gate = await loadGate(false);
    expect(gate.OPEN_BETA).toBe(false);
    expect(gate.isTierAtLeast('free', 'pro')).toBe(false);
    expect(gate.isTierAtLeast('pro', 'enterprise')).toBe(false);
    expect(gate.isTierAtLeast('enterprise', 'enterprise')).toBe(true);
  });
});
