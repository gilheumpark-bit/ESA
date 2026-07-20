import type { NormalizedElectricalGraph, NormalizedSpec } from '../domain-normalizer';
import type { SpatialEdge, SpatialEvidenceGraph, SpatialLine, SpatialSymbol, SpatialText, SpatialTextLink } from '../../vision/spatial-graph';
import { validateElectricalInvariants } from '../electrical-invariants';

const HASH = 'a'.repeat(64);

function bounds(x: number, page = 1) {
  return { x, y: 0, w: 10, h: 10, page };
}

function symbol(id: string, candidate: string, label = candidate, x = 0, page = 1): SpatialSymbol {
  return {
    id,
    sourceId: `source:${id}`,
    typeCandidates: [candidate],
    rawLabel: label,
    bounds: bounds(x, page),
    ports: [{ x, y: 5 }],
    confidence: 0.9,
    originalEvidenceId: `symbol:${id}`,
    originalEvidenceIds: [`symbol:${id}`],
    sourceIds: [`source:${id}`],
  };
}

function line(id: string, kind: SpatialLine['lineKind'] = 'power', page = 1): SpatialLine {
  return {
    id,
    sourceId: `source:${id}`,
    lineKind: kind,
    path: [{ x: 0, y: 5 }, { x: 100, y: 5 }],
    start: { x: 0, y: 5 },
    end: { x: 100, y: 5 },
    junctions: [],
    crossovers: [],
    confidence: 0.9,
    originalEvidenceId: `line:${id}`,
    originalEvidenceIds: [`line:${id}`],
    sourceIds: [`source:${id}`],
    pages: [page],
  };
}

function edge(id: string, from: string, to: string, lineId: string): SpatialEdge {
  return { id, from, to, lineId, confidence: 0.9 };
}

function text(id: string, raw: string, x = 0, page = 1, provenance = true): SpatialText {
  return {
    id,
    sourceId: provenance ? `source:${id}` : undefined,
    raw,
    candidates: [raw],
    bounds: bounds(x, page),
    confidence: 0.9,
    originalEvidenceId: `text:${id}`,
    originalEvidenceIds: provenance ? [`text:${id}`] : [],
    sourceIds: provenance ? [`source:${id}`] : [],
  };
}

function textLink(id: string, textId: string, symbolId: string): SpatialTextLink {
  return { id, textId, symbolId, confidence: 0.9 };
}

function voltage(ownerId: string, value: number, source = true, page = 1): NormalizedSpec {
  return {
    drawingHash: HASH,
    ownerId,
    field: 'voltage_V',
    value,
    unit: 'V',
    raw: `${value}V`,
    evidenceId: `text:voltage:${ownerId}`,
    originalEvidenceIds: source ? [`text:voltage:${ownerId}`] : [],
    sourceIds: source ? [`source:voltage:${ownerId}`] : [],
    bounds: bounds(0, page),
    confidence: 0.9,
  };
}

type FixtureOptions = {
  symbols?: SpatialSymbol[];
  lines?: SpatialLine[];
  edges?: SpatialEdge[];
  texts?: SpatialText[];
  textLinks?: SpatialTextLink[];
  conflicts?: string[];
  specs?: NormalizedSpec[];
};

function makeNormalizedFixture(options: FixtureOptions = {}): NormalizedElectricalGraph {
  const symbols = options.symbols ?? [
    symbol('GEN-01', 'GEN', 'GEN', 0),
    symbol('VCB-01', 'VCB', 'VCB', 40),
    symbol('LOAD-01', 'LOAD', 'LOAD', 80),
  ];
  const lines = options.lines ?? [line('LINE-01'), line('LINE-02')];
  const edges = options.edges ?? [
    edge('EDGE-01', 'VCB-01', 'GEN-01', 'LINE-01'),
    edge('EDGE-02', 'LOAD-01', 'VCB-01', 'LINE-02'),
  ];
  const graph: SpatialEvidenceGraph = {
    drawingHash: HASH,
    symbols,
    lines,
    texts: options.texts ?? [],
    junctions: [],
    crossovers: [],
    edges,
    textLinks: options.textLinks ?? [],
    conflicts: options.conflicts ?? [],
  };
  return { graph, drawingHash: HASH, specs: options.specs ?? [], warnings: [] };
}

