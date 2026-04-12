/**
 * Motor Capacity Calculator
 *
 * Formulae:
 *   Rotary loads:  P = (T × n) / 9550                             [kW]
 *   Linear loads:  P = (F × v) / (η × 1000)                      [kW]
 *   Rated current: I = (P × 1000) / (√3 × V × pf × η)           [A]
 *   Starting current: I_start = k_start × I_rated                [A]
 *     (k_start: DOL=6-8×, Star-Delta=2-3×, VFD=1-1.5×)
 *
 * Standards: IEC 60034-1 (Rotating Electrical Machines)
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

export type LoadType = 'rotary' | 'linear';

export interface MotorCapacityInput {
  /** Load type */
  loadType: LoadType;
  /** Torque in N·m (for rotary) or Force in N (for linear) */
  torqueOrForce: number;
  /** Speed in rpm (for rotary) or velocity in m/s (for linear) */
  speedOrVelocity: number;
  /** Motor efficiency (0 < η ≤ 1) */
  efficiency: number;
  /** Rated voltage in Volts (line-to-line), default 380V */
  voltage?: number;
  /** Power factor, default 0.85 */
  powerFactor?: number;
}

const VALID_LOAD_TYPES: readonly LoadType[] = ['rotary', 'linear'];

// Standard motor ratings (kW) for selection
const STANDARD_MOTOR_KW = [
  0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3.0, 4.0, 5.5, 7.5,
  11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 200, 250, 315, 400,
] as const;

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateMotorCapacity(input: MotorCapacityInput): DetailedCalcResult {
  // PART 1 — Validation
  assertOneOf(input.loadType, VALID_LOAD_TYPES, 'loadType');
  assertPositive(input.torqueOrForce, 'torqueOrForce');
  assertPositive(input.speedOrVelocity, 'speedOrVelocity');
  assertRange(input.efficiency, 0.01, 1.0, 'efficiency');

  const { loadType, torqueOrForce, speedOrVelocity, efficiency: eta } = input;
  const V = input.voltage ?? 380;
  const pf = input.powerFactor ?? 0.85;

  assertPositive(V, 'voltage');
  assertRange(pf, 0.01, 1.0, 'powerFactor');

  // PART 2 — Derivation
  const steps: CalcStep[] = [];
  let motorPower: number;

  if (loadType === 'rotary') {
    // ── 회전 부하 ──

    // Step 1: 축 동력 계산
    const T = torqueOrForce;  // N·m
    const n = speedOrVelocity; // rpm
    motorPower = (T * n) / 9550;
    steps.push({
      step: 1,
      title: 'Calculate shaft power (rotary load)',
      formula: 'P = \\frac{T \\times n}{9550}',
      value: round(motorPower, 4),
      unit: 'kW',
    });
  } else {
    // ── 직선 부하 ──

    // Step 1: 필요 동력 계산
    const F = torqueOrForce;   // N
    const v = speedOrVelocity; // m/s
    motorPower = (F * v) / (eta * 1000);
    steps.push({
      step: 1,
      title: 'Calculate required power (linear load)',
      formula: 'P = \\frac{F \\times v}{\\eta \\times 1000}',
      value: round(motorPower, 4),
      unit: 'kW',
    });
  }

  // Step 2: 효율 고려한 전동기 입력 (rotary의 경우 효율 반영)
  const motorInput = loadType === 'rotary' ? motorPower / eta : motorPower;
  steps.push({
    step: 2,
    title: 'Calculate motor input power (including efficiency)',
    formula: 'P_{input} = \\frac{P_{shaft}}{\\eta}',
    value: round(motorInput, 4),
    unit: 'kW',
  });

  // Step 3: 표준 전동기 용량 선정
  const selectedKW = STANDARD_MOTOR_KW.find(s => s >= motorInput) ?? STANDARD_MOTOR_KW[STANDARD_MOTOR_KW.length - 1];
  steps.push({
    step: 3,
    title: 'Select standard motor rating',
    formula: 'P_{rated} \\geq P_{input}',
    value: selectedKW,
    unit: 'kW',
  });

  // Step 4: 정격 전류 계산
  const Irated = (selectedKW * 1000) / (Math.sqrt(3) * V * pf * eta);
  steps.push({
    step: 4,
    title: 'Calculate rated current',
    formula: 'I_{rated} = \\frac{P \\times 1000}{\\sqrt{3} \\times V \\times pf \\times \\eta}',
    value: round(Irated, 2),
    unit: 'A',
  });

  // Step 5: 기동 전류 (DOL 기준 7배)
  const startMultiple = 7;
  const Istart = startMultiple * Irated;
  steps.push({
    step: 5,
    title: 'Estimate starting current (DOL, 7×)',
    formula: 'I_{start} = k_{start} \\times I_{rated}',
    value: round(Istart, 2),
    unit: 'A',
  });

  // PART 3 — Judgment
  const margin = ((selectedKW - motorInput) / motorInput) * 100;
  const judgmentMsg = `Motor ${selectedKW} kW selected (required ${round(motorInput, 2)} kW, margin +${round(margin, 1)}%). Rated ${round(Irated, 2)} A, starting ${round(Istart, 2)} A.`;

  // PART 4 — Result assembly
  return {
    value: round(motorInput, 4),
    unit: 'kW',
    formula: loadType === 'rotary'
      ? 'P = \\frac{T \\times n}{9550}'
      : 'P = \\frac{F \\times v}{\\eta \\times 1000}',
    steps,
    source: [createSource('IEC', '60034-1', { edition: '2017' })],
    judgment: createJudgment(true, judgmentMsg, 'info'),
    additionalOutputs: {
      motorPower: { value: selectedKW, unit: 'kW' },
      ratedCurrent: { value: round(Irated, 2), unit: 'A' },
      startingCurrent: { value: round(Istart, 2), unit: 'A' },
    },
  };
}
