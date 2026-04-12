/**
 * Source-Judgment-Confidence (SJC) Types
 *
 * Every calculation result in ESVA carries provenance metadata:
 *   - SourceTag: which standard/clause produced the value
 *   - Judgment: pass/fail determination with severity
 *   - Confidence: 0-1 scale indicating reliability of the result
 */

// ---------------------------------------------------------------------------
// SourceTag — traces a value back to a specific standard clause
// ---------------------------------------------------------------------------
export interface SourceTag {
  /** Standard identifier, e.g. "KEC", "NEC", "IEC 60364" */
  standard: string;
  /** Clause reference, e.g. "232.3", "310.16", "Table 52-C1" */
  clause: string;
  /** Edition or year of the standard, e.g. "2021", "2023 Edition" */
  edition?: string;
  /** ISO-8601 date when this mapping was last verified against the standard */
  verifiedAt?: string;
  /** URL to the official standard or reference document */
  url?: string;
}

// ---------------------------------------------------------------------------
// Judgment — pass/fail result of a standards-based check
// ---------------------------------------------------------------------------
export type Severity = 'info' | 'warning' | 'error';

export interface Judgment {
  /** Whether the check passed */
  pass: boolean;
  /** Human-readable explanation */
  message: string;
  /** Severity level: info (note), warning (review needed), error (violation) */
  severity: Severity;
  /** Optional back-reference to the standard clause that was checked */
  standardRef?: string;
}

// ---------------------------------------------------------------------------
// Confidence — quantified reliability of a computed value
// ---------------------------------------------------------------------------
export interface Confidence {
  /** 0.0 = no confidence, 1.0 = absolute certainty */
  value: number;
  /** Human-readable reason for the confidence level */
  reason: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function createSource(
  standard: string,
  clause: string,
  opts?: Partial<Omit<SourceTag, 'standard' | 'clause'>>,
): SourceTag {
  return { standard, clause, ...opts };
}

export function createJudgment(
  pass: boolean,
  message: string,
  severity: Severity = pass ? 'info' : 'error',
  standardRef?: string,
): Judgment {
  return { pass, message, severity, standardRef };
}

export function createConfidence(value: number, reason: string): Confidence {
  if (value < 0 || value > 1) {
    throw new RangeError(`Confidence value must be 0-1, got ${value}`);
  }
  return { value, reason };
}
