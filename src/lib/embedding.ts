/**
 * ESVA Embedding Generation — Vector embedding for RAG pipeline
 *
 * Supports OpenAI text-embedding-3-small (default) and Google text-embedding-004.
 * Uses BYOK key resolution from server-ai.ts with provider fallback.
 *
 * PART 1: Types & constants
 * PART 2: LRU cache
 * PART 3: Provider implementations
 * PART 4: Public API
 */

import { resolveProviderKey } from './server-ai';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Constants
// ═══════════════════════════════════════════════════════════════════════════════

export type EmbeddingProvider = 'openai' | 'gemini';

interface EmbeddingConfig {
  model: string;
  dimensions: number;
  endpoint: string;
  providerId: string;
}

const PROVIDER_CONFIGS: Record<EmbeddingProvider, EmbeddingConfig> = {
  openai: {
    model: 'text-embedding-3-small',
    dimensions: 1536,
    endpoint: 'https://api.openai.com/v1/embeddings',
    providerId: 'openai',
  },
  gemini: {
    model: 'text-embedding-004',
    dimensions: 768,
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent',
    providerId: 'gemini',
  },
};

/** Provider preference order for fallback */
const FALLBACK_ORDER: EmbeddingProvider[] = ['openai', 'gemini'];

const LRU_MAX_ENTRIES = 500;

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — LRU Cache
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simple LRU cache keyed by text hash.
 * Evicts least-recently-used entries when capacity exceeded.
 */
class EmbeddingCache {
  private cache = new Map<string, number[]>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /** Simple hash for cache key — FNV-1a inspired */
  private hash(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  get(text: string): number[] | undefined {
    const key = this.hash(text);
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(text: string, embedding: number[]): void {
    const key = this.hash(text);
    // Delete first to refresh position if already present
    this.cache.delete(key);
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, embedding);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

const embeddingCache = new EmbeddingCache(LRU_MAX_ENTRIES);

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Provider Implementations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Call OpenAI embeddings API.
 */
async function callOpenAI(texts: string[], apiKey: string): Promise<number[][]> {
  const config = PROVIDER_CONFIGS.openai;

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: texts,
      dimensions: config.dimensions,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI embedding failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const json = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
  };

  // Sort by index to maintain input order
  const sorted = json.data.sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

/**
 * Call Google Generative AI embeddings API.
 */
async function callGemini(texts: string[], apiKey: string): Promise<number[][]> {
  const results: number[][] = [];

  // Google embedding API processes one text at a time via embedContent
  // Use batchEmbedContents for efficiency
  const batchEndpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${apiKey}`;

  const requests = texts.map((text) => ({
    model: 'models/text-embedding-004',
    content: { parts: [{ text }] },
  }));

  const response = await fetch(batchEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gemini embedding failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const json = (await response.json()) as {
    embeddings: Array<{ values: number[] }>;
  };

  for (const emb of json.embeddings) {
    results.push(emb.values);
  }

  return results;
}

/**
 * Dispatch to the appropriate provider.
 */
async function callProvider(
  provider: EmbeddingProvider,
  texts: string[],
): Promise<number[][]> {
  const config = PROVIDER_CONFIGS[provider];
  const { key } = resolveProviderKey(config.providerId);

  switch (provider) {
    case 'openai':
      return callOpenAI(texts, key);
    case 'gemini':
      return callGemini(texts, key);
    default:
      throw new Error(`[ESA/Embedding] Unknown provider: ${provider}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate an embedding vector for a single text.
 *
 * Uses LRU cache (500 entries) keyed by text hash.
 * Falls back between providers if one fails.
 *
 * @param text - The text to embed
 * @param provider - Preferred provider ('openai' | 'gemini'). Falls back if unavailable.
 * @returns Embedding vector as number[]
 */
export async function generateEmbedding(
  text: string,
  provider?: EmbeddingProvider | string,
): Promise<number[]> {
  if (!text || !text.trim()) {
    throw new Error('[ESA/Embedding] Cannot embed empty text');
  }

  const trimmed = text.trim();

  // Check cache first
  const cached = embeddingCache.get(trimmed);
  if (cached) return cached;

  // Build provider attempt order
  const preferred = (provider as EmbeddingProvider) ?? 'openai';
  const attemptOrder: EmbeddingProvider[] = [
    preferred,
    ...FALLBACK_ORDER.filter((p) => p !== preferred),
  ];

  let lastError: Error | null = null;

  for (const p of attemptOrder) {
    try {
      const [embedding] = await callProvider(p, [trimmed]);
      embeddingCache.set(trimmed, embedding);
      return embedding;
    } catch (err) {
      lastError = err as Error;
      console.warn(`[ESA/Embedding] Provider ${p} failed, trying next:`, lastError.message);
    }
  }

  throw new Error(
    `[ESA/Embedding] All providers failed. Last error: ${lastError?.message ?? 'unknown'}`,
  );
}

/**
 * Generate embeddings for multiple texts in batch.
 *
 * Texts already in cache are served from cache; only uncached texts
 * are sent to the provider API. Falls back between providers on failure.
 *
 * @param texts - Array of texts to embed
 * @param provider - Preferred provider
 * @returns Array of embedding vectors (same order as input)
 */
export async function generateEmbeddings(
  texts: string[],
  provider?: EmbeddingProvider | string,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const trimmed = texts.map((t) => t.trim());
  const results: (number[] | null)[] = new Array(trimmed.length).fill(null);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  // Separate cached from uncached
  for (let i = 0; i < trimmed.length; i++) {
    const cached = embeddingCache.get(trimmed[i]);
    if (cached) {
      results[i] = cached;
    } else {
      uncachedIndices.push(i);
      uncachedTexts.push(trimmed[i]);
    }
  }

  // Embed uncached texts
  if (uncachedTexts.length > 0) {
    const preferred = (provider as EmbeddingProvider) ?? 'openai';
    const attemptOrder: EmbeddingProvider[] = [
      preferred,
      ...FALLBACK_ORDER.filter((p) => p !== preferred),
    ];

    let embeddings: number[][] | null = null;
    let lastError: Error | null = null;

    for (const p of attemptOrder) {
      try {
        embeddings = await callProvider(p, uncachedTexts);
        break;
      } catch (err) {
        lastError = err as Error;
        console.warn(`[ESA/Embedding] Batch provider ${p} failed:`, lastError.message);
      }
    }

    if (!embeddings) {
      throw new Error(
        `[ESA/Embedding] All providers failed for batch. Last error: ${lastError?.message ?? 'unknown'}`,
      );
    }

    // Map results back and populate cache
    for (let j = 0; j < uncachedIndices.length; j++) {
      const idx = uncachedIndices[j];
      results[idx] = embeddings[j];
      embeddingCache.set(uncachedTexts[j], embeddings[j]);
    }
  }

  return results as number[][];
}

/**
 * Clear the embedding cache. Useful for testing or memory pressure.
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

/**
 * Get current cache statistics.
 */
export function getEmbeddingCacheStats(): { size: number; maxSize: number } {
  return { size: embeddingCache.size, maxSize: LRU_MAX_ENTRIES };
}
