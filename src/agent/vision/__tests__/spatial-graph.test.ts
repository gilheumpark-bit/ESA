import { assembleSpatialGraph } from '../spatial-graph';
import type { ReviewRole, RoleReviewData, RoleReviewEnvelope } from '../review-types';
import { createHash } from 'node:crypto';

function canonicalize(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
  }
  return 'null';
}

function envelope(role: ReviewRole, data: Partial<RoleReviewData>, drawingHash = 'drawing-hash'): RoleReviewEnvelope {
  const seal: Omit<RoleReviewEnvelope, 'outputHash'> = {
    role,
    drawingHash,
    provider: 'openai',
    model: 'test',
    promptVersion: 'sld-role-v1',
    durationMs: 1,
    data: { warnings: [], confidence: 1, ...data },
  };
  return { ...seal, outputHash: createHash('sha256').update(canonicalize(seal)).digest('hex') };
}

function reseal(envelopes: RoleReviewEnvelope[]): void {
  for (const item of envelopes) {
    const seal = {
      role: item.role,
      drawingHash: item.drawingHash,
      provider: item.provider,
      model: item.model,
      promptVersion: item.promptVersion,
      durationMs: item.durationMs,
      data: item.data,
    };
    item.outputHash = createHash('sha256').update(canonicalize(seal)).digest('hex');
  }
}

function fixture(options: { distant?: boolean; duplicate?: boolean; ambiguousType?: boolean; nullLabel?: boolean } = {}): RoleReviewEnvelope[] {
  const symbols = [
    {
      id: 'sym-a', sourceId: 'variant:original', typeCandidates: options.ambiguousType ? ['VCB', 'ACB'] : ['VCB'], rawLabel: options.nullLabel ? null : 'VCB',
      bounds: { x: 0, y: 40, w: 20, h: 20, page: 1 }, ports: [{ x: 20, y: 50 }], confidence: 0.99,
    },
    {
      id: 'sym-b', sourceId: 'variant:original', typeCandidates: ['TR'], rawLabel: 'TR',
      bounds: { x: 80, y: 40, w: 20, h: 20, page: 1 }, ports: [{ x: 80, y: 50 }], confidence: 0.99,
    },
  ];
  if (options.duplicate) {
    symbols.push({
      id: 'sym-a-copy', sourceId: 'region:1', typeCandidates: options.ambiguousType ? ['ACB', 'VCB'] : ['VCB'], rawLabel: options.nullLabel ? null : 'VCB',
      bounds: { x: 1, y: 41, w: 20, h: 20, page: 1 }, ports: [{ x: 21, y: 51 }], confidence: 0.8,
    });
  }
  const start = options.distant ? { x: 300, y: 300 } : { x: 20, y: 50 };
  const end = options.distant ? { x: 400, y: 300 } : { x: 80, y: 50 };
  return [
    envelope('symbols', { symbols }),
    envelope('connections', { lines: [{
      id: 'line-a', sourceId: 'variant:line-enhanced', lineKind: 'power', path: [start, end], start, end,
      junctions: [{ x: 50, y: 50 }], crossovers: [{ x: 50, y: 70 }], confidence: 0.98,
    }] }),
    envelope('text', { texts: [{
      id: 'text-a', sourceId: 'variant:text-high-contrast', raw: 'PT', candidates: ['PT', 'PPT'],
      bounds: { x: 72, y: 60, w: 12, h: 8, page: 1 }, confidence: 0.9,
    }] }),
  ];
}

