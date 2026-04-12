/**
 * ESVA Search Engine — Barrel Export
 *
 * Re-exports all search modules for clean consumption.
 */

// Types
export type {
  SearchDocument,
  ParsedQuery,
  ElectricalEntity,
  RankedResult,
  EngRankBreakdown,
  SearchResult,
  FeaturedCalculator,
  KnowledgePanel,
  GlobalComparison,
  Suggestion,
  SuggestionType,
  AutocompleteDictEntry,
  PrefetchCacheEntry,
  StandardAccessTier,
  VerificationStatus,
  QueryIntent,
  SupportedLanguage,
} from './types';

// Query parser
export { parseQuery } from './query-parser';
export { ELECTRICAL_PATTERNS, IEC_60050_SYNONYMS } from './query-parser';

// EngRank algorithm
export { calculateEngRank, rankResults } from './eng-rank';

// Autocomplete
export {
  getAutocompleteSuggestions,
  recordRecentSearch,
  AUTOCOMPLETE_DICTIONARY,
} from './autocomplete';

// Prefetch manager
export { PrefetchManager } from './prefetch';
export type { SearchFn } from './prefetch';
