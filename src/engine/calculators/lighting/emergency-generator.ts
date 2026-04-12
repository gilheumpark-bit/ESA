/**
 * Emergency Generator Sizing Calculator
 *
 * Formulae:
 *   Base load:    Pbase = SUM(Pi / pfi)                              [kVA]
 *   Motor start:  Pstart = largest_motor x startingMultiple          [kVA]
 *   Generator:    Pgen = max(Pbase, Pbase + Pstart_delta) x SF      [kVA]
 *   Fuel:         F = Pgen x 0.75 x specificConsumption              [L/h]
 *   Tank:         V = F x hours                                      [L]
 *
 * Standards: KEC 351 (Emergency Power), NFPA 110, IEC 60034
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

export interface EmergencyLoadEntry {
  /** Load name/description */
  name: string;
  /** Load power in kW */
  kW: number;
  /** Power factor (0 < pf <= 1) */
  pf: number;
  /** Is this a motor load? */
  isMotor: boolean;
  /** Starting multiplier for motor loads (default 6 for DOL) */
  startingMultiple?: number;
}

export interface EmergencyGeneratorInput {
  /** Array of emergency load entries */
  emergencyLoads: EmergencyLoadEntry[];
  /** Safety factor (1.1 ~ 1.25 typical) */
  safetyFactor: number;
  /** Required runtime in hours (default 8) */
  requiredRuntime?: number;
}

// ── Standard generator sizes (kVA) ────────────────────────────────────────

const STANDARD_GEN_SIZES = [
  15, 20, 30, 50, 75, 100, 125, 150, 200, 250, 300, 350, 400, 500,
  600, 750, 800, 1000, 1250, 1500, 2000, 2500, 3000,
];

function selectGeneratorSize(required: number): number {
  for (const size of STANDARD_GEN_SIZES) {
    if (size >= required) return size;
  }
  return STANDARD_GEN_SIZES[STANDARD_GEN_SIZES.length - 1];
}

// Diesel fuel consumption: ~0.21 L/kWh at 75% load (typical)
const SPECIFIC_CONSUMPTION = 0.21;

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateEmergencyGenerator(input: EmergencyGeneratorInput): DetailedCalcResult {
  // PART 1 -- Validation
  if (!input.emergencyLoads || input.emergencyLoads.length === 0) {
    throw new Error('At least one emergency load entry is required');
  }
  assertRange(input.safetyFactor, 1.0, 2.0, 'safetyFactor');

  for (const load of input.emergencyLoads) {
    assertPositive(load.kW, `load(${load.name}).kW`);
    assertRange(load.pf, 0.01, 1.0, `load(${load.name}).pf`);
  }

  const { emergencyLoads, safetyFactor: SF } = input;
  const runtime = input.requiredRuntime ?? 8;

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];

  // Step 1: Sum of steady-state loads
  let totalKVA = 0;
  for (const load of emergencyLoads) {
    totalKVA += load.kW / load.pf;
  }
  steps.push({
    step: 1,
    title: '정상부하 합산 (Total steady-state load)',
    formula: 'S_{base} = \\sum \\frac{P_i}{pf_i}',
    value: round(totalKVA, 2),
    unit: 'kVA',
  });

  // Step 2: Find largest motor and its starting impact
  let largestMotorKVA = 0;
  let largestMotorName = '';
  let largestStartMult = 6;
  for (const load of emergencyLoads) {
    if (load.isMotor) {
      const motorKVA = load.kW / load.pf;
      if (motorKVA > largestMotorKVA) {
        largestMotorKVA = motorKVA;
        largestMotorName = load.name;
        largestStartMult = load.startingMultiple ?? 6;
      }
    }
  }

  const startingKVA = largestMotorKVA * largestStartMult;
  const startDelta = startingKVA - largestMotorKVA; // additional kVA during start
  steps.push({
    step: 2,
    title: '최대 전동기 기동부하 (Largest motor starting load)',
    formula: `S_{start} = ${round(largestMotorKVA, 2)} \\times ${largestStartMult}`,
    value: round(startingKVA, 2),
    unit: `kVA (${largestMotorName || 'N/A'})`,
  });

  // Step 3: Generator required capacity (consider starting transient)
  const peakKVA = totalKVA + startDelta;
  const requiredKVA = Math.max(totalKVA, peakKVA) * SF;
  steps.push({
    step: 3,
    title: '발전기 필요용량 (Required generator capacity)',
    formula: 'S_{gen} = \\max(S_{base}, S_{base} + \\Delta S_{start}) \\times SF',
    value: round(requiredKVA, 2),
    unit: 'kVA',
  });

  // Step 4: Select standard size
  const selectedKVA = selectGeneratorSize(requiredKVA);
  steps.push({
    step: 4,
    title: '발전기 표준용량 선정 (Selected generator size)',
    formula: `S_{sel} \\geq ${round(requiredKVA, 2)}`,
    value: selectedKVA,
    unit: 'kVA',
  });

  // Step 5: Fuel consumption at 75% load
  const fuelPerHour = selectedKVA * 0.8 * 0.75 * SPECIFIC_CONSUMPTION; // kVA -> kW (0.8 pf) x 0.75 load x rate
  steps.push({
    step: 5,
    title: '연료소비량 (Fuel consumption at 75% load)',
    formula: 'F = S_{gen} \\times 0.8 \\times 0.75 \\times 0.21',
    value: round(fuelPerHour, 1),
    unit: 'L/h',
  });

  // Step 6: Tank size for required runtime
  const tankSize = fuelPerHour * runtime;
  steps.push({
    step: 6,
    title: `연료탱크 용량 (Tank size for ${runtime}h)`,
    formula: 'V_{tank} = F \\times hours',
    value: round(tankSize, 0),
    unit: 'L',
  });

  // PART 3 -- Result assembly
  return {
    value: selectedKVA,
    unit: 'kVA',
    formula: 'S_{gen} = \\max(S_{base}, S_{base} + \\Delta S_{start}) \\times SF',
    steps,
    source: [
      createSource('KEC', '351', { edition: '2021' }),
      createSource('NFPA', '110', { edition: '2022' }),
    ],
    judgment: createJudgment(
      true,
      `비상발전기 ${selectedKVA} kVA 선정 (정상 ${round(totalKVA, 2)} kVA, 기동 ${round(startingKVA, 2)} kVA), 연료탱크 ${round(tankSize, 0)} L (${runtime}h)`,
      'info',
    ),
    additionalOutputs: {
      generatorCapacity: { value: selectedKVA,            unit: 'kVA' },
      fuelConsumption:   { value: round(fuelPerHour, 1),  unit: 'L/h' },
      tankSize:          { value: round(tankSize, 0),     unit: 'L' },
    },
  };
}
