/**
 * Client-side Receipt Cache (sessionStorage)
 *
 * PART 1: Constants & helpers
 * PART 2: Cache operations — save, get, getLastReceipt
 *
 * Graceful degradation: allows export API to work without Supabase
 * by keeping receipts in the browser session.
 */

import type { Receipt } from '@/engine/receipt/types';

// ---------------------------------------------------------------------------
// PART 1 — Constants & helpers
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'esa-receipt-';
const INDEX_KEY = 'esa-receipt-index';
const MAX_CACHED = 10;

function isSessionStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const test = '__esa_test__';
    sessionStorage.setItem(test, '1');
    sessionStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

function getIndex(): string[] {
  if (!isSessionStorageAvailable()) return [];
  try {
    const raw = sessionStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function setIndex(ids: string[]): void {
  if (!isSessionStorageAvailable()) return;
  sessionStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

// ---------------------------------------------------------------------------
// PART 2 — Cache operations
// ---------------------------------------------------------------------------

/** Save a receipt to sessionStorage. Evicts oldest when over MAX_CACHED. */
export function cacheReceipt(receipt: Receipt): void {
  if (!isSessionStorageAvailable()) return;

  try {
    const ids = getIndex().filter((id) => id !== receipt.id);
    ids.push(receipt.id);

    // Evict oldest if over limit
    while (ids.length > MAX_CACHED) {
      const evicted = ids.shift();
      if (evicted) {
        sessionStorage.removeItem(STORAGE_PREFIX + evicted);
      }
    }

    sessionStorage.setItem(STORAGE_PREFIX + receipt.id, JSON.stringify(receipt));
    setIndex(ids);
  } catch {
    // sessionStorage full or other error — silently ignore
  }
}

/** Retrieve a cached receipt by ID. */
export function getCachedReceipt(id?: string): Receipt | null {
  if (!id || !isSessionStorageAvailable()) return null;

  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as Receipt;
  } catch {
    return null;
  }
}

/** Get the most recently cached receipt. */
export function getLastReceipt(): Receipt | null {
  if (!isSessionStorageAvailable()) return null;

  try {
    const ids = getIndex();
    if (ids.length === 0) return null;
    const lastId = ids[ids.length - 1];
    return getCachedReceipt(lastId);
  } catch {
    return null;
  }
}
