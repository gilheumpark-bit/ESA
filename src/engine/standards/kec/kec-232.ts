/**
 * KEC 232 — 전압강하 (Voltage Drop) 조건 트리
 *
 * KEC 232.52 전압강하 기준:
 *   - 간선(main): 3% 이하
 *   - 분기(branch): 3% 이하
 *   - 합산(combined): 5% 이하
 *
 * 60m 이하 구간은 별도 완화 규정이 있으나, 본 구현은 일반 규정 적용.
 */

import {
  CodeArticle,
  Condition,
  JudgmentResult,
  evaluateCondition,
  makePass,
  makeFail,
  makeHold,
} from './types';

// ---------------------------------------------------------------------------
// PART 1 — 조항 정의
// ---------------------------------------------------------------------------

/** 간선 전압강하 3% 이하 */
const CONDITION_MAIN: Condition = {
  param: 'voltageDropPercent',
  operator: '<=',
  value: 3,
  unit: '%',
  result: 'PASS',
  note: '간선 전압강하 3% 이하',
};

/** 분기 전압강하 3% 이하 */
const CONDITION_BRANCH: Condition = {
  param: 'voltageDropPercent',
  operator: '<=',
  value: 3,
  unit: '%',
  result: 'PASS',
  note: '분기회로 전압강하 3% 이하',
};

/** 합산 전압강하 5% 이하 */
const CONDITION_COMBINED: Condition = {
  param: 'voltageDropPercent',
  operator: '<=',
  value: 5,
  unit: '%',
  result: 'PASS',
  note: '간선+분기 합산 전압강하 5% 이하',
};

/** KEC 232.52 조항 — 간선 */
export const KEC_232_52_MAIN: CodeArticle = {
  id: 'KEC-232.52-MAIN',
  country: 'KR',
  standard: 'KEC',
  article: '232.52',
  title: '저압 옥내배선의 전압강하 — 간선',
  conditions: [CONDITION_MAIN],
  relatedClauses: [
    { articleId: 'KEC-232.52-BRANCH', relation: 'reference', note: '분기회로 전압강하도 함께 검토' },
    { articleId: 'KEC-232.52-COMBINED', relation: 'reference', note: '간선+분기 합산 5% 기준' },
    { articleId: 'KEC-232.1', relation: 'reference', note: '허용전류 기본값 참조' },
    { articleId: 'NEC-210.19', relation: 'equivalent', note: 'NEC 분기회로 도체 기준과 등가' },
  ],
  effectiveDate: '2021-01-01',
  version: '2021',
};

/** KEC 232.52 조항 — 분기 */
export const KEC_232_52_BRANCH: CodeArticle = {
  id: 'KEC-232.52-BRANCH',
  country: 'KR',
  standard: 'KEC',
  article: '232.52',
  title: '저압 옥내배선의 전압강하 — 분기회로',
  conditions: [CONDITION_BRANCH],
  effectiveDate: '2021-01-01',
  version: '2021',
};

/** KEC 232.52 조항 — 합산 */
export const KEC_232_52_COMBINED: CodeArticle = {
  id: 'KEC-232.52-COMBINED',
  country: 'KR',
  standard: 'KEC',
  // relatedClauses inherited from MAIN
  article: '232.52',
  title: '저압 옥내배선의 전압강하 — 간선+분기 합산',
  conditions: [CONDITION_COMBINED],
  effectiveDate: '2021-01-01',
  version: '2021',
};

// ---------------------------------------------------------------------------
// PART 2 — 회로 유형별 조항 선택
// ---------------------------------------------------------------------------

type CircuitType = 'main' | 'branch' | 'combined';

function getArticleForCircuitType(circuitType: CircuitType): CodeArticle {
  switch (circuitType) {
    case 'main':     return KEC_232_52_MAIN;
    case 'branch':   return KEC_232_52_BRANCH;
    case 'combined': return KEC_232_52_COMBINED;
  }
}

function getLimitForCircuitType(circuitType: CircuitType): number {
  switch (circuitType) {
    case 'main':     return 3;
    case 'branch':   return 3;
    case 'combined': return 5;
  }
}

// ---------------------------------------------------------------------------
// PART 3 — 평가 함수
// ---------------------------------------------------------------------------

/**
 * KEC 232.52 전압강하 기준 평가
 *
 * @param voltageDropPercent - 실제 전압강하율 (%)
 * @param circuitType - 회로 유형: 'main' | 'branch' | 'combined'
 * @returns JudgmentResult — PASS, FAIL, 또는 HOLD (입력 누락 시)
 */
export function evaluateVoltageDropKEC(
  voltageDropPercent: number,
  circuitType: CircuitType,
): JudgmentResult {
  // 입력 검증 — NaN, undefined 등은 HOLD
  if (voltageDropPercent == null || !Number.isFinite(voltageDropPercent)) {
    return makeHold(
      getArticleForCircuitType(circuitType),
      ['voltageDropPercent'],
    );
  }

  const article = getArticleForCircuitType(circuitType);
  const condition = article.conditions[0];
  const limit = getLimitForCircuitType(circuitType);
  const passed = evaluateCondition(condition, voltageDropPercent);

  if (passed) {
    return makePass(article, [condition], [
      `전압강하 ${voltageDropPercent}% ≤ ${limit}% (${circuitType})`,
    ]);
  }

  return makeFail(article, [], [condition], [
    `전압강하 ${voltageDropPercent}% > ${limit}% (${circuitType}) — KEC 232.52 위반`,
  ]);
}
