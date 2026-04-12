/**
 * Motor Power Factor Correction Calculator
 *
 * Formulae:
 *   Qc = P x (tan(phi1) - tan(phi2))                        [kvar]
 *   Corrected current: I2 = P / (sqrt(3) x V x pf2)        [A]
 *   Warning: Qc must not exceed motor no-load magnetizing kvar
 *
 * Standards: KEC 232, IEC 60831
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

export interface MotorPFCorrectionInput {
  /** Motor rated power in kW */
  motorPower: number;
  /** Motor existing power factor (0 < pf <= 1) */
  motorPF: number;
  /** Target power factor (motorPF < targetPF <= 1) */
  targetPF: number;
  /** Motor rated voltage in Volts */
  motorVoltage: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateMotorPFCorrection(input: MotorPFCorrectionInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.motorPower, 'motorPower');
  assertRange(input.motorPF, 0.01, 0.99, 'motorPF');
  assertRange(input.targetPF, 0.01, 1.0, 'targetPF');
  assertPositive(input.motorVoltage, 'motorVoltage');

  if (input.targetPF <= input.motorPF) {
    throw new Error('targetPF must be greater than motorPF');
  }

  const { motorPower: P, motorPF: pf1, targetPF: pf2, motorVoltage: V } = input;

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];
  const sqrt3 = Math.sqrt(3);

  // Step 1: Existing reactive power
  const phi1 = Math.acos(pf1);
  const phi2 = Math.acos(pf2);
  const Qc = P * (Math.tan(phi1) - Math.tan(phi2));
  steps.push({
    step: 1,
    title: '필요 콘덴서 용량 산출 (Required capacitor size)',
    formula: 'Q_c = P \\times (\\tan\\varphi_1 - \\tan\\varphi_2)',
    value: round(Qc, 2),
    unit: 'kvar',
  });

  // Step 2: Original current
  const I1 = (P * 1000) / (sqrt3 * V * pf1);
  steps.push({
    step: 2,
    title: '보정 전 전류 (Current before correction)',
    formula: 'I_1 = \\frac{P \\times 1000}{\\sqrt{3} \\times V \\times \\cos\\varphi_1}',
    value: round(I1, 2),
    unit: 'A',
  });

  // Step 3: Corrected current
  const I2 = (P * 1000) / (sqrt3 * V * pf2);
  steps.push({
    step: 3,
    title: '보정 후 전류 (Current after correction)',
    formula: 'I_2 = \\frac{P \\times 1000}{\\sqrt{3} \\times V \\times \\cos\\varphi_2}',
    value: round(I2, 2),
    unit: 'A',
  });

  // Step 4: Current reduction
  const reduction = ((I1 - I2) / I1) * 100;
  steps.push({
    step: 4,
    title: '전류 감소율 (Current reduction)',
    formula: '\\Delta I = \\frac{I_1 - I_2}{I_1} \\times 100',
    value: round(reduction, 1),
    unit: '%',
  });

  // Step 5: No-load magnetizing current check
  // Rule of thumb: capacitor kvar should not exceed ~90% of motor no-load kvar
  // No-load kvar ~= 30-40% of motor kW for standard motors
  const noLoadKvar = P * 0.35;
  const capacitorSafe = Qc <= noLoadKvar;
  steps.push({
    step: 5,
    title: '무부하 여자전류 초과 여부 (No-load magnetizing limit)',
    formula: `Q_c \\leq Q_{noload} \\approx ${round(noLoadKvar, 2)} \\text{ kvar}`,
    value: round(noLoadKvar, 2),
    unit: 'kvar',
    standardRef: 'KEC 232',
  });

  // PART 3 -- Result assembly
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
      capacitorSafe,
      capacitorSafe
        ? `콘덴서 ${round(Qc, 2)} kvar 선정, 전류 ${round(reduction, 1)}% 감소`
        : `콘덴서 ${round(Qc, 2)} kvar -- 무부하 여자전류(${round(noLoadKvar, 2)} kvar) 초과! 자기여자 위험`,
      capacitorSafe ? 'info' : 'warning',
    ),
    additionalOutputs: {
      capacitorSize:    { value: round(Qc, 2),        unit: 'kvar', formula: 'Q_c' },
      correctedCurrent: { value: round(I2, 2),        unit: 'A',    formula: 'I_2' },
      currentReduction: { value: round(reduction, 1), unit: '%' },
    },
  };
}