describe('electrical invariants', () => {
  it('blocks dangling endpoints with line provenance and page', () => {
    const input = makeNormalizedFixture({
      edges: [edge('EDGE-01', 'GEN-01', 'MISSING-01', 'LINE-01')],
      lines: [line('LINE-01', 'power', 2)],
    });

    expect(validateElectricalInvariants(input)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'DANGLING_EDGE',
        judgment: 'BLOCK',
        evidence: expect.objectContaining({ originalEvidenceIds: expect.arrayContaining(['line:LINE-01']), pages: expect.arrayContaining([2]) }),
      }),
    ]));
  });

  it('holds isolated devices without declaring failure', () => {
    const issues = validateElectricalInvariants(makeNormalizedFixture({
      symbols: [symbol('LOAD-01', 'LOAD')],
      lines: [],
      edges: [],
    }));

    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ISOLATED_DEVICE', judgment: 'HOLD' })]));
    expect(issues.some((issue) => issue.judgment === 'FAIL')).toBe(false);
  });

  it('orients one acyclic source-to-load component without trusting edge order', () => {
    const issues = validateElectricalInvariants(makeNormalizedFixture());

    expect(issues.some((issue) => issue.code === 'NO_UPSTREAM_PROTECTION')).toBe(false);
    const judgments: string[] = issues.map((issue) => issue.judgment);
    expect(judgments).not.toContain('PASS');
  });

  it('holds a path with no confirmed protection', () => {
    const issues = validateElectricalInvariants(makeNormalizedFixture({
      symbols: [symbol('GEN-01', 'GEN', 'GEN', 0), symbol('LOAD-01', 'LOAD', 'LOAD', 80)],
      lines: [line('LINE-01')],
      edges: [edge('EDGE-01', 'LOAD-01', 'GEN-01', 'LINE-01')],
    }));

    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'NO_UPSTREAM_PROTECTION', judgment: 'HOLD' })]));
  });

  it('fails only an explicitly linked unprotected path', () => {
    const explicit = makeNormalizedFixture({
      symbols: [symbol('GEN-01', 'GEN', 'GEN', 0), symbol('LOAD-01', 'LOAD', 'LOAD', 80)],
      lines: [line('LINE-01')],
      edges: [edge('EDGE-01', 'GEN-01', 'LOAD-01', 'LINE-01')],
      texts: [text('TEXT-01', 'NO PROTECTION', 80)],
      textLinks: [textLink('LINK-01', 'TEXT-01', 'LOAD-01')],
    });
    const failed = validateElectricalInvariants(explicit);
    expect(failed).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'EXPLICIT_UNPROTECTED_PATH', judgment: 'FAIL', evidence: expect.objectContaining({ originalEvidenceIds: expect.arrayContaining(['text:TEXT-01']), pages: [1] }) }),
    ]));

    const missingProvenance: NormalizedElectricalGraph = {
      ...explicit,
      graph: {
        ...explicit.graph,
        texts: explicit.graph.texts.map((item) => item.id === 'TEXT-01' ? { ...item, sourceIds: [] } : item),
      },
    };
    const held = validateElectricalInvariants(missingProvenance);
    expect(held.some((issue) => issue.code === 'EXPLICIT_UNPROTECTED_PATH')).toBe(false);
    expect(held).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'NO_UPSTREAM_PROTECTION', judgment: 'HOLD' })]));
  });

  it('holds multiple sources, missing paths, and cyclic direction', () => {
    const multi = makeNormalizedFixture({
      symbols: [symbol('GEN-01', 'GEN', 'GEN', 0), symbol('GEN-02', 'UPS', 'UPS', 40), symbol('LOAD-01', 'LOAD', 'LOAD', 80)],
      lines: [line('LINE-01'), line('LINE-02')],
      edges: [edge('EDGE-01', 'GEN-01', 'LOAD-01', 'LINE-01'), edge('EDGE-02', 'GEN-02', 'LOAD-01', 'LINE-02')],
    });
    const missing = makeNormalizedFixture({
      symbols: [symbol('LOAD-01', 'LOAD')], lines: [], edges: [],
    });
    const cycle = makeNormalizedFixture({
      lines: [line('LINE-01'), line('LINE-02'), line('LINE-03')],
      edges: [edge('EDGE-01', 'GEN-01', 'VCB-01', 'LINE-01'), edge('EDGE-02', 'VCB-01', 'LOAD-01', 'LINE-02'), edge('EDGE-03', 'LOAD-01', 'GEN-01', 'LINE-03')],
    });

    expect(validateElectricalInvariants(multi)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'MULTIPLE_SOURCE_LOAD_PATHS', judgment: 'HOLD' })]));
    expect(validateElectricalInvariants(missing)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'NO_SOURCE_LOAD_PATH', judgment: 'HOLD' })]));
    expect(validateElectricalInvariants(cycle)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'DIRECTION_AMBIGUOUS', judgment: 'HOLD' })]));
  });

  it('uses only recognized aliases and rejects mixed-role candidates', () => {
    const mixed = makeNormalizedFixture({
      symbols: [
        symbol('GEN-01', 'GEN', 'GEN', 0),
        { ...symbol('AMB-01', 'VCB', 'VCB', 40), typeCandidates: ['VCB', 'SWITCH'] },
        symbol('LOAD-01', 'LOAD', 'LOAD', 80),
      ],
      lines: [line('LINE-01'), line('LINE-02')],
      edges: [edge('EDGE-01', 'GEN-01', 'AMB-01', 'LINE-01'), edge('EDGE-02', 'AMB-01', 'LOAD-01', 'LINE-02')],
    });

    expect(validateElectricalInvariants(mixed)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'NO_UPSTREAM_PROTECTION', judgment: 'HOLD' })]));
  });

  it('compares only uniquely owned source-linked voltage values', () => {
    const direct = makeNormalizedFixture({
      symbols: [symbol('GEN-01', 'GEN', 'GEN', 0), symbol('LOAD-01', 'LOAD', 'LOAD', 80)],
      lines: [line('LINE-01')],
      edges: [edge('EDGE-01', 'GEN-01', 'LOAD-01', 'LINE-01')],
      specs: [voltage('GEN-01', 220), voltage('LOAD-01', 380)],
    });
    const unresolved: NormalizedElectricalGraph = {
      ...direct,
      specs: direct.specs.map((item) => item.ownerId === 'LOAD-01' ? { ...item, sourceIds: [] } : item),
    };

    expect(validateElectricalInvariants(direct)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'VOLTAGE_DOMAIN_CONFLICT', judgment: 'FAIL' })]));
    expect(validateElectricalInvariants(unresolved)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'VOLTAGE_DOMAIN_UNRESOLVED', judgment: 'HOLD' })]));
  });

  it('does not compare primary and secondary voltage domains across a PT', () => {
    const input = makeNormalizedFixture({
      symbols: [symbol('GEN-01', 'GEN', 'GEN', 0), symbol('PT-01', 'PT', 'PT', 40)],
      lines: [line('LINE-01')],
      edges: [edge('EDGE-01', 'GEN-01', 'PT-01', 'LINE-01')],
      specs: [voltage('GEN-01', 22_900), voltage('PT-01', 110)],
    });

    expect(validateElectricalInvariants(input).some((issue) => issue.code === 'VOLTAGE_DOMAIN_CONFLICT')).toBe(false);
  });

  it('holds unknown ground paths and accepts no implicit power-edge ground', () => {
    const input = makeNormalizedFixture({
      symbols: [symbol('GEN-01', 'GEN', 'GEN', 0), symbol('LOAD-01', 'LOAD', 'LOAD', 80), symbol('GROUND-01', 'GND', 'GND', 120)],
      lines: [line('LINE-01'), line('LINE-02', 'power')],
      edges: [edge('EDGE-01', 'GEN-01', 'LOAD-01', 'LINE-01'), edge('EDGE-02', 'LOAD-01', 'GROUND-01', 'LINE-02')],
    });

    expect(validateElectricalInvariants(input)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'GROUND_PATH_UNKNOWN', judgment: 'HOLD' })]));
  });

  it('propagates graph conflicts before derived checks', () => {
    const issues = validateElectricalInvariants(makeNormalizedFixture({ conflicts: ['UNBOUND_LINE_ENDPOINT:LINE-01', 'UNKNOWN_CONFLICT:GEN-01'] }));

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'GRAPH_CONFLICT', judgment: 'BLOCK' }),
      expect.objectContaining({ code: 'GRAPH_CONFLICT', judgment: 'HOLD' }),
    ]));
    expect(issues.some((issue) => issue.judgment === 'FAIL')).toBe(false);
  });

  it('caps traversal and does not enumerate cyclic paths', () => {
    const symbols = Array.from({ length: 2_001 }, (_, index) => symbol(`LOAD-${String(index).padStart(4, '0')}`, 'LOAD', 'LOAD', index));
    const issues = validateElectricalInvariants(makeNormalizedFixture({ symbols, lines: [], edges: [] }));

    expect(issues).toEqual([expect.objectContaining({ code: 'VALIDATION_BUDGET_EXCEEDED', judgment: 'BLOCK' })]);
  });

  it('is deterministic and never emits PASS', () => {
    const input = makeNormalizedFixture({ specs: [voltage('GEN-01', 220), voltage('LOAD-01', 220)] });
    const reversed: NormalizedElectricalGraph = {
      ...input,
      graph: {
        ...input.graph,
        symbols: [...input.graph.symbols].reverse(),
        lines: [...input.graph.lines].reverse(),
        edges: [...input.graph.edges].reverse(),
      },
      specs: [...input.specs].reverse(),
    };

    const original = validateElectricalInvariants(input);
    expect(validateElectricalInvariants(reversed)).toEqual(original);
    expect(original.every((issue) => issue.judgment === 'BLOCK' || issue.judgment === 'FAIL' || issue.judgment === 'HOLD')).toBe(true);
  });
});
