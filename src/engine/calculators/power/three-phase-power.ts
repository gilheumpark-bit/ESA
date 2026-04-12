/**
 * Three-Phase Power Calculator
 *
 * Formulae (balanced load):
 *   Active Power:    P = sqrt(3) x V_L x I_L x cos(phi)   [W]
 *   Apparent Power:  S = sqrt(3) x V_L x I_L               [VA]
 *   Reactive Power:  Q = sqrt(3) x V_L x I_L x sin(phi)    [var]
 *
 * Standards: KEC 130 (Power System Fundamentals)
 */

import { SQRT3 } from '@engine/constants/physical';
import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  round,
} from '../types';

// ── Input ───────────────────────────────────────────────────────────────────

export interface ThreePhasePowerInput {
  /** Line-to-line voltage in Volts */
  lineVoltage: number;
  /** Line current in Amperes */
  lineCurrent: number;
  /** Power factor (0 < pf <= 1) */
  powerFactor: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateThreePhasePower(input: ThreePhasePowerInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.lineVoltage, 'lineVoltage');
  assertPositive(input.lineCurrent, 'lineCurrent');
  assertRange(input.powerFactor, 0.01, 1.0, 'powerFactor');

  const { lineVoltage: VL, lineCurrent: IL, powerFactor: pf } = input;

  // PART 2 — Derivation
  const steps: CalcStep[] = [];

  // Step 1: Apparent Power
  const S = SQRT3 * VL * IL;
  steps.push({
    step: 1,
    title: 'Calculate apparent power',
    formula: 'S = \\sqrt{3} \\times V_L \\times I_L',
    value: round(S, 2),
    unit: 'VA',
  });

  // Step 2: Active Power
  const P = SQRT3 * VL * IL * pf;
  steps.push({
    step: 2,
    title: 'Calculate active power',
    formula: 'P = \\sqrt{3} \\times V_L \\times I_L \\times \\cos\\varphi',
    value: round(P, 2),
    unit: 'W',
  });

  // Step 3: Reactive Power
  const sinPhi = Math.sqrt(1 - pf * pf);
  const Q = SQRT3 * VL * IL * sinPhi;
  steps.push({
    step: 3,
    title: 'Calculate reactive power',
    formula: 'Q = \\sqrt{3} \\times V_L \\times I_L \\times \\sin\\varphi',
    value: round(Q, 2),
    unit: 'var',
  });

  // Step 4: kW / kVA presentation
  const P_kW = round(P / 1000, 3);
  const S_kVA = round(S / 1000, 3);
  steps.push({
    step: 4,
    title: 'Convert to kW / kVA',
    formula: 'P_{kW} = P / 1000',
    value: P_kW,
    unit: 'kW',
  });

  // PART 3 — Result
  return {
    value: round(P, 2),
    unit: 'W',
    formula: 'P = \\sqrt{3} \\times V_L \\times I_L \\times \\cos\\varphi',
    steps,
    source: [createSource('KEC', '130', { edition: '2021' })],
    judgment: createJudgment(
      true,
      `Active power = ${P_kW} kW, Apparent power = ${S_kVA} kVA`,
      'info',
    ),
    additionalOutputs: {
      activePower_kW: { value: P_kW, unit: 'kW' },
      apparentPower: { value: round(S, 2), unit: 'VA' },
      apparentPower_kVA: { value: S_kVA, unit: 'kVA' },
      reactivePower: { value: round(Q, 2), unit: 'var' },
    },
  };
}
