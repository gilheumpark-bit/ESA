import { extractRatedValues, readRatedMeasurements } from '../rated-value-extractor';
import { reconcileCrossPage, extractPageRefHits } from '../cross-page-graph';
import { drawingDocumentCsv, drawingDocumentPrintableHtml } from '@/lib/export-drawing-document';
import { buildDrawingDocumentV3 } from '../drawing-document-report';
import { uncertaintyDocument } from '../test-support/uncertainty-document';
import { deduplicateSymbols, type RawSymbolHit } from '../evidence-deduplicator';
import type { SymbolNode, TextNode } from '../types-v3';
const evidence = (id: string, page = 0, x = 0, y = 0, w = 10, h = 10) => [{ evidenceId: id, pageIndex: page, bounds: { x, y, w, h }, confidence: 1 }];
const symbol = (id: string, page = 0, x = 0, y = 0): SymbolNode => ({ id, displayId: id, equipmentId: `eq-${id}`, rawLabel: 'VCB-1',
  typeCandidates: ['breaker'], confirmedType: 'breaker', certainty: 'confirmed', evidence: evidence(id, page, x, y, 40, 40) });
const text = (raw: string, page = 0, x = 0, y = 0, id = raw): TextNode => ({ id, displayId: id, rawText: raw, confirmedText: raw,
  candidates: [raw], certainty: 'confirmed', evidence: evidence(id, page, x, y) });

describe('reading versus ownership', () => {
  it('extracts each voltage and capacity rather than only the first nameplate value', () => {
    expect(extractRatedValues([text('22.9kV / 380V / 1000kVA')], []).map((r) => r.normalized))
      .toEqual([{ value: 22.9, unit: 'kV' }, { value: 380, unit: 'V' }, { value: 1000, unit: 'kVA' }]);
  });
  it('keeps exact source spans and does not mix voltage with capacity', () => {
    const raw = '22,900 V; 1,000kVA; 50kVAR';
    expect(readRatedMeasurements(raw).map((m) => raw.slice(m.start, m.end))).toEqual(['22,900 V', '1,000kVA', '50kVAR']);
  });
  it('equal-distance and reversed arrays cannot create a confirmed owner', () => {
    const a = symbol('a', 0, 0), b = symbol('b', 0, 100), label = text('100A', 0, 65, 15);
    const x = extractRatedValues([label], [a, b])[0], y = extractRatedValues([label], [b, a])[0];
    expect(x.ownership).toEqual(y.ownership);
    expect(x.equipmentId).toBeUndefined(); expect(x.ownership?.status).toBe('ambiguous');
    expect(x.certainty).toBe('confirmed');
  });
  it('distant text retains its number without inventing an equipment attachment', () => {
    const result = extractRatedValues([text('100A', 0, 900)], [symbol('a')])[0];
    expect(result.normalized?.value).toBe(100); expect(result.equipmentId).toBeUndefined(); expect(result.ownership?.status).toBe('unread');
  });
  it('a uniquely contained label retains a positive assignment, unrelated pages do not interfere', () => {
    const result = extractRatedValues([text('100A', 0, 10, 10)], [symbol('a'), symbol('b', 1)])[0];
    expect(result.equipmentId).toBe('eq-a'); expect(result.ownership?.status).toBe('confirmed');
  });
  it('reads same-page evidence rather than a different page at position zero', () => {
    const s = symbol('s', 1); s.evidence.unshift(...evidence('other', 0, 900));
    expect(extractRatedValues([text('100A', 1, 10, 10)], [s])[0].equipmentId).toBe('eq-s');
  });
  it('uncertain ownership cannot imply a complete engineering report', () => {
    const doc = uncertaintyDocument(); doc.ratedValues = extractRatedValues([text('100A', 0, 900)], [symbol('a')]);
    const built = buildDrawingDocumentV3({ ...doc, documentPageCount: 1 });
    expect(built.verification.claimsComplete).toBe(false);
    expect(drawingDocumentCsv(built)).toContain('귀속 미판독');
    expect(drawingDocumentPrintableHtml(built)).toContain('귀속 미판독');
  });
});

describe('cross-page stable unit and candidate contracts', () => {
  const run = (symbols: SymbolNode[], labels: TextNode[]) => {
    const ref = text('TO SHEET 2', 0, 0, 50);
    return reconcileCrossPage(symbols, [ref, ...labels], extractPageRefHits([ref]));
  };
  it('kVA is never evidence of voltage compatibility', () => {
    expect(run([symbol('a'), symbol('b', 1)], [text('1000kVA'), text('1000kVA', 1)]).some((r) => r.status === 'confirmed')).toBe(false);
  });
  it('supports equivalent explicit V and kV with a unique same-tag pair', () => {
    expect(run([symbol('a'), symbol('b', 1)], [text('22,900V'), text('22.9kV', 1)]).some((r) => r.status === 'confirmed')).toBe(true);
  });
  it('conflicting nearby voltages do not depend on text array order', () => {
    const labels = [text('22.9kV'), text('6.6kV', 0, 20), text('22.9kV', 1)];
    for (const input of [labels, [...labels].reverse()]) expect(run([symbol('a'), symbol('b', 1)], input).some((r) => r.status === 'confirmed')).toBe(false);
  });
  it('duplicate target candidates do not select an arbitrary first match', () => {
    const a = symbol('a'), b = symbol('b', 1), c = symbol('c', 1, 50);
    for (const input of [[a, b, c], [a, c, b]]) expect(run(input, [text('22.9kV'), text('22.9kV', 1)]).some((r) => r.status === 'confirmed')).toBe(false);
  });
});

describe('source identity preservation', () => {
  const hit = (id: string, fp?: string): RawSymbolHit => ({ localId: id, type: 'breaker', certainty: 'confirmed', confidence: 1,
    bounds: { x: 0, y: 0, w: 40, h: 40 }, pageIndex: 0, regionId: 'vector-full',
    ...(fp ? { sourceSymbol: { blockName: 'CUSTOM', fingerprint: fp } } : {}) });
  it('retains a vector anchor with unanchored extra observations', () => {
    expect(deduplicateSymbols([hit('a', 'fp2:1234567890123456'), hit('b')])[0].sourceSymbol?.fingerprint).toBe('fp2:1234567890123456');
  });
  it('never merges contradictory source identities into a reusable feedback rule', () => {
    expect(deduplicateSymbols([hit('a', 'fp2:1234567890123456'), hit('b', 'fp2:2222222222222222'), hit('c', 'fp2:1234567890123456')])[0].sourceSymbol).toBeUndefined();
  });
});
