/**
 * Triple-read OCR adjudication — majority alone is not enough.
 */

import type { OcrCandidateSet, OcrReading } from './types-v3';
import type { EvidenceBounds } from '../vision/evidence-types';

const CONFUSABLES: Array<[string, string]> = [
  ['PT', 'PPT'],
  ['VCB', 'VGB'],
  ['1', 'I'],
  ['1', 'L'],
  ['I', 'L'],
  ['B', '8'],
  ['0', 'O'],
  ['O', '0'],
];

export interface AdjudicateInput {
  displayId: string;
  pageIndex: number;
  bounds: EvidenceBounds;
  readings: OcrReading[];
  adjacentSymbolTypes?: string[];
  legendTerms?: string[];
  conflictingTags?: string[];
  standardTerms?: string[];
}

export function adjudicateOcr(input: AdjudicateInput): OcrCandidateSet {
  const adjacentSymbolTypes = input.adjacentSymbolTypes ?? [];
  const legendTerms = (input.legendTerms ?? []).map(normalize);
  const standardTerms = (input.standardTerms ?? []).map(normalize);
  const conflictingTags = (input.conflictingTags ?? []).map(normalize);

  const distinct = new Map<string, OcrReading>();
  for (const reading of input.readings) {
    const key = `${reading.variantId}:${reading.callId}`;
    const previous = distinct.get(key);
    if (!previous || reading.confidence > previous.confidence) distinct.set(key, reading);
  }
  const normalizedReadings = [...distinct.values()].map((r) => ({
    ...r,
    text: r.text.trim(),
    norm: normalize(r.text),
  }));

  if (normalizedReadings.length === 0 || normalizedReadings.every((r) => !r.norm)) {
    return baseSet(input, {
      status: 'UNREADABLE_TEXT',
      readings: input.readings,
    });
  }

  const counts = new Map<string, number>();
  for (const r of normalizedReadings) {
    if (!r.norm) continue;
    counts.set(r.norm, (counts.get(r.norm) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const candidates = ranked.map(([t]) => t);

  if (!top || ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
    return baseSet(input, {
      status: 'AMBIGUOUS',
      readings: input.readings,
      candidates: uniqueDisplay(normalizedReadings.map((r) => r.text)),
    });
  }

  const [winnerNorm] = top;
  const winnerDisplay = normalizedReadings.find((r) => r.norm === winnerNorm)?.text ?? winnerNorm;

  const requiredVariants: OcrReading['variantId'][] = [
    'original',
    'upscale-4x',
    'text-high-contrast',
  ];
  const variants = new Set(normalizedReadings.map((reading) => reading.variantId));
  const calls = new Set(normalizedReadings.map((reading) => reading.callId));
  const independentTripleRead = requiredVariants.every((variant) => variants.has(variant))
    && calls.size >= requiredVariants.length;
  const strokeCompatible = readingsStrokeCompatible(normalizedReadings.map((r) => r.norm));
  const symbolOk = !adjacentSymbolTypes.some((t) => symbolConflicts(winnerNorm, t));
  const lexiconOk =
    legendTerms.includes(winnerNorm)
    || standardTerms.includes(winnerNorm)
    || standardTerms.length === 0; // no lexicon provided → do not invent; require other checks
  const noTagDup = !conflictingTags.includes(winnerNorm);
  const majority = top[1] >= 2;

  // Strict: majority + same coord + stroke + symbol + not conflicting tags
  // Lexicon: if legend/standard provided, must hit; if neither, still need majority+context
  const lexiconRequired = legendTerms.length > 0 || standardTerms.length > 0;
  const lexiconPass = lexiconRequired
    ? legendTerms.includes(winnerNorm) || standardTerms.includes(winnerNorm)
    : true;

  if (independentTripleRead && majority && strokeCompatible && symbolOk && noTagDup && lexiconPass) {
    // Extra: adjacent voltage transformer context strengthens PT
    if (isConfusablePair(winnerNorm, candidates) && !contextSupports(winnerNorm, adjacentSymbolTypes, legendTerms)) {
      return baseSet(input, {
        status: 'AMBIGUOUS',
        readings: input.readings,
        candidates: uniqueDisplay(normalizedReadings.map((r) => r.text)),
      });
    }
    return baseSet(input, {
      status: 'CONFIRMED_BY_MAJORITY_AND_CONTEXT',
      readings: input.readings,
      confirmedText: winnerDisplay,
    });
  }

  void lexiconOk;
  return baseSet(input, {
    status: 'AMBIGUOUS',
    readings: input.readings,
    candidates: uniqueDisplay(normalizedReadings.map((r) => r.text)),
  });
}

function baseSet(
  input: AdjudicateInput,
  partial: Partial<OcrCandidateSet> & { status: OcrCandidateSet['status'] },
): OcrCandidateSet {
  return {
    displayId: input.displayId,
    pageIndex: input.pageIndex,
    bounds: input.bounds,
    readings: partial.readings ?? input.readings,
    context: {
      adjacentSymbolTypes: input.adjacentSymbolTypes ?? [],
      legendTerms: input.legendTerms ?? [],
      conflictingTags: input.conflictingTags ?? [],
    },
    status: partial.status,
    confirmedText: partial.confirmedText,
    candidates: partial.candidates,
  };
}

function normalize(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, '');
}

function readingsStrokeCompatible(norms: string[]): boolean {
  const nonEmpty = norms.filter(Boolean);
  if (nonEmpty.length <= 1) return true;
  return nonEmpty.every((a) => nonEmpty.every((b) => compatiblePair(a, b)));
}

function compatiblePair(a: string, b: string): boolean {
  if (a === b) return true;
  return CONFUSABLES.some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x) || a.includes(b) || b.includes(a),
  );
}

function isConfusablePair(winner: string, candidates: string[]): boolean {
  return candidates.some((c) => c !== winner && compatiblePair(winner, c));
}

function symbolConflicts(text: string, symbolType: string): boolean {
  const t = symbolType.toLowerCase();
  if (text === 'PT' || text === 'PPT') {
    return t.includes('breaker') || t.includes('vcb') || t.includes('acb');
  }
  if (text === 'VCB' || text === 'VGB') {
    return t.includes('transformer') && !t.includes('voltage');
  }
  return false;
}

function contextSupports(
  text: string,
  adjacent: string[],
  legend: string[],
): boolean {
  if (legend.includes(text)) return true;
  if (text === 'PT' || text === 'PPT') {
    return adjacent.some((a) =>
      /voltage|vt|pt|transformer/i.test(a));
  }
  if (text === 'VCB' || text === 'VGB') {
    return adjacent.some((a) => /breaker|vcb|switchgear/i.test(a));
  }
  return adjacent.length > 0;
}

function uniqueDisplay(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const k = normalize(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item.trim());
  }
  return out;
}
