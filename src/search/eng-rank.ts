/**
 * ESVA Search Engine — EngRank Algorithm
 *
 * ESA's equivalent of PageRank, tuned for electrical engineering search.
 *
 * Score = alpha * standardScore
 *       + beta  * freshnessScore
 *       + gamma * verificationScore
 *       + delta * calculatorRelevance
 *       + epsilon * userBehaviorScore
 *
 * PART 1: Weight constants
 * PART 2: Individual scoring functions
 * PART 3: Composite EngRank calculation
 * PART 4: Batch ranking with sort
 */

import type {
  SearchDocument,
  ParsedQuery,
  RankedResult,
  EngRankBreakdown,
  StandardAccessTier,
  VerificationStatus,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Weight Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** Standard-match text relevance weight */
const ALPHA = 0.3;
/** Freshness (recency) weight */
const BETA = 0.2;
/** Verification quality weight */
const GAMMA = 0.2;
/** Calculator relevance weight */
const DELTA = 0.2;
/** User behavior (CTR) weight */
const EPSILON = 0.1;

/** Freshness half-life in days: score halves every 365 days */
const FRESHNESS_HALF_LIFE_DAYS = 365;

/** Access tier scores: open access gets full credit */
const ACCESS_TIER_SCORES: Record<StandardAccessTier, number> = {
  open: 1.0,
  summary_only: 0.6,
  link_only: 0.3,
};

/** Verification status scores */
const VERIFICATION_SCORES: Record<VerificationStatus, number> = {
  expert_verified: 1.0,
  auto_verified: 0.6,
  unverified: 0.2,
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Individual Scoring Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standard score: measures how well the document matches the query
 * based on standard citations and access tier.
 *
 * Components:
 * - Number of standards cited (logarithmic scale, capped at 1.0)
 * - Access tier bonus
 * - Token overlap between query and document
 */
function computeStandardScore(doc: SearchDocument, query: ParsedQuery): number {
  // Citation count component (log scale: 0 citations = 0, 5+ = ~1.0)
  const citationCount = doc.standardsCited.length;
  const citationScore = Math.min(1.0, Math.log2(citationCount + 1) / Math.log2(6));

  // Access tier component
  const tierScore = ACCESS_TIER_SCORES[doc.accessTier];

  // Text overlap: count how many expanded query tokens appear in doc
  const docText = `${doc.title} ${doc.body} ${doc.tags.join(' ')}`.toLowerCase();
  let matchCount = 0;
  for (const token of query.expandedTokens) {
    if (token.length >= 2 && docText.includes(token.toLowerCase())) {
      matchCount++;
    }
  }
  const tokenCount = Math.max(query.expandedTokens.length, 1);
  const overlapScore = Math.min(1.0, matchCount / tokenCount);

  // Standard clause exact match bonus
  let clauseBonus = 0;
  if (query.suggestedStandard) {
    const clauseLower = query.suggestedStandard.toLowerCase();
    const hasExactClause = doc.standardsCited.some(
      (s) => `${s.standard} ${s.clause}`.toLowerCase() === clauseLower,
    );
    if (hasExactClause) {
      clauseBonus = 0.3;
    }
  }

  // Weighted combination: overlap is primary, then citations + tier, with clause bonus on top
  const base = citationScore * 0.2 + tierScore * 0.2 + overlapScore * 0.4;
  return Math.min(1.0, base + clauseBonus * 0.2);
}

/**
 * Freshness score: exponential decay based on document age.
 * Uses the formula: score = 2^(-age_days / half_life)
 */
function computeFreshnessScore(doc: SearchDocument): number {
  const now = Date.now();
  const updatedAt = new Date(doc.updatedAt).getTime();
  if (Number.isNaN(updatedAt)) {
    return 0.1; // Invalid date fallback
  }
  const ageDays = Math.max(0, (now - updatedAt) / (1000 * 60 * 60 * 24));
  return Math.pow(2, -ageDays / FRESHNESS_HALF_LIFE_DAYS);
}

/**
 * Verification score: direct mapping from verification status.
 */
function computeVerificationScore(doc: SearchDocument): number {
  return VERIFICATION_SCORES[doc.verification];
}

/**
 * Calculator relevance: boost if the document is related to the
 * calculator suggested by the query.
 */
function computeCalculatorRelevance(doc: SearchDocument, query: ParsedQuery): number {
  if (!query.suggestedCalculator) {
    return 0.0;
  }

  // Direct match: document lists the suggested calculator
  if (doc.relatedCalculators.includes(query.suggestedCalculator)) {
    return 1.0;
  }

  // Partial match: document has any related calculators in common category
  if (doc.relatedCalculators.length > 0) {
    return 0.3;
  }

  return 0.0;
}

/**
 * User behavior score: based on click-through rate.
 * Placeholder that uses CTR when available, falls back to a baseline.
 */
function computeUserBehaviorScore(doc: SearchDocument): number {
  if (doc.ctr !== undefined && doc.ctr >= 0) {
    return Math.min(1.0, doc.ctr);
  }
  // Fallback: use view count as a weak signal (log scale)
  if (doc.viewCount !== undefined && doc.viewCount > 0) {
    return Math.min(1.0, Math.log10(doc.viewCount) / 4); // 10k views = 1.0
  }
  return 0.3; // Neutral baseline for new documents
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Composite EngRank Calculation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate the EngRank score for a single document against a query.
 *
 * @param doc   - The search document to score
 * @param query - The parsed query to score against
 * @returns Final EngRank score in [0, 1]
 */
export function calculateEngRank(
  doc: SearchDocument,
  query: ParsedQuery,
): { score: number; breakdown: EngRankBreakdown } {
  const standardScore = computeStandardScore(doc, query);
  const freshnessScore = computeFreshnessScore(doc);
  const verificationScore = computeVerificationScore(doc);
  const calculatorRelevance = computeCalculatorRelevance(doc, query);
  const userBehaviorScore = computeUserBehaviorScore(doc);

  const score =
    ALPHA * standardScore +
    BETA * freshnessScore +
    GAMMA * verificationScore +
    DELTA * calculatorRelevance +
    EPSILON * userBehaviorScore;

  const breakdown: EngRankBreakdown = {
    standardScore,
    freshnessScore,
    verificationScore,
    calculatorRelevance,
    userBehaviorScore,
  };

  return { score: Math.min(1.0, Math.max(0, score)), breakdown };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Batch Ranking with Sort
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rank an array of documents against a query.
 * Returns results sorted by EngRank score in descending order.
 *
 * @param docs  - Array of search documents to rank
 * @param query - The parsed query
 * @returns Sorted array of RankedResult objects
 */
export function rankResults(
  docs: SearchDocument[],
  query: ParsedQuery,
): RankedResult[] {
  const results: RankedResult[] = docs.map((doc) => {
    const { score, breakdown } = calculateEngRank(doc, query);
    return {
      document: doc,
      score,
      breakdown,
    };
  });

  // Sort descending by score; ties broken by freshness then verification
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.breakdown.freshnessScore !== a.breakdown.freshnessScore) {
      return b.breakdown.freshnessScore - a.breakdown.freshnessScore;
    }
    return b.breakdown.verificationScore - a.breakdown.verificationScore;
  });

  return results;
}
