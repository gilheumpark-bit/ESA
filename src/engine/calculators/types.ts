/**
 * Shared types for all ESVA calculators.
 *
 * Every calculator returns a CalcResult that carries:
 *   - primary value + unit
 *   - LaTeX formula string
 *   - step-by-step derivation (CalcStep[])
 *   - source tags (standard/clause provenance)
 *   - judgment (pass/fail against standard limits)
 */

import { CalcResult as BaseCalcResult } from '@engine/standards/types';
import type { Confidence } from '@engine/sjc/types';

// ---------------------------------------------------------------------------
// CalcStep -- one step in a multi-step derivation
// ---------------------------------------------------------------------------
export interface CalcStep {
  /** 1-based ordinal */
  step: number;
  /** Human-readable title, e.g. "Calculate apparent power" */
  title: string;
  /** LaTeX formula used in this step */
  formula: string;
  /** Computed numeric value (rounded for display) */
  value: number;
  /** Engineering unit */
  unit: string;
  /** Optional reference to standard clause */
  standardRef?: string;
}

// ---------------------------------------------------------------------------
// DetailedCalcResult -- extended return type for MVP calculators
// Extends the base CalcResult with formula, steps, and additional outputs.
// ---------------------------------------------------------------------------
export interface DetailedCalcResult extends BaseCalcResult {
  /** LaTeX-formatted formula string */
  formula: string;
  /** Ordered derivation steps */
  steps: CalcStep[];
  /** Confidence metadata */
  confidence?: Confidence;
  /** Additional named outputs (e.g. reactivePower, selectedRating) */
  additionalOutputs?: Record<string, { value: number; unit: string; formula?: string }>;
}

// ---------------------------------------------------------------------------
// Calculator registry entry
// ---------------------------------------------------------------------------
export type CalculatorCategory =
  | 'power'
  | 'voltage-drop'
  | 'transformer'
  | 'cable'
  | 'protection'
  | 'grounding'
  | 'renewable'
  | 'motor'
  | 'substation'
  | 'lighting'
  | 'global'
  | 'ai';

export type DifficultyLevel = 'basic' | 'intermediate' | 'advanced';

export interface CalculatorRegistryEntry {
  /** Unique kebab-case ID, e.g. "single-phase-power" */
  id: string;
  /** Display name (Korean) */
  name: string;
  /** Display name (English) */
  nameEn: string;
  /** Functional category */
  category: CalculatorCategory;
  /** Complexity tier */
  difficulty: DifficultyLevel;
  /**
   * The pure calculator function.
   * Registry는 다양한 계산기를 단일 Map에 저장하므로 input 타입을 통합할 수 없음.
   * 각 계산기는 내부에서 assertPositive/assertRange로 런타임 검증.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calculator: (input: any) => DetailedCalcResult;
}

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------
export class CalcValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'CalcValidationError';
  }
}

export function assertPositive(value: number, field: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new CalcValidationError(field, `${field} must be a positive finite number, got ${value}`);
  }
}

export function assertNonNegative(value: number, field: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new CalcValidationError(field, `${field} must be a non-negative finite number, got ${value}`);
  }
}

export function assertRange(value: number, min: number, max: number, field: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new CalcValidationError(field, `${field} must be between ${min} and ${max}, got ${value}`);
  }
}

export function assertOneOf<T>(value: T, allowed: readonly T[], field: string): void {
  if (!allowed.includes(value)) {
    throw new CalcValidationError(field, `${field} must be one of [${allowed.join(', ')}], got ${String(value)}`);
  }
}

/** Round to n decimal places */
export function round(v: number, decimals: number = 4): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
