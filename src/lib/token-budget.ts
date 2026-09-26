import { randomUUID } from 'node:crypto';

/** Process-local defense. Multi-instance enforcement requires a trusted shared quota. */
export const DAILY_TOKEN_BUDGET = 500_000;
const MAX_TOKEN_ENTRIES = 10_000;
const MAX_RESERVATIONS = 10_000;
interface Reservation { amount: number; settled: boolean }
interface Usage { tokens: number; resetAt: number; reservations: Map<string, Reservation> }
const tokenUsage = new Map<string, Usage>();
const validCount = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;
const remaining = (entry?: Usage): number => entry && validCount(entry.tokens)
  ? Math.max(0, DAILY_TOKEN_BUDGET - entry.tokens) : entry ? 0 : DAILY_TOKEN_BUDGET;

/** A heuristic for reservation, not a claim that four characters bound every language. */
export function estimateTokens(text: string): number { return Math.ceil(text.length / 4); }

export function checkTokenBudget(ip: string, estimatedTokens: number): {
  allowed: boolean; remaining: number; reservationId?: string;
} {
  const now = Date.now();
  let entry = tokenUsage.get(ip);
  if (entry && now >= entry.resetAt) { tokenUsage.delete(ip); entry = undefined; }
  if (!validCount(estimatedTokens) || !ip || (entry && !validCount(entry.tokens))) {
    return { allowed: false, remaining: remaining(entry) };
  }
  if (estimatedTokens > remaining(entry)) return { allowed: false, remaining: remaining(entry) };
  if (!entry) {
    cleanupTokenUsage();
    // Never evict a live budget: rotating clients must not reset someone else's usage.
    if (tokenUsage.size >= MAX_TOKEN_ENTRIES) return { allowed: false, remaining: 0 };
    const midnight = new Date(now); midnight.setUTCHours(24, 0, 0, 0);
    entry = { tokens: 0, resetAt: midnight.getTime(), reservations: new Map() };
    tokenUsage.set(ip, entry);
  }
  if (entry.reservations.size >= MAX_RESERVATIONS) return { allowed: false, remaining: remaining(entry) };
  const reservationId = randomUUID();
  entry.reservations.set(reservationId, { amount: estimatedTokens, settled: false });
  entry.tokens += estimatedTokens;
  return { allowed: true, remaining: remaining(entry), reservationId };
}

/** Both refunds and overages count. A reservation can settle only once, in its own UTC day. */
export function settleTokenUsage(ip: string, reserved: number, actual: number, reservationId?: string): void {
  if (!validCount(reserved) || !validCount(actual)) return;
  const entry = tokenUsage.get(ip);
  if (!entry || Date.now() >= entry.resetAt || !validCount(entry.tokens)) return;
  // Legacy pure callers are supported; production callers always pass the exact id.
  const receipt = reservationId ? entry.reservations.get(reservationId)
    : [...entry.reservations.values()].find((r) => !r.settled && r.amount === reserved);
  if (!receipt || receipt.settled || receipt.amount !== reserved) return;
  receipt.settled = true;
  const next = entry.tokens - reserved + actual;
  entry.tokens = Number.isSafeInteger(next) ? Math.max(0, next) : Number.MAX_SAFE_INTEGER;
}

export function cleanupTokenUsage(): void {
  const now = Date.now();
  for (const [key, entry] of tokenUsage) if (now >= entry.resetAt) tokenUsage.delete(key);
}

export function __resetTokenBudget(): void { tokenUsage.clear(); }

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
