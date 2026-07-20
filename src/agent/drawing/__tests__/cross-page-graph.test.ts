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
    expect(rels.some((r) => r.status === 'candidate' && r.reason === 'same-label-no-page-ref')).toBe(true);
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
});
