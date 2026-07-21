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
}

// ---------------------------------------------------------------------------
// PART 2 — Read / write
// ---------------------------------------------------------------------------

function isEntry(v: unknown): v is RecentCalcEntry {
  return typeof v === 'object' && v !== null && typeof (v as RecentCalcEntry).id === 'string';
}

/** Load recent calculations (newest first), trimming any overflow in place. */
export function loadRecentCalcs(): RecentCalcEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_CALCS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries = parsed.filter(isEntry);
    if (entries.length > MAX_RECENT_CALCS) {
      const trimmed = entries.slice(0, MAX_RECENT_CALCS);
      localStorage.setItem(RECENT_CALCS_KEY, JSON.stringify(trimmed));
      return trimmed;
    }
    return entries;
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
    const existing = loadRecentCalcs().filter((e) => e.id !== entry.id);
    const next = [entry, ...existing].slice(0, MAX_RECENT_CALCS);
    localStorage.setItem(RECENT_CALCS_KEY, JSON.stringify(next));
  } catch {
    // localStorage quota exceeded or unavailable — history is best-effort.
  }
}
