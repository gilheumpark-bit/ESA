/**
 * Demand & Diversity Factor Calculator
 *
 * Formulae:
 *   수용률 (Demand Factor)      = 최대수요전력 / 설비용량
 *   부등률 (Diversity Factor)   = Σ개별최대 / 합성최대
 *   부하율 (Utilization Factor) = 평균전력 / 최대수요전력  (= 합성최대 / 설비용량)
 *
 * Standards: KEC 130, KEC 232.2 (수용률/부등률 정의)
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export interface DemandDiversityInput {
  /** Individual maximum demands of each feeder/load group in kW */
  individualMaxDemands: number[];
  /** Combined (simultaneous) maximum demand in kW */
  combinedMaxDemand: number;
  /** Total installed (nameplate) capacity in kW */
  totalInstalled: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateDemandDiversity(input: DemandDiversityInput): DetailedCalcResult {
  // PART 1 — Validation
  if (!input.individualMaxDemands || input.individualMaxDemands.length === 0) {
    throw new Error('At least one individual max demand value is required');
  }
  for (let i = 0; i < input.individualMaxDemands.length; i++) {
    assertPositive(input.individualMaxDemands[i], `individualMaxDemands[${i}]`);
  }
  assertPositive(input.combinedMaxDemand, 'combinedMaxDemand');
  assertPositive(input.totalInstalled, 'totalInstalled');

  const steps: CalcStep[] = [];

  // PART 2 — Derivation

  // Step 1: Sum of individual max demands
  const sumIndividual = input.individualMaxDemands.reduce((a, b) => a + b, 0);
  steps.push({
    step: 1,
    title: 'Sum of individual maximum demands',
    formula: '\\sum P_{max,i}',
    value: round(sumIndividual, 2),
    unit: 'kW',
  });

  // Step 2: Diversity factor (부등률)
  const diversityFactor = sumIndividual / input.combinedMaxDemand;
  steps.push({
    step: 2,
    title: 'Diversity factor (부등률)',
    formula: 'F_{div} = \\frac{\\sum P_{max,i}}{P_{combined}}',
    value: round(diversityFactor, 4),
    unit: '',
    standardRef: 'KEC 232.2',
  });

  // Step 3: Demand factor (수용률)
  const demandFactor = input.combinedMaxDemand / input.totalInstalled;
  steps.push({
    step: 3,
    title: 'Demand factor (수용률)',
    formula: 'D_f = \\frac{P_{combined}}{P_{installed}}',
    value: round(demandFactor, 4),
    unit: '',
    standardRef: 'KEC 232.2',
  });

  // Step 4: Utilization factor (부하율 / 이용률)
  const utilizationFactor = input.combinedMaxDemand / input.totalInstalled;
  steps.push({
    step: 4,
    title: 'Utilization factor (이용률)',
    formula: 'U_f = \\frac{P_{combined}}{P_{installed}}',
    value: round(utilizationFactor, 4),
    unit: '',
  });

  // PART 3 — Result assembly
  const dfWarning = diversityFactor < 1.0;
  const message = dfWarning
    ? `Diversity factor ${round(diversityFactor, 4)} < 1.0 — check individual demand values`
    : `Diversity factor = ${round(diversityFactor, 4)}, Demand factor = ${round(demandFactor, 4)}`;

  return {
    value: round(diversityFactor, 4),
    unit: '',
    formula: 'F_{div} = \\frac{\\sum P_{max,i}}{P_{combined}}',
    steps,
    source: [
      createSource('KEC', '232.2', { edition: '2021' }),
      createSource('KEC', '130', { edition: '2021' }),
    ],
    judgment: createJudgment(!dfWarning, message, dfWarning ? 'warning' : 'info'),
    additionalOutputs: {
      demandFactor: {
        value: round(demandFactor, 4),
        unit: '',
        formula: 'D_f = \\frac{P_{combined}}{P_{installed}}',
      },
      diversityFactor: {
        value: round(diversityFactor, 4),
        unit: '',
        formula: 'F_{div} = \\frac{\\sum P_{max,i}}{P_{combined}}',
      },
      utilizationFactor: {
        value: round(utilizationFactor, 4),
        unit: '',
        formula: 'U_f = \\frac{P_{combined}}{P_{installed}}',
      },
    },
  };
}
