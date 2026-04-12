/**
 * Local Search Fallback Module
 *
 * PART 1: Types
 * PART 2: Scoring helpers
 * PART 3: Search implementation — searches ELECTRICAL_TERMS, STANDARD_REFS, CALCULATOR_REGISTRY
 *
 * Ultimate fallback when Weaviate/RAG/Agent are all unavailable.
 */

import { ELECTRICAL_TERMS } from '@/data/iec-60050/electrical-terms';
import { STANDARD_REFS } from '@/data/standards/standard-refs';
import { CALCULATOR_REGISTRY } from '@/engine/calculators';

// ---------------------------------------------------------------------------
// PART 1 — Types
// ---------------------------------------------------------------------------

export interface LocalSearchResult {
  title: string;
  description: string;
  type: 'term' | 'standard' | 'calculator';
  score: number;
  url?: string;
  standardRef?: string;
  calcId?: string;
}

// ---------------------------------------------------------------------------
// PART 2 — Scoring helpers
// ---------------------------------------------------------------------------

function normalise(s: string): string {
  return s.toLowerCase().trim();
}

function scoreMatch(needle: string, haystack: string): number {
  const n = normalise(needle);
  const h = normalise(haystack);
  if (h === n) return 100;                // exact match
  if (h.startsWith(n)) return 80;         // starts with
  if (h.includes(n)) return 60;           // contains
  return 0;
}

function bestScore(needle: string, candidates: string[]): number {
  let best = 0;
  for (const c of candidates) {
    const s = scoreMatch(needle, c);
    if (s > best) best = s;
    if (best === 100) break;
  }
  return best;
}

// ---------------------------------------------------------------------------
// PART 3 — Search implementation
// ---------------------------------------------------------------------------

function searchTerms(query: string, lang?: string): LocalSearchResult[] {
  const results: LocalSearchResult[] = [];

  for (const term of ELECTRICAL_TERMS) {
    const candidates: string[] = [term.ko, term.en, ...term.synonyms];
    if (term.ja) candidates.push(term.ja);
    if (term.zh) candidates.push(term.zh);

    const score = bestScore(query, candidates);
    if (score <= 0) continue;

    const title = lang === 'en' ? term.en : term.ko;
    const altName = lang === 'en' ? term.ko : term.en;

    results.push({
      title,
      description: `${altName} — ${term.category}${term.iecRef ? ` (IEC ${term.iecRef})` : ''}`,
      type: 'term',
      score,
      calcId: term.relatedCalc,
    });
  }

  return results;
}

function searchStandards(query: string): LocalSearchResult[] {
  const results: LocalSearchResult[] = [];

  for (const ref of STANDARD_REFS) {
    const candidates: string[] = [
      ref.standard,
      ref.title_ko,
      ref.title_en,
      ref.clause ?? '',
      `${ref.standard} ${ref.clause ?? ''}`.trim(),
    ];

    const score = bestScore(query, candidates);
    if (score <= 0) continue;

    results.push({
      title: `${ref.standard} ${ref.clause ?? ''}`.trim(),
      description: `${ref.title_ko} (${ref.title_en})`,
      type: 'standard',
      score,
      url: ref.url,
      standardRef: `${ref.standard} ${ref.clause ?? ''}`.trim(),
    });
  }

  return results;
}

function searchCalculators(query: string): LocalSearchResult[] {
  const results: LocalSearchResult[] = [];

  for (const [, entry] of CALCULATOR_REGISTRY) {
    const candidates: string[] = [entry.id, entry.name, entry.nameEn, entry.category];

    const score = bestScore(query, candidates);
    if (score <= 0) continue;

    results.push({
      title: entry.name,
      description: `${entry.nameEn} — ${entry.category} (${entry.difficulty})`,
      type: 'calculator',
      score,
      url: `/calc/${entry.category}/${entry.id}`,
      calcId: entry.id,
    });
  }

  return results;
}

/**
 * Search through all local data sources.
 * Returns top 20 results sorted by relevance score.
 */
export function searchLocalData(query: string, lang?: string): LocalSearchResult[] {
  if (!query || query.trim().length === 0) return [];

  const all: LocalSearchResult[] = [
    ...searchTerms(query, lang),
    ...searchStandards(query),
    ...searchCalculators(query),
  ];

  all.sort((a, b) => b.score - a.score);

  return all.slice(0, 20);
}
