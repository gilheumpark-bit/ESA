/**
 * SJC Judge Engine — PASS/HOLD/FAIL/BLOCK 판정 엔진
 *
 * ESA의 판정 중추. 모든 계산 결과는 이 엔진을 통해 판정받는다.
 *
 * 판정 체계:
 *   PASS  — 모든 기준 조건 충족
 *   HOLD  — 입력 파라미터 부족 (불완전한 상태)
 *   FAIL  — 기준서 위반 (위반 조항 명시)
 *   BLOCK — 소스 태그 누락 또는 LLM 생성값 감지
 *
 * 판정 우선순위: BLOCK > FAIL > HOLD > PASS
 *   (하나라도 BLOCK → 전체 BLOCK, 하나라도 FAIL → 전체 FAIL)
 *
 * "LLM은 귀, ESVA 엔진은 뇌" — 판정은 반드시 엔진이 내린다.
 */

import { SourceTag, Judgment, createJudgment } from './types';
import { CalcResult } from '../standards/types';
import {
  Condition,
  JudgmentResult,
  Verdict,
} from '../standards/kec/types';
import {
  validateSources,
  SourceValidation,
} from './source-tracker';

// ---------------------------------------------------------------------------
// PART 1 — SJC 판정 결과 타입
// ---------------------------------------------------------------------------

/** SJC 최종 판정 결과 */
export interface SJCJudgment {
  /** 4단계 판정 */
  verdict: Verdict;
  /** 판정 사유 (사람이 읽을 수 있는 형태) */
  reason: string;
  /** 값의 출처 태그 목록 */
  sources: SourceTag[];
  /** 관련 기준서 조항 ID */
  article?: string;
  /** 위반한 조건 목록 (FAIL 시) */
  failedConditions?: Condition[];
  /** 소스 검증 결과 */
  sourceValidation?: SourceValidation;
}

// ---------------------------------------------------------------------------
// PART 2 — 단일 CalcResult 판정
// ---------------------------------------------------------------------------

/**
 * 단일 계산 결과를 판정한다.
 *
 * 판정 순서:
 *   1. 소스 태그 검증 → 미태그 값 존재 시 BLOCK
 *   2. 기준서 조항 평가 (codeArticle이 주어진 경우)
 *   3. CalcResult.judgment 기반 판정 (기존 판정 결과가 있는 경우)
 *   4. 값 존재 여부 → null이면 HOLD
 *   5. 위 모든 통과 → PASS
 *
 * @param calcResult - 계산 결과
 * @param codeArticleResult - 기준서 평가 결과 (선택, evaluateKEC 등의 반환값)
 * @returns SJCJudgment
 */
export function judge(
  calcResult: CalcResult,
  codeArticleResult?: JudgmentResult,
): SJCJudgment {
  const sources = calcResult.source ?? [];

  // 1단계: 소스 태그 검증 — BLOCK 체크
  const sourceCheck = validateSources(calcResult as unknown as Record<string, unknown>);
  if (!sourceCheck.valid && sourceCheck.untagged.length > 0) {
    // 소스 태그가 없는 필드가 있고, CalcResult.source도 비어있으면 BLOCK
    if (sources.length === 0) {
      return {
        verdict: 'BLOCK',
        reason: `소스 태그 누락: [${sourceCheck.untagged.join(', ')}]. 출처 불명 값은 사용 불가.`,
        sources,
        sourceValidation: sourceCheck,
      };
    }
  }

  // 2단계: 기준서 조항 평가 결과 반영
  if (codeArticleResult) {
    return fromJudgmentResult(codeArticleResult, sources, sourceCheck);
  }

  // 3단계: CalcResult에 기존 judgment가 있는 경우
  if (calcResult.judgment) {
    return fromExistingJudgment(calcResult.judgment, sources, sourceCheck);
  }

  // 4단계: 값 존재 여부 체크 — HOLD
  if (calcResult.value === null || calcResult.value === undefined) {
    return {
      verdict: 'HOLD',
      reason: '계산 결과값 없음. 입력 파라미터를 확인하세요.',
      sources,
      sourceValidation: sourceCheck,
    };
  }

  // 5단계: 모든 검사 통과 — PASS
  return {
    verdict: 'PASS',
    reason: '모든 조건 충족',
    sources,
    sourceValidation: sourceCheck,
  };
}

// ---------------------------------------------------------------------------
// PART 3 — 그래프 전체 판정 (집합 판정)
// ---------------------------------------------------------------------------

