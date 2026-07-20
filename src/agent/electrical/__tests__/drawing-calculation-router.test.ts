import type { NormalizedElectricalGraph, NormalizedSpec } from '../domain-normalizer';
import { normalizeElectricalGraph } from '../domain-normalizer';
import type { SpatialEvidenceGraph, SpatialLine, SpatialSymbol, SpatialText } from '../../vision/spatial-graph';
import { getCalculator } from '@/engine/calculators';
import { routeDrawingCalculations } from '../drawing-calculation-router';

const DRAWING_HASH = 'd'.repeat(64);

function bounds(x: number, page = 1) {
  return { page, x, y: 0, w: 10, h: 10 };
}

function symbol(id: string, type: string, x: number, page = 1): SpatialSymbol {
  return {
    id,
    originalEvidenceId: `symbol:${id}`,
    originalEvidenceIds: [`symbol:${id}`],
    sourceIds: [`source:symbol:${id}`],
    typeCandidates: [type],
    rawLabel: id,
    bounds: bounds(x, page),
    ports: [],
    confidence: 0.9,
  };
}

function text(id: string, raw: string, x: number, page = 1): SpatialText {
  return {
    id,
    originalEvidenceId: `text:${id}`,
    originalEvidenceIds: [`text:${id}`],
    sourceIds: [`source:text:${id}`],
    raw,
    candidates: [raw],
    bounds: bounds(x, page),
    confidence: 0.9,
  };
}

function line(id: string, fromX: number, toX: number, pages: number[] = [1]): SpatialLine {
  const start = { x: fromX, y: 5 };
  const end = { x: toX, y: 5 };
  return {
    id,
    originalEvidenceId: `line:${id}`,
    originalEvidenceIds: [`line:${id}`],
    sourceIds: [`source:line:${id}`],
    lineKind: 'power',
    path: [start, end],
    start,
    end,
    junctions: [],
    crossovers: [],
    confidence: 0.9,
    pages,
  };
}

function graph(): SpatialEvidenceGraph {
  return {
    drawingHash: DRAWING_HASH,
    symbols: [symbol('CABLE-01', 'CABLE', 0), symbol('VCB-01', 'VCB', 100), symbol('TR-01', 'TRANSFORMER', 200), symbol('CT-01', 'CT', 300)],
    lines: [],
    texts: [],
    junctions: [],
    crossovers: [],
    edges: [],
    textLinks: [],
    conflicts: [],
  };
}

function calculationGraph(): SpatialEvidenceGraph {
  return {
    drawingHash: DRAWING_HASH,
    symbols: [symbol('CABLE-01', 'CABLE', 0), symbol('VCB-01', 'VCB', 100), symbol('TR-01', 'TRANSFORMER', 200), symbol('CT-01', 'CT', 300)],
    lines: [line('LINE-CABLE-VCB', 20, 100)],
    texts: [
      text('CABLE-TEXT', 'CV 3C 35mm2 Cu 80m', 0),
      text('PHASE-TEXT', '3상', 0),
      text('VCB-TEXT', '380V 부하전류 120A 단락전류 25kA 허용전류 150A 역률 0.9', 100),
      text('TR-TEXT', '총부하 500kW 역률 0.9 효율 95% 수용률 80% 안전율 0.1', 200),
      text('CT-TEXT', '최대부하전류 120A burden 15VA lead length 30m lead size 2.5mm2 accuracy class 5P', 300),
    ],
    junctions: [],
    crossovers: [],
    edges: [{ id: 'EDGE-CABLE-VCB', from: 'CABLE-01', to: 'VCB-01', lineId: 'LINE-CABLE-VCB', confidence: 0.9 }],
    textLinks: [
      { id: 'LINK-CABLE', textId: 'CABLE-TEXT', symbolId: 'CABLE-01', confidence: 1 },
      { id: 'LINK-PHASE', textId: 'PHASE-TEXT', symbolId: 'CABLE-01', confidence: 1 },
      { id: 'LINK-VCB', textId: 'VCB-TEXT', symbolId: 'VCB-01', confidence: 1 },
      { id: 'LINK-TR', textId: 'TR-TEXT', symbolId: 'TR-01', confidence: 1 },
      { id: 'LINK-CT', textId: 'CT-TEXT', symbolId: 'CT-01', confidence: 1 },
    ],
    conflicts: [],
  };
}

