/**
 * Transformer Loss Calculator
 *
 * Formulae:
 *   Total loss:    P_total = P_fe + P_cu × (loadRatio)²          [W]
 *   Annual loss:   E = P_total × 8760 / 1000                     [kWh]
 *
 * Efficiency requires the rated capacity S (kVA) and power factor, which this
 * loss-only calculator does not take — use transformer-efficiency.ts instead.
 *
 * Standards: IEC 60076-1 (Power Transformers)
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  assertNonNegative,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export interface TransformerLossInput {
  /** No-load (iron/core) loss in Watts */
  noLoadLoss: number;
  /** Rated load (copper/winding) loss in Watts */
  ratedLoadLoss: number;
  /** Load ratio (0 to 1, where 1 = full load) */
  loadRatio: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateTransformerLoss(input: TransformerLossInput): DetailedCalcResult {
  // PART 1 — Validation
  assertNonNegative(input.noLoadLoss, 'noLoadLoss');
  assertPositive(input.ratedLoadLoss, 'ratedLoadLoss');
  assertRange(input.loadRatio, 0, 1, 'loadRatio');

  const { noLoadLoss: Pfe, ratedLoadLoss: Pcu, loadRatio: k } = input;

  // PART 2 — Derivation
  const steps: CalcStep[] = [];

  // Step 1: 부하시 동손 계산
  const loadLoss = Pcu * k * k;
  steps.push({
    step: 1,
    title: 'Calculate load-dependent copper loss',
    formula: 'P_{cu,actual} = P_{cu,rated} \\times k^2',
    value: round(loadLoss, 2),
    unit: 'W',
  });

  // Step 2: 총 손실 계산
  const totalLoss = Pfe + loadLoss;
  steps.push({
    step: 2,
    title: 'Calculate total loss',
    formula: 'P_{total} = P_{fe} + P_{cu} \\times k^2',
    value: round(totalLoss, 2),
    unit: 'W',
  });

  // Step 3: 연간 에너지 손실 (8760h/year)
  // 효율은 정격용량 S(kVA)와 역률이 있어야 산출 가능하므로 손실 전용 계산기에서는 제외한다.
  const annualLoss = totalLoss * 8760 / 1000;
  steps.push({
    step: 3,
    title: 'Calculate annual energy loss',
    formula: 'E_{annual} = P_{total} \\times 8760 / 1000',
    value: round(annualLoss, 2),
    unit: 'kWh',
  });

  // PART 3 — Result assembly
  return {
    value: round(totalLoss, 2),
    unit: 'W',
    formula: 'P_{total} = P_{fe} + P_{cu} \\times k^2',
    steps,
    source: [createSource('IEC', '60076-1', { edition: '2011' })],
    judgment: createJudgment(
      true,
      `Total loss = ${round(totalLoss, 2)} W at ${k * 100}% load (Fe: ${Pfe} W, Cu: ${round(loadLoss, 2)} W)`,
      'info',
    ),
    additionalOutputs: {
      annualLoss: { value: round(annualLoss, 2), unit: 'kWh', formula: 'E = P_{total} \\times 8760 / 1000' },
    },
  };
}
