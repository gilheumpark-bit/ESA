/**
 * Sensitivity Analysis
 *
 * Varies a single input parameter while holding others fixed
 * to determine how sensitive the output is and where judgment
 * transitions occur (PASS -> FAIL critical points).
 *
 * PART 1: Types
 * PART 2: analyzeSensitivity() main function
 * PART 3: Critical point detection
 */

import type { DetailedCalcResult } from '../calculators/types';

// ---------------------------------------------------------------------------
// PART 1 — Types
// ---------------------------------------------------------------------------

/** Result of a sensitivity analysis run */
export interface SensitivityResult {
  /** Parameter that was varied */
  param: string;
  /** Parameter display name */
  paramLabel: string;
  /** The values the parameter was swept through */
  values: number[];
  /** The corresponding output results */
  results: number[];
  /** The corresponding output units */
  unit: string;
  /** Whether each result passed judgment */
  judgments: boolean[];
  /** Critical point where judgment flips (undefined if no flip) */
  criticalPoint?: number;
  /** Direction of the critical transition */
  criticalDirection?: 'pass_to_fail' | 'fail_to_pass';
  /** Sensitivity coefficient: d(output)/d(input) at midpoint */
  sensitivityCoeff: number;
  /** Calculator ID used */
  calcId: string;
  /** Number of steps computed */
  steps: number;
}

/** Calculator function type (matches CalculatorRegistryEntry.calculator) */
type CalcFn = (input: Record<string, unknown>) => DetailedCalcResult;

// ---------------------------------------------------------------------------
// PART 2 — Main Analysis Function
// ---------------------------------------------------------------------------

/**
 * Run sensitivity analysis on a single parameter.
 *
 * @param calcId - Calculator identifier for labeling
 * @param calculator - The pure calculator function
 * @param inputs - Base input parameter set
 * @param paramToVary - Which parameter to sweep
 * @param range - [min, max] range to sweep
 * @param steps - Number of evenly-spaced steps (default: 20)
 * @returns SensitivityResult with swept values, results, and critical point
 */
export function analyzeSensitivity(
  calcId: string,
  calculator: CalcFn,
  inputs: Record<string, unknown>,
  paramToVary: string,
  range: [number, number],
  steps: number = 20,
): SensitivityResult {
  if (steps < 2) {
    throw new Error('Sensitivity analysis requires at least 2 steps');
  }
  if (range[0] >= range[1]) {
    throw new Error(`Invalid range: min (${range[0]}) must be less than max (${range[1]})`);
  }
  if (!(paramToVary in inputs)) {
    throw new Error(`Parameter '${paramToVary}' not found in inputs`);
  }

  const [min, max] = range;
  const stepSize = (max - min) / (steps - 1);

  const values: number[] = [];
  const results: number[] = [];
  const judgments: boolean[] = [];
  let unit = '';

  // Sweep the parameter
  for (let i = 0; i < steps; i++) {
    const paramValue = min + i * stepSize;
    values.push(paramValue);

    // Create input copy with varied parameter
    const variedInputs = { ...inputs, [paramToVary]: paramValue };

    try {
      const calcResult = calculator(variedInputs);
      const resultValue = typeof calcResult.value === 'number' ? calcResult.value : 0;
      results.push(resultValue);
      unit = calcResult.unit;
      judgments.push(calcResult.judgment?.pass ?? true);
    } catch {
      // If calculation fails for this value (e.g., out of range), mark as NaN
      results.push(NaN);
      judgments.push(false);
    }
  }

  // Detect critical point
  const { criticalPoint, criticalDirection } = findCriticalPoint(values, judgments);

  // Calculate sensitivity coefficient at midpoint
  const sensitivityCoeff = calculateSensitivityCoeff(values, results);

  return {
    param: paramToVary,
    paramLabel: paramToVary, // Could be enhanced with tool param descriptions
    values,
    results,
    unit,
    judgments,
    criticalPoint,
    criticalDirection,
    sensitivityCoeff,
    calcId,
    steps,
  };
}

// ---------------------------------------------------------------------------
// PART 3 — Critical Point Detection
// ---------------------------------------------------------------------------

/**
 * Find the point where judgment transitions from PASS to FAIL or vice versa.
 * Uses linear interpolation between the two adjacent points where the flip occurs.
 */
function findCriticalPoint(
  values: number[],
  judgments: boolean[],
): { criticalPoint?: number; criticalDirection?: 'pass_to_fail' | 'fail_to_pass' } {
  for (let i = 1; i < judgments.length; i++) {
    if (judgments[i] !== judgments[i - 1]) {
      // Judgment flipped between index i-1 and i
      // Linear interpolation: the critical point is approximately at the midpoint
      const criticalPoint = (values[i - 1] + values[i]) / 2;
      const criticalDirection: 'pass_to_fail' | 'fail_to_pass' =
        judgments[i - 1] && !judgments[i] ? 'pass_to_fail' : 'fail_to_pass';

      return { criticalPoint, criticalDirection };
    }
  }

  return {};
}

/**
 * Calculate the sensitivity coefficient (average d(output)/d(input)).
 * Uses finite differences across the valid (non-NaN) result range.
 */
