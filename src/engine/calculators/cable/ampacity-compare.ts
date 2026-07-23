/**
 * Ampacity Country-Comparison Calculator
 *
 * Compares allowable current-carrying capacity for the same cable across:
 *   - KEC (한국전기설비기준 Table 232-1)
 *   - NEC (Table 310.16)
 *   - IEC 60364-5-52 (Table B.52.2 ~ B.52.4)
 *
 * Applies temperature derating: I_derated = I_base × Kt
 *   Kt = sqrt((T_insulation - T_ambient) / (T_insulation - T_reference))
 *
 * Standards: KEC 232.3, NEC 310.16, IEC 60364-5-52
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertOneOf,
  round,
} from '../types';
import { getNecAmpacity, type NecTempRating } from '@/data/ampacity-tables/nec-ampacity';
import { getIecAmpacity } from '@/data/ampacity-tables/iec-ampacity';
import { getAmpacity as getKecAmpacity } from '@/data/ampacity-tables/kec-ampacity';

// ── Ampacity Reference Tables ───────────────────────────────────────────────

type ConductorType = 'Cu' | 'Al';
type InsulationType = 'PVC' | 'XLPE';

// NEC·IEC는 KEC에 배율을 곱해 추정하지 않는다 — 각 표준의 실제 표를 조회한다.
// (구 구현은 NEC=KEC×0.98, IEC=KEC×1.02로 값을 지어냈다. 허용전류 과대평가는
//  과부하·화재 방향의 오차이므로 배율 추정을 금지한다.)

/**
 * NEC 310.16 표준 규격의 공칭 도체 단면적(mm², ASTM B258).
 * NEC은 AWG 네이티브라 mm² 입력을 스냅해야 하는데, **보수적으로 하향**한다:
 * 단면적이 입력보다 크지 않은 최대 규격을 고른다. 최근접 스냅은 25mm²를
 * 3 AWG(26.67mm²)로 올려 허용전류를 +21% 과대평가한다(비보수).
 */
const NEC_SIZES_MM2: ReadonlyArray<readonly [string, number]> = [
  ['14', 2.08], ['12', 3.31], ['10', 5.26], ['8', 8.37], ['6', 13.3], ['4', 21.15],
  ['3', 26.67], ['2', 33.63], ['1', 42.41], ['1/0', 53.5], ['2/0', 67.4], ['3/0', 85.0],
  ['4/0', 107.2], ['250', 126.7], ['300', 152.0], ['350', 177.3], ['400', 202.7],
];

/** 입력 단면적 이하의 최대 NEC 규격(보수). 최소 규격보다 작으면 최소 규격. */
function necSizeAtOrBelow(mm2: number): readonly [string, number] {
  let chosen = NEC_SIZES_MM2[0];
  for (const entry of NEC_SIZES_MM2) {
    if (entry[1] <= mm2) chosen = entry;
  }
  return chosen;
}

// ── Input / Output ──────────────────────────────────────────────────────────

export interface AmpacityCompareInput {
  /** Cable cross-section in mm² */
  cableSize: number;
  /** Conductor material */
  conductor: ConductorType;
  /** Insulation type */
  insulation: InsulationType;
  /** Ambient temperature in °C (default 30) */
  ambientTemp?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function compareAmpacityByCountry(input: AmpacityCompareInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.cableSize, 'cableSize');
  assertOneOf(input.conductor, ['Cu', 'Al'] as const, 'conductor');
  assertOneOf(input.insulation, ['PVC', 'XLPE'] as const, 'insulation');

  const ambientTemp = input.ambientTemp ?? 30;
  const refTemp = 30;

  const steps: CalcStep[] = [];

