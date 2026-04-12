/**
 * Transformer Efficiency Calculator
 *
 * Formulae:
 *   Efficiency:         η = (S × cosφ × k) / (S × cosφ × k + Pfe + Pcu × k²) × 100  [%]
 *   Optimal load ratio: k_opt = √(Pfe / Pcu)
 *   Annual energy saving vs full-load operation
 *
 * Standards: IEC 60076-1 (Power Transformers), IEC 60076-20 (Energy Efficiency)
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

export interface TransformerEfficiencyInput {
  /** Rated capacity in kVA */
  capacity: number;
  /** No-load (iron) loss in Watts */
  noLoadLoss: number;
  /** Rated load (copper) loss in Watts */
  loadLoss: number;
  /** Power factor (0 < pf <= 1) */
  powerFactor: number;
  /** Load ratio (0 < k <= 1) */
  loadRatio: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateTransformerEfficiency(input: TransformerEfficiencyInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.capacity, 'capacity');
  assertPositive(input.noLoadLoss, 'noLoadLoss');
  assertPositive(input.loadLoss, 'loadLoss');
  assertRange(input.powerFactor, 0.01, 1.0, 'powerFactor');
  assertRange(input.loadRatio, 0.01, 1.0, 'loadRatio');

  const { capacity: S, noLoadLoss: Pfe, loadLoss: Pcu, powerFactor: pf, loadRatio: k } = input;

  // PART 2 — Derivation
  const steps: CalcStep[] = [];

  // Step 1: 출력 전력 (kW → W)
  const Pout = S * pf * k * 1000; // W
  steps.push({
    step: 1,
    title: 'Calculate output power',
    formula: 'P_{out} = S \\times \\cos\\varphi \\times k \\times 1000',
    value: round(Pout, 2),
    unit: 'W',
  });

  // Step 2: 총 손실 계산
  const totalLoss = Pfe + Pcu * k * k;
  steps.push({
    step: 2,
    title: 'Calculate total losses',
    formula: 'P_{loss} = P_{fe} + P_{cu} \\times k^2',
    value: round(totalLoss, 2),
    unit: 'W',
  });

  // Step 3: 효율 계산
  const efficiency = (Pout / (Pout + totalLoss)) * 100;
  steps.push({
    step: 3,
    title: 'Calculate efficiency',
    formula: '\\eta = \\frac{S \\cos\\varphi \\cdot k}{S \\cos\\varphi \\cdot k + P_{fe} + P_{cu} k^2} \\times 100',
    value: round(efficiency, 4),
    unit: '%',
  });

  // Step 4: 최적 부하율 계산
  const optimalLoadRatio = Math.sqrt(Pfe / Pcu);
  steps.push({
    step: 4,
    title: 'Calculate optimal load ratio',
    formula: 'k_{opt} = \\sqrt{\\frac{P_{fe}}{P_{cu}}}',
    value: round(optimalLoadRatio, 4),
    unit: '',
  });

  // Step 5: 최적 부하율 대비 연간 에너지 절감 추정
  // 현재 부하율 vs 최적 부하율의 손실 차이 × 8760h
  const lossAtOptimal = Pfe + Pcu * optimalLoadRatio * optimalLoadRatio;
  const annualSaving = (totalLoss - lossAtOptimal) * 8760 / 1000;
  steps.push({
    step: 5,
    title: 'Estimate annual energy saving vs optimal loading',
    formula: 'E_{saving} = (P_{loss,current} - P_{loss,optimal}) \\times 8760 / 1000',
    value: round(annualSaving, 2),
    unit: 'kWh',
  });

  // PART 3 — Judgment
  const pass = efficiency >= 95;
  const judgmentMsg = pass
    ? `Efficiency = ${round(efficiency, 2)}% (good, >= 95%)`
    : `Efficiency = ${round(efficiency, 2)}% (below 95% target — consider optimal loading at k=${round(optimalLoadRatio, 3)})`;

  // PART 4 — Result assembly
  return {
    value: round(efficiency, 4),
    unit: '%',
    formula: '\\eta = \\frac{S \\cos\\varphi \\cdot k}{S \\cos\\varphi \\cdot k + P_{fe} + P_{cu} k^2} \\times 100',
    steps,
    source: [
      createSource('IEC', '60076-1', { edition: '2011' }),
      createSource('IEC', '60076-20', { edition: '2017' }),
    ],
    judgment: createJudgment(pass, judgmentMsg, pass ? 'info' : 'warning'),
    additionalOutputs: {
      optimalLoadRatio: { value: round(optimalLoadRatio, 4), unit: '', formula: 'k_{opt} = \\sqrt{P_{fe}/P_{cu}}' },
      annualEnergySaving: { value: round(annualSaving, 2), unit: 'kWh' },
    },
  };
}