function calculateSensitivityCoeff(values: number[], results: number[]): number {
  // Find two valid points near the midpoint
  const mid = Math.floor(values.length / 2);

  // Search outward from midpoint for two valid adjacent points
  for (let offset = 0; offset < values.length - 1; offset++) {
    const i = Math.min(mid + offset, values.length - 2);
    if (Number.isFinite(results[i]) && Number.isFinite(results[i + 1])) {
      const dInput = values[i + 1] - values[i];
      if (dInput === 0) continue;
      return (results[i + 1] - results[i]) / dInput;
    }
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Convenience: Run sensitivity on multiple parameters
// ---------------------------------------------------------------------------

export interface MultiSensitivityResult {
  calcId: string;
  analyses: SensitivityResult[];
  mostSensitiveParam: string;
  mostSensitiveCoeff: number;
}

/**
 * Run sensitivity analysis on multiple parameters and rank them
 * by sensitivity coefficient magnitude.
 */
export function analyzeMultiSensitivity(
  calcId: string,
  calculator: CalcFn,
  inputs: Record<string, unknown>,
  paramsToVary: Array<{ param: string; range: [number, number] }>,
  steps: number = 20,
): MultiSensitivityResult {
  const analyses: SensitivityResult[] = [];

  for (const { param, range } of paramsToVary) {
    try {
      const result = analyzeSensitivity(calcId, calculator, inputs, param, range, steps);
      analyses.push(result);
    } catch {
      // Skip params that can't be analyzed
    }
  }

  // Rank by absolute sensitivity coefficient
  analyses.sort((a, b) => Math.abs(b.sensitivityCoeff) - Math.abs(a.sensitivityCoeff));

  return {
    calcId,
    analyses,
    mostSensitiveParam: analyses[0]?.param ?? '',
    mostSensitiveCoeff: analyses[0]?.sensitivityCoeff ?? 0,
  };
}

// ---------------------------------------------------------------------------
// PART 4 — 2-Variable Interaction Analysis (다변수 상호작용)
// ---------------------------------------------------------------------------

export interface InteractionResult {
  paramA: string;
  paramB: string;
  /** 2D grid of output values [rowA][colB] */
  grid: number[][];
  /** 2D grid of pass/fail judgments */
  judgmentGrid: boolean[][];
  /** Values swept for param A */
  valuesA: number[];
  /** Values swept for param B */
  valuesB: number[];
  /** Interaction coefficient: how much paramB changes the sensitivity of paramA */
  interactionCoeff: number;
  calcId: string;
}

/**
 * 2-Variable Interaction: paramA와 paramB를 동시에 변화시켜
 * 상호작용 효과를 측정한다.
 *
 * interactionCoeff > 0.1이면 두 변수가 유의미하게 상호작용.
 */
export function analyzeInteraction(
  calcId: string,
  calculator: CalcFn,
  inputs: Record<string, unknown>,
  paramA: { param: string; range: [number, number] },
  paramB: { param: string; range: [number, number] },
  stepsPerParam: number = 10,
): InteractionResult {
  const valuesA: number[] = [];
  const valuesB: number[] = [];
  const stepA = (paramA.range[1] - paramA.range[0]) / (stepsPerParam - 1);
  const stepB = (paramB.range[1] - paramB.range[0]) / (stepsPerParam - 1);

  for (let i = 0; i < stepsPerParam; i++) valuesA.push(paramA.range[0] + i * stepA);
  for (let j = 0; j < stepsPerParam; j++) valuesB.push(paramB.range[0] + j * stepB);

  const grid: number[][] = [];
  const judgmentGrid: boolean[][] = [];

  for (let i = 0; i < stepsPerParam; i++) {
    const row: number[] = [];
    const jRow: boolean[] = [];
    for (let j = 0; j < stepsPerParam; j++) {
      try {
        const varied = { ...inputs, [paramA.param]: valuesA[i], [paramB.param]: valuesB[j] };
        const r = calculator(varied);
        row.push(typeof r.value === 'number' ? r.value : 0);
        jRow.push(r.judgment?.pass ?? true);
      } catch {
        row.push(NaN);
        jRow.push(false);
      }
    }
    grid.push(row);
    judgmentGrid.push(jRow);
  }

  // 상호작용 계수: paramB의 값에 따라 paramA의 기울기가 얼마나 변하는지
  const slopeAtLowB = grid.length >= 2 && Number.isFinite(grid[1][0]) && Number.isFinite(grid[0][0])
    ? (grid[1][0] - grid[0][0]) / (stepA || 1) : 0;
  const slopeAtHighB = grid.length >= 2 && Number.isFinite(grid[1][stepsPerParam - 1]) && Number.isFinite(grid[0][stepsPerParam - 1])
    ? (grid[1][stepsPerParam - 1] - grid[0][stepsPerParam - 1]) / (stepA || 1) : 0;
  const interactionCoeff = slopeAtHighB !== 0 ? Math.abs((slopeAtHighB - slopeAtLowB) / slopeAtHighB) : 0;

  return { paramA: paramA.param, paramB: paramB.param, grid, judgmentGrid, valuesA, valuesB, interactionCoeff, calcId };
}
