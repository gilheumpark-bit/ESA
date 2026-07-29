import {
  DAILY_TOKEN_BUDGET,
  ORCHESTRATION_RESERVE,
  __resetTokenBudget,
  checkTokenBudget,
  estimateTokens,
  settleTokenUsage,
} from '../token-budget';

/**
 * 예산은 원래 `app/api/chat/route.ts` 안에만 있었다. 그래서 chat 만 계량됐고
 * 다중 에이전트 경로(`team-review`)는 서버 키를 무계량으로 썼다
 * (실측 2026-07-29 · 그 라우트에서 `budget|quota` grep 0 건).
 *
 * 여기서 잠그는 것은 **한 통에 담긴다**는 성질이다 — 라우트를 갈아타며
 * 예산을 두 배로 쓰지 못한다.
 */
describe('일일 토큰 예산', () => {
  beforeEach(() => __resetTokenBudget());

  it('한도를 넘으면 거절한다', () => {
    expect(checkTokenBudget('1.1.1.1', DAILY_TOKEN_BUDGET - 10).allowed).toBe(true);
    expect(checkTokenBudget('1.1.1.1', 100).allowed).toBe(false);
  });

  it('IP 가 다르면 서로의 예산을 깎지 않는다', () => {
    checkTokenBudget('1.1.1.1', DAILY_TOKEN_BUDGET);
    expect(checkTokenBudget('2.2.2.2', 1000).allowed).toBe(true);
  });

  /**
   * 통이 하나라는 뜻 — chat 이 쓴 만큼 team-review 몫이 줄어야 한다.
   * 라우트별로 Map 을 따로 두면 이 검사가 깨진다.
   */
  it('여러 호출이 같은 통을 공유한다', () => {
    const half = DAILY_TOKEN_BUDGET / 2;
    expect(checkTokenBudget('3.3.3.3', half).allowed).toBe(true);
    expect(checkTokenBudget('3.3.3.3', half).allowed).toBe(true);
    expect(checkTokenBudget('3.3.3.3', 1).allowed).toBe(false);
  });

  it('정산은 차액만 돌려준다 — 실사용분은 남긴다', () => {
    checkTokenBudget('4.4.4.4', 1000);
    settleTokenUsage('4.4.4.4', 1000, 300);
    // 700 환급 → 300 만 소진. 남은 예산으로 다시 통과해야 한다.
    expect(checkTokenBudget('4.4.4.4', DAILY_TOKEN_BUDGET - 300).allowed).toBe(true);
    expect(checkTokenBudget('4.4.4.4', 1).allowed).toBe(false);
  });

  it('한 번에 예산 전체를 넘는 요청은 통을 오염시키지 않고 거절된다', () => {
    expect(checkTokenBudget('5.5.5.5', DAILY_TOKEN_BUDGET + 1).allowed).toBe(false);
    expect(checkTokenBudget('5.5.5.5', 1000).allowed).toBe(true);
  });

  /**
   * 예약분은 코드에 실재하는 두 값의 곱이다 — 역할당 출력 상한 8,192
   * (`agent/drawing/role-runner.ts`) × 필수 역할 5. 임의 상수로 바뀌면
   * 하루 허용 횟수가 조용히 달라지므로 유도값을 잠근다.
   */
  it('오케스트레이션 예약분이 유도값과 일치한다 (8192 × 5)', () => {
    expect(ORCHESTRATION_RESERVE).toBe(8_192 * 5);
    expect(Math.floor(DAILY_TOKEN_BUDGET / ORCHESTRATION_RESERVE)).toBe(12);
  });

  it('토큰 어림은 문자 4 개당 1 이다', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
