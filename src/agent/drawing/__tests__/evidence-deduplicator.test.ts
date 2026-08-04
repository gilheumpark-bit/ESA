import {
  assignDisplayIdsForTexts,
  buildPageRelations,
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

  it('does not count a labelled PTx3 instrument transformer as a power transformer', () => {
    const symbols = deduplicateSymbols([{
      localId: 'pt-misread',
      type: 'transformer',
      label: 'PTx3 380/110V',
      bounds: { x: 10, y: 10, w: 20, h: 20 },
      confidence: 0.94,
      pageIndex: 0,
      regionId: 'mcc-crop',
    }]);

    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({
      typeCandidates: ['vt_pt'],
      rawLabel: 'PTx3 380/110V',
    });
  });

  it('merges the same conductor when reviewers disagree only between bus and power, but keeps ground separate', () => {
    const lines = deduplicateLines([
      { localId: 'full-bus', lineKind: 'bus', path: [{ x: 0, y: 100 }, { x: 400, y: 100 }], confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'crop-power', lineKind: 'power', path: [{ x: 2, y: 101 }, { x: 398, y: 101 }], confidence: 0.9, pageIndex: 0, regionId: 'crop' },
      { localId: 'ground', lineKind: 'ground', path: [{ x: 0, y: 100 }, { x: 400, y: 100 }], confidence: 0.9, pageIndex: 0, regionId: 'ground' },
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ lineKind: 'bus' });
    expect(lines[0].evidence.map((item) => item.regionId)).toEqual(['full', 'crop']);
    expect(lines[1]).toMatchObject({ lineKind: 'ground' });
  });

  it('merges substantially overlapping collinear line reads but keeps offset parallel lines separate', () => {
    const lines = deduplicateLines([
      { localId: 'full', lineKind: 'power', path: [{ x: 100, y: 0 }, { x: 100, y: 300 }], confidence: 0.79, pageIndex: 0, regionId: 'full' },
      { localId: 'region', lineKind: 'power', path: [{ x: 102, y: 60 }, { x: 102, y: 295 }], confidence: 0.79, pageIndex: 0, regionId: 'region' },
      { localId: 'parallel', lineKind: 'power', path: [{ x: 150, y: 0 }, { x: 150, y: 300 }], confidence: 0.79, pageIndex: 0, regionId: 'parallel' },
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0].evidence).toHaveLength(2);
    expect(lines[0].path).toEqual([{ x: 100, y: 0 }, { x: 100, y: 300 }]);
  });

  it('merges the same device type at the same coordinates even when broad and region labels differ', () => {
    const symbols = deduplicateSymbols([
      { localId: 'full', type: 'breaker', label: 'Line Breaker Left', bounds: { x: 100, y: 100, w: 30, h: 30 }, confidence: 0.79, pageIndex: 0, regionId: 'full' },
      { localId: 'region', type: 'breaker', label: 'Left Line Breaker', bounds: { x: 100, y: 100, w: 30, h: 30 }, confidence: 0.79, pageIndex: 0, regionId: 'region' },
    ]);

    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({ typeCandidates: ['breaker'], certainty: 'ambiguous' });
    expect(symbols[0].evidence).toHaveLength(2);
  });

  it('merges strongly overlapping full-page and crop reads despite center drift but keeps adjacent repeated devices separate', () => {
    const symbols = deduplicateSymbols([
      { localId: 'full-a', type: 'transformer', bounds: { x: 100, y: 100, w: 58, h: 90 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'crop-a', type: 'transformer', bounds: { x: 102, y: 136, w: 55, h: 88 }, confidence: 0.88, pageIndex: 0, regionId: 'crop' },
      { localId: 'adjacent-b', type: 'transformer', bounds: { x: 205, y: 100, w: 58, h: 90 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
    ]);

    expect(symbols).toHaveLength(2);
    expect(symbols[0].evidence.map((item) => item.regionId)).toEqual(['full', 'crop']);
    expect(symbols[0].evidence).toHaveLength(2);
    expect(symbols[1].evidence).toHaveLength(1);
  });

  it('merges a full-page symbol shifted by crop padding when more than half of the physical glyph overlaps', () => {
    const symbols = deduplicateSymbols([
      { localId: 'crop', type: 'transformer', bounds: { x: 128, y: 724, w: 59, h: 86 }, confidence: 0.95, pageIndex: 0, regionId: 'crop' },
      { localId: 'full', type: 'transformer', bounds: { x: 130, y: 758, w: 60, h: 91 }, confidence: 0.95, pageIndex: 0, regionId: 'full' },
      { localId: 'next-device', type: 'transformer', bounds: { x: 345, y: 724, w: 59, h: 86 }, confidence: 0.95, pageIndex: 0, regionId: 'crop' },
    ]);

    expect(symbols).toHaveLength(2);
    expect(symbols[0].evidence.map((item) => item.regionId)).toEqual(['crop', 'full']);
  });

  it('merges the same house at the measured full-page/crop shift while keeping the next house', () => {
    const symbols = deduplicateSymbols([
      { localId: 'crop-house', type: 'load', bounds: { x: 85, y: 844, w: 80, h: 79 }, confidence: 0.95, pageIndex: 0, regionId: 'crop' },
      { localId: 'full-house', type: 'load', bounds: { x: 84, y: 878, w: 78, h: 88 }, confidence: 0.95, pageIndex: 0, regionId: 'full' },
      { localId: 'next-house', type: 'load', bounds: { x: 187, y: 844, w: 80, h: 79 }, confidence: 0.95, pageIndex: 0, regionId: 'crop' },
    ]);

    expect(symbols).toHaveLength(2);
    expect(symbols[0].evidence.map((item) => item.regionId)).toEqual(['crop', 'full']);
  });

  it('uses every retained receipt when merging a later partial symbol read and folds transformer winding aliases into the physical transformer', () => {
    const symbols = deduplicateSymbols([
      { localId: 'partial', type: 'transformer_winding', bounds: { x: 100, y: 100, w: 60, h: 40 }, confidence: 0.9, pageIndex: 0, regionId: 'crop-a' },
      { localId: 'whole', type: 'transformer', bounds: { x: 100, y: 100, w: 60, h: 90 }, confidence: 0.95, pageIndex: 0, regionId: 'full' },
      { localId: 'lower-winding', type: 'transformer_winding', bounds: { x: 100, y: 135, w: 60, h: 55 }, confidence: 0.9, pageIndex: 0, regionId: 'crop-b' },
    ]);

    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({ typeCandidates: ['transformer'], confirmedType: 'transformer' });
    expect(symbols[0].evidence.map((item) => item.regionId)).toEqual(['crop-a', 'full', 'crop-b']);
  });

  it('merges a cropped roof-only load into the complete house without swallowing the adjacent house', () => {
    const symbols = deduplicateSymbols([
      { localId: 'adjacent', type: 'load', bounds: { x: 143, y: 530, w: 79, h: 82 }, confidence: 0.95, pageIndex: 0, regionId: 'full' },
      { localId: 'roof-only', type: 'house_load', bounds: { x: 211, y: 524, w: 51, h: 26 }, confidence: 0.9, pageIndex: 0, regionId: 'crop' },
      { localId: 'complete', type: 'load', bounds: { x: 246, y: 527, w: 81, h: 82 }, confidence: 0.95, pageIndex: 0, regionId: 'full' },
    ]);

    expect(symbols).toHaveLength(2);
    expect(symbols.find((item) => item.evidence.some((evidence) => evidence.regionId === 'crop'))?.evidence)
      .toHaveLength(2);
  });

  it('merges breaker and circuit_breaker aliases at the same coordinates', () => {
    const symbols = deduplicateSymbols([
      { localId: 'full', type: 'circuit_breaker', bounds: { x: 100, y: 100, w: 30, h: 30 }, confidence: 0.79, pageIndex: 0, regionId: 'full' },
      { localId: 'region', type: 'breaker', bounds: { x: 101, y: 100, w: 30, h: 30 }, confidence: 0.79, pageIndex: 0, regionId: 'region' },
    ]);

    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({ typeCandidates: ['breaker'], certainty: 'ambiguous' });
    expect(symbols[0].evidence).toHaveLength(2);
  });

  it('merges colocated cross-type readings with the same label into one ambiguous candidate set', () => {
    const symbols = deduplicateSymbols([
      { localId: 'capacitor-read', type: 'capacitor', label: 'Shunt Reactor', bounds: { x: 100, y: 100, w: 30, h: 30 }, confidence: 0.79, pageIndex: 0, regionId: 'full' },
      { localId: 'load-read', type: 'load', label: 'Shunt Reactor', bounds: { x: 112, y: 100, w: 30, h: 30 }, confidence: 0.79, pageIndex: 0, regionId: 'region' },
    ]);

    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({ typeCandidates: ['capacitor', 'load'], rawLabel: 'Shunt Reactor', certainty: 'ambiguous' });
    expect(symbols[0].confirmedType).toBeUndefined();
  });

  it('keeps a parser-derived low-confidence endpoint relation as an ambiguous relation', () => {
    const symbols = deduplicateSymbols([
      { localId: 'vcb', type: 'vcb', label: 'VCB-1', bounds: { x: 0, y: 0, w: 10, h: 10 }, confidence: 0.85, pageIndex: 0, regionId: 'vector' },
      { localId: 'tr', type: 'transformer', label: 'TR-1', bounds: { x: 100, y: 0, w: 10, h: 10 }, confidence: 0.85, pageIndex: 0, regionId: 'vector' },
    ]);
    const lines = deduplicateLines([
      { localId: 'line', lineKind: 'power', path: [{ x: 5, y: 5 }, { x: 105, y: 5 }], confidence: 0.55, pageIndex: 0, regionId: 'vector' },
    ]);

    expect(buildPageRelations(symbols, lines, 0)).toEqual([
      expect.objectContaining({ from: symbols[0].id, to: symbols[1].id, lineId: lines[0].id, certainty: 'ambiguous' }),
    ]);
  });

  it('allows a small anti-alias gap only for ambiguous fallback lines when binding intermediate loads', () => {
    const symbols = deduplicateSymbols([
      { localId: 'left', type: 'load', bounds: { x: 20, y: 50, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'symbols' },
      { localId: 'middle', type: 'load', bounds: { x: 90, y: 50, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'symbols' },
      { localId: 'right', type: 'load', bounds: { x: 160, y: 50, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'symbols' },
    ]);
    const ambiguous = deduplicateLines([
      { localId: 'fallback', lineKind: 'unknown', path: [{ x: 30, y: 42 }, { x: 170, y: 42 }], confidence: 0.65, pageIndex: 0, regionId: 'fallback', certainty: 'ambiguous' },
    ]);

    expect(buildPageRelations(symbols, ambiguous, 0)).toHaveLength(2);
    expect(buildPageRelations(symbols, ambiguous, 0).every((relation) => relation.certainty === 'ambiguous')).toBe(true);
  });

  it('binds a line endpoint anywhere on a long busbar bounds, not only near its center', () => {
    const symbols = deduplicateSymbols([
      { localId: 'bus', type: 'busbar', bounds: { x: 0, y: 0, w: 300, h: 12 }, confidence: 0.9, pageIndex: 0, regionId: 'broad' },
      { localId: 'breaker', type: 'breaker', bounds: { x: 360, y: 0, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'broad' },
    ]);
    const lines = deduplicateLines([
      { localId: 'line', lineKind: 'power', path: [{ x: 10, y: 6 }, { x: 370, y: 10 }], confidence: 0.9, pageIndex: 0, regionId: 'broad' },
    ]);

    expect(buildPageRelations(symbols, lines, 0)).toEqual([
      expect.objectContaining({ from: symbols[0].id, to: symbols[1].id }),
    ]);
  });

  it('does not skip an inline breaker when a vision model returns one continuous conductor', () => {
    const symbols = deduplicateSymbols([
      { localId: 'source', type: 'load', bounds: { x: 90, y: 0, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'breaker', type: 'breaker', bounds: { x: 85, y: 90, w: 30, h: 30 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'bus', type: 'busbar', bounds: { x: 0, y: 190, w: 300, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
    ]);
    const lines = deduplicateLines([
      { localId: 'continuous', lineKind: 'power', path: [{ x: 100, y: 10 }, { x: 100, y: 200 }], confidence: 0.9, pageIndex: 0, regionId: 'full' },
    ]);

    expect(buildPageRelations(symbols, lines, 0)).toEqual([
      expect.objectContaining({ from: symbols[0].id, to: symbols[1].id, lineId: lines[0].id }),
      expect.objectContaining({ from: symbols[1].id, to: symbols[2].id, lineId: lines[0].id }),
    ]);
  });

  it('keeps a spatial relation between ambiguous device candidates without promoting it to confirmed', () => {
    const symbols = deduplicateSymbols([
      { localId: 'bus-candidate', type: 'bus', label: 'Main Bus', bounds: { x: 0, y: 0, w: 10, h: 10 }, confidence: 0.79, pageIndex: 0, regionId: 'broad' },
      { localId: 'vcb-candidate', type: 'breaker', label: 'Bus Tie Breaker', bounds: { x: 100, y: 0, w: 10, h: 10 }, confidence: 0.79, pageIndex: 0, regionId: 'broad' },
    ]);
    const lines = deduplicateLines([
      { localId: 'candidate-line', lineKind: 'power', path: [{ x: 5, y: 5 }, { x: 105, y: 5 }], confidence: 0.79, pageIndex: 0, regionId: 'broad' },
    ]);

    expect(symbols.every((symbol) => symbol.certainty === 'ambiguous')).toBe(true);
    expect(buildPageRelations(symbols, lines, 0)).toEqual([
      expect.objectContaining({ from: symbols[0].id, to: symbols[1].id, lineId: lines[0].id, certainty: 'ambiguous' }),
    ]);
  });

  it('traces a device branch through a perpendicular line gap to a busbar network', () => {
    const symbols = deduplicateSymbols([
      { localId: 'bus', type: 'busbar', label: 'L1,L2,L3', bounds: { x: 0, y: 0, w: 50, h: 10 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'fuse', type: 'fuse', label: 'FU1', bounds: { x: 240, y: 170, w: 20, h: 40 }, confidence: 0.9, pageIndex: 0, regionId: 'region' },
    ]);
    const lines = deduplicateLines([
      { localId: 'bus-line', lineKind: 'bus', path: [{ x: 45, y: 5 }, { x: 300, y: 5 }], confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'branch', lineKind: 'power', path: [{ x: 250, y: 50 }, { x: 250, y: 170 }], confidence: 0.9, pageIndex: 0, regionId: 'region' },
    ]);

    expect(buildPageRelations(symbols, lines, 0)).toEqual([
      expect.objectContaining({ from: symbols[0].id, to: symbols[1].id, lineId: lines[1].id, certainty: 'ambiguous' }),
    ]);
  });

  it('reconciles two crop-edge conductor fragments into an ambiguous device relation', () => {
    const symbols = deduplicateSymbols([
      { localId: 'transformer', type: 'transformer', bounds: { x: 90, y: 0, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'top' },
      { localId: 'load', type: 'load', bounds: { x: 90, y: 180, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'bottom' },
    ]);
    const lines = deduplicateLines([
      { localId: 'top-fragment', lineKind: 'power', path: [{ x: 100, y: 20 }, { x: 100, y: 90 }], confidence: 0.9, pageIndex: 0, regionId: 'top' },
      { localId: 'bottom-fragment', lineKind: 'power', path: [{ x: 100, y: 110 }, { x: 100, y: 180 }], confidence: 0.9, pageIndex: 0, regionId: 'bottom' },
    ]);

    expect(buildPageRelations(symbols, lines, 0)).toEqual([
      expect.objectContaining({ from: symbols[0].id, to: symbols[1].id, certainty: 'ambiguous' }),
    ]);
  });

  it('does not bridge a nearby parallel line into a busbar network', () => {
    const symbols = deduplicateSymbols([
      { localId: 'bus', type: 'busbar', bounds: { x: 0, y: 0, w: 50, h: 10 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'fuse', type: 'fuse', bounds: { x: 490, y: 40, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'region' },
    ]);
    const lines = deduplicateLines([
      { localId: 'bus-line', lineKind: 'bus', path: [{ x: 45, y: 5 }, { x: 800, y: 5 }], confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'parallel', lineKind: 'power', path: [{ x: 200, y: 50 }, { x: 490, y: 50 }], confidence: 0.9, pageIndex: 0, regionId: 'region' },
    ]);

    expect(buildPageRelations(symbols, lines, 0)).toEqual([]);
  });
});

// 중급 공개 결선도(wiring-real-sm.jpg)의 기록된 기호축 실패를 그대로 재현한다.
// 정답 스위치 1·퓨즈 15·차단기 0에서 breaker 오탐 5, switch 2/1, 퓨즈 14/15가
// 나왔다(docs/VALIDATION_EVIDENCE.md 7차, 기호축 69%).
describe('개폐·보호 계열 판독 충돌 병합', () => {
  it('FU 지정문자가 붙은 breaker 오독을 퓨즈로 되돌려 병합한다', () => {
    const symbols = deduplicateSymbols([
      { localId: 'fu3-fuse', type: 'fuse', label: 'FU3', bounds: { x: 100, y: 100, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'full', certainty: 'confirmed' as const },
      { localId: 'fu3-misread', type: 'breaker', label: 'FU3', bounds: { x: 103, y: 104, w: 20, h: 20 }, confidence: 0.8, pageIndex: 0, regionId: 'grid' },
    ]);

    expect(symbols).toHaveLength(1);
    expect(symbols[0].confirmedType).toBe('fuse');
    expect(symbols[0].typeCandidates).toEqual(['fuse']);
  });

  it('QS 지정문자와 단로기 계열 이름을 하나의 switch로 접는다', () => {
    // 채점기는 disconnector를 switch로 접는데 병합이 안 접으면 QS1이
    // 두 노드로 남아 switch 2/1 이 된다.
    const symbols = deduplicateSymbols([
      { localId: 'qs1-switch', type: 'switch', label: 'QS1', bounds: { x: 40, y: 40, w: 18, h: 18 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'qs1-disconnector', type: 'disconnector', bounds: { x: 43, y: 44, w: 18, h: 18 }, confidence: 0.85, pageIndex: 0, regionId: 'grid' },
    ]);

    expect(symbols).toHaveLength(1);
    expect(symbols[0].typeCandidates).toEqual(['switch']);
  });

  it('라벨 없는 breaker 재판독이 퓨즈 위에 유령 차단기를 만들지 않는다', () => {
    // 서로 다른 기기 몸체는 과반이 겹치게 그려지지 않는다. 같은 자리의
    // 개폐 계열 타입 충돌은 별개 기기가 아니라 하나의 ambiguous 노드다.
    const symbols = deduplicateSymbols([
      { localId: 'fu5', type: 'fuse', label: 'FU5', bounds: { x: 200, y: 100, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'ghost-breaker', type: 'breaker', bounds: { x: 204, y: 106, w: 20, h: 20 }, confidence: 0.8, pageIndex: 0, regionId: 'grid' },
    ]);

    expect(symbols).toHaveLength(1);
    expect(symbols[0].certainty).toBe('ambiguous');
    expect(symbols[0].confirmedType).toBeUndefined();
    expect(symbols[0].typeCandidates).toEqual(['fuse', 'breaker']);
  });

  it('개폐 계열 밖(모선·변압기)과는 타입 충돌 병합을 하지 않는다', () => {
    const withBus = deduplicateSymbols([
      { localId: 'bus', type: 'bus', bounds: { x: 0, y: 200, w: 300, h: 12 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'inline-breaker', type: 'breaker', bounds: { x: 140, y: 198, w: 18, h: 18 }, confidence: 0.9, pageIndex: 0, regionId: 'grid' },
    ]);
    expect(withBus).toHaveLength(2);

    const withTransformer = deduplicateSymbols([
      { localId: 'tr', type: 'transformer', bounds: { x: 100, y: 100, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'overlap-breaker', type: 'breaker', bounds: { x: 104, y: 105, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'grid' },
    ]);
    expect(withTransformer).toHaveLength(2);
  });

  it('크기가 4배 넘게 다르면 개폐 계열이라도 별개 기기로 남긴다', () => {
    // 포함 관계(큰 개폐기 몸체 안의 작은 퓨즈)는 같은 글리프가 아니다.
    const symbols = deduplicateSymbols([
      { localId: 'big-switch', type: 'switch', bounds: { x: 50, y: 50, w: 25, h: 25 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'small-fuse', type: 'fuse', bounds: { x: 55, y: 55, w: 10, h: 10 }, confidence: 0.9, pageIndex: 0, regionId: 'grid' },
    ]);
    expect(symbols).toHaveLength(2);
  });

  it('QF 지정문자는 차단기를 유지한다', () => {
    const symbols = deduplicateSymbols([
      { localId: 'qf1', type: 'fuse', label: 'QF1', bounds: { x: 10, y: 10, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'full', certainty: 'confirmed' as const },
    ]);
    expect(symbols[0].confirmedType).toBe('breaker');
  });
});
