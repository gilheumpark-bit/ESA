/**
 * Earth Fault Current Calculator
 *
 * Formulae:
 *   Solidly grounded:    Ig = V_ph / (Zs + Zg)                   [A]
 *   Resistance grounded: Ig = V_ph / √((Rs+Rg)² + (Xs+Xg)²)    [A]
 *   Phase voltage:       V_ph = V_LL / √3                        [V]
 *   Touch voltage:       Vt = Ig × Rg                             [V]
 *   Step voltage:        Vs = Ig × ρ / (2π × d) × (1/d1 - 1/d2) [V] (simplified)
 *
 * Standards: KEC 142 (접지 시스템), IEC 60364-4-41
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertNonNegative,
  assertOneOf,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export type GroundingType = 'solid' | 'resistance' | 'impedance';

export interface EarthFaultInput {
  /** System voltage (line-to-line) in Volts */
  systemVoltage: number;
  /** Grounding type */
  groundingType: GroundingType;
  /** Ground impedance in Ohms */
  groundImpedance: number;
  /** Source impedance in Ohms */
  sourceImpedance: number;
}

const VALID_GROUNDING: readonly GroundingType[] = ['solid', 'resistance', 'impedance'];

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateEarthFault(input: EarthFaultInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.systemVoltage, 'systemVoltage');
  assertOneOf(input.groundingType, VALID_GROUNDING, 'groundingType');
  assertNonNegative(input.groundImpedance, 'groundImpedance');
  assertNonNegative(input.sourceImpedance, 'sourceImpedance');

  const { systemVoltage: Vll, groundingType, groundImpedance: Zg, sourceImpedance: Zs } = input;

  // PART 2 — Derivation
  const steps: CalcStep[] = [];

  // Step 1: 상전압 계산
  const Vph = Vll / Math.sqrt(3);
  steps.push({
    step: 1,
    title: 'Calculate phase voltage',
    formula: 'V_{ph} = \\frac{V_{LL}}{\\sqrt{3}}',
    value: round(Vph, 2),
    unit: 'V',
  });

  // Step 2: 지락전류 계산
  let Ig: number;
  let faultFormula: string;

  if (groundingType === 'solid') {
    // 직접 접지: Ig = Vph / (Zs + Zg)
    const Ztotal = Zs + Zg;
    Ig = Ztotal > 0 ? Vph / Ztotal : Vph / 0.001;
    faultFormula = 'I_g = \\frac{V_{ph}}{Z_s + Z_g}';
  } else {
    // 저항/임피던스 접지: Ig = Vph / √(Zs² + Zg²) (simplified series)
    const Ztotal = Math.sqrt(Zs * Zs + Zg * Zg);
    Ig = Ztotal > 0 ? Vph / Ztotal : Vph / 0.001;
    faultFormula = 'I_g = \\frac{V_{ph}}{\\sqrt{Z_s^2 + Z_g^2}}';
  }

  steps.push({
    step: 2,
    title: `Calculate earth fault current (${groundingType} grounding)`,
    formula: faultFormula,
    value: round(Ig, 2),
    unit: 'A',
  });

  // Step 3: 접촉 전압 계산
  const touchVoltage = Ig * Zg;
  steps.push({
    step: 3,
    title: 'Calculate touch voltage',
    formula: 'V_t = I_g \\times Z_g',
    value: round(touchVoltage, 2),
    unit: 'V',
  });

  // Step 4: 보폭 전압 (simplified estimation)
  // Vs ≈ Ig × Zg × 0.2 (simplified factor for typical soil conditions)
  const stepVoltage = Ig * Zg * 0.2;
  steps.push({
    step: 4,
    title: 'Estimate step voltage (simplified)',
    formula: 'V_s \\approx I_g \\times Z_g \\times 0.2',
    value: round(stepVoltage, 2),
    unit: 'V',
  });

  // PART 3 — Judgment (KEC 142: touch voltage limit 50V for general, 25V for wet)
  const touchLimit = 50;
  const pass = touchVoltage <= touchLimit;
  const judgmentMsg = pass
    ? `Touch voltage ${round(touchVoltage, 2)} V ≤ ${touchLimit} V limit (KEC 142)`
    : `Touch voltage ${round(touchVoltage, 2)} V exceeds ${touchLimit} V limit — reduce ground impedance`;

  // PART 4 — Result assembly
  return {
    value: round(Ig, 2),
    unit: 'A',
    formula: faultFormula,
    steps,
    source: [
      createSource('KEC', '142', { edition: '2021' }),
      createSource('IEC', '60364-4-41', { edition: '2017' }),
    ],
    judgment: createJudgment(pass, judgmentMsg, pass ? 'info' : 'error'),
    additionalOutputs: {
      touchVoltage: { value: round(touchVoltage, 2), unit: 'V', formula: 'V_t = I_g \\times Z_g' },
      stepVoltage: { value: round(stepVoltage, 2), unit: 'V', formula: 'V_s \\approx I_g \\times Z_g \\times 0.2' },
    },
  };
}
