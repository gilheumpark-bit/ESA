/**
 * KEC Condition Tree DSL Types
 *
 * 전기설비기술기준(KEC)을 실행 가능한 코드로 표현하기 위한 타입 시스템.
 * "기준서는 코드다" — 모든 조항을 Condition Tree로 모델링한다.
 *
 * 설계 원칙:
 *   - 하나의 CodeArticle = 기준서의 하나의 조항
 *   - Condition = 단일 비교 연산 (param operator value)
 *   - JudgmentResult = 조항 평가 결과 (PASS/HOLD/FAIL/BLOCK)
 */

// ---------------------------------------------------------------------------
// Operator — 조건 비교 연산자
// ---------------------------------------------------------------------------
export type ComparisonOperator = '<=' | '>=' | '==' | '<' | '>';

// ---------------------------------------------------------------------------
// Verdict — 판정 결과 4단계
// ---------------------------------------------------------------------------
export type Verdict = 'PASS' | 'HOLD' | 'FAIL' | 'BLOCK';

// ---------------------------------------------------------------------------
// Condition — 단일 기준 조건
// ---------------------------------------------------------------------------
export interface Condition {
  /** 검사 대상 파라미터명 (예: "voltageDropPercent", "breakerRating") */
  param: string;
  /** 비교 연산자 */
  operator: ComparisonOperator;
  /** 기준값 */
  value: number;
  /** 단위 (예: "%", "A", "ohm") */
  unit: string;
  /** 조건 충족 시 결과 */
  result: 'PASS' | 'FAIL';
  /** 조건 설명 (한국어) */
  note: string;
}

// ---------------------------------------------------------------------------
// CodeArticle — 기준서 조항 하나를 표현하는 구조체
// ---------------------------------------------------------------------------
export type ClauseRelation = 'exception' | 'reference' | 'implements' | 'equivalent';

export interface RelatedClause {
  /** 관련 조항 ID */
  articleId: string;
  /** 관계 유형: exception(예외), reference(참조), implements(구현), equivalent(등가) */
  relation: ClauseRelation;
  /** 관계 설명 */
  note: string;
}

export interface CodeArticle {
  /** 고유 식별자 (예: "KEC-232.52", "KEC-212.3") */
  id: string;
  /** 국가 코드 (예: "KR", "US", "JP") */
  country: string;
  /** 기준서명 (예: "KEC", "NEC", "IEC 60364") */
  standard: string;
  /** 조항 번호 (예: "232.52", "212.3") */
  article: string;
  /** 조항 제목 */
  title: string;
  /** 이 조항에 속하는 조건들 */
  conditions: Condition[];
  /** 교차참조 조항 — 검색 시 자동으로 딸려옴 */
  relatedClauses?: RelatedClause[];
  /** 시행일 (ISO-8601) */
  effectiveDate: string;
  /** 기준서 판 (예: "2021", "제5판") */
  version: string;
}

// ---------------------------------------------------------------------------
// JudgmentResult — 조항 평가 결과
// ---------------------------------------------------------------------------
export interface JudgmentResult {
  /**
   * 최종 판정:
   *   PASS  — 모든 조건 충족
   *   HOLD  — 입력 파라미터 부족 (불완전)
   *   FAIL  — 기준 위반 (위반 조항 명시)
   *   BLOCK — 소스 태그 누락 또는 LLM 생성값 감지
   */
  judgment: Verdict;
  /** 평가 대상 조항 */
  article: CodeArticle;
  /** 통과한 조건들 */
  matchedConditions: Condition[];
  /** 위반한 조건들 */
  failedConditions: Condition[];
  /** 판정 사유 및 참고 메모 */
  notes: string[];
}

// ---------------------------------------------------------------------------
// CompositeCondition — AND/OR 복합 조건 (조항 내 다중 조건 결합)
// ---------------------------------------------------------------------------

export type LogicOperator = 'AND' | 'OR';

/**
 * 복합 조건: 다수의 Condition을 AND/OR로 결합.
 * 예: (전압강하 ≤ 3%) AND (허용전류 ≥ 부하전류)
 */
export interface CompositeCondition {
  operator: LogicOperator;
  conditions: Condition[];
  /** 중첩 가능: ((A AND B) OR C) */
  nested?: CompositeCondition;
}

/**
 * CompositeCondition을 평가한다.
 * AND: 모든 조건 충족 시 true
 * OR: 하나 이상 충족 시 true
 */
export function evaluateComposite(
  composite: CompositeCondition,
  params: Record<string, number>,
): { result: boolean; matched: Condition[]; failed: Condition[] } {
  const matched: Condition[] = [];
  const failed: Condition[] = [];

  for (const cond of composite.conditions) {
    const actual = params[cond.param];
    if (actual === undefined) {
      failed.push(cond);
      continue;
    }
    if (evaluateCondition(cond, actual)) {
      matched.push(cond);
    } else {
      failed.push(cond);
    }
  }

  // 중첩 조건 평가
  if (composite.nested) {
    const nestedResult = evaluateComposite(composite.nested, params);
    matched.push(...nestedResult.matched);
    failed.push(...nestedResult.failed);

    if (composite.operator === 'AND') {
      return { result: failed.length === 0 && nestedResult.result, matched, failed };
    }
    return { result: matched.length > 0 || nestedResult.result, matched, failed };
  }

  if (composite.operator === 'AND') {
    return { result: failed.length === 0, matched, failed };
  }
  return { result: matched.length > 0, matched, failed };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Condition 하나를 평가한다 */
export function evaluateCondition(
  condition: Condition,
  actualValue: number,
): boolean {
  switch (condition.operator) {
    case '<=': return actualValue <= condition.value;
    case '>=': return actualValue >= condition.value;
    case '==': return actualValue === condition.value;
    case '<':  return actualValue < condition.value;
    case '>':  return actualValue > condition.value;
    default:   return false;
  }
}

/** PASS JudgmentResult 생성 헬퍼 */
export function makePass(
  article: CodeArticle,
  matched: Condition[],
  notes: string[] = [],
): JudgmentResult {
  return {
    judgment: 'PASS',
    article,
    matchedConditions: matched,
    failedConditions: [],
    notes: [...notes, `${article.id} 기준 적합`],
  };
}

/** FAIL JudgmentResult 생성 헬퍼 */
export function makeFail(
  article: CodeArticle,
  matched: Condition[],
  failed: Condition[],
  notes: string[] = [],
): JudgmentResult {
  return {
    judgment: 'FAIL',
    article,
    matchedConditions: matched,
    failedConditions: failed,
    notes: [
      ...notes,
      ...failed.map(c => `${article.id} 위반: ${c.note} (${c.param} ${c.operator} ${c.value}${c.unit})`),
    ],
  };
}

/** HOLD JudgmentResult 생성 헬퍼 — 입력 파라미터 부족 */
export function makeHold(
  article: CodeArticle,
  missingParams: string[],
): JudgmentResult {
  return {
    judgment: 'HOLD',
    article,
    matchedConditions: [],
    failedConditions: [],
    notes: [
      `${article.id} 판정 보류: 입력 파라미터 부족`,
      ...missingParams.map(p => `누락 파라미터: ${p}`),
    ],
  };
}

/** BLOCK JudgmentResult 생성 헬퍼 — 소스 태그 누락 */
export function makeBlock(
  article: CodeArticle,
  reason: string,
): JudgmentResult {
  return {
    judgment: 'BLOCK',
    article,
    matchedConditions: [],
    failedConditions: [],
    notes: [`${article.id} 차단: ${reason}`],
  };
}