function setTextRaw(source: SpatialEvidenceGraph, id: string, raw: string): void {
  const item = source.texts.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`missing test text: ${id}`);
  item.raw = raw;
  item.candidates = [raw];
}

function receiptFor(receipts: ReturnType<typeof routeDrawingCalculations>, calculatorId: string, ownerId: string) {
  return receipts.find((receipt) => receipt.calculatorId === calculatorId && receipt.scopeKey.startsWith(`${ownerId}@`));
}

describe('routeDrawingCalculations', () => {
  it('calls all four real calculators only from complete graph-backed normalized evidence and keeps HOLD', () => {
    const receipts = routeDrawingCalculations(normalizeElectricalGraph(calculationGraph()));

    expect(receiptFor(receipts, 'voltage-drop', 'CABLE-01')).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
    expect(receiptFor(receipts, 'breaker-sizing', 'VCB-01')).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
    expect(receiptFor(receipts, 'transformer-capacity', 'TR-01')).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
    expect(receiptFor(receipts, 'ct-sizing', 'CT-01')).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
    expect(receiptFor(receipts, 'voltage-drop', 'CABLE-01')?.inputEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ adapterField: 'voltage', normalizedField: 'voltage_V', sourceUnit: 'V', targetUnit: 'V', transform: 'identity' }),
      expect.objectContaining({ adapterField: 'conductor', normalizedField: 'conductorMaterial', value: 'Cu' }),
    ]));
  });

  it('skips missing required input without invoking that calculator', () => {
    const normalizedGraph = normalizeElectricalGraph(calculationGraph());
    const withoutVoltage = { ...normalizedGraph, specs: normalizedGraph.specs.filter((item) => !(item.ownerId === 'VCB-01' && item.field === 'voltage_V')) };
    const receipt = receiptFor(routeDrawingCalculations(withoutVoltage), 'breaker-sizing', 'VCB-01');

    expect(receipt).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD', calculatorResult: undefined });
    expect(receipt?.missingInputs).toEqual(expect.arrayContaining([expect.objectContaining({ adapterField: 'voltage' })]));
  });

  it('does not substitute breaking capacity for prospective fault current', () => {
    const source = calculationGraph();
    setTextRaw(source, 'VCB-TEXT', '380V 부하전류 120A 정격차단전류 25kA 허용전류 150A 역률 0.9');
    const receipt = receiptFor(routeDrawingCalculations(normalizeElectricalGraph(source)), 'breaker-sizing', 'VCB-01');

    expect(receipt).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD', calculatorResult: undefined });
    expect(receipt?.missingInputs).toEqual(expect.arrayContaining([expect.objectContaining({ adapterField: 'shortCircuitCurrent' })]));
  });

  it('fails closed on conflicting values and preserves deterministic duplicate lineage', () => {
    const ambiguousSource = calculationGraph();
    ambiguousSource.texts.push(text('LOAD-CONFLICT', '부하전류 130A', 110));
    ambiguousSource.textLinks.push({ id: 'LINK-LOAD-CONFLICT', textId: 'LOAD-CONFLICT', symbolId: 'VCB-01', confidence: 1 });
    const skipped = receiptFor(routeDrawingCalculations(normalizeElectricalGraph(ambiguousSource)), 'breaker-sizing', 'VCB-01');
    expect(skipped).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
    expect(skipped?.ambiguousInputs).toEqual(expect.arrayContaining([expect.objectContaining({ adapterField: 'loadCurrent' })]));

    const duplicateSource = calculationGraph();
    const duplicate = text('VCB-TEXT-Z', duplicateSource.texts.find((item) => item.id === 'VCB-TEXT')!.raw, 100);
    duplicateSource.texts.push(duplicate);
    duplicateSource.textLinks.push({ id: 'LINK-VCB-Z', textId: duplicate.id, symbolId: 'VCB-01', confidence: 1 });
    const forward = routeDrawingCalculations(normalizeElectricalGraph(duplicateSource));
    const backward = routeDrawingCalculations(normalizeElectricalGraph({ ...duplicateSource, texts: [...duplicateSource.texts].reverse(), textLinks: [...duplicateSource.textLinks].reverse() }));
    expect(backward).toEqual(forward);
  });

  it('discloses calculator defaults and refuses evidence with missing provenance', () => {
    const withoutMarginSource = calculationGraph();
    setTextRaw(withoutMarginSource, 'TR-TEXT', '총부하 500kW 역률 0.9 효율 95% 수용률 80%');
    const withoutMargin = receiptFor(
      routeDrawingCalculations(normalizeElectricalGraph(withoutMarginSource)),
      'transformer-capacity',
      'TR-01',
    );
    const normalizedGraph = normalizeElectricalGraph(calculationGraph());
    const malformed = { ...normalizedGraph, specs: normalizedGraph.specs.map((item) => item.ownerId === 'VCB-01' && item.field === 'voltage_V' ? { ...item, sourceIds: [] } : item) };
    const skipped = receiptFor(routeDrawingCalculations(malformed), 'breaker-sizing', 'VCB-01');

    expect(withoutMargin).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
    expect(withoutMargin?.optionalDefaultsUsed).toEqual([
      expect.objectContaining({ name: 'growthMargin', value: 0, meaning: expect.stringContaining('calculator-internal') }),
    ]);
    expect(skipped).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
    expect(skipped?.missingInputs).toEqual(expect.arrayContaining([expect.objectContaining({ adapterField: 'voltage' })]));
  });

  it('skips foreign, missing, and cross-page owner contexts before registry lookup', () => {
    const calls: string[] = [];
    const lookup = (id: string) => { calls.push(id); return getCalculator(id); };
    const normalizedGraph = normalizeElectricalGraph(calculationGraph());
    const foreign = normalizedGraph.specs.filter((item) => item.ownerId === 'VCB-01').map((item) => ({ ...item, ownerId: 'NOT-IN-GRAPH' }));
    const crossPage = normalizedGraph.specs.filter((item) => item.ownerId === 'TR-01').map((item) => ({ ...item, bounds: bounds(200, 2) }));
    const missing = normalizedGraph.specs.filter((item) => item.ownerId === 'CT-01').map(({ ownerId: _ownerId, ...item }) => item);
    const receipts = routeDrawingCalculations({ ...normalizedGraph, specs: [...foreign, ...crossPage, ...missing] }, { getCalculator: lookup });

    expect(calls).toEqual([]);
    expect(receipts).toHaveLength(12);
    expect(receipts.every((receipt) => receipt.status === 'SKIPPED' && receipt.judgment === 'HOLD')).toBe(true);
    expect(receipts.every((receipt) => receipt.scopeIssues.some((issue) => issue.startsWith('OWNER_CONTEXT_UNRESOLVED:')))).toBe(true);
  });

  it('uses actual normalizer output without invented fields and never turns unresolved owners into calculations', () => {
    const source = graph();
    source.texts = [text('TEXT-01', '부하전류 120A 단락전류 25kA 380V', 1_000)];
    const result = normalizeElectricalGraph(source);
    const receipts = routeDrawingCalculations(result);

    expect(receipts.every((receipt) => receipt.status === 'SKIPPED')).toBe(true);
    expect(receipts.every((receipt) => receipt.judgment === 'HOLD')).toBe(true);
    expect(receipts.every((receipt) => receipt.scopeIssues.some((issue) => issue.startsWith('OWNER_CONTEXT_UNRESOLVED:unresolved@')))).toBe(true);
  });

  it('redacts calculator errors and reports unavailable registry entries as ERROR/HOLD', () => {
    const lookup = (id: string) => id === 'breaker-sizing'
      ? { ...getCalculator(id)!, calculator: () => { throw new Error('token=secret raw OCR /C:/private'); } }
      : undefined;
    const receipts = routeDrawingCalculations(normalizeElectricalGraph(calculationGraph()), { getCalculator: lookup });
    const breaker = receiptFor(receipts, 'breaker-sizing', 'VCB-01');
    const voltage = receiptFor(receipts, 'voltage-drop', 'CABLE-01');

    expect(breaker).toMatchObject({ status: 'ERROR', judgment: 'HOLD', error: { code: 'CALCULATOR_EXECUTION_FAILED', message: 'Calculator execution failed.' } });
    expect(JSON.stringify(breaker)).not.toMatch(/secret|OCR|private|stack/i);
    expect(voltage).toMatchObject({ status: 'ERROR', judgment: 'HOLD', error: { code: 'CALCULATOR_UNAVAILABLE' } });
  });

  it('combines uniquely edge-linked same-page cable and breaker evidence from the real normalizer for voltage drop', () => {
    const receipts = routeDrawingCalculations(normalizeElectricalGraph(calculationGraph()));
    const voltageDrop = receiptFor(receipts, 'voltage-drop', 'CABLE-01');

    expect(voltageDrop).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
    expect(voltageDrop?.inputEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ adapterField: 'length', evidenceId: 'CABLE-TEXT' }),
      expect.objectContaining({ adapterField: 'voltage', evidenceId: 'VCB-TEXT' }),
      expect.objectContaining({ adapterField: 'current', evidenceId: 'VCB-TEXT' }),
    ]));
  });

  it('keeps breaker, transformer, and CT routes live on the same real normalizer graph', () => {
    const receipts = routeDrawingCalculations(normalizeElectricalGraph(calculationGraph()));

    expect(receiptFor(receipts, 'breaker-sizing', 'VCB-01')).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
    expect(receiptFor(receipts, 'transformer-capacity', 'TR-01')).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
    expect(receiptFor(receipts, 'ct-sizing', 'CT-01')).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
  });

  it('keeps connected real-normalizer receipts deterministic under source permutations', () => {
    const source = calculationGraph();
    const permuted: SpatialEvidenceGraph = {
      ...source,
      symbols: [...source.symbols].reverse(),
      lines: [...source.lines].reverse(),
      texts: [...source.texts].reverse(),
      edges: [...source.edges].reverse(),
      textLinks: [...source.textLinks].reverse(),
    };

    expect(routeDrawingCalculations(normalizeElectricalGraph(permuted))).toEqual(routeDrawingCalculations(normalizeElectricalGraph(source)));
  });

  it('holds voltage drop when cable and breaker are not connected', () => {
    const source = calculationGraph();
    source.lines = [];
    source.edges = [];

    expect(receiptFor(routeDrawingCalculations(normalizeElectricalGraph(source)), 'voltage-drop', 'CABLE-01')).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
  });

  it('holds voltage drop when the same cable and breaker have multiple graph paths', () => {
    const source = calculationGraph();
    source.lines.push(line('LINE-CABLE-VCB-2', 20, 100));
    source.edges.push({ id: 'EDGE-CABLE-VCB-2', from: 'CABLE-01', to: 'VCB-01', lineId: 'LINE-CABLE-VCB-2', confidence: 0.8 });

    expect(receiptFor(routeDrawingCalculations(normalizeElectricalGraph(source)), 'voltage-drop', 'CABLE-01')).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
  });

  it('holds voltage drop when a cable has multiple connected breaker evidence candidates', () => {
    const source = calculationGraph();
    source.symbols.push(symbol('VCB-02', 'VCB', 500));
    source.texts.push(text('VCB-TEXT-2', '380V 부하전류 100A 역률 0.85', 500));
    source.textLinks.push({ id: 'LINK-VCB-2', textId: 'VCB-TEXT-2', symbolId: 'VCB-02', confidence: 1 });
    source.lines.push(line('LINE-CABLE-VCB-2', 20, 500));
    source.edges.push({ id: 'EDGE-CABLE-VCB-2', from: 'CABLE-01', to: 'VCB-02', lineId: 'LINE-CABLE-VCB-2', confidence: 0.8 });

    expect(receiptFor(routeDrawingCalculations(normalizeElectricalGraph(source)), 'voltage-drop', 'CABLE-01')).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
  });

  it('holds voltage drop when the linked breaker evidence is on another page', () => {
    const source = calculationGraph();
    const breaker = source.symbols.find((item) => item.id === 'VCB-01');
    const breakerText = source.texts.find((item) => item.id === 'VCB-TEXT');
    if (!breaker || !breakerText) throw new Error('missing cross-page fixture evidence');
    breaker.bounds = bounds(100, 2);
    breakerText.bounds = bounds(100, 2);
    source.lines[0].pages = [1, 2];

    expect(receiptFor(routeDrawingCalculations(normalizeElectricalGraph(source)), 'voltage-drop', 'CABLE-01')).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
  });

  it('fails closed instead of defaulting an explicitly invalid transformer growth margin', () => {
    const source = calculationGraph();
    setTextRaw(source, 'TR-TEXT', '총부하 500kW 역률 0.9 효율 95% 수용률 80% 안전율 1.25');
    const receipt = receiptFor(routeDrawingCalculations(normalizeElectricalGraph(source)), 'transformer-capacity', 'TR-01');

    expect(receipt).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
    expect(receipt?.missingInputs).toEqual(expect.arrayContaining([expect.objectContaining({ adapterField: 'growthMargin' })]));
    expect(receipt?.optionalDefaultsUsed).toEqual([]);
  });

  it('fails closed when the normalizer rejects an explicit zero-percent transformer growth margin', () => {
    const source = calculationGraph();
    setTextRaw(source, 'TR-TEXT', '총부하 500kW 역률 0.9 효율 95% 수용률 80% 안전율 0%');
    const normalized = normalizeElectricalGraph(source);
    const receipt = receiptFor(routeDrawingCalculations(normalized), 'transformer-capacity', 'TR-01');

    expect(normalized.specs.some((spec) => spec.field === 'safetyMargin')).toBe(false);
    expect(normalized.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'HOLD_UNSUPPORTED_OR_MALFORMED_VALUE',
        evidenceId: 'TR-TEXT',
        field: 'safetyMargin',
      }),
    ]));
    expect(receipt).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
    expect(receipt?.missingInputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ adapterField: 'growthMargin', normalizedFields: ['safetyMargin'] }),
    ]));
    expect(receipt?.optionalDefaultsUsed).toEqual([]);
  });

  it.each([
    {
      label: 'ambiguous transformer growth margin',
      textId: 'TR-TEXT',
      raw: '총부하 500kW 역률 0.9 효율 95% 수용률 80% 안전율 0.1 안전율 0.2',
      calculatorId: 'transformer-capacity',
      ownerId: 'TR-01',
      adapterField: 'growthMargin',
      warningField: 'safetyMargin',
      issueKey: 'ambiguousInputs',
    },
    {
      label: 'malformed cable ampacity',
      textId: 'VCB-TEXT',
      raw: '380V 부하전류 120A 단락전류 25kA 허용전류 0A 역률 0.9',
      calculatorId: 'breaker-sizing',
      ownerId: 'VCB-01',
      adapterField: 'cableAmpacity',
      warningField: 'cableAmpacity_A',
      issueKey: 'missingInputs',
    },
    {
      label: 'ambiguous cable ampacity',
      textId: 'VCB-TEXT',
      raw: '380V 부하전류 120A 단락전류 25kA 허용전류 150A 허용전류 160A 역률 0.9',
      calculatorId: 'breaker-sizing',
      ownerId: 'VCB-01',
      adapterField: 'cableAmpacity',
      warningField: 'cableAmpacity_A',
      issueKey: 'ambiguousInputs',
    },
  ] as const)('maps $label normalizer warnings to optional-input HOLD', ({
    textId, raw, calculatorId, ownerId, adapterField, warningField, issueKey,
  }) => {
    const source = calculationGraph();
    setTextRaw(source, textId, raw);
    const normalized = normalizeElectricalGraph(source);
    const receipt = receiptFor(routeDrawingCalculations(normalized), calculatorId, ownerId);

    expect(normalized.specs.some((spec) => spec.field === warningField)).toBe(false);
    expect(normalized.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ evidenceId: textId, field: warningField }),
    ]));
    expect(receipt).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
    expect(receipt?.[issueKey]).toEqual(expect.arrayContaining([
      expect.objectContaining({ adapterField }),
    ]));
  });

  it('fails closed instead of dropping ambiguous explicit cable ampacity evidence', () => {
    const source = calculationGraph();
    source.texts.push(text('AMPACITY-TEXT-2', '허용전류 160A', 110));
    source.textLinks.push({ id: 'LINK-AMPACITY-2', textId: 'AMPACITY-TEXT-2', symbolId: 'VCB-01', confidence: 1 });
    const receipt = receiptFor(routeDrawingCalculations(normalizeElectricalGraph(source)), 'breaker-sizing', 'VCB-01');

    expect(receipt).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
    expect(receipt?.ambiguousInputs).toEqual(expect.arrayContaining([expect.objectContaining({ adapterField: 'cableAmpacity' })]));
  });

  it('uses a transformer default only when growth margin evidence is truly absent', () => {
    const source = calculationGraph();
    setTextRaw(source, 'TR-TEXT', '총부하 500kW 역률 0.9 효율 95% 수용률 80%');
    const receipt = receiptFor(routeDrawingCalculations(normalizeElectricalGraph(source)), 'transformer-capacity', 'TR-01');

    expect(receipt).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
    expect(receipt?.optionalDefaultsUsed).toEqual([expect.objectContaining({ name: 'growthMargin', value: 0 })]);
  });

  it.each([
    ['evidenceId', (spec: NormalizedSpec): NormalizedSpec => ({ ...spec, evidenceId: 'NOT-IN-GRAPH' })],
    ['raw', (spec: NormalizedSpec): NormalizedSpec => ({ ...spec, raw: 'forged raw' })],
    ['bounds', (spec: NormalizedSpec): NormalizedSpec => ({ ...spec, bounds: { ...spec.bounds, x: spec.bounds.x + 1 } })],
    ['original lineage', (spec: NormalizedSpec): NormalizedSpec => ({ ...spec, originalEvidenceIds: [...spec.originalEvidenceIds, 'NOT-IN-GRAPH'] })],
    ['source lineage', (spec: NormalizedSpec): NormalizedSpec => ({ ...spec, sourceIds: [...spec.sourceIds, 'NOT-IN-GRAPH'] })],
  ])('rejects a required spec whose %s does not match current source graph evidence', (_label, mutate) => {
    const normalizedGraph = normalizeElectricalGraph(calculationGraph());
    const tampered: NormalizedElectricalGraph = {
      ...normalizedGraph,
      specs: normalizedGraph.specs.map((item) => item.ownerId === 'VCB-01' && item.field === 'voltage_V' ? mutate(item) : item),
    };
    const receipt = receiptFor(routeDrawingCalculations(tampered), 'breaker-sizing', 'VCB-01');

    expect(receipt).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
    expect(receipt?.missingInputs).toEqual(expect.arrayContaining([expect.objectContaining({ adapterField: 'voltage' })]));
  });

  it('rejects source-backed specs whose owner was forged to bypass graph connection evidence', () => {
    const normalizedGraph = normalizeElectricalGraph(calculationGraph());
    const tampered: NormalizedElectricalGraph = {
      ...normalizedGraph,
      graph: { ...normalizedGraph.graph, lines: [], edges: [] },
      specs: normalizedGraph.specs.map((item) => item.ownerId === 'VCB-01' && ['voltage_V', 'loadCurrent_A', 'powerFactor'].includes(item.field)
        ? { ...item, ownerId: 'CABLE-01' }
        : item),
    };

    expect(receiptFor(routeDrawingCalculations(tampered), 'voltage-drop', 'CABLE-01')).toMatchObject({ status: 'SKIPPED', judgment: 'HOLD' });
  });

  it('accepts only the canonical text and graph-backed lineage union emitted by normalizer dedupe', () => {
    const source = calculationGraph();
    const duplicate = text('VCB-TEXT-Z', source.texts.find((item) => item.id === 'VCB-TEXT')!.raw, 100);
    source.texts.push(duplicate);
    source.textLinks.push({ id: 'LINK-VCB-Z', textId: duplicate.id, symbolId: 'VCB-01', confidence: 1 });
    const receipt = receiptFor(routeDrawingCalculations(normalizeElectricalGraph(source)), 'breaker-sizing', 'VCB-01');
    const voltage = receipt?.inputEvidence.find((item) => item.adapterField === 'voltage');

    expect(receipt).toMatchObject({ status: 'CALCULATED', judgment: 'HOLD' });
    expect(voltage).toMatchObject({ evidenceId: 'VCB-TEXT' });
    expect(voltage?.originalEvidenceIds).toEqual(['text:VCB-TEXT', 'text:VCB-TEXT-Z']);
    expect(voltage?.sourceIds).toEqual(['source:text:VCB-TEXT', 'source:text:VCB-TEXT-Z']);
  });

  it('redacts registry lookup failures into safe ERROR/HOLD receipts', () => {
    const receipts = routeDrawingCalculations(normalizeElectricalGraph(calculationGraph()), {
      getCalculator: () => { throw new Error('token=secret raw OCR /C:/private'); },
    });
    const errors = receipts.filter((item) => item.status === 'ERROR');

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((item) => item.judgment === 'HOLD' && item.error?.message === 'Calculator lookup failed.')).toBe(true);
    expect(JSON.stringify(errors)).not.toMatch(/secret|OCR|private|stack/i);
  });
});
