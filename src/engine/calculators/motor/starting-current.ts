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

  // PART 3 -- Result assembly
  // 기동 전압강하 판정은 계통 단락용량 + 급전 임피던스가 필요 -> 본 계산기 범위 밖 (Hold/RFI).
  // 고정 배율 x 2% 방식의 임의 추정은 CLAUDE.md 시스템 프롬프트 규칙 11 위반이므로 제거.
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
      true,
      `기동전류 ${round(Ist, 2)} A (${startingMethod}, k=${mult.typical}). 기동시 전압강하 평가는 계통 단락용량(S_sc)과 급전/케이블 임피던스가 필요하여 본 계산 범위 밖 -- Hold/RFI: 변압기 kVA·%Z 및 케이블 임피던스 제공 요망.`,
      'info',
    ),
    additionalOutputs: {
      ratedCurrent:       { value: round(Irated, 2),      unit: 'A', formula: 'I_{rated}' },
      startingCurrent:    { value: round(Ist, 2),          unit: 'A', formula: 'I_{st}' },
      startingMultiple:   { value: mult.typical,           unit: 'x' },
    },
  };
}
