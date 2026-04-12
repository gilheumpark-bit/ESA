/**
 * Dynamic Hybrid Search Weighting (α)
 *
 * Dynamically calculates the vector/keyword balance (alpha)
 * for hybrid search based on query characteristics.
 *
 * α = 0.0 → pure keyword (BM25)
 * α = 1.0 → pure semantic (vector)
 *
 * PART 1: Types
 * PART 2: Query classification
 * PART 3: Alpha calculator
 * PART 4: Feedback-adjusted alpha
 */

// ---------------------------------------------------------------------------
// PART 1 — Types
// ---------------------------------------------------------------------------

export interface ParsedQuery {
  /** Original raw query text */
  raw: string;
  /** Tokenized words */
  tokens: string[];
  /** Detected patterns */
  hasStandardRef: boolean;
  hasFormula: boolean;
  isQuestion: boolean;
  isMixed: boolean;
  wordCount: number;
}

export interface AlphaDecision {
  alpha: number;
  reason: string;
  queryType: 'standard-ref' | 'formula' | 'question' | 'mixed' | 'short' | 'long' | 'default';
}

// ---------------------------------------------------------------------------
// PART 2 — Query Classification
// ---------------------------------------------------------------------------

/**
 * Standard reference patterns (KEC, NEC, IEC, IEEE, etc.)
 * 예: KEC 232.3, NEC 210.8, IEC 60364-4-41
 */
const STANDARD_REF_PATTERN = /\b(KEC|NEC|IEC|IEEE|KS\s?C?|NFPA|BS)\s*[\d.-]+/i;

/**
 * Formula-like patterns
 * 예: V=IR, P=√3VIcosφ, I²t
 */
const FORMULA_PATTERN = /[A-Za-z]\s*[=≈≤≥<>]\s*[A-Za-z0-9√]/;

/**
 * Question words (Korean + English)
 */
const QUESTION_PATTERN = /^(what|how|why|when|where|which|can|is|does|뭐|어떻게|왜|언제|어디|무엇|얼마)/i;

/** Natural language suffixes (Korean question endings) */
const KO_QUESTION_SUFFIX = /(인가요|인가|일까요|일까|할까요|인지|인가요|ㅂ니까|나요|세요|합니까)\??$/;

export function parseQuery(raw: string): ParsedQuery {
  const tokens = raw.split(/\s+/).filter(Boolean);

  return {
    raw,
    tokens,
    hasStandardRef: STANDARD_REF_PATTERN.test(raw),
    hasFormula: FORMULA_PATTERN.test(raw),
    isQuestion: QUESTION_PATTERN.test(raw) || KO_QUESTION_SUFFIX.test(raw) || raw.endsWith('?'),
    isMixed: STANDARD_REF_PATTERN.test(raw) && tokens.length > 4,
    wordCount: tokens.length,
  };
}

// ---------------------------------------------------------------------------
// PART 3 — Alpha Calculator
// ---------------------------------------------------------------------------

/**
 * Calculate the optimal alpha (vector weight) for a given query.
 *
 * Rules (priority order):
 * 1. Exact standard reference → α=0.2 (favor keyword BM25)
 * 2. Formula query           → α=0.3 (partial keyword)
 * 3. Natural language question → α=0.8 (favor semantic)
 * 4. Mixed (standard + context) → α=0.5 (balanced)
 * 5. Short query (< 3 words)    → α=0.3
 * 6. Long query (> 10 words)    → α=0.8
 * 7. Default                    → α=0.5
 */
export function calculateAlpha(query: ParsedQuery | string): AlphaDecision {
  const q = typeof query === 'string' ? parseQuery(query) : query;

  // Rule 1: Exact standard reference (highest priority)
  if (q.hasStandardRef && !q.isMixed) {
    return {
      alpha: 0.2,
      reason: 'Exact standard reference detected — favor keyword search',
      queryType: 'standard-ref',
    };
  }

  // Rule 2: Formula
  if (q.hasFormula) {
    return {
      alpha: 0.3,
      reason: 'Formula pattern detected — partial keyword bias',
      queryType: 'formula',
    };
  }

  // Rule 3: Natural language question
  if (q.isQuestion && q.wordCount > 3) {
    return {
      alpha: 0.8,
      reason: 'Natural language question — favor semantic search',
      queryType: 'question',
    };
  }

  // Rule 4: Mixed (standard ref + surrounding context)
  if (q.isMixed) {
    return {
      alpha: 0.5,
      reason: 'Mixed query (standard ref + context) — balanced',
      queryType: 'mixed',
    };
  }

  // Rule 5: Short query
  if (q.wordCount < 3) {
    return {
      alpha: 0.3,
      reason: 'Short query (< 3 words) — keyword bias',
      queryType: 'short',
    };
  }

  // Rule 6: Long query
  if (q.wordCount > 10) {
    return {
      alpha: 0.8,
      reason: 'Long query (> 10 words) — semantic bias',
      queryType: 'long',
    };
  }

  // Rule 7: Default
  return {
    alpha: 0.5,
    reason: 'Default balanced weighting',
    queryType: 'default',
  };
}

// ---------------------------------------------------------------------------
// PART 4 — Feedback-Adjusted Alpha
// ---------------------------------------------------------------------------

/**
 * Adjust alpha based on user feedback.
 *
 * @param baseAlpha - The initially calculated alpha
 * @param feedbackScore - User feedback from -1.0 (bad) to +1.0 (good)
 *   - Positive feedback: results were good → keep alpha direction
 *   - Negative feedback: results were bad → shift alpha toward opposite mode
 * @returns Adjusted alpha, clamped to [0.0, 1.0]
 */
export function adjustAlphaFromFeedback(
  baseAlpha: number,
  feedbackScore: number,
): number {
  // feedbackScore 범위 제한
  const fb = Math.max(-1, Math.min(1, feedbackScore));

  // 양호 피드백: 현재 방향 유지 (약간 강화)
  // 부정 피드백: 반대 방향으로 이동
  const adjustment = fb * 0.15;

  // 피드백이 부정적이면 alpha를 반대로
  // (keyword 쪽이었으면 semantic 쪽으로, 반대도 동일)
  let adjusted: number;
  if (fb < 0) {
    // 나쁜 결과: alpha를 0.5 방향으로 이동 후 반대로 약간
    const towardCenter = (0.5 - baseAlpha) * 0.3;
    adjusted = baseAlpha + towardCenter - adjustment;
  } else {
    // 좋은 결과: 현재 방향 약간 강화
    adjusted = baseAlpha + adjustment * (baseAlpha > 0.5 ? 1 : -1);
  }

  return Math.max(0, Math.min(1, Math.round(adjusted * 100) / 100));
}
