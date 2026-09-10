/** Retrieval results are evidence candidates, not an automatic standards approval. */
import { generateEmbedding } from './embedding';
import { FRESHNESS_HALF_LIFE_DAYS, FRESHNESS_MAX_BOOST, RAG_FETCH_LIMIT_CAP, RAG_HYBRID_ALPHA, RAG_SNIPPET_MAX_CHARS } from './esa-config';
import { resolveCollections, hybridSearch, type ESACountry, type ESAGenre, type ESALicenseType, type WeaviateSearchHit } from './weaviate';

export interface RAGResult {
  title: string; snippet: string; source: string; url: string; standard?: string; clause?: string;
  publishedAt?: string; collectedAt?: string; licenseType: ESALicenseType; score: number; collection: string;
}
export interface RAGDiagnostics {
  mode: 'hybrid' | 'keyword-only'; attemptedCollections: number; failedCollections: number;
  status: 'complete' | 'partial' | 'unavailable';
}
export interface RAGSearchOptions {
  query: string; country?: string; genre?: string; limit?: number; filters?: Record<string, string>;
  embeddingByok?: { provider: 'openai' | 'gemini'; apiKey: string };
  /** Request-scoped observer; never shared across users or stored with credentials. */
  onDiagnostics?: (value: RAGDiagnostics) => void;
}
const COUNTRIES = new Set(['kr', 'us', 'eu', 'jp', 'global']);
const GENRES = new Set(['electrical', 'mechanical', 'fire', 'energy', 'ai', 'general']);
const FILTERS = new Set(['standard', 'clause', 'country', 'genre', 'source_url', 'license_type', 'doc_type', 'parent_id', 'doc_hash']);
const str = (value: unknown) => typeof value === 'string' ? value : undefined;
export function sourceUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
/** Future-dated or invalid metadata does not gain a freshness bonus. */
export function ragFreshness(publishedAt?: string, collectedAt?: string, now = Date.now()): number {
  const date = Date.parse(publishedAt || collectedAt || '');
  if (!Number.isFinite(date) || date > now) return 1;
  const days = (now - date) / 86_400_000;
  return 1 + (FRESHNESS_MAX_BOOST - 1) * Math.exp(-days * Math.LN2 / FRESHNESS_HALF_LIFE_DAYS);
}
function snippetFor(hit: WeaviateSearchHit, license: ESALicenseType): string {
  if (license === 'link_only') return '[Content restricted — see source link]';
  const text = license === 'summary_only' ? str(hit.summary) : str(hit.content);
  if (!text?.trim()) return license === 'summary_only' ? '[Summary unavailable — see source link]' : '';
  return text.length > RAG_SNIPPET_MAX_CHARS ? `${text.slice(0, RAG_SNIPPET_MAX_CHARS)}...` : text;
}

export async function searchRAG(opts: RAGSearchOptions): Promise<RAGResult[]> {
  const { query, embeddingByok } = opts;
  if (typeof query !== 'string' || !query.trim()) return [];
  if (query.length > 2000) throw new Error('Retrieval query is too long');
  const limit = opts.limit ?? 10;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid retrieval limit');
  let country = opts.country?.toLowerCase();
  if (country === 'iec') country = 'eu';
  const genre = opts.genre?.toLowerCase();
  if ((country && !COUNTRIES.has(country)) || (genre && !GENRES.has(genre))) throw new Error('Invalid retrieval scope');
  const filters = Object.entries(opts.filters ?? {});
  if (filters.length > 16 || filters.some(([name, value]) => !FILTERS.has(name) || typeof value !== 'string' || value.length > 2048)) {
    throw new Error('Invalid retrieval filters');
  }
  const collections = resolveCollections(country as ESACountry | undefined, genre as ESAGenre | undefined);
  let embedding: number[] | null = null;
  try {
    const result = await generateEmbedding(query, embeddingByok?.provider, embeddingByok?.apiKey);
    if (Array.isArray(result) && result.length > 0 && result.every(Number.isFinite)) embedding = result;
  } catch { /* Keyword fallback is explicit below; do not log the key or request. */ }
  const operands = filters.map(([name, value]) => ({ path: [name], operator: 'Equal', valueText: value }));
  const where = operands.length === 1 ? operands[0] : operands.length ? { operator: 'And', operands } : undefined;
  const buckets: WeaviateSearchHit[][] = collections.map(() => []);
  let cursor = 0, failed = 0;
  // Bound collection fan-out, retaining deterministic merge order.
  await Promise.all(Array.from({ length: Math.min(4, collections.length) }, async () => {
    while (cursor < collections.length) {
      const index = cursor++;
      try {
        buckets[index] = await hybridSearch(collections[index], query, {
          alpha: embedding ? RAG_HYBRID_ALPHA : 0, limit: Math.min(limit * 2, RAG_FETCH_LIMIT_CAP),
          where, ...(embedding ? { vector: embedding } : {}), failOnError: true,
        });
      } catch { failed++; }
    }
  }));
  opts.onDiagnostics?.({ mode: embedding ? 'hybrid' : 'keyword-only', attemptedCollections: collections.length,
    failedCollections: failed, status: !collections.length || failed === collections.length ? 'unavailable' : failed ? 'partial' : 'complete' });
  const results: Array<RAGResult & { identity: string }> = [];
  const now = Date.now();
  for (let index = 0; index < buckets.length; index++) {
    for (const hit of buckets[index]) {
      if (!hit || !hit._additional || !Number.isFinite(hit._additional.score)) continue;
      const license = ['open', 'summary_only', 'link_only'].includes(String(hit.license_type)) ? hit.license_type as ESALicenseType : 'link_only';
      const url = sourceUrl(hit.source_url), standard = str(hit.standard), clause = str(hit.clause);
      const publishedAt = str(hit.published_at), collectedAt = str(hit.collected_at);
      // Distinct clauses/chunks must remain distinct even when they share a URL.
      const identity = str(hit.doc_hash) ? `hash:${hit.doc_hash}:${clause ?? ''}` : `${collections[index]}:${hit._additional.id}`;
      results.push({ identity, title: str(hit.title) ?? 'Untitled', snippet: snippetFor(hit, license),
        source: str(hit.doc_type) ?? 'unknown', url, standard, clause, publishedAt, collectedAt,
        licenseType: license, score: hit._additional.score * ragFreshness(publishedAt, collectedAt, now), collection: collections[index] });
    }
  }
  results.sort((a, b) => b.score - a.score || a.identity.localeCompare(b.identity));
  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.identity)) return false;
    seen.add(result.identity); return true;
  }).slice(0, limit).map(({ identity, ...result }) => { void identity; return result; });
}
