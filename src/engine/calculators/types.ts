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
  /**
   * 계산 불확실성 범위 — PE 검토 시 오차 인식용.
   * 예: arc-flash ±25%, grounding ±30%, voltage-drop ±5%
   * Reference: IEEE 1584 Annex D, KEC 해설서
   */
  uncertaintyRange?: {
    /** 최소값 (value - uncertainty) */
    min: number;
    /** 최대값 (value + uncertainty) */
    max: number;
    /** 불확실성 비율 (%) */
    tolerancePercent: number;
    /** 불확실성 근거 */
    basis?: string;
  };
  /** 경고 메시지 (PE 검토 필요 등) */
  warnings?: string[];
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
   
  calculator: (input: any) => DetailedCalcResult;
}

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------
/**
 * 호출자가 분기해야 하는 거부 사유. **메시지 문자열로 판별하지 말 것** —
 * 메시지는 번역되고, 번역되는 순간 `continue` 가 `throw` 로 뒤집힌다.
 */
export type CalcErrorCode = 'SIZE_UNAVAILABLE';

export class CalcValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
    /** 호출자가 분기할 때 쓰는 안정된 사유. 없으면 단순 거부다. */
    public readonly code?: CalcErrorCode,
  ) {
    super(message);
    this.name = 'CalcValidationError';
  }
}

/**
 * 공용 계층이 던진 거부의 **칸 이름만** 호출자 폼 이름으로 바꾼다.
 * 표 계층은 `size`·`method` 같은 제 이름을 쓰는데 그대로 422 로 나가면
 * 화면이 없는 칸을 짚는다.
 *
 * **감싸지 말 것.** 오류를 새로 만들어 메시지를 이어 붙이면 ① 내부 불변식
 * 500 이 422 로 뭉개지고 ② 원인이 다른 칸이어도 한 칸만 짚고 ③ 내부 표 키가
 * 사용자 응답에 실린다. 여기서는 종류도 메시지도 그대로 두고 이름만 옮긴다.
 */
export function remapErrorField<T>(
  fn: () => T,
  map: Readonly<Record<string, string>>,
  /**
   * 어느 표에서 났는지 — 붙이면 메시지 앞에 온다. 여러 표를 잇달아 조회하는
   * 계산기에서 필요하다(2.5mm² 를 넣었는데 "Wire size 14 …" 만 나오면 사용자가
   * 어느 단계인지 모른다 — NEC 는 AWG 로 환산해 조회하기 때문이다).
   *
   * `CalcValidationError` 에만 붙는다. 내부 불변식(500)은 손대지 않으므로
   * 내부 표 키가 이 경로로 새어 나갈 수 없다.
   */
  context?: string,
): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof CalcValidationError && (map[e.field] || context)) {
      const field = map[e.field] ?? e.field;
      throw new CalcValidationError(field, context ? `${context}: ${e.message}` : e.message);
    }
    throw e;
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
