/**
 * 서버 키로 나가는 LLM 호출의 **일일 토큰 예산** — IP 단위.
 *
 * 원래 `app/api/chat/route.ts` 안에만 있었다. 그래서 chat 한 라우트만 계량됐고,
 * 훨씬 비싼 다중 에이전트 경로(`team-review`)는 예산 없이 서버 키를 썼다
 * (실측 2026-07-29 · `budget|quota` grep 0 건). 한 사용자의 하루 사용량은
 * 라우트별로 따로 셀 값이 아니라 **한 통에 담아야** 하므로 여기로 옮긴다.
 *
 * 계량 원칙은 chat 이 쓰던 것을 그대로 가져왔다:
 *   ① 예약 — 출력 길이를 모르므로 상한을 먼저 잡는다(안 잡으면 짧은 프롬프트로
 *      긴 답을 뽑는 만큼 새어 나간다)
 *   ② 정산 — 실제 사용량을 알면 차액을 돌려준다(4096 예약하고 300 쓴 사용자가
 *      하루 122 번에 막히지 않게)
 *
 * BYOK 사용자에게는 걸지 않는다. 비용을 본인이 내는데 막으면, 이미 넣은 키를
 * 넣으라는 안내를 받게 된다.
 */

export const DAILY_TOKEN_BUDGET = 500_000;

/** 최대 엔트리 — 넘으면 오래된 것부터 버린다. */
const MAX_TOKEN_ENTRIES = 10_000;

const tokenUsage = new Map<string, { tokens: number; resetAt: number }>();

/** 문자 수로 토큰을 어림한다 — 정확한 계량이 아니라 상한 잡기용이다. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function checkTokenBudget(
  ip: string,
  estimatedTokens: number,
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = tokenUsage.get(ip);

  // UTC 자정 리셋
  const midnightUtc = new Date();
  midnightUtc.setUTCHours(24, 0, 0, 0);
  const resetAt = midnightUtc.getTime();

  if (!entry || now >= entry.resetAt) {
    if (estimatedTokens > DAILY_TOKEN_BUDGET) {
      return { allowed: false, remaining: DAILY_TOKEN_BUDGET };
    }
    tokenUsage.set(ip, { tokens: estimatedTokens, resetAt });
    return { allowed: true, remaining: DAILY_TOKEN_BUDGET - estimatedTokens };
  }

  if (entry.tokens + estimatedTokens > DAILY_TOKEN_BUDGET) {
    return { allowed: false, remaining: DAILY_TOKEN_BUDGET - entry.tokens };
  }

  entry.tokens += estimatedTokens;
  return { allowed: true, remaining: DAILY_TOKEN_BUDGET - entry.tokens };
}

/** 예약분을 실사용량으로 정산한다 — 차액만 돌려준다. */
export function settleTokenUsage(ip: string, reserved: number, actual: number): void {
  const entry = tokenUsage.get(ip);
  if (!entry || Date.now() >= entry.resetAt) return;
  const refund = Math.max(0, reserved - actual);
  entry.tokens = Math.max(0, entry.tokens - refund);
}

let lastTokenCleanup = Date.now();

/** 10 분마다 지연 청소 — 만료 엔트리 제거 후 상한 초과분 정리. */
export function cleanupTokenUsage(): void {
  const now = Date.now();
  if (now - lastTokenCleanup < 600_000 && tokenUsage.size < MAX_TOKEN_ENTRIES) return;
  lastTokenCleanup = now;
  for (const [key, entry] of tokenUsage) {
    if (now >= entry.resetAt) tokenUsage.delete(key);
  }
  if (tokenUsage.size > MAX_TOKEN_ENTRIES) {
    const oldest = [...tokenUsage.entries()]
      .sort((a, b) => a[1].resetAt - b[1].resetAt)
      .slice(0, tokenUsage.size - MAX_TOKEN_ENTRIES);
    for (const [key] of oldest) tokenUsage.delete(key);
  }
}

/** 테스트 전용 — 예산 통을 비운다. */
export function __resetTokenBudget(): void {
  tokenUsage.clear();
  lastTokenCleanup = 0;
}

/**
 * 다중 에이전트 1 회 실행의 **출력 상한 어림** — 발명한 숫자가 아니라 코드에
 * 실재하는 두 값의 곱이다.
 *
 *   `agent/drawing/role-runner.ts` 의 역할당 출력 상한  8,192
 *   도면 검토 필수 역할 수(symbols·connections·text·logic·coverage-auditor)  5
 *
 * 8,192 × 5 = 40,960. 하루 예산 500,000 을 나누면 IP 당 **약 12 회/일**이다.
 * 이건 상한이지 실사용량이 아니다 — 오케스트레이터가 실제 토큰 수를 돌려주지
 * 않아 정산(`settleTokenUsage`)을 못 건다. 실사용 계량이 붙으면 정산으로
 * 바꾸고 이 상수는 지운다.
 *
 * 조이거나 풀 곳은 여기 한 곳이다.
 */
const ROLE_OUTPUT_CAP = 8_192;
const REQUIRED_ROLE_COUNT = 5;
export const ORCHESTRATION_RESERVE = ROLE_OUTPUT_CAP * REQUIRED_ROLE_COUNT;
