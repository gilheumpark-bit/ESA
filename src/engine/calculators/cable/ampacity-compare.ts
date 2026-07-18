/**
 * Ampacity Calculator (KEC)
 *
 * KEC(한국전기설비기준 Table 232-1) 허용전류를 조회하고 주위온도 보정을 적용한다.
 * NEC/IEC 값은 KEC 표에 상수를 곱하는 방식으로는 정확히 유도할 수 없어 제거했다
 * (실 표 기반 국가 비교는 global/ampacity-global-compare.ts 사용).
 *
 * Applies temperature derating: I_derated = I_base × Kt
 *   Kt = sqrt((T_insulation - T_ambient) / (T_insulation - T_reference))
 *
 * Standards: KEC 232.3
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertOneOf,
  round,
} from '../types';

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

// NOTE: 이 계산기는 KEC 표 값만 신뢰 가능한 출처로 제공한다.
// NEC/IEC 값은 별도 표 조회 없이 KEC 값에 임의 상수를 곱해 조작할 수 없으므로
// (실제 NEC/IEC 허용전류는 KEC와 상수비로 추종하지 않음) 비교 출력을 제거했다.
// 실 표 기반 국가 비교가 필요하면 global/ampacity-global-compare.ts를 사용할 것.

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

  // PART 2 — Base ampacity lookup (KEC only — 신뢰 가능한 단일 출처)
  const key = `${input.insulation.toLowerCase()}${input.conductor}` as keyof AmpacityEntry;
  const kecBase = entry[key] as number;

  steps.push({
    step: 1,
    title: `KEC base ampacity (${input.cableSize} mm², ${input.conductor}, ${input.insulation}, 30°C)`,
    formula: 'I_{base,KEC}',
    value: kecBase,
    unit: 'A',
    standardRef: 'KEC 232.3 Table 232-1',
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
      step: 2,
      title: `Temperature derating factor (${ambientTemp}°C ambient)`,
      formula: 'K_t = \\sqrt{\\frac{T_{ins} - T_{amb}}{T_{ins} - T_{ref}}}',
      value: round(Kt, 4),
      unit: '',
    });
  }

  const kecDerated = round(kecBase * Kt, 0);

  if (ambientTemp !== refTemp) {
    steps.push({
      step: 3,
      title: 'Derated ampacity (KEC)',
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
    ],
    judgment: createJudgment(
      true,
      `${input.cableSize} mm² ${input.conductor}/${input.insulation} at ${ambientTemp}°C — KEC: ${kecDerated}A`,
      'info',
    ),
    additionalOutputs: {
      kecAmpacity: { value: kecDerated, unit: 'A' },
      deratingFactor: { value: round(Kt, 4), unit: '' },
    },
  };
}