  // PART 2 — Base ampacity lookup
  let kecLookup: ReturnType<typeof getKecAmpacity>;
  try {
    kecLookup = getKecAmpacity({
      size: input.cableSize,
      conductor: input.conductor,
      insulation: input.insulation,
      installation: 'freeAir',
      ambientTemp,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown lookup failure';
    throw new Error(`KEC ampacity not available for this comparison: ${reason}`);
  }
  const kecBase = kecLookup.ampacity;

  // NEC 310.16 실표 조회 — mm²는 보수적으로 하향 스냅한 AWG로 환산(등가 규격 공개).
  const [necSize, necSizeMm2] = necSizeAtOrBelow(input.cableSize);
  const necTempRating: NecTempRating = input.insulation === 'PVC' ? 75 : 90;
  let necLookup: ReturnType<typeof getNecAmpacity>;
  try {
    necLookup = getNecAmpacity({
      size: necSize, conductor: input.conductor, tempRating: necTempRating, ambientTemp,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown lookup failure';
    throw new Error(`NEC ampacity not available for this comparison: ${reason}`);
  }

  // IEC 60364-5-52 실표 조회 — mm² 네이티브라 환산 불필요.
  let iecLookup: ReturnType<typeof getIecAmpacity>;
  try {
    iecLookup = getIecAmpacity({
      size: input.cableSize, conductor: input.conductor, insulation: input.insulation, ambientTemp,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown lookup failure';
    throw new Error(`IEC ampacity not available for this comparison: ${reason}`);
  }

  steps.push({
    step: 1,
    title: `KEC free-air base ampacity (${input.cableSize} mm², ${input.conductor}, ${input.insulation}, 30°C)`,
    formula: 'I_{base,KEC}',
    value: kecBase,
    unit: 'A',
    standardRef: 'KEC 232.3 Table 232-1',
  });

  steps.push({
    step: 2,
    title: `NEC base ampacity (${necSize} AWG ≤ ${input.cableSize}mm², 등가 ${necSizeMm2}mm², ${necTempRating}°C)`,
    formula: 'I_{base,NEC}',
    value: round(necLookup.ampacity, 0),
    unit: 'A',
    standardRef: 'NEC Table 310.16',
  });

  steps.push({
    step: 3,
    title: 'IEC base ampacity',
    formula: 'I_{base,IEC}',
    value: round(iecLookup.ampacity, 0),
    unit: 'A',
    standardRef: 'IEC 60364-5-52 Table B.52.4',
  });

  // PART 3 — Each standard's own temperature table was applied by its lookup.
  const kecDerated = round(kecLookup.corrected, 0);
  const necDerated = round(necLookup.corrected, 0);
  const iecDerated = round(iecLookup.corrected, 0);
  const kecFactor = round(kecLookup.corrected / kecLookup.ampacity, 4);
  if (ambientTemp !== refTemp) {
    steps.push({
      step: 4,
      title: `Standard-specific temperature corrections (${ambientTemp}°C ambient)`,
      formula: 'I_{corrected}=I_{base}\\times K_{standard}',
      value: kecDerated,
      unit: 'A (KEC)',
    });
  }

  // PART 4 — Result assembly
  return {
    value: kecDerated,
    unit: 'A',
    formula: 'I_{derated} = I_{base} \\times K_t',
    steps,
    source: [
      createSource('KEC', '232.3', { edition: '2021' }),
      createSource('NEC', '310.16', { edition: '2023' }),
      createSource('IEC', '60364-5-52', { edition: '2009' }),
    ],
    judgment: createJudgment(
      true,
      `정보용 비교(적합 판정 아님): ${input.cableSize} mm² ${input.conductor}/${input.insulation} at ${ambientTemp}°C — KEC: ${kecDerated}A, NEC: ${necDerated}A, IEC: ${iecDerated}A`,
      'info',
    ),
    warnings: [
      'KEC free-air, NEC Table 310.16, IEC Method C의 표 조건은 완전히 동일하지 않습니다. 설계 선정에는 실제 포설조건별 계산을 사용하세요.',
    ],
    additionalOutputs: {
      kecAmpacity: { value: kecDerated, unit: 'A' },
      necAmpacity: { value: necDerated, unit: 'A' },
      iecAmpacity: { value: iecDerated, unit: 'A' },
      deratingFactor: { value: kecFactor, unit: 'KEC' },
    },
  };
}
