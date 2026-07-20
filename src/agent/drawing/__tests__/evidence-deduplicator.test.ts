import {
  assignDisplayIdsForTexts,
  deduplicateLines,
  deduplicateSymbols,
  findUnboundLineItems,
} from '../evidence-deduplicator';

describe('drawing evidence numbering and merge', () => {
  it('assigns deterministic page-local symbol numbers and preserves overlapping receipts', () => {
    const symbols = deduplicateSymbols([
      { localId: 'later-page', type: 'vcb', bounds: { x: 20, y: 20, w: 10, h: 10 }, confidence: 0.8, pageIndex: 1, regionId: 'p2-a' },
      { localId: 'right', type: 'transformer', bounds: { x: 80, y: 10, w: 10, h: 10 }, confidence: 0.9, pageIndex: 0, regionId: 'p1-right' },
      { localId: 'left-low', type: 'vcb', bounds: { x: 10, y: 10, w: 10, h: 10 }, confidence: 0.7, pageIndex: 0, regionId: 'p1-left-a' },
      { localId: 'left-high', type: 'vcb', bounds: { x: 11, y: 10, w: 10, h: 10 }, confidence: 0.95, pageIndex: 0, regionId: 'p1-left-b' },
    ]);

    expect(symbols.map((item) => item.displayId)).toEqual(['P01-S001', 'P01-S002', 'P02-S001']);
    expect(symbols[0].rawLabel).toBeUndefined();
    expect(symbols[0].evidence).toHaveLength(2);
    expect(symbols[0].evidence.map((item) => item.regionId)).toEqual(['p1-left-a', 'p1-left-b']);
  });

  it('numbers lines and texts independently per page', () => {
    const lines = deduplicateLines([
      { localId: 'p2', lineKind: 'power', path: [{ x: 0, y: 20 }, { x: 50, y: 20 }], confidence: 0.9, pageIndex: 1, regionId: 'p2' },
      { localId: 'p1', lineKind: 'power', path: [{ x: 0, y: 10 }, { x: 50, y: 10 }], junctions: [{ x: 25, y: 10 }], crossovers: [{ x: 40, y: 10 }], confidence: 0.9, pageIndex: 0, regionId: 'p1' },
    ]);
    const texts = assignDisplayIdsForTexts([
      { text: 'P2', bounds: { x: 0, y: 20, w: 10, h: 5 }, pageIndex: 1, certainty: 'confirmed', confidence: 1 },
      { text: 'P1', bounds: { x: 0, y: 10, w: 10, h: 5 }, pageIndex: 0, certainty: 'confirmed', confidence: 1 },
    ]);

    expect(lines.map((item) => item.displayId)).toEqual(['P01-L001', 'P02-L001']);
    expect(lines[0]).toMatchObject({ junctions: [{ x: 25, y: 10 }], crossovers: [{ x: 40, y: 10 }] });
    expect(texts.map((item) => item.displayId)).toEqual(['P01-T001', 'P02-T001']);
    expect(findUnboundLineItems(lines, [])).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'LINE_CONTINUITY_UNCERTAIN', displayId: 'P01-L001', pageIndex: 0 }),
    ]));
  });

  it('does not merge overlapping PT/PPT symbols or power/ground lines', () => {
    const symbols = deduplicateSymbols([
      { localId: 'pt', type: 'pt', bounds: { x: 10, y: 10, w: 10, h: 10 }, confidence: 0.9, pageIndex: 0, regionId: 'a' },
      { localId: 'ppt', type: 'ppt', bounds: { x: 10, y: 10, w: 10, h: 10 }, confidence: 0.9, pageIndex: 0, regionId: 'b' },
    ]);
    const lines = deduplicateLines([
      { localId: 'p', lineKind: 'power', path: [{ x: 0, y: 0 }, { x: 50, y: 0 }], confidence: 0.9, pageIndex: 0, regionId: 'a' },
      { localId: 'g', lineKind: 'ground', path: [{ x: 0, y: 0 }, { x: 50, y: 0 }], confidence: 0.9, pageIndex: 0, regionId: 'b' },
    ]);
    expect(symbols).toHaveLength(2);
    expect(lines).toHaveLength(2);
  });
});
