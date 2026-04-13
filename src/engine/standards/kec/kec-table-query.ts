/**
 * KEC Table Query Engine — 구조화 쿼리로 법규 데이터를 정확히 꺼낸다
 * ─────────────────────────────────────────────────────────────────────
 * AI가 자연어를 파싱하여 타입 안전한 구조체를 만들면,
 * 이 엔진이 100% 정확한 값을 반환한다. AI의 연산 개입 0%.
 *
 * PART 1: Ampacity 정방향 쿼리 (조건 → 허용전류)
 * PART 2: Ampacity 역산 쿼리 (전류 → 최소 케이블 규격)
 * PART 3: 차단기 정격 쿼리 (부하전류 → 후보 목록)
 * PART 4: 전압강하 판정 쿼리
 * PART 5: 통합 쿼리 디스패처 (AI Function Calling 연동)
 */

import {
  type AmpacityOptions,
  type AmpacityResult,
  type ConductorMaterial,
  type InsulationType,
  type InstallationMethod,
  KEC_CABLE_SIZES,
  getAmpacity,
} from '@/data/ampacity-tables/kec-ampacity';
import { getNecAmpacity, type NecAmpacityOptions } from '@/data/ampacity-tables/nec-ampacity';

import { STANDARD_BREAKER_RATINGS } from './kec-212';
import { getKECArticle, evaluateKEC } from './index';
import type { JudgmentResult } from './types';
import type { SourceTag } from '@/engine/sjc/types';

// =========================================================================
// PART 1 — Ampacity 정방향 쿼리
// =========================================================================

/** 구조화된 허용전류 쿼리 결과 */
export interface AmpacityQueryResult {
  /** 기본 허용전류 (A) */
  baseAmpacity: number;
  /** 보정 후 허용전류 (A) */
  correctedAmpacity: number;
  /** 적용된 보정계수 */
  corrections: Array<{ type: string; factor: number; description: string }>;
  /** 근거 */
  source: SourceTag;
  /** 쿼리 입력 에코 (투명성) */
  query: AmpacityOptions;
}

/**
 * KEC 허용전류표 구조화 쿼리.
 * AI는 이 함수에 구조체만 넘기면 됨 — 연산 개입 0%.
 *
 * @example
 * queryAmpacity({ size: 16, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit' })
 * // → { baseAmpacity: 85, correctedAmpacity: 85, ... }
 */
export function queryAmpacity(opts: AmpacityOptions): AmpacityQueryResult | null {
  try {
    const result: AmpacityResult = getAmpacity(opts);
    return {
      baseAmpacity: result.ampacity,
      correctedAmpacity: Math.round(result.corrected * 100) / 100,
      corrections: result.factors.map(f => ({
        type: f.type,
        factor: f.factor,
        description: f.description,
      })),
      source: result.source,
      query: opts,
    };
  } catch {
    return null;
  }
}

// =========================================================================
// PART 2 — Ampacity 역산 쿼리 (전류 → 최소 케이블 규격)
// =========================================================================

export interface MinCableSizeResult {
  /** 최소 케이블 규격 (mm²) */
  minSize: number;
  /** 해당 규격의 허용전류 (A) */
  ampacity: number;
  /** 보정 후 허용전류 (A) */
  correctedAmpacity: number;
  /** 요구 전류 (A) */
  requiredCurrent: number;
  /** 여유율 (%) */
  margin: number;
  source: SourceTag;
}

/**
 * 필요 전류에서 최소 케이블 규격을 역산한다.
 * KEC 표준 규격(1.5~630sq) 중 허용전류가 requiredCurrent 이상인 최소값.
 *
 * @example
 * findMinCableSize(55, { conductor: 'Cu', insulation: 'XLPE', installation: 'conduit' })
 * // → { minSize: 10, ampacity: 63, margin: 14.5% }
 */
export function findMinCableSize(
  requiredCurrent: number,
  opts: Omit<AmpacityOptions, 'size'>,
): MinCableSizeResult | null {
  for (const size of KEC_CABLE_SIZES) {
    try {
      const result = getAmpacity({ ...opts, size });
      if (result.corrected >= requiredCurrent) {
        const margin = ((result.corrected - requiredCurrent) / requiredCurrent) * 100;
        return {
          minSize: size,
          ampacity: result.ampacity,
          correctedAmpacity: Math.round(result.corrected * 100) / 100,
          requiredCurrent,
          margin: Math.round(margin * 10) / 10,
          source: result.source,
        };
      }
    } catch {
      // 해당 규격에서 데이터 없음 (예: Al 1.5sq) → 다음 규격
      continue;
    }
  }
  return null; // 모든 규격으로도 부족
}

// =========================================================================
// PART 3 — 차단기 정격 쿼리
// =========================================================================

export interface BreakerQueryResult {
  /** 부하전류 × 1.25 이상인 최소 차단기 정격 */
  recommended: number;
  /** 조건을 만족하는 전체 후보 목록 */
  candidates: number[];
  /** 부하전류 × 1.25 기준값 */
  minRequired: number;
  /** 전선 허용전류 제한값 (제공 시) */
  maxAllowed?: number;
  source: SourceTag;
}

/**
 * KEC 212.3 기준 차단기 정격 후보를 필터링한다.
 * 관계식: 부하전류 × 1.25 ≤ 차단기 정격 ≤ 전선 허용전류
 *
 * @param loadCurrent 부하전류 (A)
 * @param wireAmpacity 전선 허용전류 (A) — 제공 시 상한 제한
 */