describe('source-linked spatial graph', () => {
  it('creates stable device, line, junction, crossover, edge, and text-link IDs', () => {
    const graph = assembleSpatialGraph(fixture(), { snapTolerance: 24 });

    expect(graph.symbols.map((item) => item.id)).toEqual(['VCB-01', 'TR-01']);
    expect(graph.lines.map((item) => item.id)).toEqual(['LINE-001']);
    expect(graph.junctions.map((item) => item.id)).toEqual(['J-001']);
    expect(graph.crossovers.map((item) => item.id)).toEqual(['X-001']);
    expect(graph.edges).toMatchObject([{ id: 'EDGE-001', from: 'VCB-01', to: 'TR-01', lineId: 'LINE-001' }]);
    expect(graph.textLinks).toMatchObject([{ id: 'TEXT-LINK-001', textId: 'TEXT-001', symbolId: 'TR-01' }]);
    expect(graph.edges.every((item) => item.from !== item.to)).toBe(true);
  });

  it('keeps null labels and ambiguous type candidates without asserting a first candidate as truth', () => {
    const graph = assembleSpatialGraph(fixture({ ambiguousType: true, nullLabel: true }));

    expect(graph.symbols[0]).toMatchObject({ id: 'AMB-01', rawLabel: null, typeCandidates: ['VCB', 'ACB'] });
    expect(graph.conflicts).toContain('AMBIGUOUS_SYMBOL_TYPE:sym-a');
  });

  it('deduplicates overlapping symbols and preserves every original evidence id', () => {
    const graph = assembleSpatialGraph(fixture({ duplicate: true }), { dedupeIou: 0.5 });
    const breaker = graph.symbols.find((item) => item.id === 'VCB-01');

    expect(graph.symbols.filter((item) => item.id.startsWith('VCB-'))).toHaveLength(1);
    expect(breaker?.originalEvidenceIds).toEqual(['sym-a', 'sym-a-copy']);
    expect(breaker?.confidence).toBe(0.99);
  });

  it('deduplicates near forward/reverse full and region polylines while retaining provenance, junctions, and crossovers separately', () => {
    const input = fixture();
    const connections = input[1];
    connections.data.lines?.push({
      id: 'line-region', sourceId: 'region:1', lineKind: 'power',
      path: [{ x: 80, y: 51 }, { x: 50, y: 52 }, { x: 20, y: 50 }], start: { x: 80, y: 51 }, end: { x: 20, y: 50 },
      junctions: [{ x: 51, y: 51 }], crossovers: [{ x: 51, y: 70 }], confidence: 0.7,
    });
    reseal(input);

    const graph = assembleSpatialGraph(input, { snapTolerance: 24 });

    expect(graph.lines).toHaveLength(1);
    expect(graph.lines[0].originalEvidenceIds).toEqual(['line-a', 'line-region']);
    expect(graph.junctions).toHaveLength(1);
    expect(graph.crossovers).toHaveLength(1);
  });

  it('scales coordinate quantization tolerance for a 4000px drawing', () => {
    const input = fixture();
    input[1].data.lines?.push({
      id: 'line-high-resolution-region', sourceId: 'region:1', lineKind: 'power',
      path: [{ x: 22, y: 52 }, { x: 82, y: 52 }], start: { x: 22, y: 52 }, end: { x: 82, y: 52 },
      junctions: [], crossovers: [], confidence: 0.7,
    });
    reseal(input);
    const options = { drawingWidth: 4_000 };

    const graph = assembleSpatialGraph(input, options);

    expect(graph.lines).toHaveLength(1);
    expect(graph.lines[0].originalEvidenceIds).toEqual(['line-a', 'line-high-resolution-region']);
  });

  it('preserves boundary-near parallel conductors with a deterministic HOLD conflict while leaving distant parallels conflict-free', () => {
    const parallel = fixture();
    parallel[1].data.lines?.push({
      id: 'line-boundary', sourceId: 'region:1', lineKind: 'power',
      path: [{ x: 20, y: 52 }, { x: 80, y: 52 }], start: { x: 20, y: 52 }, end: { x: 80, y: 52 },
      junctions: [], crossovers: [], confidence: 0.7,
    });
    parallel[1].data.lines?.push({
      id: 'line-parallel', sourceId: 'region:1', lineKind: 'power',
      path: [{ x: 20, y: 56 }, { x: 80, y: 56 }], start: { x: 20, y: 56 }, end: { x: 80, y: 56 },
      junctions: [], crossovers: [], confidence: 0.7,
    });
    reseal(parallel);
    const graph = assembleSpatialGraph(parallel);
    expect(graph.lines).toHaveLength(3);
    expect(graph.conflicts).toContain('AMBIGUOUS_NEAR_PARALLEL_LINE:line-a|line-boundary');
    expect(graph.conflicts.some((item) => item.includes('line-parallel'))).toBe(false);
  });

  it('rejects oversized nested point input before assembly', () => {
    const oversized = fixture();
    const line = oversized[1].data.lines?.[0] as NonNullable<RoleReviewData['lines']>[number];
    line.path = Array.from({ length: 10_001 }, (_, index) => ({ x: index, y: 50 }));
    reseal(oversized);
    expect(() => assembleSpatialGraph(oversized)).toThrow(/nested input budget/);
  });

  it('never invents an edge for distant, ambiguous, or same-device endpoints', () => {
    const distant = assembleSpatialGraph(fixture({ distant: true }), { snapTolerance: 24 });
    expect(distant.edges).toEqual([]);
    expect(distant.conflicts).toContain('UNBOUND_LINE_ENDPOINT:LINE-001');

    const ambiguous = fixture();
    ambiguous[0].data.symbols?.push({
      id: 'sym-c', sourceId: 'full', typeCandidates: ['MTR'], rawLabel: 'MTR',
      bounds: { x: 18, y: 40, w: 20, h: 20, page: 1 }, ports: [{ x: 20, y: 50 }], confidence: 0.8,
    });
    reseal(ambiguous);
    const graph = assembleSpatialGraph(ambiguous, { snapTolerance: 24 });
    expect(graph.edges).toEqual([]);
    expect(graph.conflicts).toContain('AMBIGUOUS_LINE_ENDPOINT:LINE-001');

    const sameDevice = fixture();
    const line = sameDevice[1].data.lines as NonNullable<RoleReviewData['lines']>;
    line[0].path = [{ x: 20, y: 50 }, { x: 20, y: 50 }];
    line[0].start = { x: 20, y: 50 };
    line[0].end = { x: 20, y: 50 };
    reseal(sameDevice);
    const selfGraph = assembleSpatialGraph(sameDevice, { snapTolerance: 24 });
    expect(selfGraph.edges).toEqual([]);
    expect(selfGraph.conflicts).toContain('SELF_LINE_ENDPOINT:LINE-001');
  });

  it('binds role-specific prepared sources in the same drawing and page, but rejects unknown multi-page line frames', () => {
    const input = fixture();
    const graph = assembleSpatialGraph(input, { snapTolerance: 24 });
    expect(graph.edges).toHaveLength(1);

    const multiPage = fixture();
    multiPage[0].data.symbols?.push({
      id: 'sym-page-2', sourceId: 'variant:original', typeCandidates: ['MTR'], rawLabel: 'MTR',
      bounds: { x: 0, y: 40, w: 20, h: 20, page: 2 }, ports: [{ x: 20, y: 50 }], confidence: 0.8,
    });
    reseal(multiPage);
    expect(() => assembleSpatialGraph(multiPage, { snapTolerance: 24 })).toThrow(/line page/);
  });

  it('keeps text evidence and reports ambiguous text links instead of selecting a nearest symbol', () => {
    const input = fixture();
    const texts = input[2].data.texts as NonNullable<RoleReviewData['texts']>;
    texts[0].bounds = { x: 45, y: 45, w: 10, h: 10, page: 1 };
    reseal(input);
    const graph = assembleSpatialGraph(input, { snapTolerance: 40 });

    expect(graph.texts).toHaveLength(1);
    expect(graph.textLinks).toEqual([]);
    expect(graph.conflicts).toContain('AMBIGUOUS_TEXT_LINK:TEXT-001');
  });

  it('is input-order independent, deep-frozen, and does not mutate envelopes', () => {
    const input = fixture({ duplicate: true });
    const original = structuredClone(input);
    const first = assembleSpatialGraph(input, { snapTolerance: 24 });
    const second = assembleSpatialGraph([...input].reverse(), { snapTolerance: 24 });

    expect(second).toEqual(first);
    expect(input).toEqual(original);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.symbols[0].originalEvidenceIds)).toBe(true);
    expect(() => first.symbols.push(first.symbols[0])).toThrow();
  });

  it('fails closed before graph assembly for mixed, duplicate, malformed, and unsafe inputs', () => {
    const valid = fixture();
    expect(() => assembleSpatialGraph([...valid, envelope('symbols', { symbols: [] })])).toThrow(/duplicate role/);
    expect(() => assembleSpatialGraph([envelope('logic', { logic: [] })])).toThrow(/role/);
    expect(() => assembleSpatialGraph([envelope('symbols', { texts: [] } as Partial<RoleReviewData>)] )).toThrow(/collection/);
    expect(() => assembleSpatialGraph([envelope('symbols', { symbols: [] }, 'other-hash'), valid[1], valid[2]])).toThrow(/drawingHash/);
    expect(() => assembleSpatialGraph(valid.map((item) => ({ ...item, outputHash: 'not-a-hash' })))).toThrow(/outputHash/);
    for (const key of ['provider', 'model', 'promptVersion', 'durationMs', 'data'] as const) {
      const tampered = structuredClone(valid);
      if (key === 'durationMs') tampered[0][key] = 2;
      else if (key === 'data') tampered[0].data.warnings.push('tampered');
      else if (key === 'provider') tampered[0].provider = 'gemini';
      else if (key === 'model') tampered[0].model = 'tampered';
      else tampered[0].promptVersion = 'tampered';
      expect(() => assembleSpatialGraph(tampered)).toThrow(/outputHash/);
    }
    expect(() => assembleSpatialGraph(valid, { snapTolerance: Number.NaN })).toThrow(/snapTolerance/);
    expect(() => assembleSpatialGraph(valid, { snapTolerance: -1 })).toThrow(/snapTolerance/);
    expect(() => assembleSpatialGraph(valid, { dedupeIou: Infinity })).toThrow(/dedupeIou/);
    expect(() => assembleSpatialGraph([envelope('symbols', { symbols: new Array(2_001).fill({}) })])).toThrow(/budget/);
  });

  it('merges overlapping candidate sets and duplicate OCR text while preserving union provenance', () => {
    const input = fixture();
    input[0].data.symbols?.push({
      id: 'sym-a-region', sourceId: 'region:1', typeCandidates: ['VCB', 'ACB'], rawLabel: null,
      bounds: { x: 1, y: 41, w: 20, h: 20, page: 1 }, ports: [{ x: 21, y: 51 }], confidence: 0.8,
    });
    input[2].data.texts?.push({
      id: 'text-a-region', sourceId: 'region:1', raw: 'PT', candidates: ['PPT', 'PT'],
      bounds: { x: 73, y: 60, w: 12, h: 8, page: 1 }, confidence: 0.8,
    });
    reseal(input);
    const graph = assembleSpatialGraph(input);

    expect(graph.symbols.filter((item) => item.originalEvidenceIds.includes('sym-a'))).toHaveLength(1);
    expect(graph.symbols.find((item) => item.originalEvidenceIds.includes('sym-a'))).toMatchObject({ typeCandidates: ['VCB', 'ACB'], originalEvidenceIds: ['sym-a', 'sym-a-region'] });
    expect(graph.conflicts).toContain('AMBIGUOUS_SYMBOL_TYPE:sym-a');
    expect(graph.texts).toHaveLength(1);
    expect(graph.texts[0].originalEvidenceIds).toEqual(['text-a', 'text-a-region']);
    expect(graph.texts[0].candidates).toEqual(['PT', 'PPT']);
  });
});
