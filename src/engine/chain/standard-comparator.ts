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

import { queryAmpacity } from '@/engine/standards/kec/kec-table-query';
import { evaluateStandard } from '@/engine/standards/registry';
import type { JudgmentResult } from '@/engine/standards/kec/types';
import type { AmpacityOptions } from '@/data/ampacity-tables/kec-ampacity';
import { getNecAmpacity, type NecTempRating } from '@/data/ampacity-tables/nec-ampacity';
import { getIecAmpacity, type IecInsulationType } from '@/data/ampacity-tables/iec-ampacity';

// NEC 310.16 표준 규격의 공칭 도체 단면적(mm², ASTM B258 AWG 면적).
// NEC은 AWG 네이티브이므로 mm² 입력을 "면적 최근접 AWG"로 스냅해 실표를 조회하고
// 어떤 AWG로 조회했는지 note에 공개한다(임의 보정계수 없음).
const NEC_SIZES_MM2: ReadonlyArray<readonly [string, number]> = [
  ['14', 2.08], ['12', 3.31], ['10', 5.26], ['8', 8.37], ['6', 13.3], ['4', 21.15],
  ['3', 26.67], ['2', 33.63], ['1', 42.41], ['1/0', 53.5], ['2/0', 67.4], ['3/0', 85.0],
  ['4/0', 107.2], ['250', 126.7], ['300', 152.0], ['350', 177.3], ['400', 202.7],
];

function nearestNecSize(mm2: number): readonly [string, number] {
  let best = NEC_SIZES_MM2[0];
  for (const e of NEC_SIZES_MM2) {
    if (Math.abs(e[1] - mm2) < Math.abs(best[1] - mm2)) best = e;
  }
  return best;
}

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

  // NEC — 실제 NEC 310.16 표 조회 (면적 최근접 AWG로 스냅, 등가 AWG 공개)
  let necAmpacity: number | undefined;
  let necNote = 'NEC 310.16 데이터 없음';
  try {
    const [necSize, necMm2] = nearestNecSize(opts.size);
    // 절연 등급 → 도체 온도등급: PVC 75°C(THWN), XLPE/EPR/MI 90°C.
    const tempRating: NecTempRating = opts.insulation === 'PVC' ? 75 : 90;
    const nec = getNecAmpacity({
      size: necSize,
      conductor: opts.conductor,
      tempRating,
      ambientTemp: opts.ambientTemp,
    });
    necAmpacity = Math.round(nec.corrected);
    necNote = `NEC 310.16 조회값: ${necSize} AWG (${opts.size}mm²≈${necMm2}mm²), ${tempRating}°C, 보정 후 ${necAmpacity}A`;
  } catch {
    necAmpacity = undefined;
  }
  entries.push({ standard: 'NEC', country: 'US', ampacity: necAmpacity, clause: 'NEC 310.16', note: necNote });

  // IEC — 실제 IEC 60364-5-52 표 조회 (mm² 네이티브)
  let iecAmpacity: number | undefined;
  let iecNote = 'IEC 60364-5-52 데이터 없음';
  try {
    // KEC 절연(PVC/XLPE/MI) → IEC 절연(PVC/XLPE/EPR): MI는 90°C급이므로 XLPE로 매핑.
    const iecInsulation: IecInsulationType = opts.insulation === 'PVC' ? 'PVC' : 'XLPE';
    const iec = getIecAmpacity({
      size: opts.size,
      conductor: opts.conductor,
      insulation: iecInsulation,
      ambientTemp: opts.ambientTemp,
      groupCount: opts.groupCount,
    });
    iecAmpacity = Math.round(iec.corrected);
    iecNote = `IEC 60364-5-52 조회값: 보정 후 ${iecAmpacity}A`;
  } catch {
    iecAmpacity = undefined;
  }
  entries.push({ standard: 'IEC', country: 'INT', ampacity: iecAmpacity, clause: 'IEC 60364-5-52', note: iecNote });

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
