/**
 * Reactive Power / Power Factor Correction Calculator
 *
 * Formulae:
 *   Qc = P × (tan(φ1) - tan(φ2))
 *   φ1 = arccos(pf_current), φ2 = arccos(pf_target)
 *
 * Selects nearest standard capacitor bank size from:
 *   [5, 10, 15, 20, 25, 30, 50, 75, 100, 150, 200, 300, 500] kvar
 *
 * Standards: KEC 232 (역률 개선), IEC 60831 (콘덴서)
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  round,
} from '../types';

// ── Constants ───────────────────────────────────────────────────────────────

const STANDARD_CAPACITOR_SIZES = [5, 10, 15, 20, 25, 30, 50, 75, 100, 150, 200, 300, 500] as const;

// ── Input / Output ──────────────────────────────────────────────────────────

export interface ReactivePowerInput {
  /** Active power in kW */
  activePower: number;
  /** Current power factor (0 < pf < 1) */
  currentPF: number;
  /** Target power factor (currentPF < targetPF <= 1) */
  targetPF: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateReactivePower(input: ReactivePowerInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.activePower, 'activePower');
  assertRange(input.currentPF, 0.01, 0.99, 'currentPF');
  assertRange(input.targetPF, 0.01, 1.0, 'targetPF');

  if (input.targetPF <= input.currentPF) {
    throw new Error('targetPF must be greater than currentPF');
  }

  const { activePower: P, currentPF: pf1, targetPF: pf2 } = input;
  const steps: CalcStep[] = [];

  // PART 2 — Derivation

  // Step 1: Current phase angle and tan(φ1)
  const phi1Rad = Math.acos(pf1);
  const phi1Deg = (phi1Rad * 180) / Math.PI;
  const tanPhi1 = Math.tan(phi1Rad);
  steps.push({
    step: 1,
    title: 'Current phase angle and tan(φ₁)',
    formula: '\\varphi_1 = \\arccos(pf_1),\\quad \\tan\\varphi_1',
    value: round(tanPhi1, 4),
    unit: '',
  });

  // Step 2: Target phase angle and tan(φ2)
  const phi2Rad = Math.acos(pf2);
  const phi2Deg = (phi2Rad * 180) / Math.PI;
  const tanPhi2 = Math.tan(phi2Rad);
  steps.push({
    step: 2,
    title: 'Target phase angle and tan(φ₂)',
    formula: '\\varphi_2 = \\arccos(pf_2),\\quad \\tan\\varphi_2',
    value: round(tanPhi2, 4),
    unit: '',
  });

  // Step 3: Required capacitor bank reactive power
  const Qc = P * (tanPhi1 - tanPhi2);
  steps.push({
    step: 3,
    title: 'Required capacitor bank size',
    formula: 'Q_c = P \\times (\\tan\\varphi_1 - \\tan\\varphi_2)',
    value: round(Qc, 2),
    unit: 'kvar',
    standardRef: 'KEC 232',
  });

  // Step 4: Current reactive power
  const Q1 = P * tanPhi1;
  steps.push({
    step: 4,
    title: 'Current reactive power',
    formula: 'Q_1 = P \\times \\tan\\varphi_1',
    value: round(Q1, 2),
    unit: 'kvar',
  });

  // Step 5: Target reactive power
  const Q2 = P * tanPhi2;
  steps.push({
    step: 5,
    title: 'Target reactive power',
    formula: 'Q_2 = P \\times \\tan\\varphi_2',
    value: round(Q2, 2),
    unit: 'kvar',
  });

  // Step 6: Select nearest standard capacitor size
  const selectedSize = STANDARD_CAPACITOR_SIZES.find((s) => s >= Qc) ?? STANDARD_CAPACITOR_SIZES[STANDARD_CAPACITOR_SIZES.length - 1];
  steps.push({
    step: 6,
    title: 'Select nearest standard capacitor bank',
    formula: 'Q_{std} \\geq Q_c',
    value: selectedSize,
    unit: 'kvar',
    standardRef: 'IEC 60831',
  });

  // PART 3 — Result assembly
  return {
    value: round(Qc, 2),
    unit: 'kvar',
    formula: 'Q_c = P \\times (\\tan\\varphi_1 - \\tan\\varphi_2)',
    steps,
    source: [
      createSource('KEC', '232', { edition: '2021' }),
      createSource('IEC', '60831', { edition: '2014' }),
    ],
    judgment: createJudgment(
      true,
      `Required ${round(Qc, 2)} kvar — select ${selectedSize} kvar standard capacitor bank`,
      'info',
    ),
    additionalOutputs: {
      requiredCapacitorBank: { value: round(Qc, 2), unit: 'kvar' },
      selectedStandardSize: { value: selectedSize, unit: 'kvar' },
      currentReactive: { value: round(Q1, 2), unit: 'kvar' },
      targetReactive: { value: round(Q2, 2), unit: 'kvar' },
      currentAngle: { value: round(phi1Deg, 2), unit: 'deg' },
      targetAngle: { value: round(phi2Deg, 2), unit: 'deg' },
    },
  };
}
