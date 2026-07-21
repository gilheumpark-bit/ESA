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

// ── Ampacity Reference Tables ───────────────────────────────────────────────
// Simplified lookup for copper, PVC/XLPE, single-circuit in air (Method C/B)
// Real implementation would use comprehensive table database

type ConductorType = 'Cu' | 'Al';
type InsulationType = 'PVC' | 'XLPE';

interface AmpacityEntry {
  size: number;        // mm²
  pvcCu: number;       // PVC insulated, copper, in air (A)
  xlpeCu: number;      // XLPE insulated, copper, in air (A)
  pvcAl: number;       // PVC insulated, aluminum, in air (A)
  xlpeAl: number;      // XLPE insulated, aluminum, in air (A)
}

// Base ampacity at 30°C ambient (representative values — 3-core cable in air)
const KEC_TABLE: AmpacityEntry[] = [
  { size: 1.5,  pvcCu: 19,  xlpeCu: 24,  pvcAl: 15,  xlpeAl: 19 },
  { size: 2.5,  pvcCu: 27,  xlpeCu: 33,  pvcAl: 21,  xlpeAl: 26 },
  { size: 4,    pvcCu: 36,  xlpeCu: 45,  pvcAl: 28,  xlpeAl: 35 },
  { size: 6,    pvcCu: 46,  xlpeCu: 57,  pvcAl: 36,  xlpeAl: 44 },
  { size: 10,   pvcCu: 63,  xlpeCu: 78,  pvcAl: 49,  xlpeAl: 61 },
  { size: 16,   pvcCu: 85,  xlpeCu: 105, pvcAl: 66,  xlpeAl: 82 },
  { size: 25,   pvcCu: 112, xlpeCu: 138, pvcAl: 87,  xlpeAl: 107 },
  { size: 35,   pvcCu: 138, xlpeCu: 171, pvcAl: 107, xlpeAl: 133 },
  { size: 50,   pvcCu: 168, xlpeCu: 209, pvcAl: 130, xlpeAl: 163 },
  { size: 70,   pvcCu: 213, xlpeCu: 269, pvcAl: 165, xlpeAl: 209 },
  { size: 95,   pvcCu: 258, xlpeCu: 328, pvcAl: 200, xlpeAl: 255 },
  { size: 120,  pvcCu: 299, xlpeCu: 382, pvcAl: 232, xlpeAl: 297 },
  { size: 150,  pvcCu: 344, xlpeCu: 441, pvcAl: 267, xlpeAl: 342 },
  { size: 185,  pvcCu: 392, xlpeCu: 506, pvcAl: 304, xlpeAl: 393 },
  { size: 240,  pvcCu: 461, xlpeCu: 599, pvcAl: 358, xlpeAl: 465 },
  { size: 300,  pvcCu: 530, xlpeCu: 693, pvcAl: 411, xlpeAl: 538 },
];

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
  const refTemp = 30; // reference ambient for table values
  const insulationMaxTemp = input.insulation === 'PVC' ? 70 : 90;

  // Find matching cable size in table
  const entry = KEC_TABLE.find((e) => e.size === input.cableSize);
  if (!entry) {
    const available = KEC_TABLE.map((e) => e.size).join(', ');
    throw new Error(`Cable size ${input.cableSize} mm² not found. Available: ${available}`);
  }

  const steps: CalcStep[] = [];

  // PART 2 — Base ampacity lookup
  const key = `${input.insulation.toLowerCase()}${input.conductor}` as keyof AmpacityEntry;
  const kecBase = entry[key] as number;

  // NEC 310.16 실표 조회 — mm²는 보수적으로 하향 스냅한 AWG로 환산(등가 규격 공개).
  const [necSize, necSizeMm2] = necSizeAtOrBelow(input.cableSize);
  const necTempRating: NecTempRating = input.insulation === 'PVC' ? 75 : 90;
  let necBase = 0;
  try {
    necBase = round(getNecAmpacity({
      size: necSize, conductor: input.conductor, tempRating: necTempRating, ambientTemp: refTemp,
    }).corrected, 0);
  } catch { necBase = 0; }

  // IEC 60364-5-52 실표 조회 — mm² 네이티브라 환산 불필요.
  let iecBase = 0;
  try {
    iecBase = round(getIecAmpacity({
      size: input.cableSize, conductor: input.conductor, insulation: input.insulation, ambientTemp: refTemp,
    }).corrected, 0);
  } catch { iecBase = 0; }

  steps.push({
    step: 1,
    title: `KEC base ampacity (${input.cableSize} mm², ${input.conductor}, ${input.insulation}, 30°C)`,
    formula: 'I_{base,KEC}',
    value: kecBase,
    unit: 'A',
    standardRef: 'KEC 232.3 Table 232-1',
  });

  steps.push({
    step: 2,
    title: `NEC base ampacity (${necSize} AWG ≤ ${input.cableSize}mm², 등가 ${necSizeMm2}mm², ${necTempRating}°C)`,
    formula: 'I_{base,NEC}',
    value: necBase,
    unit: 'A',
    standardRef: 'NEC Table 310.16',
  });

  steps.push({
    step: 3,
    title: 'IEC base ampacity',
    formula: 'I_{base,IEC}',
    value: iecBase,
    unit: 'A',
    standardRef: 'IEC 60364-5-52 Table B.52.4',
  });

  // PART 3 — Temperature derating (if ambient != reference)
  let Kt = 1.0;
  if (ambientTemp !== refTemp) {
    const numerator = insulationMaxTemp - ambientTemp;
    const denominator = insulationMaxTemp - refTemp;
    if (numerator <= 0) {
      throw new Error(`Ambient temperature ${ambientTemp}°C exceeds insulation rating ${insulationMaxTemp}°C`);
    }
    Kt = Math.sqrt(numerator / denominator);

    steps.push({
      step: 4,
      title: `Temperature derating factor (${ambientTemp}°C ambient)`,
      formula: 'K_t = \\sqrt{\\frac{T_{ins} - T_{amb}}{T_{ins} - T_{ref}}}',
      value: round(Kt, 4),
      unit: '',
    });
  }

  const kecDerated = round(kecBase * Kt, 0);
  const necDerated = round(necBase * Kt, 0);
  const iecDerated = round(iecBase * Kt, 0);

  if (ambientTemp !== refTemp) {
    steps.push({
      step: 5,
      title: 'Derated ampacities',
      formula: 'I_{derated} = I_{base} \\times K_t',
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
      `${input.cableSize} mm² ${input.conductor}/${input.insulation} at ${ambientTemp}°C — KEC: ${kecDerated}A, NEC: ${necDerated}A, IEC: ${iecDerated}A`,
      'info',
    ),
    additionalOutputs: {
      kecAmpacity: { value: kecDerated, unit: 'A' },
      necAmpacity: { value: necDerated, unit: 'A' },
      iecAmpacity: { value: iecDerated, unit: 'A' },
      deratingFactor: { value: round(Kt, 4), unit: '' },
    },
  };
}
