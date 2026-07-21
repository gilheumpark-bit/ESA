import { createHash } from 'node:crypto';

import type { NormalizedElectricalGraph, NormalizedSpec } from '../domain-normalizer';
import { compareLogicToGraph } from '../logic-conflicts';
import type { LogicEvidence, RoleReviewEnvelope } from '../../vision/review-types';

function canonicalize(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

const bounds = (x: number, y = 100, page = 1) => ({ x, y, w: 40, h: 40, page });

function normalized(extraSpecs: NormalizedSpec[] = []): NormalizedElectricalGraph {
  const symbols = [
    { id: 'VCB-01', originalEvidenceId: 'orig-vcb', originalEvidenceIds: ['orig-vcb'], sourceIds: ['source-symbols'], typeCandidates: ['VCB'], rawLabel: 'VCB', bounds: bounds(100), ports: [], confidence: 0.99 },
    { id: 'TR-01', originalEvidenceId: 'orig-tr', originalEvidenceIds: ['orig-tr'], sourceIds: ['source-symbols'], typeCandidates: ['TR'], rawLabel: 'TR', bounds: bounds(300), ports: [], confidence: 0.99 },
    { id: 'LOAD-01', originalEvidenceId: 'orig-load', originalEvidenceIds: ['orig-load'], sourceIds: ['source-symbols'], typeCandidates: ['LOAD'], rawLabel: 'LOAD', bounds: bounds(500), ports: [], confidence: 0.99 },
  ];
  return {
    drawingHash: 'drawing-hash',
    graph: {
      drawingHash: 'drawing-hash',
      symbols,
      lines: [
        { id: 'LINE-001', originalEvidenceId: 'orig-line-1', originalEvidenceIds: ['orig-line-1'], sourceIds: ['source-lines'], pages: [1], lineKind: 'power', path: [{ x: 140, y: 120 }, { x: 300, y: 120 }], start: { x: 140, y: 120 }, end: { x: 300, y: 120 }, junctions: [], crossovers: [], confidence: 0.98 },
        { id: 'LINE-002', originalEvidenceId: 'orig-line-2', originalEvidenceIds: ['orig-line-2'], sourceIds: ['source-lines'], pages: [1], lineKind: 'power', path: [{ x: 340, y: 120 }, { x: 500, y: 120 }], start: { x: 340, y: 120 }, end: { x: 500, y: 120 }, junctions: [], crossovers: [], confidence: 0.98 },
      ],
      texts: [], junctions: [], crossovers: [], textLinks: [], conflicts: [],
      edges: [
        { id: 'EDGE-001', from: 'VCB-01', to: 'TR-01', lineId: 'LINE-001', confidence: 0.98 },
        { id: 'EDGE-002', from: 'TR-01', to: 'LOAD-01', lineId: 'LINE-002', confidence: 0.98 },
      ],
    },
    specs: extraSpecs,
    warnings: [],
  };
}

function statement(input: Partial<LogicEvidence> & Pick<LogicEvidence, 'topic'>): LogicEvidence {
  return {
    id: input.id ?? `logic:${input.topic.toLowerCase()}`,
    sourceId: input.sourceId ?? 'source-logic',
    topic: input.topic,
    subjectIds: input.subjectIds ?? ['local:a'],
    attributes: input.attributes,
    statement: input.statement ?? 'independent logic observation',
    evidenceBounds: input.evidenceBounds ?? [bounds(100)],
    confidence: input.confidence ?? 0.9,
  };
}

function envelope(logic: LogicEvidence[], patch: Partial<RoleReviewEnvelope> = {}): RoleReviewEnvelope {
  const seal = {
    role: patch.role ?? 'logic',
    drawingHash: patch.drawingHash ?? 'drawing-hash',
    provider: patch.provider ?? 'openai',
    model: patch.model ?? 'vision-test',
    promptVersion: patch.promptVersion ?? 'sld-review-v1',
    durationMs: patch.durationMs ?? 12,
    data: patch.data ?? { logic, warnings: [], confidence: 0.9 },
  };
  return {
    ...seal,
    outputHash: patch.outputHash ?? createHash('sha256').update(canonicalize(seal)).digest('hex'),
  } as RoleReviewEnvelope;
}

describe('independent logic conflict comparison', () => {
  it('resolves role-local IDs only through unique spatial evidence', () => {
    const result = compareLogicToGraph(normalized(), envelope([
      statement({ topic: 'DIRECTION', subjectIds: ['local:a', 'local:b'], attributes: { fromId: 'local:a', toId: 'local:b' }, evidenceBounds: [bounds(100), bounds(300)] }),
    ]));
    expect(result).toEqual([]);
  });

  it('holds a deceptive stable ID that conflicts with its geometry', () => {
    const result = compareLogicToGraph(normalized(), envelope([
      statement({ topic: 'DIRECTION', subjectIds: ['VCB-01', 'local:b'], attributes: { fromId: 'VCB-01', toId: 'local:b' }, evidenceBounds: [bounds(300), bounds(500)] }),
    ]));
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'UNRESOLVED_LOGIC_REFERENCE', status: 'hold', action: 'TARGETED_REVIEW' }),
    ]));
  });

  it('holds a reversed geometric edge because endpoint order does not prove power direction', () => {
    const reverse = compareLogicToGraph(normalized(), envelope([
      statement({ id: 'reverse', topic: 'DIRECTION', subjectIds: ['local:tr', 'local:vcb'], attributes: { fromId: 'local:tr', toId: 'local:vcb' }, evidenceBounds: [bounds(300), bounds(100)] }),
    ]));
    expect(reverse).toEqual([expect.objectContaining({
      kind: 'UNRESOLVED_LOGIC_REFERENCE', topic: 'DIRECTION', severity: 'critical', status: 'hold', reasonCode: 'REVERSED_DIRECTION',
    })]);
    expect(reverse[0].graphOriginalEvidenceIds).toContain('orig-line-1');
    expect(reverse[0].graphEvidencePages).toEqual([1]);
    expect(reverse[0].graphEvidenceBounds).toEqual(expect.arrayContaining([
      expect.objectContaining({ page: 1, x: 100 }),
      expect.objectContaining({ page: 1, x: 300 }),
    ]));

    const absent = compareLogicToGraph(normalized(), envelope([
      statement({ id: 'absent', topic: 'DIRECTION', subjectIds: ['local:vcb', 'local:load'], attributes: { fromId: 'local:vcb', toId: 'local:load' }, evidenceBounds: [bounds(100), bounds(500)] }),
    ]));
    expect(absent).toEqual([expect.objectContaining({ kind: 'UNRESOLVED_LOGIC_REFERENCE', status: 'hold' })]);
  });

  it('holds a valid multi-hop upstream protector instead of declaring a mismatch', () => {
    const graph = structuredClone(normalized());
    graph.graph.symbols.push(
      { id: 'MCCB-01', originalEvidenceId: 'orig-mccb', originalEvidenceIds: ['orig-mccb'], sourceIds: ['source-symbols'], typeCandidates: ['MCCB'], rawLabel: 'MCCB', bounds: bounds(600), ports: [], confidence: 0.99 },
      { id: 'BUS-01', originalEvidenceId: 'orig-bus', originalEvidenceIds: ['orig-bus'], sourceIds: ['source-symbols'], typeCandidates: ['BUS'], rawLabel: 'BUS', bounds: bounds(700), ports: [], confidence: 0.99 },
      { id: 'ACB-01', originalEvidenceId: 'orig-acb', originalEvidenceIds: ['orig-acb'], sourceIds: ['source-symbols'], typeCandidates: ['ACB'], rawLabel: 'ACB', bounds: bounds(800), ports: [], confidence: 0.99 },
    );
    graph.graph.lines.push(
      { id: 'LINE-003', originalEvidenceId: 'orig-line-3', originalEvidenceIds: ['orig-line-3'], sourceIds: ['source-lines'], pages: [1], lineKind: 'power', path: [{ x: 540, y: 120 }, { x: 600, y: 120 }], start: { x: 540, y: 120 }, end: { x: 600, y: 120 }, junctions: [], crossovers: [], confidence: 0.98 },
      { id: 'LINE-004', originalEvidenceId: 'orig-line-4', originalEvidenceIds: ['orig-line-4'], sourceIds: ['source-lines'], pages: [1], lineKind: 'power', path: [{ x: 640, y: 120 }, { x: 700, y: 120 }], start: { x: 640, y: 120 }, end: { x: 700, y: 120 }, junctions: [], crossovers: [], confidence: 0.98 },
      { id: 'LINE-005', originalEvidenceId: 'orig-line-5', originalEvidenceIds: ['orig-line-5'], sourceIds: ['source-lines'], pages: [1], lineKind: 'power', path: [{ x: 740, y: 120 }, { x: 800, y: 120 }], start: { x: 740, y: 120 }, end: { x: 800, y: 120 }, junctions: [], crossovers: [], confidence: 0.98 },
    );
    graph.graph.edges.push(
      { id: 'EDGE-003', from: 'LOAD-01', to: 'MCCB-01', lineId: 'LINE-003', confidence: 0.98 },
      { id: 'EDGE-004', from: 'MCCB-01', to: 'BUS-01', lineId: 'LINE-004', confidence: 0.98 },
      { id: 'EDGE-005', from: 'BUS-01', to: 'ACB-01', lineId: 'LINE-005', confidence: 0.98 },
    );

    const result = compareLogicToGraph(graph, envelope([
      statement({
        id: 'multi-hop-protection', topic: 'PROTECTION_CHAIN', subjectIds: ['LOAD-01'],
        attributes: { protectedById: 'ACB-01' }, evidenceBounds: [bounds(500), bounds(800)],
      }),
    ]));

    expect(result).toEqual([expect.objectContaining({
      kind: 'UNRESOLVED_LOGIC_REFERENCE', status: 'hold', reasonCode: 'PROTECTOR_PATH_DIRECTION_UNVERIFIED',
    })]);
  });

  it('fails closed on envelope integrity, page ambiguity, and graph conflicts', () => {
    const logic = statement({ topic: 'DEVICE_IDENTITY', attributes: { deviceType: 'VCB' }, evidenceBounds: [bounds(100)] });
    for (const bad of [
      envelope([logic], { drawingHash: 'foreign-hash' }),
      envelope([logic], { outputHash: '0'.repeat(64) }),
      envelope([logic], { role: 'text' }),
      envelope([{ ...logic, evidenceBounds: [bounds(100, 100, 2)] }]),
    ]) {
      expect(compareLogicToGraph(normalized(), bad)).toEqual([
        expect.objectContaining({ kind: 'UNRESOLVED_LOGIC_REFERENCE', status: 'hold' }),
      ]);
    }
    const conflicted = structuredClone(normalized());
    conflicted.graph.conflicts.push('AMBIGUOUS_NEAR_PARALLEL_LINE:LINE-001');
    expect(compareLogicToGraph(conflicted, envelope([logic]))[0]).toEqual(expect.objectContaining({
      kind: 'UNRESOLVED_LOGIC_REFERENCE',
      graphConflictIds: ['AMBIGUOUS_NEAR_PARALLEL_LINE:LINE-001'],
      graphOriginalEvidenceIds: expect.arrayContaining(['orig-line-1']),
      graphEvidenceBounds: expect.arrayContaining([
        expect.objectContaining({ page: 1, x: 140, y: 120, w: 160 }),
      ]),
    }));
  });

  it('compares voltage and device identity only after exact evidence resolution', () => {
    const voltage: NormalizedSpec = {
      drawingHash: 'drawing-hash', ownerId: 'VCB-01', field: 'voltage_V', value: 22_900, unit: 'V', raw: '22.9kV', evidenceId: 'TEXT-001', originalEvidenceIds: ['orig-text'], sourceIds: ['source-text'], bounds: bounds(100, 150), confidence: 0.95,
    };
    const result = compareLogicToGraph(normalized([voltage]), envelope([
      statement({ id: 'voltage-bad', topic: 'VOLTAGE_DOMAIN', subjectIds: ['local:vcb'], attributes: { voltageV: 380 }, evidenceBounds: [bounds(100)] }),
      statement({ id: 'identity-bad', topic: 'DEVICE_IDENTITY', subjectIds: ['local:tr'], attributes: { deviceType: 'VCB' }, evidenceBounds: [bounds(300)] }),
    ]));
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'CONTRADICTION', topic: 'VOLTAGE_DOMAIN', severity: 'major' }),
      expect.objectContaining({ kind: 'CONTRADICTION', topic: 'DEVICE_IDENTITY', severity: 'major' }),
    ]));

    const equal = compareLogicToGraph(normalized([voltage]), envelope([
      statement({ id: 'voltage-equal', topic: 'VOLTAGE_DOMAIN', subjectIds: ['local:vcb'], attributes: { voltageV: 22_900 }, evidenceBounds: [bounds(100)] }),
    ]));
    expect(equal).toEqual([]);
    const missing = compareLogicToGraph(normalized(), envelope([
      statement({ id: 'voltage-missing', topic: 'VOLTAGE_DOMAIN', subjectIds: ['local:vcb'], attributes: { voltageV: 22_900 }, evidenceBounds: [bounds(100)] }),
    ]));
    expect(missing).toEqual([expect.objectContaining({ kind: 'UNRESOLVED_LOGIC_REFERENCE', reasonCode: 'VOLTAGE_EVIDENCE_MISSING' })]);
  });

  it('checks protection and missing-relation statements without inventing topology', () => {
    const result = compareLogicToGraph(normalized(), envelope([
      statement({ id: 'protected', topic: 'PROTECTION_CHAIN', subjectIds: ['local:tr'], attributes: { protectedById: 'local:vcb' }, evidenceBounds: [bounds(300), bounds(100)] }),
      statement({ id: 'missing-present', topic: 'MISSING_RELATION', subjectIds: ['local:tr', 'local:load'], evidenceBounds: [bounds(300), bounds(500)] }),
      statement({ id: 'missing-absent', topic: 'MISSING_RELATION', subjectIds: ['local:vcb', 'local:load'], evidenceBounds: [bounds(100), bounds(500)] }),
    ]));
    expect(result.some((item) => item.id.includes('protected'))).toBe(false);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'CONTRADICTION', topic: 'MISSING_RELATION', status: 'open' }),
      expect.objectContaining({ kind: 'UNRESOLVED_LOGIC_REFERENCE', topic: 'MISSING_RELATION', status: 'hold' }),
    ]));

    const mismatch = compareLogicToGraph(normalized(), envelope([
      statement({ id: 'wrong-protector', topic: 'PROTECTION_CHAIN', subjectIds: ['local:tr'], attributes: { protectedById: 'local:load' }, evidenceBounds: [bounds(300), bounds(500)] }),
    ]));
    expect(mismatch).toEqual([expect.objectContaining({ kind: 'CONTRADICTION', reasonCode: 'PROTECTOR_MISMATCH' })]);
  });

  it('holds rather than picking the first of two spatial candidates', () => {
    const graph = structuredClone(normalized());
    graph.graph.symbols.push({
      id: 'VCB-02', originalEvidenceId: 'orig-vcb-2', originalEvidenceIds: ['orig-vcb-2'], sourceIds: ['source-symbols'], typeCandidates: ['VCB'], rawLabel: 'VCB-2', bounds: bounds(100), ports: [], confidence: 0.8,
    });
    const result = compareLogicToGraph(graph, envelope([
      statement({ id: 'ambiguous', topic: 'DEVICE_IDENTITY', subjectIds: ['local:breaker'], attributes: { deviceType: 'VCB' }, evidenceBounds: [bounds(100)] }),
    ]));
    expect(result).toEqual([expect.objectContaining({
      kind: 'UNRESOLVED_LOGIC_REFERENCE',
      reasonCode: 'AMBIGUOUS_SPATIAL_CANDIDATE',
      graphEvidenceIds: ['VCB-01', 'VCB-02'],
    })]);
  });

  it('is deterministic, preserves complete provenance, and does not mutate inputs', () => {
    const items = [
      statement({ id: 'b', topic: 'DIRECTION', subjectIds: ['x', 'y'], attributes: { fromId: 'x', toId: 'y' }, evidenceBounds: [bounds(500), bounds(100)] }),
      statement({ id: 'a', topic: 'DEVICE_IDENTITY', attributes: { deviceType: 'MOTOR' }, evidenceBounds: [bounds(300)] }),
    ];
    const graph = normalized();
    const review = envelope(items);
    const beforeGraph = structuredClone(graph);
    const beforeReview = structuredClone(review);
    const first = compareLogicToGraph(graph, review);
    const second = compareLogicToGraph(graph, envelope([...items].reverse()));
    expect(second).toEqual(first);
    expect(first.every((item) => item.logicEvidenceBounds.every((itemBounds) => itemBounds.page === 1))).toBe(true);
    expect(first.flatMap((item) => item.graphOriginalEvidenceIds).length).toBeGreaterThan(0);
    expect(graph).toEqual(beforeGraph);
    expect(review).toEqual(beforeReview);
  });
});
