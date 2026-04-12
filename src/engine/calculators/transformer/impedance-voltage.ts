/**
 * Transformer Impedance Voltage Calculator
 *
 * Formulae:
 *   Impedance:          Zt = Vn / (√3 × In)  (for 3-phase)        [Ω]
 *   Rated current:      In = S / (√3 × Vn)                        [A]
 *   Impedance voltage:  Vz% = (Iz × Zt / Vn) × 100               [%]
 *
 * Standards: IEC 60076-1 (Power Transformers)
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export interface ImpedanceVoltageInput {
  /** Rated capacity in kVA */
  ratedCapacity: number;
  /** Rated voltage in Volts (line-to-line) */
  ratedVoltage: number;
  /** Short-circuit current in Amperes */
  shortCircuitCurrent: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateImpedanceVoltage(input: ImpedanceVoltageInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.ratedCapacity, 'ratedCapacity');
  assertPositive(input.ratedVoltage, 'ratedVoltage');
  assertPositive(input.shortCircuitCurrent, 'shortCircuitCurrent');

  const { ratedCapacity: S, ratedVoltage: Vn, shortCircuitCurrent: Iz } = input;

  // PART 2 — Derivation
  const steps: CalcStep[] = [];

  // Step 1: 정격 전류 계산
  const In = (S * 1000) / (Math.sqrt(3) * Vn);
  steps.push({
    step: 1,
    title: 'Calculate rated current',
    formula: 'I_n = \\frac{S \\times 1000}{\\sqrt{3} \\times V_n}',
    value: round(In, 2),
    unit: 'A',
  });

  // Step 2: 임피던스 계산
  const Zt = Vn / (Math.sqrt(3) * In);
  steps.push({
    step: 2,
    title: 'Calculate transformer impedance',
    formula: 'Z_t = \\frac{V_n}{\\sqrt{3} \\times I_n}',
    value: round(Zt, 4),
    unit: 'Ω',
  });

  // Step 3: 임피던스 전압 (%) 계산
  const VzPercent = (Iz * Zt / Vn) * 100;
  steps.push({
    step: 3,
    title: 'Calculate impedance voltage percentage',
    formula: 'V_z\\% = \\frac{I_z \\times Z_t}{V_n} \\times 100',
    value: round(VzPercent, 2),
    unit: '%',
  });

  // PART 3 — Judgment
  const pass = VzPercent >= 3 && VzPercent <= 15;
  const judgmentMsg = pass
    ? `Impedance voltage = ${round(VzPercent, 2)}% (typical range 4-6% for distribution transformers)`
    : `Impedance voltage = ${round(VzPercent, 2)}% is outside typical range (4-6%)`;

  // PART 4 — Result assembly
  return {
    value: round(VzPercent, 2),
    unit: '%',
    formula: 'V_z\\% = \\frac{I_z \\times Z_t}{V_n} \\times 100',
    steps,
    source: [createSource('IEC', '60076-1', { edition: '2011' })],
    judgment: createJudgment(pass, judgmentMsg, pass ? 'info' : 'warning'),
    additionalOutputs: {
      impedance: { value: round(Zt, 4), unit: 'Ω', formula: 'Z_t = \\frac{V_n}{\\sqrt{3} \\times I_n}' },
      ratedCurrent: { value: round(In, 2), unit: 'A', formula: 'I_n = \\frac{S}{\\sqrt{3} \\times V_n}' },
    },
  };
}
