import { extractPageRefHits, reconcileCrossPage } from '../cross-page-graph';
import type { SymbolNode, TextNode } from '../types-v3';

describe('cross-page-graph', () => {
  it('does not auto-merge same label without page ref (AC-07)', () => {
    const symbols: SymbolNode[] = [
      {
        id: 'a',
        displayId: 'P01-S001',
        rawLabel: 'VCB-1',
        confirmedType: 'vcb',
        typeCandidates: ['vcb'],
        certainty: 'confirmed',
        evidence: [{ evidenceId: 'e1', pageIndex: 0, bounds: { x: 0, y: 0, w: 10, h: 10 }, confidence: 1 }],
      },
      {
        id: 'b',
        displayId: 'P07-S003',
        rawLabel: 'VCB-1',
        confirmedType: 'vcb',
        typeCandidates: ['vcb'],
        certainty: 'confirmed',
        evidence: [{ evidenceId: 'e2', pageIndex: 6, bounds: { x: 0, y: 0, w: 10, h: 10 }, confidence: 1 }],
      },
    ];
    const rels = reconcileCrossPage(symbols, [], []);
    expect(rels.some((r) => r.status === 'confirmed')).toBe(false);
    expect(rels.some((r) => r.status === 'candidate' && r.reason === 'same-label-voltage-unknown')).toBe(true);
  });

  it('extracts TO SHEET N references', () => {
    const texts: TextNode[] = [{
      id: 't1',
      displayId: 'P03-T001',
      rawText: 'TO SHEET 7',
      confirmedText: 'TO SHEET 7',
      candidates: ['TO SHEET 7'],
      certainty: 'confirmed',
      evidence: [{ evidenceId: 'te', pageIndex: 2, bounds: { x: 0, y: 0, w: 50, h: 10 }, confidence: 1 }],
    }];
    const hits = extractPageRefHits(texts);
    expect(hits[0].targetPageHint).toBe(6);
  });

  it('does not treat a title-block SHEET number as a cross-page connector', () => {
    const text: TextNode = {
      id: 'title-sheet', displayId: 'P01-T001', rawText: 'SHEET 7', confirmedText: 'SHEET 7',
      candidates: ['SHEET 7'], certainty: 'confirmed',
      evidence: [{ evidenceId: 'title-sheet-e', pageIndex: 0, bounds: { x: 0, y: 0, w: 40, h: 10 }, confidence: 1 }],
    };

    expect(extractPageRefHits([text])).toEqual([]);
  });

  it('does not create a quadratic cross-page graph for generic synthetic junction labels', () => {
    const junction = (id: string, pageIndex: number): SymbolNode => ({
      id, displayId: id, rawLabel: '접점 (junction)', confirmedType: 'bus', typeCandidates: ['bus'], certainty: 'confirmed',
      evidence: [{ evidenceId: `${id}-e`, pageIndex, bounds: { x: 0, y: 0, w: 10, h: 10 }, confidence: 1 }],
    });

    expect(reconcileCrossPage([
      junction('j1', 0), junction('j2', 1), junction('j3', 2),
    ], [], [])).toEqual([]);
  });

  it('does not mistake repeated breaker ratings for cross-page equipment tags', () => {
    const ratedBreaker = (id: string, pageIndex: number): SymbolNode => ({
      id,
      displayId: id,
      rawLabel: 'MCCB 3P-50/50',
      confirmedType: 'breaker',
      typeCandidates: ['breaker'],
      certainty: 'confirmed',
      evidence: [{
        evidenceId: `${id}-e`,
        pageIndex,
        bounds: { x: 0, y: 0, w: 10, h: 10 },
        confidence: 1,
      }],
    });

    expect(reconcileCrossPage([
      ratedBreaker('mccb-p1', 0), ratedBreaker('mccb-p2', 1), ratedBreaker('mccb-p3', 2),
    ], [], [])).toEqual([]);
  });

  it('ignores ambiguous page-reference OCR and does not confuse PT with PPT', () => {
    const ambiguous: TextNode = {
      id: 't-amb', displayId: 'P01-T001', rawText: 'TO SHEET 2', candidates: ['TO SHEET 2', 'TO SHEET 7'], certainty: 'ambiguous',
      evidence: [{ evidenceId: 'te', pageIndex: 0, bounds: { x: 0, y: 0, w: 50, h: 10 }, confidence: 0.5 }],
    };
    expect(extractPageRefHits([ambiguous])).toEqual([]);

    const symbol = (id: string, type: string, pageIndex: number): SymbolNode => ({
      id, displayId: id, rawLabel: 'PT-1', confirmedType: type, typeCandidates: [type], certainty: 'confirmed',
      evidence: [{ evidenceId: `${id}-e`, pageIndex, bounds: { x: 0, y: 20, w: 10, h: 10 }, confidence: 1 }],
    });
    const ref: TextNode = { ...ambiguous, id: 't-ref', certainty: 'confirmed', confirmedText: 'TO SHEET 2', candidates: ['TO SHEET 2'] };
    const volts: TextNode[] = [0, 1].map((pageIndex) => ({
      id: `kv-${pageIndex}`, displayId: `kv-${pageIndex}`, rawText: '22.9kV', confirmedText: '22.9kV', candidates: ['22.9kV'], certainty: 'confirmed',
      evidence: [{ evidenceId: `kv-e-${pageIndex}`, pageIndex, bounds: { x: 0, y: 20, w: 20, h: 10 }, confidence: 1 }],
    }));
    const rels = reconcileCrossPage([symbol('pt', 'pt', 0), symbol('ppt', 'ppt', 1)], [ref, ...volts], extractPageRefHits([ref]));
    expect(rels.some((relation) => relation.status === 'confirmed')).toBe(false);
  });
});
