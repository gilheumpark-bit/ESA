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
      reviewedSourceIds: item.reviewedSourceIds,
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

  it('binds a line endpoint that lands on a long busbar away from its center', () => {
    const input = fixture();
    const symbols = input[0].data.symbols as NonNullable<RoleReviewData['symbols']>;
    symbols[0] = {
      ...symbols[0], typeCandidates: ['BUSBAR'], rawLabel: 'MAIN BUS',
      bounds: { x: 0, y: 40, w: 200, h: 12, page: 1 }, ports: [],
    };
    symbols[1] = {
      ...symbols[1], bounds: { x: 240, y: 40, w: 20, h: 20, page: 1 }, ports: [],
    };
    const line = input[1].data.lines?.[0] as NonNullable<RoleReviewData['lines']>[number];
    line.path = [{ x: 10, y: 46 }, { x: 240, y: 50 }];
    line.start = line.path[0];
    line.end = line.path[1];
    reseal(input);

    const graph = assembleSpatialGraph(input, { snapTolerance: 24 });
    expect(graph.edges).toEqual([
      expect.objectContaining({ from: 'BUSBAR-01', to: 'TR-01' }),
    ]);
  });

  it('keeps null labels and ambiguous type candidates without asserting a first candidate as truth', () => {
    const graph = assembleSpatialGraph(fixture({ ambiguousType: true, nullLabel: true }));

    // 저장되는 typeCandidates 는 정본 어휘다(입력은 모델 날 문자열 'VCB'/'ACB').
    // 후보 2개가 그대로 남는 것이 이 시험의 계약이며 — 첫 후보를 진실로 단정하지
    // 않는다 — 정본화는 세부 종류를 보존하므로 그 계약이 유지된다.
    expect(graph.symbols[0]).toMatchObject({ id: 'AMB-01', rawLabel: null, typeCandidates: ['breaker_vcb', 'breaker_acb'] });
    expect(graph.conflicts).toContain('AMBIGUOUS_SYMBOL_TYPE:sym-a');
  });

  it('deduplicates overlapping symbols and preserves every original evidence id', () => {
    const graph = assembleSpatialGraph(fixture({ duplicate: true }), { dedupeIou: 0.5 });
    const breaker = graph.symbols.find((item) => item.id === 'VCB-01');

    expect(graph.symbols.filter((item) => item.id.startsWith('VCB-'))).toHaveLength(1);
    expect(breaker?.originalEvidenceIds).toEqual(['sym-a', 'sym-a-copy']);
    expect(breaker?.confidence).toBe(0.99);
  });

  it('서로 다른 미등록 기기 타입은 other라는 이유만으로 병합하지 않는다', () => {
    const input = fixture();
    input[0].data.symbols = [
      {
        id: 'unknown-sensor', sourceId: 'variant:original', typeCandidates: ['mystery_sensor'], rawLabel: null,
        bounds: { x: 0, y: 40, w: 20, h: 20, page: 1 }, ports: [], confidence: 0.99,
      },
      {
        id: 'unknown-actuator', sourceId: 'region:1', typeCandidates: ['custom_actuator'], rawLabel: null,
        bounds: { x: 1, y: 41, w: 20, h: 20, page: 1 }, ports: [], confidence: 0.8,
      },
    ];
    reseal(input);

    const graph = assembleSpatialGraph(input, { dedupeIou: 0.5 });

    expect(graph.symbols).toHaveLength(2);
    expect(graph.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ typeCandidates: ['other'], unrecognizedTypeCandidates: ['mystery_sensor'] }),
      expect.objectContaining({ typeCandidates: ['other'], unrecognizedTypeCandidates: ['custom_actuator'] }),
    ]));
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

  it('accepts council envelopes sealed with reviewed source ids and protects that provenance', () => {
    const input = fixture();
    for (const item of input) item.reviewedSourceIds = ['variant:original', 'region:1'];
    reseal(input);

    expect(() => assembleSpatialGraph(input)).not.toThrow();

    const tampered = structuredClone(input);
    tampered[0].reviewedSourceIds = ['variant:original'];
    expect(() => assembleSpatialGraph(tampered)).toThrow(/outputHash/);
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
    expect(graph.symbols.find((item) => item.originalEvidenceIds.includes('sym-a'))).toMatchObject({ typeCandidates: ['breaker_vcb', 'breaker_acb'], originalEvidenceIds: ['sym-a', 'sym-a-region'] });
    expect(graph.conflicts).toContain('AMBIGUOUS_SYMBOL_TYPE:sym-a');
    expect(graph.texts).toHaveLength(1);
    expect(graph.texts[0].originalEvidenceIds).toEqual(['text-a', 'text-a-region']);
    expect(graph.texts[0].candidates).toEqual(['PT', 'PPT']);
  });
});

