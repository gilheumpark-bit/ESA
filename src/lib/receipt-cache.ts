/**
 * Client-side Receipt Cache (sessionStorage)
 *
 * PART 1: Constants & helpers
 * PART 2: Cache operations — save, get, getLastReceipt, remove
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
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Same owner rule as history-read-model: no userId (or 'anonymous') is local anonymous work. */
function ownerOf(receipt: Receipt): string | null {
  return receipt.userId && receipt.userId !== 'anonymous' ? receipt.userId : null;
}

function setIndex(ids: string[]): void {
  if (!isSessionStorageAvailable()) return;
  sessionStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

// ---------------------------------------------------------------------------
// PART 2 — Cache operations
// ---------------------------------------------------------------------------

/**
 * Save a receipt to sessionStorage. Evicts oldest when over MAX_CACHED.
 * Only the scope that owns the receipt (`uid`, or null when signed out) may cache it.
 */
export function cacheReceipt(receipt: Receipt, uid: string | null = null): void {
  if (!isSessionStorageAvailable() || ownerOf(receipt) !== uid) return;

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

/**
 * Retrieve a cached receipt by ID for the viewer `uid` (null when signed out).
 * Another account's receipt is never returned; anonymous work stays readable.
 */
export function getCachedReceipt(id?: string, uid: string | null = null): Receipt | null {
  if (!id || !isSessionStorageAvailable()) return null;

  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    const receipt = JSON.parse(raw) as Receipt;
    if (receipt?.id !== id) return null;
    const owner = ownerOf(receipt);
    return owner === null || owner === uid ? receipt : null;
  } catch {
    return null;
  }
}

/** Get the most recently cached receipt readable by `uid`. */
export function getLastReceipt(uid: string | null = null): Receipt | null {
  if (!isSessionStorageAvailable()) return null;

  try {
    const ids = getIndex();
    if (ids.length === 0) return null;
    const lastId = ids[ids.length - 1];
    return getCachedReceipt(lastId, uid);
  } catch {
    return null;
  }
}

/** An explicit access denial invalidates the offline copy too. */
export function removeCachedReceipt(id: string): void {
  if (!isSessionStorageAvailable()) return;
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + id);
    setIndex(getIndex().filter((entry) => entry !== id));
  } catch {
    // Storage can be disabled independently of the API.
  }
}
