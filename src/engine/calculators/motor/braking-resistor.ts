/**
 * Braking Resistor Calculator
 *
 * Formulae:
 *   Resistance:  R = Vdc^2 / Pbrake                     [ohm]
 *   Energy:      E = 0.5 x J x (omega1^2 - omega2^2)   [J]
 *   Peak power:  Ppeak = Vdc^2 / R                      [W]
 *   Resistor rating: Prating = Ppeak x dutyCycle        [W]
 *
 * Standards: IEC 61800-2 (VFD Systems)
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

export interface BrakingResistorInput {
  /** DC bus voltage in Volts */
  dcBusVoltage: number;
  /** Required braking power in kW */
  brakingPower: number;
  /** Braking time per cycle in seconds */
  brakingTime: number;
  /** Duty cycle percentage (0-100) */
  dutyCycle: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateBrakingResistor(input: BrakingResistorInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.dcBusVoltage, 'dcBusVoltage');
  assertPositive(input.brakingPower, 'brakingPower');
  assertPositive(input.brakingTime, 'brakingTime');
  assertRange(input.dutyCycle, 0.1, 100, 'dutyCycle');

  const { dcBusVoltage: Vdc, brakingPower: Pbrake, brakingTime: tBrake, dutyCycle } = input;

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];

  // Step 1: Minimum resistance
  const PbrakeW = Pbrake * 1000;
  const R = (Vdc * Vdc) / PbrakeW;
  steps.push({
    step: 1,
    title: '최소 저항값 산출 (Minimum resistance)',
    formula: 'R = \\frac{V_{dc}^2}{P_{brake}}',
    value: round(R, 2),
    unit: '\u03A9',
  });

  // Step 2: Peak power
  const Ppeak = (Vdc * Vdc) / R;
  steps.push({
    step: 2,
    title: '피크 전력 (Peak braking power)',
    formula: 'P_{peak} = \\frac{V_{dc}^2}{R}',
    value: round(Ppeak / 1000, 2),
    unit: 'kW',
  });

  // Step 3: Braking energy per cycle
  const energy = PbrakeW * tBrake;
  steps.push({
    step: 3,
    title: '제동 에너지 (Braking energy per cycle)',
    formula: 'E = P_{brake} \\times t_{brake}',
    value: round(energy / 1000, 2),
    unit: 'kJ',
  });

  // Step 4: Continuous resistor rating based on duty cycle
  const dcFraction = dutyCycle / 100;
  const Prating = (Ppeak / 1000) * dcFraction;
  steps.push({
    step: 4,
    title: '저항기 정격 (Resistor continuous rating)',
    formula: 'P_{rating} = P_{peak} \\times DC',
    value: round(Prating, 2),
    unit: 'kW',
  });

  // PART 3 -- Result assembly
  return {
    value: round(R, 2),
    unit: '\u03A9',
    formula: 'R = \\frac{V_{dc}^2}{P_{brake}}',
    steps,
    source: [
      createSource('IEC', '61800-2', { edition: '2021' }),
    ],
    judgment: createJudgment(
      true,
      `제동저항 ${round(R, 2)} \u03A9, 정격 ${round(Prating, 2)} kW (듀티사이클 ${dutyCycle}%)`,
      'info',
    ),
    additionalOutputs: {
      resistance:     { value: round(R, 2),             unit: '\u03A9',  formula: 'R' },
      peakPower:      { value: round(Ppeak / 1000, 2),  unit: 'kW', formula: 'P_{peak}' },
      energy:         { value: round(energy / 1000, 2), unit: 'kJ', formula: 'E' },
      resistorRating: { value: round(Prating, 2),       unit: 'kW', formula: 'P_{rating}' },
    },
  };
}
