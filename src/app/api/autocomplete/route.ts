/**
 * ESVA Autocomplete API — /api/autocomplete
 * ──────────────────────────────────────────
 * GET: Return autocomplete suggestions for partial queries.
 * No auth required. Designed for fast response (<50ms).
 *
 * PART 1: Query parameter parsing
 * PART 2: GET handler
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { getAutocompleteSuggestions } from '@search/autocomplete';
import type { SupportedLanguage } from '@search/types';

// ─── PART 1: GET Handler ────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const blocked = applyRateLimit(request, 'default');
    if (blocked) return blocked;

    const { searchParams } = request.nextUrl;

    const q = searchParams.get('q') ?? '';
    const lang = (searchParams.get('lang') ?? 'ko') as SupportedLanguage;
    const limitParam = searchParams.get('limit');
    const limit = Math.min(20, Math.max(1, parseInt(limitParam ?? '8', 10)));

    // Validate language
    if (lang !== 'ko' && lang !== 'en') {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-3020', message: 'Invalid language. Use "ko" or "en".' } },
        { status: 400 },
      );
    }

    // Query can be empty (returns recent/popular suggestions)
    if (q.length > 200) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-3021', message: 'Query too long (max 200 chars)' } },
        { status: 400 },
      );
    }

    const suggestions = getAutocompleteSuggestions(q, lang, limit);

    return NextResponse.json(
      { success: true, data: suggestions },
      {
        status: 200,
        headers: {
          // Cache autocomplete results aggressively
          'Cache-Control': 'public, max-age=120, s-maxage=600, stale-while-revalidate=300',
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ESVA /api/autocomplete] Error:', message);

    return NextResponse.json(
      { success: false, error: { code: 'ESVA-3999', message: 'Autocomplete error' } },
      { status: 500 },
    );
  }
}
