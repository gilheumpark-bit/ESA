/**
 * ESVA RAG Search Pipeline — Retrieval-Augmented Generation search
 *
 * Hybrid search across Weaviate collections with license filtering,
 * freshness boosting, and graceful degradation.
 *
 * PART 1: Types
 * PART 2: Collection resolution
 * PART 3: Freshness boost
 * PART 4: License filtering
 * PART 5: Public API
 */

import { generateEmbedding } from './embedding';
import {
  FRESHNESS_HALF_LIFE_DAYS,
  FRESHNESS_MAX_BOOST,
  RAG_FETCH_LIMIT_CAP,
  RAG_HYBRID_ALPHA,
  RAG_SNIPPET_MAX_CHARS,
} from '@/lib/esa-config';
import {
  resolveCollections,
  hybridSearch,
  type ESACountry,
  type ESAGenre,
  type ESALicenseType,
  type WeaviateSearchHit,
} from './weaviate';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

/** A single RAG search result */
export interface RAGResult {
  title: string;
  snippet: string;
  source: string;
  url: string;
  standard?: string;
  clause?: string;
  publishedAt?: string;
  collectedAt?: string;
  licenseType: ESALicenseType;
  score: number;
  collection: string;
}

/** Options for the RAG search */
export interface RAGSearchOptions {
  query: string;
  country?: string;
  genre?: string;
  limit?: number;
  /** Additional metadata filters (key=property name, value=exact match) */
  filters?: Record<string, string>;
}

/** Internal scored hit before final output */
interface ScoredHit {
  hit: WeaviateSearchHit;
  collection: string;
  adjustedScore: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Collection Resolution
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine which Weaviate collections to search based on filters.
 * Falls back to all collections if no country/genre specified.
 */
function resolveTargetCollections(country?: string, genre?: string): string[] {
  const c = country as ESACountry | undefined;
  const g = genre as ESAGenre | undefined;
  return resolveCollections(c, g);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Freshness Boost (constants from @/lib/esa-config)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute a freshness multiplier for a document.
 * Newer documents receive a higher score boost (up to FRESHNESS_MAX_BOOST).
 * Very old or undated documents receive a multiplier of 1.0 (no boost).
 */
function computeFreshnessMultiplier(publishedAt?: string, collectedAt?: string): number {
  const dateStr = publishedAt || collectedAt;
  if (!dateStr) return 1.0;

  try {
    const docDate = new Date(dateStr);
    if (isNaN(docDate.getTime())) return 1.0;

    const now = Date.now();
    const ageDays = (now - docDate.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 0) return FRESHNESS_MAX_BOOST; // Future-dated (edge case)

    // Exponential decay: boost = 1 + (maxBoost - 1) * exp(-ageDays * ln2 / halfLife)
    const decayFactor = Math.exp((-ageDays * Math.LN2) / FRESHNESS_HALF_LIFE_DAYS);
    return 1.0 + (FRESHNESS_MAX_BOOST - 1.0) * decayFactor;
  } catch {
    return 1.0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — License Filtering
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Apply license restrictions to a search hit.
 * - 'open': full content returned
 * - 'summary_only': content truncated to summary field
 * - 'link_only': only title + url returned, no content snippet
 */
function applyLicenseFilter(hit: WeaviateSearchHit): { snippet: string; restricted: boolean } {
  const licenseType = (hit.license_type as string) ?? 'open';

  if (licenseType === 'link_only') {
    return {
      snippet: '[Content restricted — see source link]',
      restricted: true,
    };
  }

  if (licenseType === 'summary_only') {
    const summary = hit.summary as string | undefined;
    if (summary) {
      return { snippet: summary, restricted: false };
    }
    // Fall through to content if no summary available
  }

  // 'open' or fallback
  const content = (hit.content as string) ?? '';
  const maxSnippet = RAG_SNIPPET_MAX_CHARS;
  const snippet = content.length > maxSnippet
    ? content.slice(0, maxSnippet) + '...'
    : content;

  return { snippet, restricted: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a RAG search across relevant Weaviate collections.
 *
 * Steps:
 *  1. Resolve target collections from country/genre
 *  2. Generate query embedding
 *  3. Hybrid search: alpha from ESVA_RAG_ALPHA (default 0.7)
 *  4. Apply license filtering
 *  5. Apply freshness boost
 *  6. Merge, sort, and return top results
 *
 * Graceful degradation: returns empty array with console warning
 * if Weaviate is unavailable or embedding generation fails.
 */
export async function searchRAG(opts: RAGSearchOptions): Promise<RAGResult[]> {
  const { query, country, genre, limit = 10, filters } = opts;

  if (!query || !query.trim()) {
    return [];
  }

  // Step 1: Resolve target collections
  const collections = resolveTargetCollections(country, genre);
  if (collections.length === 0) {
    console.warn('[ESA/RAG] No collections resolved for given filters');
    return [];
  }

  // Step 2: Generate query embedding (best-effort, search can still work keyword-only)
  let _queryEmbedding: number[] | null = null;
  try {
    _queryEmbedding = await generateEmbedding(query);
  } catch (err) {
    console.warn(
      '[ESA/RAG] Embedding generation failed, falling back to keyword-only search:',
      (err as Error).message,
    );
  }

  // Step 3: Hybrid search across all target collections
  const allHits: ScoredHit[] = [];

  // Build Weaviate where-filter from additional filters
  let whereFilter: Record<string, unknown> | undefined;
  if (filters && Object.keys(filters).length > 0) {
    const operands = Object.entries(filters).map(([path, value]) => ({
      path: [path],
      operator: 'Equal' as const,
      valueText: value,
    }));

    whereFilter = operands.length === 1
      ? operands[0]
      : { operator: 'And', operands };
  }

  // Search collections in parallel
  const searchPromises = collections.map(async (collectionName) => {
    try {
      const hits = await hybridSearch(collectionName, query, {
        alpha: RAG_HYBRID_ALPHA,
        limit: Math.min(limit * 2, RAG_FETCH_LIMIT_CAP),
        where: whereFilter,
      });

      for (const hit of hits) {
        allHits.push({
          hit,
          collection: collectionName,
          adjustedScore: hit._additional.score ?? 0,
        });
      }
    } catch (err) {
      console.warn(
        `[ESA/RAG] Search failed on ${collectionName}:`,
        (err as Error).message,
      );
      // Continue with other collections
    }
  });

  try {
    await Promise.all(searchPromises);
  } catch (err) {
    console.warn('[ESA/RAG] Parallel search error:', (err as Error).message);
  }

  // If no results from any collection
  if (allHits.length === 0) {
    return [];
  }

  // Step 4 + 5: Apply license filter and freshness boost, build results
  const results: RAGResult[] = [];

  for (const { hit, collection, adjustedScore } of allHits) {
    const licenseType = (hit.license_type as ESALicenseType) ?? 'open';
    const { snippet } = applyLicenseFilter(hit);

    const publishedAt = hit.published_at as string | undefined;
    const collectedAt = hit.collected_at as string | undefined;
    const freshnessMultiplier = computeFreshnessMultiplier(publishedAt, collectedAt);

    const finalScore = adjustedScore * freshnessMultiplier;

    results.push({
      title: (hit.title as string) ?? 'Untitled',
      snippet,
      source: (hit.doc_type as string) ?? 'unknown',
      url: (hit.source_url as string) ?? '',
      standard: hit.standard as string | undefined,
      clause: hit.clause as string | undefined,
      publishedAt,
      collectedAt,
      licenseType,
      score: finalScore,
      collection,
    });
  }

  // Step 6: Sort by adjusted score (descending) and return top N
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