/**
 * 계산 그래프의 전체 결과를 집합 판정한다.
 *
 * 집합 판정 규칙 (우선순위순):
 *   - 하나라도 BLOCK → 전체 BLOCK
 *   - 하나라도 FAIL  → 전체 FAIL
 *   - 하나라도 HOLD  → 전체 HOLD
 *   - 모두 PASS      → 전체 PASS
 *
 * @param graphResults - 노드ID → CalcResult 매핑
 * @param articleResults - 노드ID → JudgmentResult 매핑 (선택)
 * @returns SJCJudgment — 집합 판정 결과
 */
export function judgeGraph(
  graphResults: Map<string, CalcResult>,
  articleResults?: Map<string, JudgmentResult>,
): SJCJudgment {
  const nodeJudgments: Map<string, SJCJudgment> = new Map();
  const allSources: SourceTag[] = [];

  // 각 노드별 판정
  for (const [nodeId, calcResult] of graphResults) {
    const articleResult = articleResults?.get(nodeId);
    const nodeJudgment = judge(calcResult, articleResult);
    nodeJudgments.set(nodeId, nodeJudgment);
    allSources.push(...nodeJudgment.sources);
  }

  // 집합 판정 — 우선순위: BLOCK > FAIL > HOLD > PASS
  const verdictPriority: Verdict[] = ['BLOCK', 'FAIL', 'HOLD', 'PASS'];

  for (const targetVerdict of verdictPriority) {
    const matchingNodes: string[] = [];

    for (const [nodeId, nodeJudgment] of nodeJudgments) {
      if (nodeJudgment.verdict === targetVerdict) {
        matchingNodes.push(nodeId);
      }
    }

    if (matchingNodes.length > 0) {
      // 첫 번째 매칭 노드의 판정 결과를 기반으로 집합 판정 구성
      const firstMatch = nodeJudgments.get(matchingNodes[0])!;

      // 모든 실패 조건 수집
      const allFailedConditions: Condition[] = [];
      const reasons: string[] = [];

      for (const nodeId of matchingNodes) {
        const nj = nodeJudgments.get(nodeId)!;
        reasons.push(`[${nodeId}] ${nj.reason}`);
        if (nj.failedConditions) {
          allFailedConditions.push(...nj.failedConditions);
        }
      }

      return {
        verdict: targetVerdict,
        reason: targetVerdict === 'PASS'
          ? `전체 ${graphResults.size}개 노드 판정 통과`
          : reasons.join('; '),
        sources: allSources,
        article: firstMatch.article,
        failedConditions: allFailedConditions.length > 0 ? allFailedConditions : undefined,
      };
    }
  }

  // 빈 그래프
  return {
    verdict: 'HOLD',
    reason: '판정 대상 없음 (빈 그래프)',
    sources: [],
  };
}

// ---------------------------------------------------------------------------
// PART 4 — 내부 변환 헬퍼
// ---------------------------------------------------------------------------

/** JudgmentResult(KEC 조건 트리 결과) → SJCJudgment 변환 */
function fromJudgmentResult(
  jr: JudgmentResult,
  sources: SourceTag[],
  sourceCheck: SourceValidation,
): SJCJudgment {
  return {
    verdict: jr.judgment,
    reason: jr.notes.join('; '),
    sources,
    article: jr.article.id,
    failedConditions: jr.failedConditions.length > 0 ? jr.failedConditions : undefined,
    sourceValidation: sourceCheck,
  };
}

/** 기존 Judgment(boolean 기반) → SJCJudgment 변환 */
function fromExistingJudgment(
  j: Judgment,
  sources: SourceTag[],
  sourceCheck: SourceValidation,
): SJCJudgment {
  return {
    verdict: j.pass ? 'PASS' : 'FAIL',
    reason: j.message,
    sources,
    article: j.standardRef,
    sourceValidation: sourceCheck,
  };
}

// ---------------------------------------------------------------------------
// PART 5 — 유틸리티
// ---------------------------------------------------------------------------

/**
 * SJCJudgment를 기존 Judgment(boolean 기반) 형태로 변환한다.
 * 기존 CalcResult.judgment 필드와의 호환을 위해 사용.
 */
export function toJudgment(sjc: SJCJudgment): Judgment {
  const pass = sjc.verdict === 'PASS';
  const severity = sjc.verdict === 'BLOCK' || sjc.verdict === 'FAIL'
    ? 'error' as const
    : sjc.verdict === 'HOLD'
      ? 'warning' as const
      : 'info' as const;

  return createJudgment(pass, sjc.reason, severity, sjc.article);
}

/**
 * 판정 결과의 심각도 레벨을 숫자로 반환한다.
 * BLOCK=3, FAIL=2, HOLD=1, PASS=0
 */
export function verdictSeverity(verdict: Verdict): number {
  switch (verdict) {
    case 'BLOCK': return 3;
    case 'FAIL':  return 2;
    case 'HOLD':  return 1;
    case 'PASS':  return 0;
  }
}
