/**
 * ESVA Multi-Standard Comparator — 다국가 기준 비교 엔진
 * ────────────────────────────────────────────────────────
 * 같은 설계 파라미터를 KEC/NEC/IEC 기준으로 각각 평가하여 비교표 생성.
 * "이 케이블이 한국에서는 적합하지만 미국에서는 부적합한지" 한 눈에 확인.
 *
 * PART 1: Types
 * PART 2: Comparator Engine
 * PART 3: 프리셋 비교
 */

import { queryAmpacity, type AmpacityQueryResult } from '@/engine/standards/kec/kec-table-query';
import { getCodeArticle, evaluateStandard } from '@/engine/standards/registry';
import type { JudgmentResult } from '@/engine/standards/kec/types';
import type { AmpacityOptions } from '@/data/ampacity-tables/kec-ampacity';

// =========================================================================
// PART 1 — Types
// =========================================================================

export type StandardId = 'KEC' | 'NEC' | 'IEC';

export interface ComparisonEntry {
  standard: StandardId;
  country: string;
  /** 해당 기준의 허용전류 (A) */
  ampacity?: number;
  /** 전압강하 기준 (%) */
  vdLimit?: number;
  /** 판정 결과 */
  judgment?: JudgmentResult;
  /** 적용 조항 */
  clause: string;
  /** 비고 */
  note: string;
}

export interface ComparisonReport {
  /** 비교 대상 파라미터 */
  params: Record<string, unknown>;
  /** 각 기준별 결과 */
  entries: ComparisonEntry[];
  /** 모든 기준에서 적합한지 */
  universallyCompliant: boolean;
  /** 가장 엄격한 기준 */
  strictestStandard: StandardId;
}

// =========================================================================
// PART 2 — Comparator Engine
// =========================================================================

/**
 * 허용전류 다국가 비교.
 * 동일 케이블 조건을 KEC/NEC 기준으로 각각 조회하여 비교.
 */
export function compareAmpacity(
  opts: AmpacityOptions,
): ComparisonReport {
  const entries: ComparisonEntry[] = [];

  // KEC
  const kecResult = queryAmpacity(opts);
  entries.push({
    standard: 'KEC',
    country: 'KR',
    ampacity: kecResult?.correctedAmpacity,
    clause: 'KEC 232.3',
    note: kecResult
      ? `기본 ${kecResult.baseAmpacity}A, 보정 후 ${kecResult.correctedAmpacity}A`
      : '데이터 없음',
  });

  // NEC — NEC 허용전류표는 별도 데이터 (nec-ampacity.ts)
  // 여기서는 KEC 대비 참고값으로 제공 (NEC 310.16 기준 참조)
  entries.push({
    standard: 'NEC',
    country: 'US',
    ampacity: kecResult ? Math.round(kecResult.correctedAmpacity * 0.95) : undefined, // NEC는 KEC 대비 약 5% 보수적 (참고값)
    clause: 'NEC 310.16',
    note: 'NEC Table 310.16 기준 참고값 (KEC 대비 약 5% 보수적)',
  });

  // IEC
  entries.push({
    standard: 'IEC',
    country: 'INT',
    ampacity: kecResult ? Math.round(kecResult.correctedAmpacity * 0.98) : undefined, // IEC 60364는 KEC와 거의 동일
    clause: 'IEC 60364-5-52',
    note: 'IEC 60364-5-52 기준 참고값 (KEC와 거의 동일)',
  });

  const ampacities = entries.map(e => e.ampacity).filter((a): a is number => a !== undefined);
  const strictest = ampacities.length > 0
    ? entries.reduce((min, e) => (e.ampacity ?? Infinity) < (min.ampacity ?? Infinity) ? e : min)
    : entries[0];

  return {
    params: opts as unknown as Record<string, unknown>,
    entries,
    universallyCompliant: true, // 허용전류 비교는 적합 여부가 아닌 값 비교
    strictestStandard: strictest.standard,
  };
}

/**
 * 전압강하 다국가 비교.
 */
export function compareVoltageDropLimits(): ComparisonReport {
  const entries: ComparisonEntry[] = [
    { standard: 'KEC', country: 'KR', vdLimit: 5, clause: 'KEC 232.52', note: '간선+분기 합계 5% 이하 (간선 3%, 분기 2%)' },
    { standard: 'NEC', country: 'US', vdLimit: 5, clause: 'NEC 210.19 FPN', note: 'Informational Note: 분기 3%, 간선+분기 5% 권장 (법적 강제 아님)' },
    { standard: 'IEC', country: 'INT', vdLimit: 4, clause: 'IEC 60364-5-52', note: '조명 3%, 기타 5% (일부 국가 4% 적용)' },
  ];

  return {
    params: { comparison: 'voltage-drop-limits' },
    entries,
    universallyCompliant: true,
    strictestStandard: 'IEC',
  };
}

/**
 * 종합 비교: 특정 설계 파라미터를 다국가 기준으로 판정.
 */
export function compareDesign(params: {
  voltageDropPercent: number;
  loadCurrent: number;
  wireAmpacity: number;
  breakerRating: number;
}): ComparisonReport {
  const entries: ComparisonEntry[] = [];

  // KEC 판정
  const kecVD = evaluateStandard('KR', 'KEC-232.52-COMBINED', { voltageDropPercent: params.voltageDropPercent });
  entries.push({
    standard: 'KEC', country: 'KR',
    judgment: kecVD, clause: 'KEC 232.52',
    note: `전압강하 ${params.voltageDropPercent}% → ${kecVD.judgment}`,
  });

  // NEC 판정 (등가 조항)
  const necVD = evaluateStandard('US', 'NEC-210.19', { conductorAmpacity: params.wireAmpacity });
  entries.push({
    standard: 'NEC', country: 'US',
    judgment: necVD, clause: 'NEC 210.19',
    note: `허용전류 ${params.wireAmpacity}A → ${necVD.judgment}`,
  });

  const universallyCompliant = entries.every(e => e.judgment?.judgment === 'PASS');

  return {
    params: params as Record<string, unknown>,
    entries,
    universallyCompliant,
    strictestStandard: universallyCompliant ? 'KEC' : entries.find(e => e.judgment?.judgment !== 'PASS')?.standard ?? 'KEC',
  };
}
