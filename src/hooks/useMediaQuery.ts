/**
 * Responsive Media Query Hooks
 *
 * PART 1: useMediaQuery (generic)
 * PART 2: useIsMobile / useIsTablet (convenience)
 */

import { useState, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Generic useMediaQuery
// ═══════════════════════════════════════════════════════════════════════════════

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
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
