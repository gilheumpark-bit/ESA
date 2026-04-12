'use client';

/**
 * useUrlParams Hook — URL parameter synchronization
 *
 * PART 1: Type helpers
 * PART 2: Hook implementation — read from URL, write via replaceState
 */

import { useState, useCallback, useEffect, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Type Helpers
// ═══════════════════════════════════════════════════════════════════════════════

type Serializable = string | number | boolean;

/** Infer the shape: each key maps to a serializable value */
type ParamShape = Record<string, Serializable>;

function parseValue<T extends Serializable>(raw: string, defaultVal: T): T {
  if (typeof defaultVal === 'number') {
    const n = Number(raw);
    return (isNaN(n) ? defaultVal : n) as T;
  }
  if (typeof defaultVal === 'boolean') {
    return (raw === 'true' || raw === '1') as unknown as T;
  }
  return raw as unknown as T;
}

function serializeValue(val: Serializable): string {
  return String(val);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Hook
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Syncs state with URL search parameters.
 *
 * - On mount: reads from `window.location.search` and merges with defaults
 * - On update: calls `history.replaceState` (no navigation / re-render loop)
 * - Type-safe: numbers are parsed, booleans handled ("true"/"1")
 */
export function useUrlParams<T extends ParamShape>(
  defaults: T,
): [T, (updates: Partial<T>) => void] {
  const defaultsRef = useRef(defaults);

  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaults;

    const params = new URLSearchParams(window.location.search);
    const merged = { ...defaults } as Record<string, Serializable>;

    for (const key of Object.keys(defaults)) {
      const raw = params.get(key);
      if (raw !== null) {
        merged[key] = parseValue(raw, defaults[key]);
      }
    }

    return merged as T;
  });

  // Sync URL on state change (skip initial mount if no URL params present)
  const isInitial = useRef(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // On first render, only write URL if there were actual params
    if (isInitial.current) {
      isInitial.current = false;
      const params = new URLSearchParams(window.location.search);
      if (params.toString() === '') return;
    }

    const params = new URLSearchParams();
    const defs = defaultsRef.current;

    for (const [key, val] of Object.entries(state)) {
      // Only include non-default values to keep URL clean
      if (val !== defs[key]) {
        params.set(key, serializeValue(val));
      }
    }

    const qs = params.toString();
    const newUrl = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;

    if (newUrl !== `${window.location.pathname}${window.location.search}`) {
      history.replaceState(null, '', newUrl);
    }
  }, [state]);

  const update = useCallback((updates: Partial<T>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  return [state, update];
}
