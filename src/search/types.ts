/**
 * ESVA Search Engine — Type Definitions
 *
 * PART 1: Core document & query types
 * PART 2: Ranking result types
 * PART 3: Search response types
 * PART 4: Autocomplete types
 * PART 5: Prefetch types
 */

import type { SourceTag } from '@engine/sjc/types';
import type { CalculatorCategory } from '@engine/calculators/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Core Document & Query Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Access tier for standard documents */
export type StandardAccessTier = 'open' | 'summary_only' | 'link_only';

/** Verification status of a search document */
export type VerificationStatus = 'expert_verified' | 'auto_verified' | 'unverified';

/** Supported query intent categories */
export type QueryIntent =
  | 'search'
  | 'calculate'
  | 'compare'
  | 'standard_lookup'
  | 'definition';

/** Supported languages for query/display */
export type SupportedLanguage = 'ko' | 'en';

/** A document indexed in the ESVA search engine */
export interface SearchDocument {
  /** Unique document identifier */
  id: string;
  /** Document title */
  title: string;
  /** Document title in alternate language */
  titleAlt?: string;
  /** Full-text body (may be truncated for display) */
  body: string;
  /** Short summary or excerpt */
  excerpt?: string;
  /** URL to the source */
  url?: string;
  /** ISO-8601 date when the document was last updated */
  updatedAt: string;
  /** ISO-8601 date when the document was created */
  createdAt?: string;
  /** Standard references cited in this document */
  standardsCited: SourceTag[];
  /** Access tier for any standards referenced */
  accessTier: StandardAccessTier;
  /** Verification status */
  verification: VerificationStatus;
  /** Related calculator IDs */
  relatedCalculators: string[];
  /** Tags/keywords for indexing */
  tags: string[];
  /** Click-through rate (0-1), populated by analytics */
  ctr?: number;
  /** Total view count */
  viewCount?: number;
  /** Document language */
  language: SupportedLanguage;
  /** Content category */
  category?: string;
}

/** Entity extracted from a query by electrical NER */
export interface ElectricalEntity {
  /** Entity type */
  type:
    | 'voltage'
    | 'current'
    | 'power'
    | 'frequency'
    | 'cable_size'
    | 'equipment'
    | 'standard_ref'
    | 'resistance'
    | 'capacitance'
    | 'temperature';
  /** Raw matched text */
  raw: string;
  /** Normalized numeric value (if applicable) */
  value?: number;
  /** Engineering unit */
  unit?: string;
  /** Standard clause reference (for standard_ref type) */
  clause?: string;
}

/** Parsed and enriched query object */
export interface ParsedQuery {
  /** Original raw query string */
  original: string;
  /** Normalized (lowercased, trimmed, synonym-expanded) query */
  normalized: string;
  /** Classified user intent */
  intent: QueryIntent;
  /** Extracted electrical entities */
  entities: ElectricalEntity[];
  /** Detected query language */
  language: SupportedLanguage;
  /** Suggested calculator ID based on query analysis */
  suggestedCalculator?: string;
  /** Suggested standard reference based on query analysis */
  suggestedStandard?: string;
  /** Synonym-expanded search tokens */
  expandedTokens: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Ranking Result Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Breakdown of an EngRank score for transparency */
export interface EngRankBreakdown {
  /** Text-relevance / standard-match score [0-1] */
  standardScore: number;
  /** Freshness decay score [0-1] */
  freshnessScore: number;
  /** Verification quality score [0-1] */
  verificationScore: number;
  /** Calculator relevance boost [0-1] */
  calculatorRelevance: number;
  /** User behavior (CTR) score [0-1] */
  userBehaviorScore: number;
}

/** A search document annotated with its EngRank score */
export interface RankedResult {
  /** The original document */
  document: SearchDocument;
  /** Final composite EngRank score [0-1] */
  score: number;
  /** Score component breakdown */
  breakdown: EngRankBreakdown;
  /** Matched highlight snippets */
  highlights?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Search Response Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Featured calculator card displayed at top of results */
export interface FeaturedCalculator {
  /** Calculator ID from registry */
  id: string;
  /** Display name */
  name: string;
  /** English display name */
  nameEn: string;
  /** Calculator category */
  category: CalculatorCategory;
  /** Relevance score [0-1] */
  relevance: number;
}

/** Knowledge panel shown for definition queries */
export interface KnowledgePanel {
  /** Term being defined */
  term: string;
  /** IEC 60050 reference number, if applicable */
  iecRef?: string;
  /** Korean definition */
  definitionKo: string;
  /** English definition */
  definitionEn: string;
  /** Related terms */
  relatedTerms: string[];
  /** Related standard clauses */
  relatedStandards: SourceTag[];
}

/** Global comparison data for compare-intent queries */
export interface GlobalComparison {
  /** Items being compared */
  items: string[];
  /** Comparison dimensions */
  dimensions: {
    name: string;
    values: Record<string, string>;
  }[];
  /** Source of comparison data */
  source: SourceTag;
}

/** Complete search response payload */
export interface SearchResult {
  /** Ranked document results */
  documents: RankedResult[];
  /** Featured calculator (if query matches a calculator) */
  featuredCalculator?: FeaturedCalculator;
  /** Knowledge panel (for definition queries) */
  knowledgePanel?: KnowledgePanel;
  /** Related calculators sidebar */
  relatedCalcs: FeaturedCalculator[];
  /** Global comparison panel */
  globalComparison?: GlobalComparison;
  /** The parsed query that produced these results */
  query: ParsedQuery;
  /** Total matching documents (before pagination) */
  totalCount: number;
  /** Search latency in milliseconds */
  latencyMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Autocomplete Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Type of autocomplete suggestion */
export type SuggestionType = 'term' | 'calculator' | 'standard' | 'recent';

/** A single autocomplete suggestion */
export interface Suggestion {
  /** Display text for the suggestion */
  text: string;
  /** Category of suggestion */
  type: SuggestionType;
  /** Icon identifier for UI rendering */
  icon: string;
  /** Optional secondary label (e.g., English name, clause number) */
  subtitle?: string;
  /** Relevance score for internal sorting */
  score?: number;
}

/** Entry in the IEC 60050 autocomplete dictionary */
export interface AutocompleteDictEntry {
  /** Primary term (Korean) */
  term: string;
  /** English equivalent */
  termEn?: string;
  /** Synonym list (Korean + English abbreviations) */
  synonyms: string[];
  /** Category for grouping */
  category: string;
  /** Related calculator ID, if any */
  relatedCalc?: string;
  /** IEC 60050 reference number */
  iecRef?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Prefetch Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Cache entry for prefetched results */
export interface PrefetchCacheEntry {
  /** Cached search result */
  result: SearchResult;
  /** Timestamp when the result was cached */
  cachedAt: number;
  /** The query that produced this result */
  query: string;
}
