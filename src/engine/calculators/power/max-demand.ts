/**
 * Maximum Demand Calculator
 *
 * Formula:
 *   MD = Σ(Pi × Di) × (1 / diversityFactor)
 *
 * Where:
 *   Pi = rated power of each load (kW)
 *   Di = demand factor of each load (0-1)
 *   diversityFactor = ratio accounting for non-simultaneous operation
 *
 * Standards: KEC 130 (전력계통 기본), KEC 232.2 (수용률/부등률)
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
  /** Load identifier */
  name: string;
  /** Rated power in kW */
  ratedPower: number;
  /** Demand factor (0 < D <= 1) */
  demandFactor: number;
}

export interface MaxDemandInput {
  /** Array of individual loads */
  loads: LoadEntry[];
  /** Diversity factor (>= 1.0 typically) */
  diversityFactor: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateMaxDemand(input: MaxDemandInput): DetailedCalcResult {
  // PART 1 — Validation
  if (!input.loads || input.loads.length === 0) {
    throw new Error('At least one load entry is required');
  }
  assertPositive(input.diversityFactor, 'diversityFactor');
  if (input.diversityFactor < 1.0) {
    throw new Error('diversityFactor must be >= 1.0');
  }

  for (const load of input.loads) {
    assertPositive(load.ratedPower, `ratedPower(${load.name})`);
    assertRange(load.demandFactor, 0.01, 1.0, `demandFactor(${load.name})`);
  }

  const steps: CalcStep[] = [];

  // PART 2 — Derivation

  // Step 1: Total connected load
  const totalConnected = input.loads.reduce((sum, l) => sum + l.ratedPower, 0);
  steps.push({
    step: 1,
    title: 'Sum total connected load',
    formula: 'P_{total} = \\sum P_i',
    value: round(totalConnected, 2),
    unit: 'kW',
  });

  // Step 2: Sum of demand-weighted loads
  const weightedSum = input.loads.reduce((sum, l) => sum + l.ratedPower * l.demandFactor, 0);
  steps.push({
    step: 2,
    title: 'Calculate demand-weighted sum',
    formula: '\\sum (P_i \\times D_i)',
    value: round(weightedSum, 2),
    unit: 'kW',
  });

  // Step 3: Apply diversity factor
  const maxDemand = weightedSum / input.diversityFactor;
  steps.push({
    step: 3,
    title: 'Apply diversity factor',
    formula: 'MD = \\frac{\\sum (P_i \\times D_i)}{F_{div}}',
    value: round(maxDemand, 2),
    unit: 'kW',
    standardRef: 'KEC 232.2',
  });

  // Step 4: Overall demand factor
  const overallDemandFactor = maxDemand / totalConnected;
  steps.push({
    step: 4,
    title: 'Calculate overall demand factor',
    formula: 'D_{overall} = \\frac{MD}{P_{total}}',
    value: round(overallDemandFactor, 4),
    unit: '',
  });

  // PART 3 — Result assembly
  return {
    value: round(maxDemand, 2),
    unit: 'kW',
    formula: 'MD = \\frac{\\sum (P_i \\times D_i)}{F_{div}}',
    steps,
    source: [
      createSource('KEC', '232.2', { edition: '2021' }),
      createSource('KEC', '130', { edition: '2021' }),
    ],
    judgment: createJudgment(
      true,
      `Maximum demand = ${round(maxDemand, 2)} kW (overall demand factor = ${round(overallDemandFactor, 4)})`,
      'info',
    ),
    additionalOutputs: {
      totalConnected: { value: round(totalConnected, 2), unit: 'kW' },
      overallDemandFactor: {
        value: round(overallDemandFactor, 4),
        unit: '',
        formula: 'D_{overall} = \\frac{MD}{P_{total}}',
      },
    },
  };
}