export function queryBreakerRating(
  loadCurrent: number,
  wireAmpacity?: number,
): BreakerQueryResult {
  const minRequired = loadCurrent * 1.25;

  let candidates = STANDARD_BREAKER_RATINGS.filter(r => r >= minRequired);

  if (wireAmpacity !== undefined) {
    candidates = candidates.filter(r => r <= wireAmpacity);
  }

  return {
    recommended: candidates.length > 0 ? candidates[0] : 0,
    candidates: [...candidates],
    minRequired: Math.round(minRequired * 100) / 100,
    maxAllowed: wireAmpacity,
    source: {
      standard: 'KEC',
      clause: '212.3',
      edition: '2021',
      verifiedAt: '2024-12-01',
    },
  };
}

// =========================================================================
// PART 4 — 전압강하 판정 쿼리
// =========================================================================

/**
 * KEC 전압강하 기준 판정.
 * 조항 ID로 적합 기준을 찾고, 실제 전압강하율을 대입하여 PASS/FAIL 판정.
 */
export function queryVoltageDrop(
  voltageDropPercent: number,
  circuitType: 'main' | 'branch' | 'combined' = 'combined',
): JudgmentResult | null {
  const articleMap: Record<string, string> = {
    main: 'KEC-232.52-MAIN',
    branch: 'KEC-232.52-BRANCH',
    combined: 'KEC-232.52-COMBINED',
  };

  const articleId = articleMap[circuitType];
  const article = getKECArticle(articleId);
  if (!article) return null;

  return evaluateKEC(articleId, { voltageDropPercent });
}

// =========================================================================
// PART 4.5 — 교차참조 자동 로딩
// =========================================================================

import type { CodeArticle as CA2, RelatedClause } from './types';

/**
 * 조항 조회 시 관련 조항(예외/참조/등가)을 자동으로 딸림 로딩한다.
 * "제232.3조에 따라... 단, 1항 예외" 류의 꼬리물기를 자동 추적.
 */
export function queryWithRelated(articleId: string): {
  article: CA2 | null;
  related: Array<{ article: CA2; relation: RelatedClause }>;
} {
  const article = getKECArticle(articleId);
  if (!article) return { article: null, related: [] };

  const related: Array<{ article: CA2; relation: RelatedClause }> = [];

  if (article.relatedClauses) {
    for (const ref of article.relatedClauses) {
      const refArticle = getKECArticle(ref.articleId);
      if (refArticle) {
        related.push({ article: refArticle, relation: ref });
      }
    }
  }

  return { article, related };
}

// =========================================================================
// PART 5 — 통합 쿼리 디스패처 (AI Function Calling 연동)
// =========================================================================

export type QueryType = 'ampacity' | 'min_cable_size' | 'breaker' | 'voltage_drop' | 'nec_ampacity';

export interface StructuredQuery {
  type: QueryType;
  params: Record<string, unknown>;
}

export interface QueryResult {
  type: QueryType;
  success: boolean;
  data: unknown;
  error?: string;
  source?: SourceTag;
}

function failResult(type: QueryType, error: string): QueryResult {
  return { type, success: false, data: null, error };
}

/**
 * AI가 생성한 구조화 쿼리를 실행한다.
 * LLM Function Calling의 타겟 함수.
 */
export function executeQuery(query: StructuredQuery): QueryResult {
  try {
    switch (query.type) {
      case 'ampacity': {
        const p = query.params as unknown as AmpacityOptions;
        const result = queryAmpacity(p);
        if (!result) return failResult('ampacity', '해당 조건의 허용전류 데이터를 찾을 수 없습니다.');
        return { type: 'ampacity', success: true, data: result, source: result.source };
      }

      case 'min_cable_size': {
        const p = query.params as { requiredCurrent: number; conductor: ConductorMaterial; insulation: InsulationType; installation: InstallationMethod; ambientTemp?: number; groupCount?: number };
        const result = findMinCableSize(p.requiredCurrent, {
          conductor: p.conductor,
          insulation: p.insulation,
          installation: p.installation,
          ambientTemp: p.ambientTemp,
          groupCount: p.groupCount,
        });
        if (!result) return failResult('min_cable_size', '요구 전류를 만족하는 KEC 표준 케이블 규격이 없습니다.');
        return { type: 'min_cable_size', success: true, data: result, source: result.source };
      }

      case 'breaker': {
        const p = query.params as { loadCurrent: number; wireAmpacity?: number };
        const result = queryBreakerRating(p.loadCurrent, p.wireAmpacity);
        return { type: 'breaker', success: true, data: result, source: result.source };
      }

      case 'voltage_drop': {
        const p = query.params as { voltageDropPercent: number; circuitType?: 'main' | 'branch' | 'combined' };
        const result = queryVoltageDrop(p.voltageDropPercent, p.circuitType);
        if (!result) return failResult('voltage_drop', '전압강하 판정 조항을 찾을 수 없습니다.');
        return { type: 'voltage_drop', success: true, data: result, source: { standard: 'KEC', clause: '232.52', edition: '2021' } };
      }

      case 'nec_ampacity': {
        const p = query.params as unknown as NecAmpacityOptions;
        const result = getNecAmpacity(p);
        if (!result) return failResult('nec_ampacity', 'NEC Table 310.16 해당 조건의 데이터를 찾을 수 없습니다.');
        return { type: 'nec_ampacity', success: true, data: result, source: { standard: 'NEC', clause: '310.16', edition: '2023' } as SourceTag };
      }

      default:
        return failResult(query.type, `지원하지 않는 쿼리 타입: ${query.type}`);
    }
  } catch (err) {
    return failResult(query.type, err instanceof Error ? err.message : String(err));
  }
}
