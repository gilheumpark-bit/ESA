/**
 * Transformer Impedance Voltage Calculator
 *
 * Formulae:
 *   Rated current:      In = S / (√3 × Vn)                        [A]
 *   Actual impedance:   Zt = Vn / (√3 × Iz)  (for 3-phase)        [Ω]
 *   Impedance voltage:  Vz% = (In / Iz) × 100                     [%]
 *
 * The impedance voltage (%Z) is the transformer nameplate parameter defined by
 * the short-circuit relation Isc = In × (100 / %Z), i.e. %Z = (In / Isc) × 100.
 * A distribution transformer sits at ~4–6%.
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

  // Step 2: 실제 임피던스 계산 (단락전류 기준)
  const Zt = Vn / (Math.sqrt(3) * Iz);
  steps.push({
    step: 2,
    title: 'Calculate transformer impedance (from short-circuit current)',
    formula: 'Z_t = \\frac{V_n}{\\sqrt{3} \\times I_z}',
    value: round(Zt, 4),
    unit: 'Ω',
  });

  // Step 3: 임피던스 전압 (%) 계산 — %Z = (I_n / I_sc) × 100
  const VzPercent = (In / Iz) * 100;
  steps.push({
    step: 3,
    title: 'Calculate impedance voltage percentage',
    formula: 'V_z\\% = \\frac{I_n}{I_z} \\times 100',
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
    formula: 'V_z\\% = \\frac{I_n}{I_z} \\times 100',
    steps,
    source: [createSource('IEC', '60076-1', { edition: '2011' })],
    judgment: createJudgment(pass, judgmentMsg, pass ? 'info' : 'warning'),
    additionalOutputs: {
      impedance: { value: round(Zt, 4), unit: 'Ω', formula: 'Z_t = \\frac{V_n}{\\sqrt{3} \\times I_z}' },
      ratedCurrent: { value: round(In, 2), unit: 'A', formula: 'I_n = \\frac{S}{\\sqrt{3} \\times V_n}' },
    },
  };
}
