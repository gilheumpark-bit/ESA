/**
 * Single-Phase Power Calculator
 *
 * Formulae:
 *   Active Power:    P = V x I x cos(phi)          [W]
 *   Apparent Power:  S = V x I                       [VA]
 *   Reactive Power:  Q = V x I x sin(phi)           [var]
 *
 * Standards: KEC 130 (Power System Fundamentals)
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

export interface SinglePhasePowerInput {
  /** RMS voltage in Volts */
  voltage: number;
  /** RMS current in Amperes */
  current: number;
  /** Power factor (0 < pf <= 1) */
  powerFactor: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateSinglePhasePower(input: SinglePhasePowerInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.voltage, 'voltage');
  assertPositive(input.current, 'current');
  assertRange(input.powerFactor, 0.01, 1.0, 'powerFactor');

  const { voltage: V, current: I, powerFactor: pf } = input;

  // PART 2 — Derivation
  const steps: CalcStep[] = [];

  // Step 1: Apparent Power
  const S = V * I;
  steps.push({
    step: 1,
    title: 'Calculate apparent power',
    formula: 'S = V \\times I',
    value: round(S, 2),
    unit: 'VA',
  });

  // Step 2: Active Power
  const P = V * I * pf;
  steps.push({
    step: 2,
    title: 'Calculate active power',
    formula: 'P = V \\times I \\times \\cos\\varphi',
    value: round(P, 2),
    unit: 'W',
  });

  // Step 3: Reactive Power
  const sinPhi = Math.sqrt(1 - pf * pf);
  const Q = V * I * sinPhi;
  steps.push({
    step: 3,
    title: 'Calculate reactive power',
    formula: 'Q = V \\times I \\times \\sin\\varphi',
    value: round(Q, 2),
    unit: 'var',
  });

  // PART 3 — Result assembly
  return {
    value: round(P, 2),
    unit: 'W',
    formula: 'P = V \\times I \\times \\cos\\varphi',
    steps,
    source: [createSource('KEC', '130', { edition: '2021' })],
    judgment: createJudgment(true, `Active power = ${round(P, 2)} W (pf = ${pf})`, 'info'),
    additionalOutputs: {
      apparentPower: { value: round(S, 2), unit: 'VA', formula: 'S = V \\times I' },
      reactivePower: { value: round(Q, 2), unit: 'var', formula: 'Q = V \\times I \\times \\sin\\varphi' },
    },
  };
}
