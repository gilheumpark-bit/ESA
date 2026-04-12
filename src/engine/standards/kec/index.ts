/**
 * KEC Registry — 전기설비기술기준 조항 등록소
 *
 * 모든 KEC 조항을 Map으로 관리하며, articleId로 조회 및 평가할 수 있다.
 * 새 조항 추가 시 이 파일에 등록만 하면 전체 시스템에서 사용 가능.
 */

import { CodeArticle, JudgmentResult, makeHold } from './types';
import {
  KEC_232_52_MAIN,
  KEC_232_52_BRANCH,
  KEC_232_52_COMBINED,
  evaluateVoltageDropKEC,
} from './kec-232';
import {
  KEC_212_3,
  evaluateBreakerKEC,
} from './kec-212';
import {
  KEC_142_5_A,
  KEC_142_5_B,
  KEC_142_5_C,
  KEC_142_5_D,
  evaluateGroundingKEC,
} from './kec-142';
import { registerExtendedArticles } from './kec-full';

// Re-export
export * from './types';
export * from './kec-232';
export * from './kec-212';
export * from './kec-142';
export * from './kec-full';

// ---------------------------------------------------------------------------
// PART 1 — KEC 조항 레지스트리
// ---------------------------------------------------------------------------

/** 등록된 모든 KEC 조항 */
export const KEC_ARTICLES: Map<string, CodeArticle> = new Map([
  // 전압강하
  [KEC_232_52_MAIN.id, KEC_232_52_MAIN],
  [KEC_232_52_BRANCH.id, KEC_232_52_BRANCH],
  [KEC_232_52_COMBINED.id, KEC_232_52_COMBINED],
  // 과전류차단기
  [KEC_212_3.id, KEC_212_3],
  // 접지
  [KEC_142_5_A.id, KEC_142_5_A],
  [KEC_142_5_B.id, KEC_142_5_B],
  [KEC_142_5_C.id, KEC_142_5_C],
  [KEC_142_5_D.id, KEC_142_5_D],
]);

// 55개 확장 조항 등록 (kec-full.ts)
registerExtendedArticles(KEC_ARTICLES);

// 추가 100+조 (kec-extended.ts) — KEC 전문 커버
import { KEC_EXTENDED_ARTICLES } from './kec-extended';
for (const article of KEC_EXTENDED_ARTICLES) {
  if (!KEC_ARTICLES.has(article.id)) {
    KEC_ARTICLES.set(article.id, article);
  }
}

// ---------------------------------------------------------------------------
// PART 2 — 평가자 레지스트리 (articleId → evaluator 매핑)
// ---------------------------------------------------------------------------

type KecEvaluator = (params: Record<string, number>) => JudgmentResult;

/**
 * articleId별 평가 함수 매핑.
 * params 키:
 *   - KEC-232.52-*: { voltageDropPercent }
 *   - KEC-212.3:    { breakerRating, loadCurrent, wireAmpacity }
 *   - KEC-142.5-*:  { resistance }
 */
const KEC_EVALUATORS: Map<string, KecEvaluator> = new Map([
  // 전압강하 — 간선
  ['KEC-232.52-MAIN', (p) => evaluateVoltageDropKEC(p.voltageDropPercent, 'main')],
  // 전압강하 — 분기
  ['KEC-232.52-BRANCH', (p) => evaluateVoltageDropKEC(p.voltageDropPercent, 'branch')],
  // 전압강하 — 합산
  ['KEC-232.52-COMBINED', (p) => evaluateVoltageDropKEC(p.voltageDropPercent, 'combined')],
  // 차단기 선정
  ['KEC-212.3', (p) => evaluateBreakerKEC(p.breakerRating, p.loadCurrent, p.wireAmpacity)],
  // 접지 — A/B/C/D종
  ['KEC-142.5-A', (p) => evaluateGroundingKEC(p.resistance, 'A')],
  ['KEC-142.5-B', (p) => evaluateGroundingKEC(p.resistance, 'B')],
  ['KEC-142.5-C', (p) => evaluateGroundingKEC(p.resistance, 'C')],
  ['KEC-142.5-D', (p) => evaluateGroundingKEC(p.resistance, 'D')],
]);

// ---------------------------------------------------------------------------
// PART 3 — 통합 평가 함수
// ---------------------------------------------------------------------------

/**
 * KEC 조항 ID로 기준 평가를 실행한다.
 *
 * @param articleId - 조항 식별자 (예: "KEC-232.52-MAIN", "KEC-212.3")
 * @param params - 평가에 필요한 파라미터 맵
 * @returns JudgmentResult
 * @throws Error - 등록되지 않은 articleId
 */
export function evaluateKEC(
  articleId: string,
  params: Record<string, number>,
): JudgmentResult {
  const article = KEC_ARTICLES.get(articleId);
  if (!article) {
    throw new Error(`KEC 조항 미등록: ${articleId}`);
  }

  const evaluator = KEC_EVALUATORS.get(articleId);
  if (!evaluator) {
    // 조항은 등록되어 있으나 평가 함수가 아직 구현되지 않은 경우
    return makeHold(article, ['(평가 함수 미구현)']);
  }

  return evaluator(params);
}

/**
 * 등록된 모든 KEC 조항 ID 목록을 반환한다.
 */
export function listKECArticles(): string[] {
  return Array.from(KEC_ARTICLES.keys());
}

/**
 * 특정 KEC 조항을 ID로 조회한다.
 */
export function getKECArticle(articleId: string): CodeArticle | null {
  return KEC_ARTICLES.get(articleId) ?? null;
}
