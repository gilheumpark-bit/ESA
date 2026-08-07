import {
  assignDisplayIdsForTexts,
  buildPageRelations,
  deduplicateLines,
  deduplicateSymbols,
  demoteContainedMarkings,
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

  it('계열이 다르면 같은 자리라도 병합하지 않는다', () => {
    // 2026-08-07 정정: 이 시험은 원래 `pt` 와 `ppt` 를 "다른 타입" 예시로 썼는데
    // 둘 다 계기용변압기다. **완전히 같은 좌표를 두 구획이 읽은 것**이므로
    // 병합이 맞다. 옛 사설 별칭 표에 둘 다 없어서 서로 다른 값이 되는 바람에
    // 우연히 통과하고 있었다. 이 시험이 지키려던 것 — 계열이 다르면 겹쳐도
    // 안 붙는다 — 을 실제로 검사하도록 입력을 바꾼다.
    const symbols = deduplicateSymbols([
      { localId: 'tr', type: 'transformer', bounds: { x: 10, y: 10, w: 10, h: 10 }, confidence: 0.9, pageIndex: 0, regionId: 'a' },
      { localId: 'ct', type: 'current_transformer', bounds: { x: 10, y: 10, w: 10, h: 10 }, confidence: 0.9, pageIndex: 0, regionId: 'b' },
    ]);
    const lines = deduplicateLines([
      { localId: 'p', lineKind: 'power', path: [{ x: 0, y: 0 }, { x: 50, y: 0 }], confidence: 0.9, pageIndex: 0, regionId: 'a' },
      { localId: 'g', lineKind: 'ground', path: [{ x: 0, y: 0 }, { x: 50, y: 0 }], confidence: 0.9, pageIndex: 0, regionId: 'b' },
    ]);
    expect(symbols).toHaveLength(2);
    expect(lines).toHaveLength(2);
  });

  it('같은 기기를 두 구획이 다른 철자로 읽으면 하나로 접는다', () => {
    // 실측(2026-08-07): 전면 판독이 `current_transformer`, 구획 재판독이 `ct`.
    // 병합기가 자기 별칭 표를 들고 있어 두 값이 달라졌고 같은 CT 가 두 노드로
    // 남았다. 어휘 정본을 쓰면 계열이 같아 붙는다.
    const symbols = deduplicateSymbols([
      { localId: 'a', type: 'current_transformer', bounds: { x: 10, y: 10, w: 10, h: 10 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'b', type: 'ct', bounds: { x: 10, y: 10, w: 10, h: 10 }, confidence: 0.9, pageIndex: 0, regionId: 'crop' },
      { localId: 'c', type: 'currentTransformer', bounds: { x: 10, y: 10, w: 10, h: 10 }, confidence: 0.9, pageIndex: 0, regionId: 'crop2' },
    ]);
    expect(symbols).toHaveLength(1);
    expect(symbols[0].evidence).toHaveLength(3);
  });

  it('계기용변성기는 전력변압기와 같은 자리에서도 붙지 않는다', () => {
    // 24차 결함의 반대 방향 보장. 계열이 다르므로 겹쳐도 별개다.
    const symbols = deduplicateSymbols([
      { localId: 'a', type: 'transformer', bounds: { x: 10, y: 10, w: 10, h: 10 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'b', type: 'instrument_transformer', bounds: { x: 10, y: 10, w: 10, h: 10 }, confidence: 0.9, pageIndex: 0, regionId: 'crop' },
    ]);
    expect(symbols).toHaveLength(2);
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
      typeCandidates: ['voltage_transformer'],
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
    // 후보에 `transformer_winding` 이 함께 남는다. 그것이 실제 증거다 —
    // 전면 판독은 변압기 몸체를, 구획 재판독은 권선 원 하나를 봤다. 계열이
    // 같아 하나로 접히고, 무엇을 보고 접었는지는 후보가 기록한다.
    expect(symbols[0]).toMatchObject({
      typeCandidates: ['transformer_winding', 'transformer'],
      confirmedType: 'transformer',
    });
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
    // 지정문자(QS)는 일반 `switch`, 이름은 `switch_disconnector` 로 정본화된다.
    // 계열이 같으므로 하나로 접히고, 두 근거가 후보에 그대로 남는다.
    expect(symbols[0].typeCandidates).toEqual(['switch', 'switch_disconnector']);
  });

  it('라벨 없는 breaker 재판독이 퓨즈 위에 유령 차단기를 만들지 않는다', () => {
    // 서로 다른 기기 몸체는 과반이 겹치게 그려지지 않는다. 같은 자리의
    // 개폐 계열 타입 충돌은 별개 기기가 아니라 하나의 ambiguous 노드다.
    const symbols = deduplicateSymbols([
      { localId: 'fu5', type: 'fuse', label: 'FU5', bounds: { x: 200, y: 100, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'ghost-breaker', type: 'breaker', bounds: { x: 204, y: 106, w: 20, h: 20 }, confidence: 0.8, pageIndex: 0, regionId: 'grid' },
    ]);

    expect(symbols).toHaveLength(1);
    // 유령 차단기 방지가 이 시험의 목적이고 그건 위 두 줄이 지킨다 —
    // 노드가 하나고 breaker 노드가 따로 서지 않는다.
    //
    // 확정 여부는 2026-08-04 에 바뀌었다. 전에는 ambiguous 로 남겼는데,
    // 그러면 도면이 "FU5" 라고 선언한 퓨즈가 라벨 없는 크롭 재판독 하나
    // 때문에 물리 수에서 사라진다. 실측에서 이 손실이 퓨즈 15개 중
    // 1~4개였다. 지정문자가 이기도록 바꿨으므로 여기도 fuse 확정이다.
    expect(symbols[0]).toMatchObject({ confirmedType: 'fuse', certainty: 'confirmed' });
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

  it('중심이 겹치는 포함 관계는 별개 기기가 아니라 ambiguous 로 접는다', () => {
    // 2026-08-04 중급 실측 전에는 "큰 개폐기 몸체 안의 작은 퓨즈는 별개
    // 기기"로 두었으나, 실제 오탐 12개 중 11개가 정확히 이 형태(79px 퓨즈
    // 몸통 + 중심이 같은 17px 상단 조각)였다. 추측이 실측과 어긋나 전제를
    // 바꾼다. 접은 결과는 삭제가 아니라 후보 둘을 보존한 ambiguous 노드라
    // 정보가 사라지지 않고 확인 항목으로 올라간다.
    const symbols = deduplicateSymbols([
      { localId: 'big-switch', type: 'switch', bounds: { x: 50, y: 50, w: 25, h: 25 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'small-fuse', type: 'fuse', bounds: { x: 55, y: 55, w: 10, h: 10 }, confidence: 0.9, pageIndex: 0, regionId: 'grid' },
    ]);
    expect(symbols).toHaveLength(1);
    expect(symbols[0].certainty).toBe('ambiguous');
    expect(symbols[0].typeCandidates).toEqual(['switch', 'fuse']);
  });

  it('겹침이 얕으면 부분 판독으로 보지 않는다', () => {
    // 나란한 두 기기가 모서리만 스치는 경우는 같은 글리프가 아니다.
    const symbols = deduplicateSymbols([
      { localId: 'left', type: 'switch', bounds: { x: 50, y: 50, w: 40, h: 40 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'right', type: 'fuse', bounds: { x: 88, y: 86, w: 12, h: 12 }, confidence: 0.9, pageIndex: 0, regionId: 'grid' },
    ]);
    expect(symbols).toHaveLength(2);
  });

  it('퓨즈 몸통의 상단 조각을 유령 차단기로 남기지 않고, 본체 확정도 강등하지 않는다', () => {
    // 중급 실측: 전체 판독이 79px 퓨즈 몸통을, 구획 재판독이 같은 x 의
    // 상단 17px 조각을 breaker 로 잡아 오탐 12개 중 11개를 만들었다.
    // 면적비가 6배라 areasComparable 로는 걸러지므로 부분 판독 겹침으로 받는다.
    // 흡수한 조각의 타입 충돌이 본체 확정을 강등하면 물리 퓨즈 카운트가
    // 무너진다(count-register 는 confirmed 만 물리 수로 센다) — 실측에서
    // 퓨즈 14→4 로 떨어진 기제다.
    const symbols = deduplicateSymbols([
      { localId: 'fu3-body', type: 'fuse', label: 'FU3', bounds: { x: 528, y: 826, w: 31, h: 79 }, confidence: 0.9, pageIndex: 0, regionId: 'full', certainty: 'confirmed' as const },
      { localId: 'fu3-top-fragment', type: 'breaker', label: '1', bounds: { x: 529, y: 829, w: 24, h: 17 }, confidence: 0.8, pageIndex: 0, regionId: 'grid' },
    ]);

    expect(symbols).toHaveLength(1);
    expect(symbols[0].typeCandidates).toEqual(['fuse', 'breaker']);
    expect(symbols[0].confirmedType).toBe('fuse');
    expect(symbols[0].certainty).toBe('confirmed');
    expect(symbols[0].rawLabel).toBe('FU3');
  });

  it('조각으로 태어난 노드에 본체 확정 판독이 오면 본체가 이긴다', () => {
    // 구획 판독이 먼저 도착해 17px 조각이 breaker 노드가 된 뒤, 전체 판독의
    // 79px 확정 퓨즈 몸통이 합류하는 순서. 실측의 S016/S017 형태다.
    const symbols = deduplicateSymbols([
      { localId: 'fragment-first', type: 'breaker', label: '1', bounds: { x: 872, y: 826, w: 24, h: 17 }, confidence: 0.8, pageIndex: 0, regionId: 'grid' },
      { localId: 'body-second', type: 'fuse', label: 'FU5', bounds: { x: 872, y: 826, w: 31, h: 79 }, confidence: 0.9, pageIndex: 0, regionId: 'full', certainty: 'confirmed' as const },
    ]);

    expect(symbols).toHaveLength(1);
    expect(symbols[0].confirmedType).toBe('fuse');
    expect(symbols[0].certainty).toBe('confirmed');
    expect(symbols[0].rawLabel).toBe('FU5');
  });

  it('비슷한 크기끼리의 진짜 충돌은 여전히 ambiguous 로 내린다', () => {
    // 비대칭 규칙은 조각↔본체에만 적용된다. 같은 크기의 두 판독이 타입으로
    // 갈리면 어느 쪽도 확정할 근거가 없다.
    const symbols = deduplicateSymbols([
      { localId: 'read-a', type: 'fuse', bounds: { x: 200, y: 100, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'full', certainty: 'confirmed' as const },
      { localId: 'read-b', type: 'breaker', bounds: { x: 204, y: 106, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'grid' },
    ]);

    expect(symbols).toHaveLength(1);
    expect(symbols[0].confirmedType).toBeUndefined();
    expect(symbols[0].certainty).toBe('ambiguous');
  });

  it('떨어져 있는 개폐 계열은 부분 판독으로도 합치지 않는다', () => {
    // 같은 줄에 늘어선 별개 퓨즈들은 중심이 멀어 부분 판독이 아니다.
    const symbols = deduplicateSymbols([
      { localId: 'fu3', type: 'fuse', label: 'FU3', bounds: { x: 528, y: 826, w: 31, h: 79 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
      { localId: 'fu4', type: 'breaker', label: '1', bounds: { x: 724, y: 829, w: 24, h: 17 }, confidence: 0.8, pageIndex: 0, regionId: 'grid' },
    ]);
    expect(symbols).toHaveLength(2);
  });

  it('QF 지정문자는 차단기를 유지한다', () => {
    const symbols = deduplicateSymbols([
      { localId: 'qf1', type: 'fuse', label: 'QF1', bounds: { x: 10, y: 10, w: 20, h: 20 }, confidence: 0.9, pageIndex: 0, regionId: 'full', certainty: 'confirmed' as const },
    ]);
    expect(symbols[0].confirmedType).toBe('breaker');
  });

  describe('같은 명판을 쪼개 읽은 것과 같은 이름의 기기 두 대를 가른다', () => {
    // 정답 라벨로 보정했다(2026-08-05). 도면의 벡터 텍스트 층에서 앵커를 만들고
    // 근접쌍 83건(SAME 20 · DISTINCT 63)을 채점한 결과, 17차가 안전하다고 본
    // **겹침이 오히려 해로운 신호**였다(DISTINCT 63건 중 16건이 겹친다 — 조밀한
    // 피더 표에서는 이웃 기기 상자가 겹친다). 면적비 단독 5.0 이 오병합 0 이다.
    const tr = (localId: string, label: string, b: { x: number; y: number; w: number; h: number }) => ({
      localId, type: 'transformer', label, bounds: b,
      confidence: 0.9, pageIndex: 0, regionId: localId, certainty: 'confirmed' as const,
    });

    it('명판 앞부분만 잡은 작은 재판독을 본체에 접는다', () => {
      const symbols = deduplicateSymbols([
        tr('full', 'MOLD TR-2 6.6kV/440V 3PH 1000kVA', { x: 996, y: 502, w: 67, h: 64 }),
        // 실측값: 23x37 — 본체 대비 면적비 5.0배.
        tr('partial', 'MOLD TR-2', { x: 969, y: 504, w: 23, h: 37 }),
      ]);
      expect(symbols).toHaveLength(1);
      expect(symbols[0].evidence).toHaveLength(2);
    });

    it('겹치기만 하고 크기가 비슷하면 접지 않는다 — 정답 63건 중 16건이 이 형태다', () => {
      const symbols = deduplicateSymbols([
        tr('left', 'SAX3', { x: 100, y: 100, w: 60, h: 60 }),
        // 이웃 기기: 상자가 겹치지만 크기가 같다. 17차 규칙은 이것을 접었다.
        tr('right', 'SAX3', { x: 140, y: 100, w: 60, h: 60 }),
      ]);
      expect(symbols).toHaveLength(2);
    });

    it('숫자를 가르는 접두는 같은 명판이 아니다', () => {
      const symbols = deduplicateSymbols([
        tr('a', 'TR-1', { x: 100, y: 100, w: 60, h: 60 }),
        tr('b', 'TR-10', { x: 170, y: 100, w: 20, h: 20 }),
      ]);
      expect(symbols).toHaveLength(2);
    });

    it('홑 숫자 라벨은 명판이 아니라 단자 번호로 본다', () => {
      const symbols = deduplicateSymbols([
        tr('a', '1', { x: 100, y: 100, w: 60, h: 60 }),
        tr('b', '1', { x: 170, y: 100, w: 20, h: 20 }),
      ]);
      expect(symbols).toHaveLength(2);
    });

    it('멀리 떨어진 같은 이름 기기는 접지 않는다', () => {
      const symbols = deduplicateSymbols([
        tr('a', 'MOLD TR-1 500kVA', { x: 100, y: 500, w: 67, h: 64 }),
        tr('b', 'MOLD TR-1', { x: 900, y: 500, w: 20, h: 20 }),
      ]);
      expect(symbols).toHaveLength(2);
    });
  });

  describe('도면이 한 번만 선언한 명판은 몇 번을 읽어도 한 대다', () => {
    // 실측(2026-08-06, KIMM 수변전 단선결선도 p5): 잔여 과다 계수는 전부 같은
    // 명판을 1~3% 거리에서 두세 번 읽은 것이었다(`MOLD TR-2` ×3, `DOWN TR` ×2).
    // 크기가 비슷해 면적비 규칙(≥5)에 안 걸렸다. 벡터 앵커 다중도로 가르면
    // 전력변압기가 7/9/8 → 5/5/5 로 접힌다.
    const vector = (localId: string, label: string, x: number) => ({
      localId, type: 'transformer', label, bounds: { x, y: 500, w: 42, h: 42 },
      confidence: 0.9, pageIndex: 0, regionId: 'vector-full', certainty: 'confirmed' as const,
    });
    const raster = (localId: string, label: string, b: { x: number; y: number; w: number; h: number }) => ({
      localId, type: 'transformer', label, bounds: b,
      confidence: 0.9, pageIndex: 0, regionId: 'variant:original', certainty: 'confirmed' as const,
    });

    it('벡터 앵커가 하나뿐인 명판의 여러 판독을 한 대로 접는다', () => {
      const symbols = deduplicateSymbols([
        vector('v', 'MOLD TR-2', 1000),
        // 크기도 비슷하고 겹치지도 않는다 — 종전 규칙 어느 것도 안 걸린다.
        raster('r1', 'MOLD TR-2 6.6kV/440V 3PH 1000kVA', { x: 996, y: 502, w: 67, h: 64 }),
        raster('r2', 'MOLD TR-2 1000kVA', { x: 1120, y: 505, w: 62, h: 60 }),
      ]);
      expect(symbols).toHaveLength(1);
      expect(symbols[0].evidence).toHaveLength(3);
    });

    it('벡터 앵커가 여럿인 명판은 접지 않는다 — 실재하는 반복 기기다', () => {
      // 실도면의 `MCCB ABSc` 는 앵커가 78개(피더 표 행마다 하나)다.
      const symbols = deduplicateSymbols([
        vector('v1', 'MCCB ABSc', 100),
        vector('v2', 'MCCB ABSc', 400),
        raster('r1', 'MCCB ABSc', { x: 96, y: 502, w: 40, h: 40 }),
        raster('r2', 'MCCB ABSc', { x: 396, y: 502, w: 40, h: 40 }),
      ]);
      // 벡터 2 + 라스터 2 가 각자 자리에서만 붙어 2대로 남는다.
      expect(symbols).toHaveLength(2);
    });

    it('벡터도 문자도 없으면 이 규칙은 발화하지 않는다', () => {
      // 근거가 없으면 추측하지 않는다.
      const symbols = deduplicateSymbols([
        raster('r1', 'MOLD TR-2 6.6kV/440V', { x: 996, y: 502, w: 67, h: 64 }),
        raster('r2', 'MOLD TR-2 1000kVA', { x: 1120, y: 505, w: 62, h: 60 }),
      ]);
      expect(symbols).toHaveLength(2);
    });

    it('라스터 원본에서는 판독된 문자 층으로 명판 다중도를 센다', () => {
      // 벡터 앵커가 없는 이미지 업로드. 문자 층이 `MOLD TR-2` 를 한 번만 적었으면
      // 그 이름의 판독은 한 대다.
      const symbols = deduplicateSymbols(
        [
          raster('r1', 'MOLD TR-2 6.6kV/440V', { x: 996, y: 502, w: 67, h: 64 }),
          raster('r2', 'MOLD TR-2 1000kVA', { x: 1120, y: 505, w: 62, h: 60 }),
        ],
        undefined,
        [{ text: 'MOLD TR-2' }, { text: 'MCCB ABSc' }, { text: 'MCCB ABSc' }],
      );
      expect(symbols).toHaveLength(1);
    });

    it('문자 층에 여러 번 적힌 이름은 라스터에서도 접지 않는다', () => {
      const symbols = deduplicateSymbols(
        [
          raster('r1', 'MCCB ABSc', { x: 100, y: 500, w: 40, h: 40 }),
          raster('r2', 'MCCB ABSc', { x: 400, y: 500, w: 40, h: 40 }),
        ],
        undefined,
        [{ text: 'MCCB ABSc' }, { text: 'MCCB ABSc' }],
      );
      expect(symbols).toHaveLength(2);
    });
  });

  describe('같은 자리의 같은 글자는 한 번만 센다', () => {
    // 종전에는 문자 중복 제거가 **아예 없었다** — 정렬 후 ID 만 붙였다. 구획이
    // 겹치게 잘리므로 같은 명판이 2~3 노드로 남았다(실측: `MOLD TR-2` 가
    // 989,511 42x6 과 1027,514 67x10 로 두 번, x 가 4px 겹치고 y 는 같다).
    const text = (s: string, b: { x: number; y: number; w: number; h: number }) => ({
      text: s, bounds: b, pageIndex: 0, certainty: 'confirmed' as const, confidence: 1,
    });

    it('겹쳐 읽힌 같은 글자를 하나로 접고 더 넓은 판독을 남긴다', () => {
      const nodes = assignDisplayIdsForTexts([
        text('MOLD TR-2', { x: 989, y: 511, w: 42, h: 6 }),
        text('MOLD TR-2', { x: 1027, y: 514, w: 67, h: 10 }),
      ]);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].evidence[0].bounds.w).toBe(67);
    });

    it('멀리 떨어진 같은 글자는 각자 센다 — 피더 표의 반복 행이다', () => {
      const nodes = assignDisplayIdsForTexts([
        text('MCCB ABSc', { x: 100, y: 500, w: 60, h: 10 }),
        text('MCCB ABSc', { x: 400, y: 500, w: 60, h: 10 }),
      ]);
      expect(nodes).toHaveLength(2);
    });
  });

  describe('IEC 지정문자는 판독 충돌도 이긴다', () => {
    // 실측(gemini · intermediate · 5회): 매 실행 퓨즈 후보를 14~15개 읽어
    // 놓고 확정은 11~14개였다. 손실은 판독이 아니라 판정이었고, 매번
    // 라벨 FU2 노드가 ["fuse","switch"] 로 남아 있었다.
    it('FU2 를 쥔 노드는 switch 판독과 충돌해도 fuse 로 확정된다', () => {
      const symbols = deduplicateSymbols([
        { localId: 'a', type: 'fuse', label: 'FU2', bounds: { x: 100, y: 100, w: 30, h: 70 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
        { localId: 'b', type: 'switch', bounds: { x: 101, y: 102, w: 30, h: 70 }, confidence: 0.9, pageIndex: 0, regionId: 'crop' },
      ]);

      expect(symbols).toHaveLength(1);
      expect(symbols[0]).toMatchObject({ confirmedType: 'fuse', certainty: 'confirmed', rawLabel: 'FU2' });
      // 진 판독도 후보로 남는다. 지우는 게 아니라 우선순위를 매기는 것이다.
      expect(symbols[0].typeCandidates).toEqual(expect.arrayContaining(['fuse', 'switch']));
    });

    it('지정문자가 없으면 종전대로 ambiguous 로 남는다', () => {
      // 라벨 "1" 은 단자 번호지 지정문자가 아니다. 근거 없이 한쪽을 고르지 않는다.
      const symbols = deduplicateSymbols([
        { localId: 'a', type: 'fuse', label: '1', bounds: { x: 100, y: 100, w: 30, h: 70 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
        { localId: 'b', type: 'breaker', label: '1', bounds: { x: 101, y: 102, w: 30, h: 70 }, confidence: 0.9, pageIndex: 0, regionId: 'crop' },
      ]);
      expect(symbols[0]).toMatchObject({ certainty: 'ambiguous', confirmedType: undefined });
    });

    it('반토막 조각 판독은 지정문자를 쥐고도 확정으로 올리지 않는다', () => {
      // 실측 회귀(2026-08-04): 이 분기를 조각/본체 판정 앞에 뒀더니 26x37
      // 반토막 판독(정상 퓨즈 31x79)이 FU2 라벨만으로 확정돼 퓨즈가 정답
      // 15개에 17개로 넘쳤다. 지정문자는 비슷한 크기끼리의 충돌만 푼다.
      const symbols = deduplicateSymbols([
        { localId: 'body', type: 'fuse', label: 'FU2', bounds: { x: 100, y: 100, w: 31, h: 79 }, confidence: 0.9, pageIndex: 0, regionId: 'full', certainty: 'confirmed' },
        { localId: 'sliver', type: 'switch', label: 'FU2', bounds: { x: 103, y: 102, w: 12, h: 17 }, confidence: 0.9, pageIndex: 0, regionId: 'crop' },
      ]);

      expect(symbols).toHaveLength(1);
      // 본체 확정이 유지된다 — 조각이 본체를 흔들지도, 조각이 별도 퓨즈로 서지도 않는다.
      expect(symbols[0]).toMatchObject({ confirmedType: 'fuse', certainty: 'confirmed' });
      expect(symbols[0].evidence).toHaveLength(2);
    });

    it('지정문자가 선언한 종류를 아무 판독도 내지 않았으면 강제하지 않는다', () => {
      // 라벨은 QF1(차단기)인데 두 판독 모두 변압기다. 라벨만으로 없는
      // 판독을 만들어내면 근거 없는 확정이 된다.
      const symbols = deduplicateSymbols([
        { localId: 'a', type: 'transformer', label: 'QF1', bounds: { x: 100, y: 100, w: 30, h: 70 }, confidence: 0.9, pageIndex: 0, regionId: 'full' },
        { localId: 'b', type: 'voltage_transformer', bounds: { x: 101, y: 102, w: 30, h: 70 }, confidence: 0.9, pageIndex: 0, regionId: 'crop' },
      ]);
      expect(symbols[0].confirmedType).not.toBe('breaker');
    });
  });

  describe('기기 몸체에 갇힌 표기 강등', () => {
    // 실측(저장된 판독 20회, 확정 322개 중 15개): 퓨즈 사각형 안에 인쇄된
    // 단자 번호 "1"·"2" 를 모델이 terminal 기기로 읽었다. 원본 도면에 그
    // 자리 단자대는 없다.
    const fuseBody = {
      localId: 'fuse', type: 'fuse', label: 'FU1',
      bounds: { x: 100, y: 100, w: 40, h: 90 },
      confidence: 0.95, pageIndex: 0, regionId: 'r1', certainty: 'confirmed' as const,
    };
    const insideFuse = (localId: string, type: string, label?: string) => ({
      localId, type, label,
      bounds: { x: 108, y: 104, w: 10, h: 12 },
      confidence: 0.9, pageIndex: 0, regionId: 'r2', certainty: 'confirmed' as const,
    });

    it('퓨즈 몸체 안의 단자 판독을 강등하고 확인 항목을 남긴다', () => {
      const symbols = deduplicateSymbols([fuseBody, insideFuse('term', 'terminal', '1')]);
      expect(symbols).toHaveLength(2);

      const items = demoteContainedMarkings(symbols);
      const fuse = symbols.find((s) => s.rawLabel === 'FU1')!;
      const terminal = symbols.find((s) => s.rawLabel === '1')!;

      expect(fuse.certainty).toBe('confirmed');
      // 노드도 근거도 지우지 않는다. 물리 수에서만 빠진다.
      expect(terminal.certainty).toBe('ambiguous');
      expect(terminal.confirmedType).toBeUndefined();
      expect(terminal.evidence).toHaveLength(1);

      expect(items).toHaveLength(1);
      expect(items[0].displayId).toBe(terminal.displayId);
      expect(items[0].candidates).toEqual(['terminal']);
      expect(items[0].userConfirmItems?.[0].question).toContain(fuse.displayId);
      expect(items[0].note).toContain(fuse.displayId);
    });

    it('구조 기기는 갇혀 있어도 강등하지 않는다', () => {
      // source·protection·load·bus 분류는 "경로에 보호기 없음" critical 소견의
      // 입력이다. 여기서 조용히 내리면 그 판정이 같이 사라진다.
      const symbols = deduplicateSymbols([fuseBody, insideFuse('inner-cb', 'mccb', 'CB9')]);
      const items = demoteContainedMarkings(symbols);
      expect(symbols.every((s) => s.certainty === 'confirmed')).toBe(true);
      expect(items).toHaveLength(0);
    });

    it('몸체가 4배 미만이면 갇힌 것으로 보지 않는다', () => {
      const symbols = deduplicateSymbols([
        // 400 : 120 = 3.3배. 몸체와 표기가 아니라 겹쳐 그린 두 기기일 수 있다.
        { ...fuseBody, bounds: { x: 100, y: 100, w: 20, h: 20 } },
        insideFuse('term', 'terminal', '1'),
      ]);
      expect(demoteContainedMarkings(symbols)).toHaveLength(0);
    });

    it('다른 페이지의 같은 좌표는 갇힌 것이 아니다', () => {
      const symbols = deduplicateSymbols([
        fuseBody,
        { ...insideFuse('term', 'terminal', '1'), pageIndex: 1 },
      ]);
      expect(demoteContainedMarkings(symbols)).toHaveLength(0);
    });
  });
});
