import type { EvidenceRef, RatedValue, SymbolNode, TextNode } from './types-v3';
import { parseRatedQuantities } from './rated-quantities';

type Box = EvidenceRef['bounds'];
function valid(box: Box): boolean {
  return [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0;
}
function gap(a: Box, b: Box): number {
  return Math.hypot(Math.max(0, a.x - b.x - b.w, b.x - a.x - a.w),
    Math.max(0, a.y - b.y - b.h, b.y - a.y - a.h));
}
function contains(a: Box, b: Box): boolean {
  return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
}

/** Proximity supplies candidates, not a proof. Confirm a unique explicit tag
 * or enclosing equipment body on the same page; retain conflicts and raw values. */
export function ratedValueAssignment(text: TextNode, symbols: SymbolNode[]): NonNullable<RatedValue['assignment']> {
  const source = text.evidence[0];
  const none = (reason: NonNullable<RatedValue['assignment']>['reason']): NonNullable<RatedValue['assignment']> =>
    ({ certainty: 'unread', candidateSymbolIds: [], reason });
  if (!source || !valid(source.bounds)) return none('missing-geometry');
  const raw = text.confirmedText ?? text.rawText;
  const candidates = symbols.flatMap((symbol) => {
    const evidence = symbol.evidence.filter((item) => item.pageIndex === source.pageIndex && valid(item.bounds));
    if (!evidence.length) return [];
    const tag = symbol.rawLabel?.trim();
    const specific = tag && /^(?:[\p{L}]{1,12}(?:[-_][\p{L}\d]+)+|[\p{L}]{1,8}\d{1,4})$/u.test(tag);
    const escaped = tag?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const explicit = specific && new RegExp(`(?<![\\p{L}\\p{N}_-])${escaped}(?![\\p{L}\\p{N}_-])`, 'iu').test(raw);
    return [{ symbol, explicit: Boolean(explicit), enclosed: evidence.some((item) => contains(item.bounds, source.bounds)),
      near: evidence.some((item) => gap(item.bounds, source.bounds) <= 2 * Math.max(item.bounds.w, item.bounds.h, source.bounds.h)) }];
  });
  const explicit = candidates.filter((item) => item.explicit), enclosed = candidates.filter((item) => item.enclosed);
  const pool = explicit.length ? explicit : enclosed.length ? enclosed : candidates.filter((item) => item.near);
  const ids = [...new Set(pool.map((item) => item.symbol.id))].sort();
  if (!ids.length) return none('no-local-owner');
  const proved = ids.length === 1 && (explicit.length > 0 || enclosed.length > 0);
  return { certainty: proved ? 'confirmed' : 'ambiguous', candidateSymbolIds: ids,
    ...(proved ? { symbolId: ids[0] } : {}),
    reason: ids.length > 1 ? 'multiple-owners' : explicit.length ? 'explicit-tag' : enclosed.length ? 'enclosing-body' : 'proximity-only' };
}

export function extractRatedValues(texts: TextNode[], symbols: SymbolNode[]): RatedValue[] {
  const values: RatedValue[] = [], byId = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  for (const text of [...texts].sort((a, b) => a.id.localeCompare(b.id))) {
    const raw = text.confirmedText ?? text.rawText, assignment = ratedValueAssignment(text, symbols);
    const owner = assignment.symbolId ? byId.get(assignment.symbolId) : undefined;
    for (const quantity of parseRatedQuantities(raw)) {
      values.push({ id: `rv-${text.id}-${quantity.offset}`, displayId: text.displayId, sourceTextId: text.id,
        field: quantity.unit.toLowerCase(), raw, normalized: { value: quantity.value, unit: quantity.unit },
        readingCertainty: text.certainty, assignment,
        certainty: text.certainty === 'unread' ? 'unread'
          : text.certainty === 'confirmed' && assignment.certainty === 'confirmed' ? 'confirmed' : 'ambiguous',
        evidence: text.evidence, equipmentId: assignment.certainty === 'confirmed' ? owner?.equipmentId : undefined });
    }
  }
  return values;
}
