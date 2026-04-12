/**
 * Motor Starting Current Calculator
 *
 * Formulae:
 *   Rated Current:    Irated = P / (sqrt(3) x V x pf x eta)   [A]
 *   Starting Current: Ist = Irated x startingMultiple          [A]
 *   DOL: 6-8x, Star-Delta: 2-3x, VFD: 1-1.5x
 *
 * Standards: KEC 232 (Motor Circuits), IEC 60034-12
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  assertOneOf,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export type StartingMethod = 'DOL' | 'Star-Delta' | 'VFD' | 'Soft-Starter';

export interface StartingCurrentInput {
  /** Motor rated power in kW */
  ratedPower: number;
  /** Line voltage in Volts */
  voltage: number;
  /** Motor power factor (0 < pf <= 1) */
  powerFactor: number;
  /** Motor efficiency (0 < eta <= 1) */
  efficiency: number;
  /** Starting method */
  startingMethod: StartingMethod;
}

// ── Starting multiplier lookup ─────────────────────────────────────────────

const STARTING_MULTIPLIERS: Record<StartingMethod, { min: number; max: number; typical: number }> = {
  'DOL':          { min: 6,   max: 8,   typical: 7   },
  'Star-Delta':   { min: 2,   max: 3,   typical: 2.5 },
  'VFD':          { min: 1,   max: 1.5, typical: 1.2 },
  'Soft-Starter': { min: 2,   max: 4,   typical: 3   },
};

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateStartingCurrent(input: StartingCurrentInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.ratedPower, 'ratedPower');
  assertPositive(input.voltage, 'voltage');
  assertRange(input.powerFactor, 0.01, 1.0, 'powerFactor');
  assertRange(input.efficiency, 0.01, 1.0, 'efficiency');
  assertOneOf(input.startingMethod, ['DOL', 'Star-Delta', 'VFD', 'Soft-Starter'] as const, 'startingMethod');

  const { ratedPower, voltage, powerFactor: pf, efficiency: eta, startingMethod } = input;

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];
  const sqrt3 = Math.sqrt(3);

  // Step 1: Rated current (3-phase)
  const Irated = (ratedPower * 1000) / (sqrt3 * voltage * pf * eta);
  steps.push({
    step: 1,
    title: '정격전류 산출 (Rated current)',
    formula: 'I_{rated} = \\frac{P \\times 1000}{\\sqrt{3} \\times V \\times \\cos\\varphi \\times \\eta}',
    value: round(Irated, 2),
    unit: 'A',
  });

  // Step 2: Starting multiplier
  const mult = STARTING_MULTIPLIERS[startingMethod];
  steps.push({
    step: 2,
    title: '기동배율 결정 (Starting multiplier)',
    formula: `k_{start} = ${mult.typical} \\text{ (${startingMethod}: ${mult.min}\\sim${mult.max})}`,
    value: mult.typical,
    unit: 'x',
  });

  // Step 3: Starting current
  const Ist = Irated * mult.typical;
  steps.push({
    step: 3,
    title: '기동전류 산출 (Starting current)',
    formula: 'I_{st} = I_{rated} \\times k_{start}',
    value: round(Ist, 2),
    unit: 'A',
  });

  // Step 4: Voltage drop estimate (simple %Z approximation)
  // 전압강하(%) ~= (Ist / Irated) x (motor kVA / system kVA) -- simplified to Ist/Irated * 2%
  const voltageDrop = round((Ist / Irated) * 2, 2);
  steps.push({
    step: 4,
    title: '기동시 전압강하 추정 (Voltage drop during starting)',
    formula: '\\Delta V \\approx k_{start} \\times 2\\%',
    value: voltageDrop,
    unit: '%',
  });

  // PART 3 -- Result assembly
  const pass = voltageDrop <= 15;
  return {
    value: round(Ist, 2),
    unit: 'A',
    formula: 'I_{st} = I_{rated} \\times k_{start}',
    steps,
    source: [
      createSource('KEC', '232', { edition: '2021' }),
      createSource('IEC', '60034-12', { edition: '2012' }),
    ],
    judgment: createJudgment(
      pass,
      pass
        ? `기동전류 ${round(Ist, 2)} A (${startingMethod}), 전압강하 ${voltageDrop}% -- 허용 범위 이내`
        : `기동전류 ${round(Ist, 2)} A, 전압강하 ${voltageDrop}% -- 15% 초과, 기동방식 변경 검토`,
      pass ? 'info' : 'warning',
    ),
    additionalOutputs: {
      ratedCurrent:       { value: round(Irated, 2),      unit: 'A', formula: 'I_{rated}' },
      startingCurrent:    { value: round(Ist, 2),          unit: 'A', formula: 'I_{st}' },
      startingMultiple:   { value: mult.typical,           unit: 'x' },
      voltageDropDuring:  { value: voltageDrop,            unit: '%' },
    },
  };
}
