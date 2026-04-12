/**
 * ESVA 4-Layer Cache System
 * ─────────────────────────
 * Layer 1: In-memory LRU (50 entries, 5 min TTL) — hot data
 * Layer 2: sessionStorage (browser) — current session
 * Layer 3: IndexedDB (browser) — offline persistence
 * Layer 4: Server cache headers — set by API routes
 *
 * PART 1: Types & constants
 * PART 2: Layer 1 — In-memory LRU
 * PART 3: Layer 2 — sessionStorage wrapper
 * PART 4: Layer 3 — IndexedDB wrapper
 * PART 5: ESACache class — unified 4-layer interface
 * PART 6: Pre-configured cache instances
 */

// ─── PART 1: Types & Constants ─────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

const DEFAULT_MAX_ENTRIES = 50;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

const isBrowser = typeof window !== 'undefined';

// ─── PART 2: Layer 1 — In-Memory LRU Cache ─────────────────────

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ─── PART 3: Layer 2 — sessionStorage Wrapper ──────────────────

class SessionStorageLayer {
  private readonly prefix: string;

  constructor(prefix: string) {
    this.prefix = `esa-cache:${prefix}:`;
  }

  get<T>(key: string): T | null {
    if (!isBrowser) return null;

    try {
      const raw = sessionStorage.getItem(this.prefix + key);
      if (!raw) return null;

      const entry: CacheEntry<T> = JSON.parse(raw);
      if (Date.now() > entry.expiresAt) {
        sessionStorage.removeItem(this.prefix + key);
        return null;
      }

      return entry.value;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
    if (!isBrowser) return;

    try {
      const entry: CacheEntry<T> = {
        value,
        expiresAt: Date.now() + ttlMs,
      };
      sessionStorage.setItem(this.prefix + key, JSON.stringify(entry));
    } catch {
      // sessionStorage might be full or disabled — silently ignore
    }
  }

  delete(key: string): void {
    if (!isBrowser) return;
    try {
      sessionStorage.removeItem(this.prefix + key);
    } catch {
      // ignore
    }
  }
}

// ─── PART 4: Layer 3 — IndexedDB Wrapper ───────────────────────

class IndexedDBLayer {
  private readonly dbName: string;
  private readonly storeName = 'cache';
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(namespace: string) {
    this.dbName = `esa-cache-${namespace}`;
  }

  private openDB(): Promise<IDBDatabase> {
    if (!isBrowser || typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB not available'));
    }

    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!isBrowser) return null;

    try {
      const db = await this.openDB();
      return new Promise<T | null>((resolve) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          const entry = request.result as CacheEntry<T> | undefined;
          if (!entry) {
            resolve(null);
            return;
          }

          if (Date.now() > entry.expiresAt) {
            // Expired — schedule cleanup
            this.delete(key).catch(() => {});
            resolve(null);
            return;
          }

          resolve(entry.value);
        };

        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
    if (!isBrowser) return;

    try {
      const db = await this.openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const entry: CacheEntry<T> = {
          value,
          expiresAt: Date.now() + ttlMs,
        };
        const request = store.put(entry, key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      // IndexedDB write failed — silently ignore
    }
  }

  async delete(key: string): Promise<void> {
    if (!isBrowser) return;

    try {
      const db = await this.openDB();
      return new Promise<void>((resolve) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      });
    } catch {
      // ignore
    }
  }
}

// ─── PART 5: ESACache — Unified 4-Layer Interface ──────────────

export class ESACache {
  private readonly memory: LRUCache<unknown>;
  private readonly session: SessionStorageLayer;
  private readonly idb: IndexedDBLayer;
  private stats = { hits: 0, misses: 0 };

  constructor(
    namespace: string,
    maxMemoryEntries: number = DEFAULT_MAX_ENTRIES,
  ) {
    this.memory = new LRUCache<unknown>(maxMemoryEntries);
    this.session = new SessionStorageLayer(namespace);
    this.idb = new IndexedDBLayer(namespace);
  }

  /**
   * Get from cache, checking layers in order: memory → sessionStorage → IndexedDB.
   * On hit from a lower layer, promotes to higher layers.
   */
  async get<T>(key: string): Promise<T | null> {
    // Layer 1: In-memory LRU
    const memResult = this.memory.get(key) as T | null;
    if (memResult !== null) {
      this.stats.hits++;
      return memResult;
    }

    // Layer 2: sessionStorage
    const sessionResult = this.session.get<T>(key);
    if (sessionResult !== null) {
      this.stats.hits++;
      // Promote to memory
      this.memory.set(key, sessionResult);
      return sessionResult;
    }

    // Layer 3: IndexedDB
    const idbResult = await this.idb.get<T>(key);
    if (idbResult !== null) {
      this.stats.hits++;
      // Promote to memory + session
      this.memory.set(key, idbResult);
      this.session.set(key, idbResult);
      return idbResult;
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Write to all applicable layers.
   * Layer 4 (server cache headers) is set by API routes directly.
   */
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttl = ttlMs ?? DEFAULT_TTL_MS;

    // Layer 1: Memory
    this.memory.set(key, value, ttl);

    // Layer 2: sessionStorage
    this.session.set(key, value, ttl);

    // Layer 3: IndexedDB
    await this.idb.set(key, value, ttl);
  }

  /**
   * Clear key from all layers.
   */
  async invalidate(key: string): Promise<void> {
    this.memory.delete(key);
    this.session.delete(key);
    await this.idb.delete(key);
  }

  /**
   * Returns hit/miss statistics for this cache instance.
   */
  getCacheStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total === 0 ? 0 : this.stats.hits / total,
    };
  }
}

// ─── PART 6: Pre-configured Instances ──────────────────────────

/** Cache for calculation results */
export const calcCache = new ESACache('calc', 50);

/** Cache for search results */
export const searchCache = new ESACache('search', 30);

/** Cache for standard reference lookups */
export const standardCache = new ESACache('standard', 100);
