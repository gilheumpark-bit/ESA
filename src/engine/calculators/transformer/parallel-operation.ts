/**
 * Transformer Parallel Operation Calculator
 *
 * Conditions for parallel operation:
 *   1. Same voltage ratio (identical turns ratio)
 *   2. Same impedance voltage %Z (within ±10%)
 *   3. Same vector group
 *   4. Load sharing proportional to capacity when %Z matches
 *
 * Formulae:
 *   Load share:  S_i = S_total × (S_rated_i / Z_i%) / Σ(S_rated_j / Z_j%)
 *
 * Standards: IEC 60076-1, KEC 311
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

export interface TransformerSpec {
  /** Rated capacity in kVA */
  capacity: number;
  /** Impedance voltage in percent */
  impedancePercent: number;
  /** Voltage ratio, e.g. "22900/380" */
  voltageRatio: string;
  /** Vector group, e.g. "Dyn11" */
  vectorGroup: string;
}

export interface ParallelOperationInput {
  /** Array of transformers (minimum 2) */
  transformers: TransformerSpec[];
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateParallelOperation(input: ParallelOperationInput): DetailedCalcResult {
  // PART 1 — Validation
  const { transformers } = input;
  if (!Array.isArray(transformers) || transformers.length < 2) {
    throw new Error('At least 2 transformers are required for parallel operation analysis');
  }

  for (let i = 0; i < transformers.length; i++) {
    assertPositive(transformers[i].capacity, `transformers[${i}].capacity`);
    assertRange(transformers[i].impedancePercent, 0.1, 30, `transformers[${i}].impedancePercent`);
  }

  // PART 2 — Derivation
  const steps: CalcStep[] = [];
  const warnings: string[] = [];

  // Step 1: 전압비 일치 확인
  const voltageRatios = transformers.map(t => t.voltageRatio);
  const allSameRatio = voltageRatios.every(r => r === voltageRatios[0]);
  steps.push({
    step: 1,
    title: 'Check voltage ratio compatibility',
    formula: 'V_{ratio,1} = V_{ratio,2} = \\ldots',
    value: allSameRatio ? 1 : 0,
    unit: allSameRatio ? 'PASS' : 'FAIL',
  });
  if (!allSameRatio) {
    warnings.push('Voltage ratios do not match — parallel operation not recommended');
  }

  // Step 2: 벡터군 일치 확인
  const vectorGroups = transformers.map(t => t.vectorGroup.toUpperCase());
  const allSameVector = vectorGroups.every(v => v === vectorGroups[0]);
  steps.push({
    step: 2,
    title: 'Check vector group compatibility',
    formula: 'VG_1 = VG_2 = \\ldots',
    value: allSameVector ? 1 : 0,
    unit: allSameVector ? 'PASS' : 'FAIL',
  });
  if (!allSameVector) {
    warnings.push('Vector groups do not match — parallel operation prohibited');
  }

  // Step 3: %Z 편차 확인 (±10% 이내)
  const zValues = transformers.map(t => t.impedancePercent);
  const avgZ = zValues.reduce((a, b) => a + b, 0) / zValues.length;
  const maxZDeviation = Math.max(...zValues.map(z => Math.abs(z - avgZ) / avgZ * 100));
  const zCompatible = maxZDeviation <= 10;
  steps.push({
    step: 3,
    title: 'Check impedance voltage deviation (max ±10%)',
    formula: '\\Delta Z\\% = \\frac{|Z_i - Z_{avg}|}{Z_{avg}} \\times 100 \\leq 10\\%',
    value: round(maxZDeviation, 2),
    unit: '%',
  });
  if (!zCompatible) {
    warnings.push(`Impedance voltage deviation ${round(maxZDeviation, 2)}% exceeds 10% limit`);
  }

  // Step 4: 부하 분담 계산 (÷0 방어)
  const ratios = transformers.map(t => t.impedancePercent > 0 ? t.capacity / t.impedancePercent : 0);
  const sumRatios = ratios.reduce((a, b) => a + b, 0);
  const loadSharing = sumRatios > 0 ? ratios.map(r => round((r / sumRatios) * 100, 2)) : ratios.map(() => 0);
  const totalCapacity = transformers.reduce((a, t) => a + t.capacity, 0);

  steps.push({
    step: 4,
    title: 'Calculate load sharing ratio',
    formula: 'S_i\\% = \\frac{S_i / Z_i\\%}{\\sum(S_j / Z_j\\%)} \\times 100',
    value: totalCapacity,
    unit: 'kVA',
  });

  // PART 3 — Overall compatibility
  const compatible = allSameRatio && allSameVector && zCompatible;
  const judgmentMsg = compatible
    ? `Parallel operation is feasible. Total capacity = ${totalCapacity} kVA`
    : `Parallel operation NOT recommended. Issues: ${warnings.join('; ')}`;

  // PART 4 — Result assembly
  // Encode load sharing and warnings into additionalOutputs
  const additionalOutputs: Record<string, { value: number; unit: string; formula?: string }> = {
    totalCapacity: { value: totalCapacity, unit: 'kVA' },
    maxZDeviation: { value: round(maxZDeviation, 2), unit: '%' },
    compatible: { value: compatible ? 1 : 0, unit: 'bool' },
  };

  loadSharing.forEach((share, i) => {
    additionalOutputs[`loadShare_T${i + 1}`] = { value: share, unit: '%' };
  });

  return {
    value: compatible ? 1 : 0,
    unit: 'bool',
    formula: 'S_i = S_{total} \\times \\frac{S_i / Z_i\\%}{\\sum(S_j / Z_j\\%)}',
    steps,
    source: [
      createSource('IEC', '60076-1', { edition: '2011' }),
      createSource('KEC', '311', { edition: '2021' }),
    ],
    judgment: createJudgment(compatible, judgmentMsg, compatible ? 'info' : 'error'),
    additionalOutputs,
  };
}
