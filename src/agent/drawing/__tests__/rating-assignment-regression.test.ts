import { extractRatedValues } from '../rated-value-extractor';
import { parseRatedQuantities, quantityVolts } from '../rated-quantities';
import { reconcileCrossPage } from '../cross-page-graph';
import type { EvidenceRef, SymbolNode, TextNode } from '../types-v3';

const evidence = (id: string, pageIndex: number, x: number, y = 0, w = 20, h = 20): EvidenceRef[] =>
  [{ evidenceId: `e-${id}`, pageIndex, bounds: { x, y, w, h }, confidence: 1 }];
export const ratingSymbol = (id: string, pageIndex = 0, x = 0, label = id): SymbolNode => ({
  id, displayId: `P0${pageIndex + 1}-${id}`, equipmentId: `eq-${id}`, rawLabel: label, confirmedType: 'breaker',
  typeCandidates: ['breaker'], certainty: 'confirmed', evidence: evidence(id, pageIndex, x),
});
export const ratingText = (id: string, raw: string, pageIndex = 0, x = 2, y = 2): TextNode => ({
  id, displayId: `P0${pageIndex + 1}-${id}`, rawText: raw, confirmedText: raw, candidates: [raw], certainty: 'confirmed',
  evidence: evidence(id, pageIndex, x, y, 10, 5),
});
const ref = [{ pageIndex: 0, targetPageHint: 1, text: 'SHEET 2', bounds: { x: 0, y: 0, w: 10, h: 10 } }];

describe('reading and ownership are different claims', () => {
  it('preserves all physical quantities instead of only the first rating', () => {
    const values = extractRatedValues([ratingText('t1', '22.9kV / 380V / 1000kVA')], [ratingSymbol('s1')]);
    expect(values.map((item) => item.normalized)).toEqual([{ value: 22.9, unit: 'kV' }, { value: 380, unit: 'V' }, { value: 1000, unit: 'kVA' }]);
    expect(values.map((item) => item.field)).toEqual(['voltage', 'voltage', 'capacity']);
    expect(new Set(values.map((item) => item.id)).size).toBe(3);
  });
  it('does not assign an equidistant rating by input-array order', () => {
    const symbols = [ratingSymbol('a', 0, 0), ratingSymbol('b', 0, 40)], texts = [ratingText('t', '100A', 0, 25, 30)];
    const forward = extractRatedValues(texts, symbols)[0], reverse = extractRatedValues(texts, [...symbols].reverse())[0];
    expect(forward).toEqual(reverse);
    expect(forward).toMatchObject({ certainty: 'ambiguous', readingCertainty: 'confirmed', equipmentId: undefined,
      assignment: { certainty: 'ambiguous', candidateSymbolIds: ['a', 'b'], reason: 'multiple-owners' } });
  });
  it('retains distant readable values without inventing an owner', () => {
    const value = extractRatedValues([ratingText('t', '100A', 0, 10000)], [ratingSymbol('a')])[0];
    expect(value.normalized).toEqual({ value: 100, unit: 'A' });
    expect(value.assignment).toMatchObject({ certainty: 'unread', candidateSymbolIds: [] });
    expect(value.equipmentId).toBeUndefined();
  });
  it('confirms a uniquely enclosed reading, not every nearest neighbour', () => {
    expect(extractRatedValues([ratingText('t', '100A')], [ratingSymbol('a')])[0]).toMatchObject({
      certainty: 'confirmed', equipmentId: 'eq-a', assignment: { reason: 'enclosing-body' } });
    expect(extractRatedValues([ratingText('t', '100A', 0, 25)], [ratingSymbol('a')])[0].certainty).toBe('ambiguous');
  });
  it('uses a unique explicit equipment tag and rejects duplicate tags', () => {
    const symbols = [ratingSymbol('a', 0, 0, 'QF-1'), ratingSymbol('b', 0, 40, 'QF-2')];
    expect(extractRatedValues([ratingText('t', 'QF-2 100A', 0, 25, 30)], symbols)[0].equipmentId).toBe('eq-b');
    symbols[0].rawLabel = 'QF-2';
    expect(extractRatedValues([ratingText('t', 'QF-2 100A', 0, 25, 30)], symbols)[0].equipmentId).toBeUndefined();
  });
  it('does not confirm unread OCR even when assignment is known', () => {
    const text = { ...ratingText('t', '100A'), certainty: 'ambiguous' as const, confirmedText: undefined };
    expect(extractRatedValues([text], [ratingSymbol('a')])[0]).toMatchObject({ certainty: 'ambiguous', readingCertainty: 'ambiguous' });
  });
  it('never assigns a value to another page', () => {
    expect(extractRatedValues([ratingText('t', '100A')], [ratingSymbol('a', 1)])[0].equipmentId).toBeUndefined();
  });
  it.each(['1000kVAh', '-100A', '1e3V', '1,00A', '1.2.3kV'])('does not parse damaged numbers or unit suffixes: %s', (raw) => {
    expect(parseRatedQuantities(raw)).toEqual([]);
  });
  it('normalizes voltage units without converting power capacity to voltage', () => {
    expect(parseRatedQuantities('0.38kV 380V 1000kVA').map(quantityVolts)).toEqual([380, 380, undefined]);
  });
});

describe('cross-page references require a unique compatible pair', () => {
  const symbols = () => [ratingSymbol('a', 0, 0, 'QF-1'), ratingSymbol('b', 1, 0, 'QF-1')];
  it('keeps a unique anchored equal-voltage reference confirmed', () => {
    const result = reconcileCrossPage(symbols(), [ratingText('t0', '380V'), ratingText('t1', '0.38kV', 1)], ref);
    expect(result[0].status).toBe('confirmed');
  });
  it('does not treat kVA as page connection voltage', () => {
    expect(reconcileCrossPage(symbols(), [ratingText('t0', '1000kVA'), ratingText('t1', '1000kVA', 1)], ref)
      .every((item) => item.status !== 'confirmed')).toBe(true);
  });
  it('does not choose among duplicate targets by iteration order', () => {
    const candidates = [...symbols(), ratingSymbol('c', 1, 40, 'QF-1')];
    const texts = [ratingText('t0', '380V'), ratingText('t1', '380V', 1), ratingText('t2', '380V', 1, 42)];
    const a = reconcileCrossPage(candidates, texts, ref), b = reconcileCrossPage([...candidates].reverse(), texts, ref);
    expect(a).toEqual(b);
    expect(a.every((item) => item.status !== 'confirmed')).toBe(true);
  });
  it('collects conflicting owned voltages rather than selecting the first text', () => {
    const texts = [ratingText('t0', '380V'), ratingText('t1', '220V', 0, 2, 10), ratingText('t2', '380V', 1)];
    const a = reconcileCrossPage(symbols(), texts, ref), b = reconcileCrossPage(symbols(), [...texts].reverse(), ref);
    expect(a).toEqual(b); expect(a.every((item) => item.status !== 'confirmed')).toBe(true);
  });
  it('does not use a sheet reference far from the source as an equipment anchor', () => {
    const result = reconcileCrossPage(symbols(), [ratingText('t0', '380V'), ratingText('t1', '380V', 1)],
      [{ ...ref[0], bounds: { x: 10000, y: 0, w: 10, h: 10 } }]);
    expect(result.every((item) => item.status !== 'confirmed')).toBe(true);
  });
});
