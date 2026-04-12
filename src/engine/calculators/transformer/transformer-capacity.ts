/**
 * Transformer Capacity Calculator
 *
 * Formula:
 *   S_required = P_total / (cos(phi) x eta x demand_factor)
 *
 * Then select the next standard size up from:
 *   [50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000] kVA
 *
 * Standards: KEC 341 (Transformer Installation), IEC 60076
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  round,
} from '../types';
import { getTransformerSpec, selectTransformerCapacity, STANDARD_CAPACITIES_KVA } from '@/data/transformer/transformer-db';

// ── Constants ───────────────────────────────────────────────────────────────

export const STANDARD_TRANSFORMER_SIZES_KVA = [
  50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000,
] as const;

// ── Input ───────────────────────────────────────────────────────────────────

export interface TransformerCapacityInput {
  /** Total connected load in kW */
  totalLoad: number;
  /** Power factor (0 < pf <= 1) */
  powerFactor: number;
  /** Transformer efficiency (0 < eta <= 1) */
  efficiency: number;
  /** Demand factor (0 < df <= 1) */
  demandFactor: number;
  /** Future growth margin (0-1, default 0) — optional */
  growthMargin?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateTransformerCapacity(input: TransformerCapacityInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.totalLoad, 'totalLoad');
  assertRange(input.powerFactor, 0.01, 1.0, 'powerFactor');
  assertRange(input.efficiency, 0.01, 1.0, 'efficiency');
  assertRange(input.demandFactor, 0.01, 1.0, 'demandFactor');

  const {
    totalLoad: P,
    powerFactor: pf,
    efficiency: eta,
    demandFactor: df,
    growthMargin = 0,
  } = input;

  if (growthMargin < 0 || growthMargin > 1) {
    assertRange(growthMargin, 0, 1, 'growthMargin');
  }

  const steps: CalcStep[] = [];

  // PART 2 — Derivation

  // Step 1: Demand load
  const P_demand = P * df;
  steps.push({
    step: 1,
    title: 'Apply demand factor',
    formula: 'P_{demand} = P_{total} \\times D_f',
    value: round(P_demand, 2),
    unit: 'kW',
  });

  // Step 2: Required apparent power
  const S_required = P_demand / (pf * eta);
  steps.push({
    step: 2,
    title: 'Calculate required transformer capacity',
    formula: 'S = \\frac{P_{demand}}{\\cos\\varphi \\times \\eta}',
    value: round(S_required, 2),
    unit: 'kVA',
    standardRef: 'KEC 341',
  });

  // Step 3: Apply growth margin
  const S_with_margin = S_required * (1 + growthMargin);
  steps.push({
    step: 3,
    title: 'Apply growth margin',
    formula: 'S_{design} = S \\times (1 + m)',
    value: round(S_with_margin, 2),
    unit: 'kVA',
  });

  // Step 4: Select standard size
  let selectedSize = STANDARD_TRANSFORMER_SIZES_KVA[STANDARD_TRANSFORMER_SIZES_KVA.length - 1];
  for (const size of STANDARD_TRANSFORMER_SIZES_KVA) {
    if (size >= S_with_margin) {
      selectedSize = size;
      break;
    }
  }

  const utilizationPct = round((S_with_margin / selectedSize) * 100, 1);
  steps.push({
    step: 4,
    title: 'Select standard transformer size',
    formula: 'S_{std} \\geq S_{design}',
    value: selectedSize,
    unit: 'kVA',
    standardRef: 'IEC 60076',
  });

  // PART 3 — Judgment
  const overSized = utilizationPct < 40;
  const pass = !overSized && selectedSize <= STANDARD_TRANSFORMER_SIZES_KVA[STANDARD_TRANSFORMER_SIZES_KVA.length - 1];
  const judgment = createJudgment(
    pass,
    overSized
      ? `Selected ${selectedSize} kVA (${utilizationPct}% utilization) - may be oversized, review demand assumptions`
      : selectedSize < S_with_margin
        ? `Required capacity ${round(S_with_margin, 2)} kVA exceeds maximum standard size ${STANDARD_TRANSFORMER_SIZES_KVA[STANDARD_TRANSFORMER_SIZES_KVA.length - 1]} kVA`
        : `Selected ${selectedSize} kVA (${utilizationPct}% utilization)`,
    overSized ? 'warning' : 'info',
    'KEC 341',
  );

  return {
    value: round(S_required, 2),
    unit: 'kVA',
    formula: 'S = \\frac{P_{total} \\times D_f}{\\cos\\varphi \\times \\eta}',
    steps,
    source: [
      createSource('KEC', '341', { edition: '2021' }),
      createSource('IEC', '60076', { edition: '2011' }),
    ],
    judgment,
    additionalOutputs: {
      demandLoad: { value: round(P_demand, 2), unit: 'kW' },
      requiredCapacity: { value: round(S_with_margin, 2), unit: 'kVA' },
      selectedStandard: { value: selectedSize, unit: 'kVA' },
      utilization: { value: utilizationPct, unit: '%' },
    },
  };
}
