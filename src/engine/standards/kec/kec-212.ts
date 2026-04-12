/**
 * KEC 212 — 과전류차단기 선정 (Breaker Sizing) 조건 트리
 *
 * KEC 212.3 과전류차단기 시설:
 *   - 차단기 정격전류 ≥ 부하전류 × 125% (연속부하)
 *   - 차단기 정격전류 ≤ 전선 허용전류
 *   - 관계식: 부하전류 × 1.25 ≤ 차단기 정격 ≤ 전선 허용전류
 *
 * 표준 차단기 정격 (A): 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 175,
 *                        200, 225, 250, 300, 350, 400, 500, 600, 700, 800,
 *                        1000, 1200, 1600, 2000, 2500, 3000, 4000
 */

import {
  CodeArticle,
  Condition,
  JudgmentResult,
  makePass,
  makeFail,
  makeHold,
} from './types';

// ---------------------------------------------------------------------------
// PART 1 — 상수 및 조항 정의
// ---------------------------------------------------------------------------

/** 표준 차단기 정격 (A) — KEC / IEC 기반 */
export const STANDARD_BREAKER_RATINGS: readonly number[] = [
  15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 175,
  200, 225, 250, 300, 350, 400, 500, 600, 700, 800,
  1000, 1200, 1600, 2000, 2500, 3000, 4000,
] as const;

/** 125% 룰 — 차단기 정격 ≥ 부하전류 × 1.25 */
const CONDITION_125_RULE: Condition = {
  param: 'breakerRating',
  operator: '>=',
  value: 0, // 동적 — 실제 평가 시 loadCurrent * 1.25로 비교
  unit: 'A',
  result: 'PASS',
  note: '차단기 정격 ≥ 부하전류 × 125%',
};

/** 전선보호 — 차단기 정격 ≤ 전선 허용전류 */
const CONDITION_WIRE_PROTECTION: Condition = {
  param: 'breakerRating',
  operator: '<=',
  value: 0, // 동적 — 실제 평가 시 wireAmpacity로 비교
  unit: 'A',
  result: 'PASS',
  note: '차단기 정격 ≤ 전선 허용전류',
};

/** KEC 212.3 조항 정의 */
export const KEC_212_3: CodeArticle = {
  id: 'KEC-212.3',
  country: 'KR',
  standard: 'KEC',
  article: '212.3',
  title: '과전류차단기의 시설',
  conditions: [CONDITION_125_RULE, CONDITION_WIRE_PROTECTION],
  effectiveDate: '2021-01-01',
  version: '2021',
};

// ---------------------------------------------------------------------------
// PART 2 — 유틸리티
// ---------------------------------------------------------------------------

/**
 * 부하전류에 맞는 최소 표준 차단기 정격을 찾는다.
 * 125% 룰 적용: 최소 정격 = loadCurrent × 1.25 이상인 첫 번째 표준 정격
 */
export function findMinBreakerRating(loadCurrent: number): number | null {
  const minRequired = loadCurrent * 1.25;
  return STANDARD_BREAKER_RATINGS.find(r => r >= minRequired) ?? null;
}

// ---------------------------------------------------------------------------
// PART 3 — 평가 함수
// ---------------------------------------------------------------------------

/**
 * KEC 212.3 차단기 선정 기준 평가
 *
 * @param breakerRating - 선정된 차단기 정격전류 (A)
 * @param loadCurrent - 부하전류 (A)
 * @param wireAmpacity - 전선 허용전류 (A)
 * @returns JudgmentResult — PASS, FAIL, 또는 HOLD
 */
export function evaluateBreakerKEC(
  breakerRating: number,
  loadCurrent: number,
  wireAmpacity: number,
): JudgmentResult {
  // 입력 검증 — 누락 파라미터 체크
  const missing: string[] = [];
  if (breakerRating == null || !Number.isFinite(breakerRating)) missing.push('breakerRating');
  if (loadCurrent == null || !Number.isFinite(loadCurrent))     missing.push('loadCurrent');
  if (wireAmpacity == null || !Number.isFinite(wireAmpacity))   missing.push('wireAmpacity');

  if (missing.length > 0) {
    return makeHold(KEC_212_3, missing);
  }

  const matched: Condition[] = [];
  const failed: Condition[] = [];
  const notes: string[] = [];

  // 조건 1: 125% 룰 — breakerRating ≥ loadCurrent × 1.25
  const minRequired = loadCurrent * 1.25;
  const cond125: Condition = {
    ...CONDITION_125_RULE,
    value: minRequired,
  };

  if (breakerRating >= minRequired) {
    matched.push(cond125);
    notes.push(`차단기 ${breakerRating}A ≥ 부하 ${loadCurrent}A × 1.25 = ${minRequired}A`);
  } else {
    failed.push(cond125);
    notes.push(`차단기 ${breakerRating}A < 부하 ${loadCurrent}A × 1.25 = ${minRequired}A — 125% 룰 위반`);
  }

  // 조건 2: 전선보호 — breakerRating ≤ wireAmpacity
  const condWire: Condition = {
    ...CONDITION_WIRE_PROTECTION,
    value: wireAmpacity,
  };

  if (breakerRating <= wireAmpacity) {
    matched.push(condWire);
    notes.push(`차단기 ${breakerRating}A ≤ 전선 허용전류 ${wireAmpacity}A`);
  } else {
    failed.push(condWire);
    notes.push(`차단기 ${breakerRating}A > 전선 허용전류 ${wireAmpacity}A — 전선보호 위반`);
  }

  // 최종 판정
  if (failed.length === 0) {
    return makePass(KEC_212_3, matched, notes);
  }

  return makeFail(KEC_212_3, matched, failed, notes);
}
