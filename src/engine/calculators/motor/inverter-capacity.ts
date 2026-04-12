/**
 * Inverter (VFD) Capacity Calculator
 *
 * Formulae:
 *   Required capacity: Sinv = Pmotor / (eta x cos(phi)) x safetyFactor  [kVA]
 *   Rated current:     Iinv = Sinv x 1000 / (sqrt(3) x V)              [A]
 *
 * Standards: KEC 232 (Motor Circuits), IEC 61800-2
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

export interface InverterCapacityInput {
  /** Motor rated power in kW */
  motorPower: number;
  /** Motor rated voltage in Volts */
  motorVoltage: number;
  /** Motor power factor (0 < pf <= 1) */
  powerFactor: number;
  /** Motor efficiency (0 < eta <= 1) */
  efficiency: number;
  /** Safety factor (1.1 ~ 1.25 typical) */
  safetyFactor: number;
}

// ── Standard inverter sizes (kVA) ──────────────────────────────────────────

const STANDARD_SIZES_KVA = [
  0.75, 1.5, 2.2, 3.7, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75,
  90, 110, 132, 160, 200, 250, 315, 400, 500, 630, 800, 1000,
];

function selectStandardSize(required: number): number {
  for (const size of STANDARD_SIZES_KVA) {
    if (size >= required) return size;
  }
  return STANDARD_SIZES_KVA[STANDARD_SIZES_KVA.length - 1];
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateInverterCapacity(input: InverterCapacityInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.motorPower, 'motorPower');
  assertPositive(input.motorVoltage, 'motorVoltage');
  assertRange(input.powerFactor, 0.01, 1.0, 'powerFactor');
  assertRange(input.efficiency, 0.01, 1.0, 'efficiency');
  assertRange(input.safetyFactor, 1.0, 2.0, 'safetyFactor');

  const { motorPower, motorVoltage, powerFactor: pf, efficiency: eta, safetyFactor: sf } = input;

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];
  const sqrt3 = Math.sqrt(3);

  // Step 1: Required capacity
  const Sinv = (motorPower / (eta * pf)) * sf;
  steps.push({
    step: 1,
    title: '인버터 필요용량 산출 (Required inverter capacity)',
    formula: 'S_{inv} = \\frac{P_{motor}}{\\eta \\times \\cos\\varphi} \\times SF',
    value: round(Sinv, 2),
    unit: 'kVA',
  });

  // Step 2: Rated current
  const Iinv = (Sinv * 1000) / (sqrt3 * motorVoltage);
  steps.push({
    step: 2,
    title: '인버터 정격전류 (Inverter rated current)',
    formula: 'I_{inv} = \\frac{S_{inv} \\times 1000}{\\sqrt{3} \\times V}',
    value: round(Iinv, 2),
    unit: 'A',
  });

  // Step 3: Select standard size
  const selected = selectStandardSize(Sinv);
  steps.push({
    step: 3,
    title: '표준용량 선정 (Select standard size)',
    formula: `S_{selected} \\geq S_{inv} = ${round(Sinv, 2)}`,
    value: selected,
    unit: 'kVA',
  });

  // PART 3 -- Result assembly
  return {
    value: selected,
    unit: 'kVA',
    formula: 'S_{inv} = \\frac{P_{motor}}{\\eta \\times \\cos\\varphi} \\times SF',
    steps,
    source: [
      createSource('KEC', '232', { edition: '2021' }),
      createSource('IEC', '61800-2', { edition: '2021' }),
    ],
    judgment: createJudgment(
      true,
      `인버터 선정용량 ${selected} kVA (필요용량 ${round(Sinv, 2)} kVA, 여유율 ${round((selected / Sinv - 1) * 100, 1)}%)`,
      'info',
    ),
    additionalOutputs: {
      requiredCapacity:  { value: round(Sinv, 2),  unit: 'kVA', formula: 'S_{inv}' },
      ratedCurrent:      { value: round(Iinv, 2),  unit: 'A',   formula: 'I_{inv}' },
      selectedCapacity:  { value: selected,         unit: 'kVA' },
    },
  };
}
