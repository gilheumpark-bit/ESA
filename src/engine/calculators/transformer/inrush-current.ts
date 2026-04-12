/**
 * Transformer Inrush Current Calculator
 *
 * Formulae:
 *   Rated current:  In = S / (√3 × Vn)                           [A]
 *   Inrush current: I_inrush = multiplier × In                   [A]
 *   Typical multipliers: 6-8× (distribution), 8-12× (power), 10-15× (dry-type)
 *   Decay time constant: τ ≈ 0.1 to 1.0 seconds
 *
 * Standards: IEC 60076-1, IEEE C57.12.00
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertOneOf,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export type TransformerType = 'distribution' | 'power' | 'dry-type';

export interface InrushCurrentInput {
  /** Rated capacity in kVA */
  ratedCapacity: number;
  /** Rated voltage in Volts (line-to-line) */
  ratedVoltage: number;
  /** Transformer type */
  transformerType: TransformerType;
}

// ── Lookup tables ───────────────────────────────────────────────────────────

const INRUSH_PARAMS: Record<TransformerType, { minMultiple: number; maxMultiple: number; decayTime: number }> = {
  'distribution': { minMultiple: 6, maxMultiple: 8, decayTime: 0.1 },
  'power':        { minMultiple: 8, maxMultiple: 12, decayTime: 0.5 },
  'dry-type':     { minMultiple: 10, maxMultiple: 15, decayTime: 0.3 },
};

const VALID_TYPES: readonly TransformerType[] = ['distribution', 'power', 'dry-type'];

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateInrushCurrent(input: InrushCurrentInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.ratedCapacity, 'ratedCapacity');
  assertPositive(input.ratedVoltage, 'ratedVoltage');
  assertOneOf(input.transformerType, VALID_TYPES, 'transformerType');

  const { ratedCapacity: S, ratedVoltage: Vn, transformerType } = input;
  const params = INRUSH_PARAMS[transformerType];

  // PART 2 — Derivation
  const steps: CalcStep[] = [];

  // Step 1: 정격 전류 계산
  const In = (S * 1000) / (Math.sqrt(3) * Vn);
  steps.push({
    step: 1,
    title: 'Calculate rated current',
    formula: 'I_n = \\frac{S \\times 1000}{\\sqrt{3} \\times V_n}',
    value: round(In, 2),
    unit: 'A',
  });

  // Step 2: 돌입전류 배수 (typical value = average of min/max)
  const typicalMultiple = (params.minMultiple + params.maxMultiple) / 2;
  steps.push({
    step: 2,
    title: `Determine inrush multiplier for ${transformerType} transformer`,
    formula: `k_{inrush} = ${params.minMultiple} \\sim ${params.maxMultiple}`,
    value: typicalMultiple,
    unit: '×',
  });

  // Step 3: 돌입전류 계산 (peak)
  const Iinrush = typicalMultiple * In;
  steps.push({
    step: 3,
    title: 'Calculate inrush current (peak)',
    formula: 'I_{inrush} = k_{inrush} \\times I_n',
    value: round(Iinrush, 2),
    unit: 'A',
  });

  // Step 4: 감쇠 시간
  steps.push({
    step: 4,
    title: 'Estimate decay time constant',
    formula: '\\tau \\approx ' + params.decayTime + '\\text{ s}',
    value: params.decayTime,
    unit: 's',
  });

  // PART 3 — Result assembly
  return {
    value: round(Iinrush, 2),
    unit: 'A',
    formula: 'I_{inrush} = k_{inrush} \\times I_n',
    steps,
    source: [
      createSource('IEC', '60076-1', { edition: '2011' }),
      createSource('IEEE', 'C57.12.00', { edition: '2015' }),
    ],
    judgment: createJudgment(
      true,
      `Inrush current ≈ ${round(Iinrush, 2)} A (${typicalMultiple}× rated, range ${params.minMultiple}-${params.maxMultiple}×). Decay ≈ ${params.decayTime} s.`,
      'info',
    ),
    additionalOutputs: {
      ratedCurrent: { value: round(In, 2), unit: 'A' },
      inrushMultiple: { value: typicalMultiple, unit: '×' },
      decayTime: { value: params.decayTime, unit: 's' },
    },
  };
}
