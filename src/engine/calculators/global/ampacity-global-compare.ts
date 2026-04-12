/**
 * Global Ampacity Comparison Calculator
 *
 * Compares cable ampacity ratings across different country standards
 * for the same cable size, conductor material, and insulation type.
 *
 * Standards: IEC 60364-5-52, NEC 310.16, KEC 232, BS 7671, AS/NZS 3008
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import { activeDefaults } from '@/engine/calculators/country-defaults';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertOneOf,
  round,
} from '../types';

// -- Input / Output ----------------------------------------------------------

export type ConductorMaterial = 'copper' | 'aluminum';
export type InsulationType = 'PVC' | 'XLPE';

export interface AmpacityGlobalCompareInput {
  /** Cable cross-section in mm2 */
  cableSize: number;
  /** Conductor material */
  conductor: ConductorMaterial;
  /** Insulation type */
  insulation: InsulationType;
  /** Ambient temperature in Celsius */
  ambientTemp: number;
}

// -- Base ampacity tables (3-core cable, reference 30C ambient) ----

interface AmpacityRecord {
  country: string;
  standard: string;
  referenceTemp: number;   // reference ambient temp
  maxConductorTemp: number;
  // ampacity lookup: size(mm2) -> amps (copper, XLPE as baseline)
  table: Record<number, number>;
}

const AMPACITY_DATA: AmpacityRecord[] = [
  {
    country: 'International (IEC)',
    standard: 'IEC 60364-5-52',
    referenceTemp: 30,
    maxConductorTemp: 90,
    table: { 1.5: 23, 2.5: 31, 4: 42, 6: 54, 10: 73, 16: 98, 25: 127, 35: 158, 50: 192, 70: 246, 95: 298, 120: 344, 150: 391, 185: 448, 240: 528, 300: 608 },
  },
  {
    country: 'USA (NEC)',
    standard: 'NEC 310.16',
    referenceTemp: 30,
    maxConductorTemp: 90,
    table: { 1.5: 20, 2.5: 30, 4: 40, 6: 55, 10: 75, 16: 95, 25: 130, 35: 150, 50: 190, 70: 240, 95: 290, 120: 335, 150: 380, 185: 440, 240: 520, 300: 600 },
  },
  {
    country: 'Korea (KEC)',
    standard: 'KEC 232',
    referenceTemp: 30,
    maxConductorTemp: 90,
    table: { 1.5: 22, 2.5: 30, 4: 41, 6: 53, 10: 72, 16: 96, 25: 125, 35: 155, 50: 190, 70: 243, 95: 295, 120: 340, 150: 388, 185: 445, 240: 525, 300: 605 },
  },
  {
    country: 'UK (BS)',
    standard: 'BS 7671',
    referenceTemp: 30,
    maxConductorTemp: 90,
    table: { 1.5: 23, 2.5: 31, 4: 42, 6: 54, 10: 73, 16: 97, 25: 127, 35: 157, 50: 190, 70: 244, 95: 296, 120: 342, 150: 389, 185: 446, 240: 526, 300: 606 },
  },
  {
    country: 'Australia (AS/NZS)',
    standard: 'AS/NZS 3008',
    referenceTemp: 40,
    maxConductorTemp: 90,
    table: { 1.5: 20, 2.5: 27, 4: 36, 6: 46, 10: 63, 16: 84, 25: 110, 35: 136, 50: 165, 70: 212, 95: 257, 120: 297, 150: 339, 185: 388, 240: 458, 300: 528 },
  },
];

// Correction factors — 국가별 프로파일에서 가져오되, 비교 계산기이므로 기본값도 유지
const PVC_DERATING = activeDefaults().pvcDerating;
const ALUMINUM_DERATING = activeDefaults().aluminumDerating;

function tempCorrectionFactor(refTemp: number, actualTemp: number, maxTemp: number): number {
  if (actualTemp >= maxTemp) return 0;
  return Math.sqrt((maxTemp - actualTemp) / (maxTemp - refTemp));
}

// -- Calculator --------------------------------------------------------------

export function compareGlobalAmpacity(input: AmpacityGlobalCompareInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.cableSize, 'cableSize');
  assertOneOf(input.conductor, ['copper', 'aluminum'] as const, 'conductor');
  assertOneOf(input.insulation, ['PVC', 'XLPE'] as const, 'insulation');

  const { cableSize, conductor, insulation, ambientTemp } = input;
  const steps: CalcStep[] = [];

  // PART 2 -- Derivation
  // Step 1: Identify material/insulation derating
  const materialFactor = conductor === 'aluminum' ? ALUMINUM_DERATING : 1.0;
  const insulationFactor = insulation === 'PVC' ? PVC_DERATING : 1.0;

  steps.push({
    step: 1,
    title: '보정 계수 산정 (Material & insulation factors)',
    formula: 'k_{mat} \\times k_{ins}',
    value: round(materialFactor * insulationFactor, 3),
    unit: '',
  });

  // Step 2-N: Per-country ampacity
  const perCountry: { country: string; standard: string; baseAmpacity: number; correctionFactor: number; correctedAmpacity: number }[] = [];

  let stepNum = 2;
  for (const record of AMPACITY_DATA) {
    // Find nearest cable size in table
    const sizes = Object.keys(record.table).map(Number).sort((a, b) => a - b);
    let nearestSize = sizes[0];
    let bestDiff = Math.abs(cableSize - nearestSize);
    for (const s of sizes) {
      const diff = Math.abs(cableSize - s);
      if (diff < bestDiff) { nearestSize = s; bestDiff = diff; }
    }

    const baseXLPECopper = record.table[nearestSize] ?? 0;
    const baseAmpacity = baseXLPECopper * materialFactor * insulationFactor;
    const cf = tempCorrectionFactor(record.referenceTemp, ambientTemp, record.maxConductorTemp);
    const corrected = baseAmpacity * cf;

    perCountry.push({
      country: record.country,
      standard: record.standard,
      baseAmpacity: round(baseAmpacity, 1),
      correctionFactor: round(cf, 4),
      correctedAmpacity: round(corrected, 1),
    });

    steps.push({
      step: stepNum++,
      title: `${record.country} 허용전류 (${record.standard})`,
      formula: `I = I_{base} \\times k_{mat} \\times k_{ins} \\times k_{temp}`,
      value: round(corrected, 1),
      unit: 'A',
      standardRef: record.standard,
    });
  }

  // Find min/max for summary
  const ampValues = perCountry.map(c => c.correctedAmpacity);
  const minAmp = Math.min(...ampValues);
  const maxAmp = Math.max(...ampValues);
  const spread = round(((maxAmp - minAmp) / minAmp) * 100, 1);

  // PART 3 -- Result assembly
  return {
    value: round(minAmp, 1),
    unit: 'A',
    formula: 'I = I_{base} \\times k_{mat} \\times k_{ins} \\times k_{temp}',
    steps,
    source: [
      createSource('IEC', '60364-5-52', { edition: '2009' }),
      createSource('NEC', '310.16', { edition: '2023' }),
      createSource('KEC', '232', { edition: '2021' }),
    ],
    judgment: createJudgment(
      true,
      `${cableSize} mm2 ${conductor} ${insulation} @ ${ambientTemp}C: ${minAmp}~${maxAmp} A (편차 ${spread}%)`,
      'info',
    ),
    additionalOutputs: {
      minAmpacity: { value: minAmp, unit: 'A' },
      maxAmpacity: { value: maxAmp, unit: 'A' },
      spreadPercent: { value: spread, unit: '%' },
    },
  };
}
