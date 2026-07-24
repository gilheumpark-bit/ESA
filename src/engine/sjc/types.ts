/**
 * Source-Judgment-Confidence (SJC) Types
 *
 * Every calculation result in ESVA carries provenance metadata:
 *   - SourceTag: which standard/clause produced the value
 *   - Judgment: pass/fail determination with severity
 *   - Confidence: 0-1 scale indicating reliability of the result
 */

import { citationOrigin } from '@engine/standards/citation-registry';

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

/**
 * 출처 태그를 만든다.
 *
 * 이 저장소는 기준서 원문 문장을 담지 않으므로(저작권·판본 변경), 영수증이
 * 내보내는 근거는 조항 번호뿐이다. 사용자가 그 번호를 들고 원문을 확인할 수
 * 있도록, 호출자가 `url`을 주지 않으면 발행기관의 원문 경로를 자동으로 붙인다.
 * 호출자가 더 구체적인 링크를 준 경우에는 그것을 그대로 존중한다.
 */
export function createSource(
  standard: string,
  clause: string,
  opts?: Partial<Omit<SourceTag, 'standard' | 'clause'>>,
): SourceTag {
  const tag: SourceTag = { standard, clause, ...opts };
  if (tag.url === undefined) {
    const origin = citationOrigin(standard);
    if (origin) tag.url = origin.url;
  }
  return tag;
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
