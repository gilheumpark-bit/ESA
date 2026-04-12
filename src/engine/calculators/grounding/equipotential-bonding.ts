/**
 * Equipotential Bonding Conductor Sizing Calculator
 *
 * Rules:
 *   Main bonding conductor ≥ 50% of largest protective conductor (PE)
 *   Minimum: 6 mm² Cu / 16 mm² Al
 *   Maximum need not exceed: 25 mm² Cu / 50 mm² Al
 *   Supplementary bonding: ≥ smallest PE of circuits involved
 *
 * Standards: KEC 142.6 (등전위 본딩), IEC 60364-5-54
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export interface EquipotentialBondingInput {
  /** Largest phase conductor cross-section in mm² */
  largestPhase: number;
  /** Largest protective earth (PE) conductor cross-section in mm² */
  largestPE: number;
}

// Standard bonding conductor sizes (mm², Cu)
const STANDARD_SIZES = [4, 6, 10, 16, 25, 35, 50, 70, 95] as const;

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateEquipotentialBonding(input: EquipotentialBondingInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.largestPhase, 'largestPhase');
  assertPositive(input.largestPE, 'largestPE');

  const { largestPhase: _largestPhase, largestPE } = input;

  // PART 2 — Derivation
  const steps: CalcStep[] = [];

  // Step 1: 주 본딩 도체 최소 단면적 (PE의 50%)
  const halfPE = largestPE * 0.5;
  steps.push({
    step: 1,
    title: 'Calculate 50% of largest PE conductor',
    formula: 'A_{bond,min} = 0.5 \\times A_{PE}',
    value: round(halfPE, 2),
    unit: 'mm²',
  });

  // Step 2: 최소 하한 적용 (6 mm² Cu)
  const minFloor = 6; // mm² Cu
  const withFloor = Math.max(halfPE, minFloor);
  steps.push({
    step: 2,
    title: 'Apply minimum floor (6 mm² Cu)',
    formula: 'A_{bond} = \\max(A_{bond,min},\\; 6)',
    value: round(withFloor, 2),
    unit: 'mm²',
  });

  // Step 3: 최대 상한 적용 (25 mm² Cu)
  const maxCap = 25; // mm² Cu
  const capped = Math.min(withFloor, maxCap);
  steps.push({
    step: 3,
    title: 'Apply maximum cap (25 mm² Cu)',
    formula: 'A_{bond} = \\min(A_{bond},\\; 25)',
    value: round(capped, 2),
    unit: 'mm²',
  });

  // Step 4: 표준 규격 선정
  const selectedSize = STANDARD_SIZES.find(s => s >= capped) ?? STANDARD_SIZES[STANDARD_SIZES.length - 1];
  steps.push({
    step: 4,
    title: 'Select standard bonding conductor size',
    formula: 'A_{selected} \\geq A_{bond}',
    value: selectedSize,
    unit: 'mm²',
  });

  // PART 3 — Judgment
  const pass = selectedSize >= capped;
  const judgmentMsg = `Bonding conductor: ${selectedSize} mm² Cu (min required ${round(capped, 2)} mm², based on PE=${largestPE} mm²)`;

  // PART 4 — Result assembly
  return {
    value: round(capped, 2),
    unit: 'mm²',
    formula: 'A_{bond} = \\min(\\max(0.5 \\times A_{PE},\\; 6),\\; 25)',
    steps,
    source: [
      createSource('KEC', '142.6', { edition: '2021' }),
      createSource('IEC', '60364-5-54', { edition: '2011' }),
    ],
    judgment: createJudgment(pass, judgmentMsg, 'info'),
    additionalOutputs: {
      minimumBonding: { value: round(capped, 2), unit: 'mm²' },
      selectedBonding: { value: selectedSize, unit: 'mm²' },
    },
  };
}
