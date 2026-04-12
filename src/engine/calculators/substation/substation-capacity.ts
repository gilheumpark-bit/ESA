/**
 * Substation Capacity Calculator
 *
 * Formulae:
 *   Total demand:      Stotal = SUM(Pi / pfi x DFi) x (1 + growth)  [kVA]
 *   Transformer size:  select from standard ratings >= Stotal
 *   Bus rating:        Ibus = Stotal x 1000 / (sqrt(3) x V)         [A]
 *
 * Standards: KEC 300 (Substation Design), IEC 60076
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

export interface LoadEntry {
  /** Load name/description */
  name: string;
  /** Load power in kW */
  kW: number;
  /** Power factor (0 < pf <= 1) */
  pf: number;
  /** Demand factor (0 < df <= 1) */
  demandFactor: number;
}

export interface SubstationCapacityInput {
  /** Array of load entries */
  loads: LoadEntry[];
  /** Future growth percentage (0-100) */
  futureGrowth: number;
  /** Redundancy scheme: 'N' or 'N+1' */
  redundancy: 'N' | 'N+1';
  /** System voltage in Volts (default 22900 for high-voltage side) */
  systemVoltage?: number;
}

// ── Standard transformer sizes (kVA) ───────────────────────────────────────

const STANDARD_TR_SIZES = [
  100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 2500, 3000,
  5000, 7500, 10000, 15000, 20000, 30000,
];

function selectTransformer(required: number): number {
  for (const size of STANDARD_TR_SIZES) {
    if (size >= required) return size;
  }
  return STANDARD_TR_SIZES[STANDARD_TR_SIZES.length - 1];
}

// ── Standard switchgear ratings (A) ────────────────────────────────────────

const SWITCHGEAR_RATINGS = [400, 600, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000];

function selectSwitchgear(current: number): number {
  for (const rating of SWITCHGEAR_RATINGS) {
    if (rating >= current * 1.1) return rating;
  }
  return SWITCHGEAR_RATINGS[SWITCHGEAR_RATINGS.length - 1];
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateSubstationCapacity(input: SubstationCapacityInput): DetailedCalcResult {
  // PART 1 -- Validation
  if (!input.loads || input.loads.length === 0) {
    throw new Error('At least one load entry is required');
  }
  assertRange(input.futureGrowth, 0, 100, 'futureGrowth');

  for (const load of input.loads) {
    assertPositive(load.kW, `load(${load.name}).kW`);
    assertRange(load.pf, 0.01, 1.0, `load(${load.name}).pf`);
    assertRange(load.demandFactor, 0.01, 1.0, `load(${load.name}).demandFactor`);
  }

  const { loads, futureGrowth, redundancy } = input;
  const _V = input.systemVoltage ?? 22900;
  const sqrt3 = Math.sqrt(3);

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];

  // Step 1: Sum of demand loads
  let totalKVA = 0;
  for (const load of loads) {
    totalKVA += (load.kW / load.pf) * load.demandFactor;
  }
  steps.push({
    step: 1,
    title: '수용 부하 합산 (Total demand load)',
    formula: 'S_{total} = \\sum \\frac{P_i}{pf_i} \\times DF_i',
    value: round(totalKVA, 2),
    unit: 'kVA',
  });

  // Step 2: Apply future growth
  const growthFactor = 1 + futureGrowth / 100;
  const totalWithGrowth = totalKVA * growthFactor;
  steps.push({
    step: 2,
    title: '장래 부하 증설 반영 (Future growth applied)',
    formula: `S_{design} = S_{total} \\times (1 + ${futureGrowth}\\%)`,
    value: round(totalWithGrowth, 2),
    unit: 'kVA',
  });

  // Step 3: Transformer selection
  const trRequired = redundancy === 'N+1'
    ? totalWithGrowth / 2  // Each transformer handles 50% in N+1
    : totalWithGrowth;
  const trSize = selectTransformer(trRequired);
  const trCount = redundancy === 'N+1' ? 2 : 1;
  steps.push({
    step: 3,
    title: '변압기 선정 (Transformer selection)',
    formula: `${redundancy} 방식: ${trCount} \\times ${trSize} \\text{ kVA}`,
    value: trSize,
    unit: `kVA x ${trCount}`,
  });

  // Step 4: Bus rating (low-voltage side at 380V)
  const lvVoltage = 380;
  const Ibus = (totalWithGrowth * 1000) / (sqrt3 * lvVoltage);
  steps.push({
    step: 4,
    title: '모선 정격전류 (Bus rating at 380V)',
    formula: 'I_{bus} = \\frac{S_{design} \\times 1000}{\\sqrt{3} \\times V_{LV}}',
    value: round(Ibus, 1),
    unit: 'A',
  });

  // Step 5: Incoming switchgear rating
  const switchgearRating = selectSwitchgear(Ibus);
  steps.push({
    step: 5,
    title: '수전반 차단기 선정 (Incoming switchgear)',
    formula: `I_{CB} \\geq I_{bus} \\times 1.1 = ${round(Ibus * 1.1, 1)}`,
    value: switchgearRating,
    unit: 'A',
  });

  // PART 3 -- Result assembly
  return {
    value: round(totalWithGrowth, 2),
    unit: 'kVA',
    formula: 'S_{design} = \\sum(P_i / pf_i \\times DF_i) \\times (1 + growth)',
    steps,
    source: [
      createSource('KEC', '300', { edition: '2021' }),
      createSource('IEC', '60076', { edition: '2011' }),
    ],
    judgment: createJudgment(
      true,
      `총 수용설비 ${round(totalWithGrowth, 2)} kVA, 변압기 ${trCount}x${trSize} kVA (${redundancy}), 차단기 ${switchgearRating} A`,
      'info',
    ),
    additionalOutputs: {
      totalDemand:      { value: round(totalWithGrowth, 2), unit: 'kVA' },
      transformerSize:  { value: trSize,                    unit: 'kVA' },
      busRating:        { value: round(Ibus, 1),            unit: 'A' },
      switchgearRating: { value: switchgearRating,          unit: 'A' },
    },
  };
}
