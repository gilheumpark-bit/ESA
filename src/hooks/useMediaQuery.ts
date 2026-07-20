/**
 * Responsive Media Query Hooks
 *
 * PART 1: useMediaQuery (generic)
 * PART 2: useIsMobile / useIsTablet (convenience)
 */

import { useCallback, useSyncExternalStore } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Generic useMediaQuery
// ═══════════════════════════════════════════════════════════════════════════════

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((notify: () => void) => {
    const mql = window.matchMedia(query);
    const handler = () => notify();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Convenience Hooks
// ═══════════════════════════════════════════════════════════════════════════════

/** True when viewport <= 768px */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 768px)');
}

/** True when viewport <= 1024px */
export function useIsTablet(): boolean {
  return useMediaQuery('(max-width: 1024px)');
}