/**
 * 2026-08-07(33차) 진단: 이 층의 관계 조립기가 **단일 선분의 양끝이 각각 정확히
 * 한 기기에 닿을 때만** 관계로 인정했다. 실제 단선결선도는 기기 → 분기점 →
 * 모선 → 분기점 → 기기로 가므로 모선 구간처럼 양끝이 기기가 아닌 정상 도선이
 * 전부 `UNBOUND_LINE_ENDPOINT` 로 신고됐고, 감사자가 페이지를 실패시켰다
 * (교재형 수변전 p6: UNBOUND ×3 + SELF ×3 → `PAGE_ANALYSIS_PARTIAL`).
 *
 * 제품 경로의 조립기(`evidence-deduplicator.buildPageRelations`)는 7차에 이미
 * 선망 추적으로 고쳤다. **같은 개념의 조립기가 둘인데 한쪽만 고쳐져 있었다.**
 */
describe('선망에 이어진 끝점은 부유 끝점이 아니다', () => {
  function graphWith(lines: NonNullable<RoleReviewData['lines']>, symbols?: NonNullable<RoleReviewData['symbols']>) {
    const input = fixture();
    if (symbols) input[0].data.symbols = symbols;
    input[1].data.lines = lines;
    reseal(input);
    return assembleSpatialGraph(input, { snapTolerance: 24 });
  }

  it('끝점이 분기점에 닿으면 UNBOUND 가 아니다', () => {
    // 모선 구간: 한쪽 끝은 기기(VCB 포트 20,50), 다른 끝은 분기점(50,50)이다.
    const graph = graphWith([{
      id: 'bus-seg', sourceId: 'variant:line-enhanced', lineKind: 'power',
      path: [{ x: 20, y: 50 }, { x: 50, y: 50 }],
      start: { x: 20, y: 50 }, end: { x: 50, y: 50 },
      junctions: [{ x: 50, y: 50 }], crossovers: [], confidence: 0.95,
    }]);
    expect(graph.conflicts.filter((item) => item.startsWith('UNBOUND'))).toEqual([]);
  });

  it('어디에도 닿지 않은 진짜 부유 끝점은 그대로 신고한다', () => {
    // 차단 신호를 죽이지 않는다는 보장. 기기도 분기점도 없는 허공이다.
    const graph = graphWith([{
      id: 'floating', sourceId: 'variant:line-enhanced', lineKind: 'power',
      path: [{ x: 500, y: 500 }, { x: 600, y: 500 }],
      start: { x: 500, y: 500 }, end: { x: 600, y: 500 },
      junctions: [], crossovers: [], confidence: 0.95,
    }]);
    expect(graph.conflicts).toContain('UNBOUND_LINE_ENDPOINT:LINE-001');
  });

  it('모선 위를 지나는 구간은 자기 참조가 아니다', () => {
    // 양끝이 같은 모선에 닿는 것은 모선 구간이지 SELF 가 아니다.
    const busbar: NonNullable<RoleReviewData['symbols']> = [{
      id: 'sym-bus', sourceId: 'variant:original', typeCandidates: ['BUSBAR'], rawLabel: 'MAIN BUS',
      bounds: { x: 0, y: 40, w: 200, h: 6, page: 1 }, ports: [], confidence: 0.99,
    }];
    const graph = graphWith([{
      id: 'on-bus', sourceId: 'variant:line-enhanced', lineKind: 'power',
      path: [{ x: 20, y: 43 }, { x: 120, y: 43 }],
      start: { x: 20, y: 43 }, end: { x: 120, y: 43 },
      junctions: [], crossovers: [], confidence: 0.95,
    }], busbar);
    expect(graph.conflicts.filter((item) => item.startsWith('SELF'))).toEqual([]);
  });

  it('분기점이 없어도 다른 선 위에 닿은 끝점은 UNBOUND 가 아니다', () => {
    // 34차 실측(교재 p6, 기하 기록): UNBOUND 6건 전부 끝점이 다른 선까지
    // 0~2px 인 T-접점·모서리였다 — 모델이 분기점을 안 찍었을 뿐이다.
    const graph = graphWith([{
      id: 'bus', sourceId: 'variant:line-enhanced', lineKind: 'power',
      path: [{ x: 20, y: 50 }, { x: 80, y: 50 }],
      start: { x: 20, y: 50 }, end: { x: 80, y: 50 },
      junctions: [], crossovers: [], confidence: 0.95,
    }, {
      // 분기선: 위쪽 허공에서 내려와 모선 위(50,50)에 닿는다. 분기점 미보고.
      id: 'branch', sourceId: 'variant:line-enhanced', lineKind: 'power',
      path: [{ x: 50, y: 50 }, { x: 50, y: 10 }],
      start: { x: 50, y: 50 }, end: { x: 50, y: 10 },
      junctions: [], crossovers: [], confidence: 0.95,
    }]);
    // branch 의 (50,50) 은 bus 위라 선망에 이어졌다. (50,10) 은 기기(0,40~20,60
    // VCB)에서 멀지만 — 24px 밖 — 이 시험의 관심은 T-접점 끝이다.
    const unbound = graph.conflicts.filter((item) => item.startsWith('UNBOUND'));
    expect(unbound).not.toContain('UNBOUND_LINE_ENDPOINT:LINE-001');
  });

  it('직렬 기기를 관통하는 도선은 SELF 가 아니다', () => {
    // 34차 실측: SELF 6건 전부 MOF·CB 몸체를 지나는 도선이었고 양끝이 다른
    // 선에도 0~1px 로 닿아 있었다. 도선망에 양끝이 이어져 있으면 자기 루프가
    // 아니라 관통 구간이다.
    const graph = graphWith([{
      // VCB(0,40~20,60) 몸체를 지나는 짧은 관통 구간: 양끝이 VCB 허용오차 안.
      id: 'through', sourceId: 'variant:line-enhanced', lineKind: 'power',
      path: [{ x: 8, y: 50 }, { x: 30, y: 50 }],
      start: { x: 8, y: 50 }, end: { x: 30, y: 50 },
      junctions: [], crossovers: [], confidence: 0.95,
    }, {
      // 위로 이어지는 도선 — 관통 구간의 왼끝에 닿는다.
      id: 'up', sourceId: 'variant:line-enhanced', lineKind: 'power',
      path: [{ x: 8, y: 50 }, { x: 8, y: 5 }],
      start: { x: 8, y: 50 }, end: { x: 8, y: 5 },
      junctions: [], crossovers: [], confidence: 0.95,
    }, {
      // TR 로 이어지는 도선 — 관통 구간의 오른끝에 닿아 선망을 완성한다.
      id: 'toTr', sourceId: 'variant:line-enhanced', lineKind: 'power',
      path: [{ x: 30, y: 50 }, { x: 80, y: 50 }],
      start: { x: 30, y: 50 }, end: { x: 80, y: 50 },
      junctions: [], crossovers: [], confidence: 0.95,
    }]);
    expect(graph.conflicts.filter((item) => item.startsWith('SELF'))).toEqual([]);
  });

  it('모선이 아닌 기기에서 시작해 같은 기기로 돌아오면 SELF 다', () => {
    const graph = graphWith([{
      id: 'loop', sourceId: 'variant:line-enhanced', lineKind: 'power',
      path: [{ x: 20, y: 50 }, { x: 22, y: 52 }],
      start: { x: 20, y: 50 }, end: { x: 22, y: 52 },
      junctions: [], crossovers: [], confidence: 0.95,
    }]);
    expect(graph.conflicts).toContain('SELF_LINE_ENDPOINT:LINE-001');
  });
});
