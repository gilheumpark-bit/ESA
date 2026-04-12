/**
 * ESVA Search Engine — Prefetch Manager
 *
 * Google Instant-style prefetching with debounce, LRU cache, and abort control.
 *
 * PART 1: LRU cache implementation
 * PART 2: PrefetchManager class
 */

import type { SearchResult } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — LRU Cache
// ═══════════════════════════════════════════════════════════════════════════════

interface CacheNode<V> {
  key: string;
  value: V;
  cachedAt: number;
}

/**
 * Simple LRU cache with max-size eviction and TTL expiry.
 */
class LRUCache<V> {
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly entries: Map<string, CacheNode<V>> = new Map();

  constructor(maxSize: number, ttlMs: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): V | null {
    const node = this.entries.get(key);
    if (!node) return null;

    // Check TTL
    if (Date.now() - node.cachedAt > this.ttlMs) {
      this.entries.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.entries.delete(key);
    this.entries.set(key, node);
    return node.value;
  }

  set(key: string, value: V): void {
    // Remove if exists (to re-insert at end)
    this.entries.delete(key);

    // Evict oldest if at capacity
    if (this.entries.size >= this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }

    this.entries.set(key, {
      key,
      value,
      cachedAt: Date.now(),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — PrefetchManager Class
// ═══════════════════════════════════════════════════════════════════════════════

/** Signature for the search function that PrefetchManager calls internally. */
export type SearchFn = (query: string) => Promise<SearchResult>;

/**
 * PrefetchManager: triggers background search after a debounce delay,
 * caches results in an LRU cache, and aborts in-flight requests
 * when the query changes.
 *
 * Usage:
 * ```ts
 * const manager = new PrefetchManager(searchFn);
 * manager.prefetch("변압기 용량");       // starts after 300ms debounce
 * const result = manager.getCached("변압기 용량"); // null until ready
 * // ... later, after prefetch completes:
 * const result2 = manager.getCached("변압기 용량"); // SearchResult
 * ```
 */
export class PrefetchManager {
  /** LRU cache: max 50 entries, 5 min TTL */
  private readonly cache: LRUCache<SearchResult>;
  /** The search function to call for prefetching */
  private readonly searchFn: SearchFn;
  /** Debounce delay in milliseconds */
  private readonly debounceMs: number;
  /** Current debounce timer handle */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Current in-flight AbortController */
  private currentAbort: AbortController | null = null;
  /** The query currently being prefetched */
  private currentQuery: string | null = null;
  /** Set of queries currently in-flight (for dedup) */
  private readonly inFlight: Set<string> = new Set();
  /** Event listeners for prefetch completion */
  private readonly listeners: Map<string, ((result: SearchResult) => void)[]> = new Map();

  constructor(
    searchFn: SearchFn,
    options?: {
      maxCacheSize?: number;
      cacheTtlMs?: number;
      debounceMs?: number;
    },
  ) {
    this.searchFn = searchFn;
    this.debounceMs = options?.debounceMs ?? 300;
    this.cache = new LRUCache<SearchResult>(
      options?.maxCacheSize ?? 50,
      options?.cacheTtlMs ?? 5 * 60 * 1000,
    );
  }

  /**
   * Trigger a prefetch for the given query.
   * Debounces by `debounceMs` (default 300ms).
   * Aborts any in-flight request for a different query.
   */
  prefetch(query: string): void {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) return;

    // Already cached — nothing to do
    if (this.cache.has(normalized)) return;

    // Clear previous debounce timer
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Abort previous in-flight request if it's for a different query
    if (this.currentQuery !== null && this.currentQuery !== normalized) {
      this.abort();
    }

    // Set up debounced fetch
    this.debounceTimer = setTimeout(() => {
      this.executePrefetch(normalized);
    }, this.debounceMs);
  }

  /**
   * Get a cached prefetch result, or null if not yet available.
   */
  getCached(query: string): SearchResult | null {
    const normalized = query.trim().toLowerCase();
    return this.cache.get(normalized);
  }

  /**
   * Invalidate a cached result for the given query.
   */
  invalidate(query: string): void {
    const normalized = query.trim().toLowerCase();
    this.cache.delete(normalized);
  }

  /**
   * Register a callback for when a specific query's prefetch completes.
   * The callback is invoked once and then removed.
   */
  onReady(query: string, callback: (result: SearchResult) => void): void {
    const normalized = query.trim().toLowerCase();

    // If already cached, invoke immediately
    const cached = this.cache.get(normalized);
    if (cached) {
      callback(cached);
      return;
    }

    // Register listener
    const existing = this.listeners.get(normalized) ?? [];
    existing.push(callback);
    this.listeners.set(normalized, existing);
  }

  /**
   * Abort the current in-flight prefetch request.
   */
  abort(): void {
    if (this.currentAbort) {
      this.currentAbort.abort();
      this.currentAbort = null;
    }
    if (this.currentQuery) {
      this.inFlight.delete(this.currentQuery);
      this.currentQuery = null;
    }
  }

  /**
   * Clear the entire cache and abort in-flight requests.
   */
  clear(): void {
    this.abort();
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.cache.clear();
    this.listeners.clear();
    this.inFlight.clear();
  }

  /** Number of entries currently in the cache */
  get cacheSize(): number {
    return this.cache.size;
  }

  /** Whether a prefetch is currently in flight */
  get isFetching(): boolean {
    return this.currentQuery !== null;
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private async executePrefetch(normalizedQuery: string): Promise<void> {
    // Skip if already in-flight or cached
    if (this.inFlight.has(normalizedQuery)) return;
    if (this.cache.has(normalizedQuery)) return;

    this.currentQuery = normalizedQuery;
    this.inFlight.add(normalizedQuery);
    this.currentAbort = new AbortController();
    const { signal } = this.currentAbort;

    try {
      const result = await this.searchFn(normalizedQuery);

      // Check if aborted while awaiting
      if (signal.aborted) return;

      // Store in cache
      this.cache.set(normalizedQuery, result);

      // Notify listeners
      const callbacks = this.listeners.get(normalizedQuery);
      if (callbacks) {
        for (const cb of callbacks) {
          try {
            cb(result);
          } catch {
            // Swallow listener errors
          }
        }
        this.listeners.delete(normalizedQuery);
      }
    } catch (err: unknown) {
      // Ignore abort errors; log others in development
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'AbortError') return;
      // In production, silently fail prefetch (non-critical)
      if (process.env.NODE_ENV === 'development') {
        console.warn('[PrefetchManager] prefetch failed:', normalizedQuery, err);
      }
    } finally {
      this.inFlight.delete(normalizedQuery);
      if (this.currentQuery === normalizedQuery) {
        this.currentQuery = null;
        this.currentAbort = null;
      }
    }
  }
}
