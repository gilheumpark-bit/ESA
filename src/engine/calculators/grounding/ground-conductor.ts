/**
 * Grounding Conductor Sizing Calculator
 *
 * Formulae:
 *   Minimum cross-section: A = I × √t / k               [mm²]
 *     where k = material constant (Cu: 226, Al: 148 per IEC 60364-5-54)
 *
 * Standards: IEC 60364-5-54, KEC 142
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertOneOf,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export type ConductorMaterial = 'Cu' | 'Al';

export interface GroundConductorInput {
  /** Fault current in Amperes */
  faultCurrent: number;
  /** Fault clearing time in seconds */
  clearingTime: number;
  /** Conductor material */
  conductor: ConductorMaterial;
}

const VALID_MATERIALS: readonly ConductorMaterial[] = ['Cu', 'Al'];

// IEC 60364-5-54 material constants (k factor)
const K_FACTOR: Record<ConductorMaterial, number> = {
  'Cu': 226,
  'Al': 148,
};

// Standard conductor sizes (mm²)
const STANDARD_SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300] as const;

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateGroundConductor(input: GroundConductorInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.faultCurrent, 'faultCurrent');
  assertPositive(input.clearingTime, 'clearingTime');
  assertOneOf(input.conductor, VALID_MATERIALS, 'conductor');

  const { faultCurrent: I, clearingTime: t, conductor } = input;
  const k = K_FACTOR[conductor];

  // PART 2 — Derivation
  const steps: CalcStep[] = [];

  // Step 1: k 계수 확인
  steps.push({
    step: 1,
    title: `Material constant for ${conductor}`,
    formula: `k = ${k}\\text{ (${conductor}, IEC 60364-5-54)}`,
    value: k,
    unit: '',
  });

  // Step 2: 최소 단면적 계산
  const Amin = (I * Math.sqrt(t)) / k;
  steps.push({
    step: 2,
    title: 'Calculate minimum conductor cross-section',
    formula: 'A = \\frac{I \\times \\sqrt{t}}{k}',
    value: round(Amin, 2),
    unit: 'mm²',
  });

  // Step 3: 표준 규격 선정
  const selectedSize = STANDARD_SIZES.find(s => s >= Amin) ?? STANDARD_SIZES[STANDARD_SIZES.length - 1];
  steps.push({
    step: 3,
    title: 'Select standard conductor size',
    formula: 'A_{selected} \\geq A_{min}',
    value: selectedSize,
    unit: 'mm²',
  });

  // PART 3 — Judgment
  const margin = ((selectedSize - Amin) / Amin) * 100;
  const pass = selectedSize >= Amin;
  const judgmentMsg = pass
    ? `${conductor} ${selectedSize} mm² selected (min ${round(Amin, 2)} mm², margin +${round(margin, 1)}%)`
    : `No standard size available for ${round(Amin, 2)} mm² minimum — use parallel conductors`;

  // PART 4 — Result assembly
  return {
    value: round(Amin, 2),
    unit: 'mm²',
    formula: 'A = \\frac{I \\times \\sqrt{t}}{k}',
    steps,
    source: [
      createSource('IEC', '60364-5-54', { edition: '2011' }),
      createSource('KEC', '142', { edition: '2021' }),
    ],
    judgment: createJudgment(pass, judgmentMsg, pass ? 'info' : 'warning'),
    additionalOutputs: {
      minimumSize: { value: round(Amin, 2), unit: 'mm²' },
      selectedSize: { value: selectedSize, unit: 'mm²' },
    },
  };
}
