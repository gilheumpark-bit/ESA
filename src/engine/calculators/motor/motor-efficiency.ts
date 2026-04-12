/**
 * Motor Efficiency & IE Class Comparison Calculator
 *
 * Formulae:
 *   Efficiency: eta = Pout / Pin = Pout / (Pout + losses)
 *   Annual cost: C = Pin x hours x rate
 *   Savings:     dC = C_IE1 - C_IEx
 *
 * Standards: IEC 60034-30-1 (IE Classification), KEC 232
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

export type IEClass = 'IE1' | 'IE2' | 'IE3' | 'IE4';

export interface MotorEfficiencyInput {
  /** Motor rated power in kW */
  ratedPower: number;
  /** Load ratio (0.25 ~ 1.0, fraction of rated load) */
  loadRatio: number;
  /** IE efficiency class */
  ieClass: IEClass;
  /** Annual operating hours (default 4000) */
  annualHours?: number;
  /** Electricity rate in currency/kWh (default 120 KRW) */
  electricityRate?: number;
}

// ── Efficiency lookup (IEC 60034-30-1, 4-pole, 50Hz, approximate) ─────────
// Indexed by [ieClass][powerRange] at 100% load.
// Simplified for common power ranges. Real tables have more granularity.

const EFFICIENCY_TABLE: Record<IEClass, Record<string, number>> = {
  IE1: { '0.75': 0.726, '1.1': 0.748, '1.5': 0.770, '2.2': 0.795, '3': 0.815, '4': 0.830, '5.5': 0.848, '7.5': 0.863, '11': 0.880, '15': 0.888, '18.5': 0.895, '22': 0.900, '30': 0.908, '37': 0.914, '45': 0.917, '55': 0.921, '75': 0.928, '90': 0.932, '110': 0.935, '132': 0.937, '160': 0.940 },
  IE2: { '0.75': 0.776, '1.1': 0.798, '1.5': 0.818, '2.2': 0.840, '3': 0.855, '4': 0.868, '5.5': 0.883, '7.5': 0.895, '11': 0.908, '15': 0.915, '18.5': 0.920, '22': 0.924, '30': 0.930, '37': 0.934, '45': 0.937, '55': 0.940, '75': 0.945, '90': 0.948, '110': 0.950, '132': 0.952, '160': 0.954 },
  IE3: { '0.75': 0.808, '1.1': 0.830, '1.5': 0.848, '2.2': 0.867, '3': 0.879, '4': 0.889, '5.5': 0.901, '7.5': 0.911, '11': 0.921, '15': 0.927, '18.5': 0.931, '22': 0.934, '30': 0.939, '37': 0.942, '45': 0.945, '55': 0.948, '75': 0.952, '90': 0.954, '110': 0.956, '132': 0.957, '160': 0.958 },
  IE4: { '0.75': 0.840, '1.1': 0.860, '1.5': 0.875, '2.2': 0.890, '3': 0.900, '4': 0.908, '5.5': 0.918, '7.5': 0.926, '11': 0.934, '15': 0.939, '18.5': 0.943, '22': 0.946, '30': 0.950, '37': 0.953, '45': 0.955, '55': 0.957, '75': 0.960, '90': 0.962, '110': 0.964, '132': 0.965, '160': 0.966 },
};

function lookupEfficiency(ieClass: IEClass, ratedPower: number): number {
  const table = EFFICIENCY_TABLE[ieClass];
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  // Find closest power rating
  let closest = keys[0];
  for (const k of keys) {
    if (Math.abs(k - ratedPower) < Math.abs(closest - ratedPower)) closest = k;
  }
  return table[String(closest)];
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateMotorEfficiency(input: MotorEfficiencyInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.ratedPower, 'ratedPower');
  assertRange(input.loadRatio, 0.1, 1.5, 'loadRatio');
  assertOneOf(input.ieClass, ['IE1', 'IE2', 'IE3', 'IE4'] as const, 'ieClass');

  const { ratedPower, loadRatio, ieClass } = input;
  const annualHours = input.annualHours ?? 4000;
  const rate = input.electricityRate ?? 120;

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];

  // Step 1: Lookup rated efficiency
  const etaRated = lookupEfficiency(ieClass, ratedPower);
  steps.push({
    step: 1,
    title: `${ieClass} 정격효율 조회 (Rated efficiency lookup)`,
    formula: `\\eta_{${ieClass}} = ${round(etaRated * 100, 1)}\\%`,
    value: round(etaRated * 100, 1),
    unit: '%',
    standardRef: 'IEC 60034-30-1',
  });

  // Step 2: Adjust for partial load (simplified parabolic model)
  // eta(load) = eta_rated * loadRatio / (loadRatio + (1-eta_rated)/eta_rated * loadRatio^2 + constant losses)
  // Simplified: at partial load, efficiency dips slightly
  const etaPartial = etaRated * loadRatio / (loadRatio + ((1 - etaRated) / etaRated) * loadRatio * loadRatio);
  const etaActual = Math.min(etaPartial, etaRated);
  steps.push({
    step: 2,
    title: '부분부하 효율 보정 (Partial load efficiency)',
    formula: '\\eta_{actual} = f(\\eta_{rated}, loadRatio)',
    value: round(etaActual * 100, 1),
    unit: '%',
  });

  // Step 3: Annual energy consumption
  const Pout = ratedPower * loadRatio;
  const Pin = Pout / etaActual;
  const annualEnergy = Pin * annualHours;
  steps.push({
    step: 3,
    title: '연간 에너지 소비량 (Annual energy consumption)',
    formula: 'E = P_{in} \\times hours = \\frac{P_{out}}{\\eta} \\times hours',
    value: round(annualEnergy, 0),
    unit: 'kWh/yr',
  });

  // Step 4: Annual cost
  const annualCost = annualEnergy * rate;
  steps.push({
    step: 4,
    title: '연간 전기요금 (Annual electricity cost)',
    formula: 'C = E \\times rate',
    value: round(annualCost, 0),
    unit: 'KRW/yr',
  });

  // Step 5: Savings vs IE1
  const etaIE1 = lookupEfficiency('IE1', ratedPower);
  const PinIE1 = Pout / etaIE1;
  const costIE1 = PinIE1 * annualHours * rate;
  const savings = costIE1 - annualCost;
  steps.push({
    step: 5,
    title: 'IE1 대비 절감액 (Savings vs IE1)',
    formula: '\\Delta C = C_{IE1} - C_{' + ieClass + '}',
    value: round(savings, 0),
    unit: 'KRW/yr',
  });

  // PART 3 -- Result assembly
  return {
    value: round(etaActual * 100, 1),
    unit: '%',
    formula: '\\eta = \\frac{P_{out}}{P_{in}} \\times 100',
    steps,
    source: [
      createSource('IEC', '60034-30-1', { edition: '2014' }),
      createSource('KEC', '232', { edition: '2021' }),
    ],
    judgment: createJudgment(
      true,
      `${ieClass} 효율 ${round(etaActual * 100, 1)}% (부하율 ${round(loadRatio * 100, 0)}%), IE1 대비 연간 ${round(savings, 0)} KRW 절감`,
      'info',
    ),
    additionalOutputs: {
      efficiency:      { value: round(etaActual * 100, 1), unit: '%' },
      annualEnergyCost:{ value: round(annualCost, 0),      unit: 'KRW/yr' },
      savingsVsIE1:    { value: round(savings, 0),         unit: 'KRW/yr' },
    },
  };
}
