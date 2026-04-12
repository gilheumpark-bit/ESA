/**
 * KEC 142 — 접지 (Grounding) 조건 트리
 *
 * KEC 142.5 접지저항 기준 (종별에 따라 다름):
 *   - A종 접지 (특고압 계통): 10 ohm 이하
 *   - B종 접지 (변압기 중성점): 계산값 (150/Ig 또는 300/Ig, 여기서는 단순 150 ohm 상한)
 *   - C종 접지 (400V 이상 기기): 10 ohm 이하
 *   - D종 접지 (400V 미만 기기): 100 ohm 이하
 *
 * KEC 2021 개정 후 접지 종별 체계:
 *   A종 → 제1종 접지 (10 ohm)
 *   B종 → 제2종 접지 (변압기 중성점, 계산값)
 *   C종 → 제3종 접지 (10 ohm, 특별 제3종은 저감)
 *   D종 → 별도 명칭 없음 (100 ohm)
 *
 * 본 구현은 실무 관행상 여전히 사용되는 A/B/C/D 종별 표기를 병행한다.
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
// PART 1 — 접지 종별 타입 및 기준값
// ---------------------------------------------------------------------------

export type GroundingType = 'A' | 'B' | 'C' | 'D';

/** 접지 종별별 허용 접지저항 (ohm) */
const GROUNDING_LIMITS: Record<GroundingType, number> = {
  A: 10,   // 특고압 계통 — 10 ohm 이하
  B: 150,  // 변압기 중성점 — 150/Ig (단순화: 150 ohm 상한)
  C: 10,   // 400V 이상 기기 — 10 ohm 이하
  D: 100,  // 400V 미만 기기 — 100 ohm 이하
};

/** 접지 종별 한국어 명칭 */
const GROUNDING_NAMES: Record<GroundingType, string> = {
  A: '제1종 접지 (A종, 특고압 계통)',
  B: '제2종 접지 (B종, 변압기 중성점)',
  C: '제3종 접지 (C종, 400V 이상 기기)',
  D: '접지 (D종, 400V 미만 기기)',
};

// ---------------------------------------------------------------------------
// PART 2 — 조건 및 조항 정의
// ---------------------------------------------------------------------------

function buildGroundingCondition(type: GroundingType): Condition {
  const limit = GROUNDING_LIMITS[type];
  return {
    param: 'resistance',
    operator: '<=',
    value: limit,
    unit: 'ohm',
    result: 'PASS',
    note: `${GROUNDING_NAMES[type]}: 접지저항 ${limit} ohm 이하`,
  };
}

function buildGroundingArticle(type: GroundingType): CodeArticle {
  const _limit = GROUNDING_LIMITS[type];
  return {
    id: `KEC-142.5-${type}`,
    country: 'KR',
    standard: 'KEC',
    article: '142.5',
    title: `접지공사의 종류 — ${GROUNDING_NAMES[type]}`,
    conditions: [buildGroundingCondition(type)],
    effectiveDate: '2021-01-01',
    version: '2021',
  };
}

/** 각 종별 CodeArticle */
export const KEC_142_5_A: CodeArticle = buildGroundingArticle('A');
export const KEC_142_5_B: CodeArticle = buildGroundingArticle('B');
export const KEC_142_5_C: CodeArticle = buildGroundingArticle('C');
export const KEC_142_5_D: CodeArticle = buildGroundingArticle('D');

// ---------------------------------------------------------------------------
// PART 3 — 평가 함수
// ---------------------------------------------------------------------------

/**
 * KEC 142.5 접지저항 기준 평가
 *
 * @param resistance - 측정된 접지저항 (ohm)
 * @param groundingType - 접지 종별: 'A' | 'B' | 'C' | 'D'
 * @returns JudgmentResult — PASS, FAIL, 또는 HOLD
 */
export function evaluateGroundingKEC(
  resistance: number,
  groundingType: GroundingType,
): JudgmentResult {
  // 입력 검증
  if (resistance == null || !Number.isFinite(resistance)) {
    return makeHold(buildGroundingArticle(groundingType), ['resistance']);
  }

  const validTypes: GroundingType[] = ['A', 'B', 'C', 'D'];
  if (!validTypes.includes(groundingType)) {
    return makeHold(buildGroundingArticle('A'), ['groundingType']);
  }

  const article = buildGroundingArticle(groundingType);
  const condition = article.conditions[0];
  const limit = GROUNDING_LIMITS[groundingType];
  const passed = evaluateCondition(condition, resistance);

  if (passed) {
    return makePass(article, [condition], [
      `접지저항 ${resistance} ohm ≤ ${limit} ohm (${GROUNDING_NAMES[groundingType]})`,
    ]);
  }

  return makeFail(article, [], [condition], [
    `접지저항 ${resistance} ohm > ${limit} ohm (${GROUNDING_NAMES[groundingType]}) — KEC 142.5 위반`,
  ]);
}
