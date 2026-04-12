/**
 * Solar (PV) DC Cable Sizing Calculator
 *
 * Formulae:
 *   System voltage:  Vsys = Voc x stringCount (open circuit)
 *   Design current:  Idesign = Isc x 1.25 (NEC 690.8 / KEC 502)
 *   Min area:        A = 2 x rho x L x Idesign / (VD_max x Vsys)  [mm^2]
 *   Actual VD:       VD = 2 x rho x L x Idesign / (A x Vsys) x 100  [%]
 *
 * Standards: KEC 502 (PV Installations), IEC 62548
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export interface SolarCableInput {
  /** Module open-circuit voltage per string in Volts */
  moduleVoc: number;
  /** Number of modules in series per string */
  stringCount: number;
  /** Short-circuit current per string in Amperes */
  isc: number;
  /** One-way cable length in meters */
  length: number;
  /** Maximum allowed voltage drop in % (typically 1-3%) */
  maxVoltageDrop: number;
}

// ── Standard cable sizes (mm^2) ────────────────────────────────────────────

const STANDARD_SIZES_MM2 = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240];

// DC cable ampacity at 30C ambient (single-core, approximate)
const AMPACITY: Record<number, number> = {
  1.5: 18, 2.5: 25, 4: 34, 6: 44, 10: 61, 16: 82, 25: 108,
  35: 135, 50: 168, 70: 213, 95: 258, 120: 299, 150: 344, 185: 392, 240: 461,
};

// Copper resistivity at 70C [ohm.mm^2/m]
const RHO_CU = 0.02133;

function selectCableSize(minArea: number): number {
  for (const size of STANDARD_SIZES_MM2) {
    if (size >= minArea) return size;
  }
  return STANDARD_SIZES_MM2[STANDARD_SIZES_MM2.length - 1];
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateSolarCable(input: SolarCableInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.moduleVoc, 'moduleVoc');
  assertPositive(input.stringCount, 'stringCount');
  assertPositive(input.isc, 'isc');
  assertPositive(input.length, 'length');
  assertRange(input.maxVoltageDrop, 0.1, 10, 'maxVoltageDrop');

  const { moduleVoc, stringCount, isc, length: L, maxVoltageDrop: maxVD } = input;

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];

  // Step 1: String voltage
  const Vsys = moduleVoc * stringCount;
  steps.push({
    step: 1,
    title: '스트링 전압 (String open-circuit voltage)',
    formula: 'V_{sys} = V_{oc} \\times N_{string}',
    value: round(Vsys, 1),
    unit: 'V',
  });

  // Step 2: Design current (1.25x Isc per KEC 502)
  const Idesign = isc * 1.25;
  steps.push({
    step: 2,
    title: '설계전류 (Design current, 1.25 x Isc)',
    formula: 'I_{design} = I_{sc} \\times 1.25',
    value: round(Idesign, 2),
    unit: 'A',
    standardRef: 'KEC 502',
  });

  // Step 3: Minimum cable cross-section area
  const VDmaxV = (maxVD / 100) * Vsys;
  const minArea = (2 * RHO_CU * L * Idesign) / VDmaxV;
  steps.push({
    step: 3,
    title: '최소 케이블 단면적 (Minimum cable area)',
    formula: 'A_{min} = \\frac{2 \\times \\rho \\times L \\times I_{design}}{\\Delta V_{max}}',
    value: round(minArea, 2),
    unit: 'mm\u00B2',
  });

  // Step 4: Select standard size
  const selected = selectCableSize(minArea);
  steps.push({
    step: 4,
    title: '표준 규격 선정 (Selected standard size)',
    formula: `A_{sel} \\geq ${round(minArea, 2)}`,
    value: selected,
    unit: 'mm\u00B2',
  });

  // Step 5: Actual voltage drop
  const actualVD = (2 * RHO_CU * L * Idesign) / (selected * Vsys) * 100;
  steps.push({
    step: 5,
    title: '실제 전압강하 (Actual voltage drop)',
    formula: '\\Delta V = \\frac{2 \\rho L I}{A \\times V_{sys}} \\times 100',
    value: round(actualVD, 2),
    unit: '%',
  });

  // Step 6: Ampacity check
  const ampacity = AMPACITY[selected] ?? 0;
  const ampacityPass = Idesign <= ampacity;
  steps.push({
    step: 6,
    title: '허용전류 검증 (Ampacity check)',
    formula: `I_{design} = ${round(Idesign, 2)} \\leq I_{amp} = ${ampacity}`,
    value: ampacity,
    unit: 'A',
    standardRef: 'IEC 62548',
  });

  // PART 3 -- Result assembly
  const pass = actualVD <= maxVD && ampacityPass;
  return {
    value: selected,
    unit: 'mm\u00B2',
    formula: 'A = \\frac{2 \\rho L I}{\\Delta V_{max}}',
    steps,
    source: [
      createSource('KEC', '502', { edition: '2021' }),
      createSource('IEC', '62548', { edition: '2016' }),
    ],
    judgment: createJudgment(
      pass,
      pass
        ? `${selected} mm\u00B2 선정, 전압강하 ${round(actualVD, 2)}%, 허용전류 ${ampacity} A -- 적합`
        : `${selected} mm\u00B2 -- ${!ampacityPass ? '허용전류 초과' : '전압강하 초과'}, 상위 규격 검토`,
      pass ? 'info' : 'error',
    ),
    additionalOutputs: {
      minSize:      { value: round(minArea, 2),   unit: 'mm\u00B2' },
      selectedSize: { value: selected,            unit: 'mm\u00B2' },
      actualVD:     { value: round(actualVD, 2),  unit: '%' },
      ampacity:     { value: ampacity,            unit: 'A' },
    },
  };
}
