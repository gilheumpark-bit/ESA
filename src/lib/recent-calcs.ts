'use client';

/**
 * Recent Calculations Store (localStorage: 'esa-recent-calcs')
 *
 * Single canonical schema + writer for the recent-calculation history that
 * both /receipt (list) and /mobile (field mode) read. Prior to this module
 * the key had two readers with divergent schemas and **no writer**, so the
 * history was permanently empty ("계산 이력이 없습니다") despite the copy
 * claiming it auto-saves. See bug H3.
 *
 * Entries record their owner because this store survives sign-out: a reader
 * sees anonymous work plus its own account's entries, never another account's.
 *
 * PART 1: Types & constants
 * PART 2: Read / write operations
 */

// ---------------------------------------------------------------------------
// PART 1 — Types & constants
// ---------------------------------------------------------------------------

/** localStorage key shared by every recent-calc reader/writer. */
export const RECENT_CALCS_KEY = 'esa-recent-calcs';

/** Cap to avoid unbounded localStorage growth. */
const MAX_RECENT_CALCS = 200;

/**
 * Canonical recent-calculation entry.
 *
 * Field set is the union both historical readers needed:
 *   - /receipt   used calcName, category, date, keyResult
 *   - /mobile    used calcName(← calculatorName), value, unit, date(← timestamp)
 */
export interface RecentCalcEntry {
  /** Receipt id — links to /receipt/[id]. */
  id: string;
  /** Human-readable calculator name (Korean). */
  calcName: string;
  /** UI category segment (e.g. "voltage-drop", "cable"). */
  category: string;
  /** ISO-8601 timestamp of the calculation. */
  date: string;
  /** Pre-formatted "값 단위" summary line. */
  keyResult: string;
  /** Primary numeric/string result value. */
  value: number | string;
  /** Result unit. */
  unit: string;
  /** Account that owns the calculation; null for anonymous work. */
  ownerId: string | null;
}

// ---------------------------------------------------------------------------
// PART 2 — Read / write
// ---------------------------------------------------------------------------

function isEntry(v: unknown): v is RecentCalcEntry {
  if (typeof v !== 'object' || v === null) return false;
  const entry = v as RecentCalcEntry;
  // Entries written before ownership was recorded cannot be attributed to an
  // account, and this store outlives sign-out, so they are not shown to anyone.
  return typeof entry.id === 'string' && (entry.ownerId === null || typeof entry.ownerId === 'string');
}

function readAll(): { entries: RecentCalcEntry[]; dirty: boolean } {
  const raw = localStorage.getItem(RECENT_CALCS_KEY);
  if (!raw) return { entries: [], dirty: false };
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return { entries: [], dirty: true };
  const owned = parsed.filter(isEntry);
  const entries = owned.slice(0, MAX_RECENT_CALCS);
  return { entries, dirty: entries.length !== parsed.length };
}

/**
 * Load the viewer's recent calculations (newest first): anonymous work plus
 * the account's own entries. Unattributable and overflow entries are pruned.
 */
export function loadRecentCalcs(uid: string | null = null): RecentCalcEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const { entries, dirty } = readAll();
    if (dirty) localStorage.setItem(RECENT_CALCS_KEY, JSON.stringify(entries));
    return entries.filter((entry) => entry.ownerId === null || entry.ownerId === uid);
  } catch {
    return [];
  }
}

/**
 * Record a calculation into history. De-duplicates by id (moving an existing
 * entry to the front), prepends newest-first, and caps the list.
 */
export function recordRecentCalc(entry: RecentCalcEntry): void {
  if (typeof window === 'undefined') return;
  try {
    // Every account's entries are kept; only the reader filters by viewer.
    const existing = readAll().entries.filter((e) => e.id !== entry.id);
    const next = [entry, ...existing].slice(0, MAX_RECENT_CALCS);
    localStorage.setItem(RECENT_CALCS_KEY, JSON.stringify(next));
  } catch {
    // localStorage quota exceeded or unavailable — history is best-effort.
  }
}
