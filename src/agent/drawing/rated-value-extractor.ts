import type { RatedValue, SymbolNode, TextNode, EvidenceRef } from './types-v3';

/** Shared maximal-unit tokenization. A capacity (kVA) is never a voltage (kV).
 * Full labels and character spans remain available; multiple nameplate values are not discarded. */
export function readRatedMeasurements(raw: string): Array<{ value: number; unit: string; start: number; end: number }> {
  const pattern = /(?<![\d.,])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(MVAR|kVAR|kVA|MVA|kVL|kV|kA|kW|MW|mm²|mm2|A|V)(?![A-Za-z\d])/gi;
  return [...raw.matchAll(pattern)].flatMap((match) => {
    const value = Number(match[1].replace(/,/g, ''));
    return Number.isFinite(value) ? [{ value, unit: match[2], start: match.index, end: match.index + match[0].length }] : [];
  });
}
const validBounds = (e: EvidenceRef) => [e.bounds.x, e.bounds.y, e.bounds.w, e.bounds.h].every(Number.isFinite)
  && e.bounds.w > 0 && e.bounds.h > 0;
function ownership(text: TextNode, symbols: SymbolNode[]): NonNullable<RatedValue['ownership']> {
  const evidence = text.evidence.find(validBounds);
  if (!evidence) return { status: 'unread', candidates: [], reason: 'missing-location' };
  const box = evidence.bounds;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const candidates = symbols.flatMap((symbol) => {
    const bounds = symbol.evidence.filter((e) => e.pageIndex === evidence.pageIndex && validBounds(e));
    if (!bounds.length) return [];
    const contained = bounds.some(({ bounds: b }) => box.x >= b.x && box.y >= b.y && box.x + box.w <= b.x + b.w && box.y + box.h <= b.y + b.h);
    const distance = Math.min(...bounds.map(({ bounds: b }) => Math.hypot(cx - b.x - b.w / 2, cy - b.y - b.h / 2)));
    return contained || distance <= 120 ? [{ symbol, contained, distance }] : [];
  });
  const contained = candidates.filter((item) => item.contained);
  if (contained.length === 1 && contained[0].symbol.certainty === 'confirmed' && contained[0].symbol.equipmentId) {
    return { status: 'confirmed', candidates: [contained[0].symbol.id], reason: 'unique-contained-label' };
  }
  // Proximity proposes an owner; it does not prove which equipment owns the value.
  return { status: candidates.length ? 'ambiguous' : 'unread',
    candidates: candidates.sort((a, b) => a.distance - b.distance || a.symbol.id.localeCompare(b.symbol.id)).map((item) => item.symbol.id),
    reason: candidates.length ? 'owner-review-required' : 'no-nearby-owner' };
}

export function extractRatedValues(texts: TextNode[], symbols: SymbolNode[]): RatedValue[] {
  const values: RatedValue[] = [];
  for (const text of texts) {
    const raw = text.confirmedText ?? text.rawText;
    const measured = readRatedMeasurements(raw);
    if (!measured.length) continue;
    const owner = ownership(text, symbols);
    for (const match of measured) {
      values.push({ id: `rv-${values.length + 1}`, displayId: text.displayId, field: match.unit.toLowerCase(), raw,
        normalized: { value: match.value, unit: match.unit }, certainty: text.certainty, evidence: text.evidence,
        textSpan: { start: match.start, end: match.end }, ownership: { ...owner, candidates: [...owner.candidates] },
        equipmentId: owner.status === 'confirmed' ? symbols.find((symbol) => symbol.id === owner.candidates[0])?.equipmentId : undefined });
    }
  }
  return values;
}
