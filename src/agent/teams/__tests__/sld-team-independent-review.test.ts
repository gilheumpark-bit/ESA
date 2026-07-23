import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { executeSLDTeam } from '../sld-team';
import { parseDxfToSLD } from '@/engine/topology/dxf-parser';
import { parsePdfToSLD } from '@/engine/topology/pdf-vector-parser';
import type { TeamInput } from '../types';
import type { DrawingSnapshot, ImageVariant, PrecisionRegion } from '../../vision/evidence-types';
import type { RoleReviewData, RoleReviewEnvelope, ReviewRole } from '../../vision/review-types';
import { normalizeElectricalGraph } from '../../electrical/domain-normalizer';
import { synthesizeDrawingReview } from '../../electrical/synthesis';
import type { ElectricalIssue } from '../../electrical/electrical-invariants';
import type { SpatialEvidenceGraph, SpatialSymbol, SpatialText } from '../../vision/spatial-graph';
import type { DrawingCouncilInput } from '../../vision/drawing-council';

jest.mock('@/engine/topology/pdf-vector-parser', () => ({ parsePdfToSLD: jest.fn() }));

const DRAWING_HASH = 'd'.repeat(64);
const KEY = 'sk-independent-review-test-key-123456';

function canonicalize(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

function sealed(role: ReviewRole, data: Partial<RoleReviewData>): RoleReviewEnvelope {
  const value: Omit<RoleReviewEnvelope, 'outputHash'> = {
    role,
    drawingHash: DRAWING_HASH,
    provider: 'openai',
    model: 'test-model',
    promptVersion: 'sld-role-v1',
    durationMs: 1,
    data: { warnings: [], confidence: 0.9, ...data },
  };
  return { ...value, outputHash: createHash('sha256').update(canonicalize(value)).digest('hex') };
}

function envelopes(): RoleReviewEnvelope[] {
  return [
    sealed('symbols', { symbols: [
      { id: 's-a', sourceId: 'variant:original', typeCandidates: ['VCB'], rawLabel: 'VCB-A', bounds: { x: 0, y: 40, w: 20, h: 20, page: 1 }, ports: [{ x: 20, y: 50 }], confidence: 0.99 },
      { id: 's-b', sourceId: 'variant:original', typeCandidates: ['TR'], rawLabel: 'TR-A', bounds: { x: 80, y: 40, w: 20, h: 20, page: 1 }, ports: [{ x: 80, y: 50 }], confidence: 0.98 },
    ] }),
    sealed('connections', { lines: [{ id: 'l-a', sourceId: 'variant:line-enhanced', lineKind: 'power', path: [{ x: 20, y: 50 }, { x: 80, y: 50 }], start: { x: 20, y: 50 }, end: { x: 80, y: 50 }, junctions: [], crossovers: [], confidence: 0.97 }] }),
    sealed('text', { texts: [{ id: 't-a', sourceId: 'variant:text-high-contrast', raw: 'PT', candidates: ['PT', 'PPT'], bounds: { x: 72, y: 60, w: 12, h: 8, page: 1 }, confidence: 0.9 }] }),
    sealed('logic', { logic: [] }),
    sealed('coverage-auditor', { rescanTargets: [] }),
  ];
}

const snapshot: DrawingSnapshot = {
  drawingHash: DRAWING_HASH,
  mimeType: 'image/png',
  page: 1,
  width: 100,
  height: 80,
  quality: { width: 100, height: 80, channels: 3, contrast: 1, edgeDensity: 0.2, gradientVariance: 1, lowContrast: false, blurry: false, recommendedScale: 1, warnings: [] },
};

function prepared(scale: 1 | 2 | 4 = 1) {
  const selectedSymbol = scale === 4 ? 'upscale-4x' : scale === 2 ? 'upscale-2x' : 'original';
  const regionCount = scale === 4 ? 16 : scale === 2 ? 9 : 4;
  const variants = ['original', 'upscale-2x', 'upscale-4x', 'line-enhanced', 'text-high-contrast'].map((kind) => ({ id: `variant:${kind}`, kind, buffer: new ArrayBuffer(1), width: 100, height: 80, transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 } })) as ImageVariant[];
  const selected = variants.filter((variant) => variant.kind === selectedSymbol || variant.kind === 'line-enhanced' || variant.kind === 'text-high-contrast');
  const regions = selected.flatMap((variant) => Array.from({ length: regionCount }, (_, index) => ({ id: `${variant.id}:region:${index}`, variantId: variant.id, variantBounds: { x: 0, y: 0, w: 25, h: 80 }, originalBounds: { x: 0, y: 0, w: 25, h: 80 }, buffer: new ArrayBuffer(1) }))) as PrecisionRegion[];
  return { snapshot: { ...snapshot, quality: { ...snapshot.quality, recommendedScale: scale } }, variants, regions };
}

function preparedWithoutRequiredUpscale(scale: 2 | 4) {
  const value = prepared(scale);
  const requiredKind = scale === 4 ? 'upscale-4x' : 'upscale-2x';
  const requiredId = `variant:${requiredKind}`;
  return {
    ...value,
    variants: value.variants.filter((variant) => variant.kind !== requiredKind),
    regions: value.regions.map((region) => region.variantId === requiredId ? {
      ...region,
      id: region.id.replace(requiredId, 'variant:original'),
      variantId: 'variant:original',
    } : region),
  };
}

function rasterInput(extra: Partial<TeamInput> = {}): TeamInput {
  return { sessionId: 'sld-independent-test', classification: 'sld_image', fileBuffer: new ArrayBuffer(8), fileName: 'fixture.png', mimeType: 'image/png', vision: { provider: 'openai', apiKey: ` ${KEY} ` }, ...extra };
}

function calculationReadyGraph(): SpatialEvidenceGraph {
  const symbol = (id: string, type: string, x: number): SpatialSymbol => ({
    id, originalEvidenceId: `original:${id}`, originalEvidenceIds: [`original:${id}`], sourceIds: [`source:${id}`],
    typeCandidates: [type], rawLabel: id, bounds: { x, y: 0, w: 10, h: 10, page: 1 }, ports: [], confidence: 0.9,
  });
  const text = (id: string, raw: string, x: number): SpatialText => ({
    id, originalEvidenceId: `original:${id}`, originalEvidenceIds: [`original:${id}`], sourceIds: [`source:${id}`],
    raw, candidates: [raw], bounds: { x, y: 0, w: 10, h: 10, page: 1 }, confidence: 0.9,
  });
  const symbols = [
    symbol('CABLE-01', 'CABLE', 0), symbol('VCB-01', 'VCB', 100),
    symbol('TR-01', 'TRANSFORMER', 200), symbol('CT-01', 'CT', 300),
  ];
  const texts = [
    text('CABLE-TEXT', 'CV 3C 35mm2 Cu 80m', 0), text('PHASE-TEXT', '3상', 0),
    text('VCB-TEXT', '380V 부하전류 120A 단락전류 25kA 허용전류 150A 역률 0.9', 100),
    text('TR-TEXT', '총부하 500kW 역률 0.9 효율 95% 수용률 80% 안전율 0.1', 200),
    text('CT-TEXT', '최대부하전류 120A burden 15VA lead length 30m lead size 2.5mm2 accuracy class 5P', 300),
  ];
  return {
    drawingHash: DRAWING_HASH,
    symbols,
    lines: [{
      id: 'LINE-001', originalEvidenceId: 'original:LINE-001', originalEvidenceIds: ['original:LINE-001'], sourceIds: ['source:LINE-001'],
      lineKind: 'power', path: [{ x: 10, y: 5 }, { x: 100, y: 5 }], start: { x: 10, y: 5 }, end: { x: 100, y: 5 },
      junctions: [], crossovers: [], confidence: 0.9, pages: [1],
    }],
    texts,
    junctions: [], crossovers: [], conflicts: [],
    edges: [{ id: 'EDGE-001', from: 'CABLE-01', to: 'VCB-01', lineId: 'LINE-001', confidence: 0.9 }],
    textLinks: texts.map((item, index) => ({
      id: `LINK-${index + 1}`, textId: item.id,
      symbolId: index < 2 ? 'CABLE-01' : index === 2 ? 'VCB-01' : index === 3 ? 'TR-01' : 'CT-01', confidence: 1,
    })),
  };
}

describe('SLD raster independent council integration', () => {
  it('can reach PASS through the production router while preserving expected SKIPPED calculation receipts', async () => {
    const result = await executeSLDTeam(rasterInput(), {
      prepareRaster: async () => prepared(),
      resolveVisionKey: () => ({ key: KEY, source: 'user' }),
      runCouncil: async () => ({ envelopes: envelopes(), failures: [] }),
      assembleGraph: () => calculationReadyGraph(),
      validateInvariants: () => [],
    });

    expect(result.drawingSynthesis).toMatchObject({
      verdict: 'PASS',
      requiresHumanReview: false,
      stages: { calculator: 'COMPLETE' },
    });
    expect(result.drawingSynthesis?.calculations.length).toBeGreaterThan(0);
    expect(result.drawingSynthesis?.calculations.some((receipt) => receipt.status === 'CALCULATED')).toBe(true);
    expect(result.drawingSynthesis?.calculations.some((receipt) => receipt.status === 'SKIPPED')).toBe(true);
    expect(result.drawingSynthesis?.calculations.some((receipt) => receipt.missingInputs.length > 0)).toBe(true);
  });

  it('runs one full-region council, maps stable graph IDs, and keeps the BYOK secret out of the result', async () => {
    const controller = new AbortController();
    const prepareRaster = jest.fn(async () => prepared());
    const resolveVisionKey = jest.fn(() => ({ key: KEY, source: 'user' as const }));
    const runCouncil = jest.fn(async () => ({ envelopes: envelopes(), failures: [] }));

    const result = await executeSLDTeam(rasterInput({ signal: controller.signal }), { prepareRaster, resolveVisionKey, runCouncil });

    expect(runCouncil).toHaveBeenCalledTimes(1);
    expect(runCouncil).toHaveBeenCalledWith(expect.objectContaining({ snapshot, regions: expect.any(Array), maxRegionCallsPerRole: 16, maxConcurrentCalls: 4, options: expect.objectContaining({ apiKey: KEY, signal: controller.signal, timeoutMs: 30_000, maxRetries: 1 }) }));
    expect(prepareRaster).toHaveBeenCalledTimes(1);
    expect(resolveVisionKey).toHaveBeenCalledWith('openai', ` ${KEY} `);
    expect(result.success).toBe(true);
    expect(result.components).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'VCB-01', type: 'breaker_vcb' }), expect.objectContaining({ id: 'TR-01', type: 'transformer' })]));
    expect(result.connections).toEqual([expect.objectContaining({ from: 'VCB-01', to: 'TR-01' })]);
    expect(result.drawingReview).toMatchObject({ snapshot: { drawingHash: DRAWING_HASH, width: 100, height: 80 }, coverage: { plannedCalls: 19, complete: true, maxRegionCallsPerRole: 16 } });
    expect(result.drawingSynthesis).toMatchObject({ drawingHash: DRAWING_HASH, verdict: 'CONDITIONAL', requiresHumanReview: true });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('keeps the review on HOLD when the independent coverage auditor requests a rescan', async () => {
    const auditTarget = sealed('coverage-auditor', {
      rescanTargets: [{
        id: 'audit:boundary:1',
        sourceId: 'variant:original',
        reason: 'boundary-clip',
        bounds: { x: 40, y: 0, w: 20, h: 80, page: 1 },
        suggestedRoles: ['symbols', 'connections'],
        confidence: 0.92,
      }],
    });
    const reviewed = [...envelopes().filter((item) => item.role !== 'coverage-auditor'), auditTarget];

    const result = await executeSLDTeam(rasterInput(), {
      prepareRaster: async () => prepared(),
      resolveVisionKey: () => ({ key: KEY, source: 'user' }),
      runCouncil: async () => ({ envelopes: reviewed, failures: [] }),
    });

    expect(result.drawingReview?.coverage.complete).toBe(false);
    expect(result.standards).toEqual(expect.arrayContaining([
      expect.objectContaining({ judgment: 'HOLD', note: expect.stringContaining('boundary-clip') }),
    ]));
    expect(result.drawingSynthesis).toMatchObject({ verdict: 'CONDITIONAL', requiresHumanReview: true });
  });

  it('limits a follow-up council pass to auditor-requested roles and intersecting regions', async () => {
    const runCouncil = jest.fn(async () => ({ envelopes: envelopes(), failures: [] }));
    const result = await executeSLDTeam(rasterInput({
      params: {
        rescanTargets: [{
          id: 'target-1', sourceId: 'variant:original', reason: 'boundary-clip',
          bounds: { x: 0, y: 0, w: 25, h: 80, page: 1 },
          suggestedRoles: ['connections'], confidence: 0.9,
        }],
      },
    }), {
      prepareRaster: async () => prepared(),
      resolveVisionKey: () => ({ key: KEY, source: 'user' }),
      runCouncil,
    });

    expect(runCouncil).toHaveBeenCalledWith(expect.objectContaining({
      regions: expect.arrayContaining([expect.objectContaining({ variantId: 'variant:line-enhanced' })]),
    }));
    const councilInput = (runCouncil.mock.calls as unknown as Array<[DrawingCouncilInput]>)[0]?.[0];
    const councilRegions = councilInput?.regions ?? [];
    expect(councilRegions).toHaveLength(4);
    expect(councilRegions.every((region) => region.variantId === 'variant:line-enhanced')).toBe(true);
    expect(result.drawingReview?.coverage.complete).toBe(true);
  });

  it('runs the image analysis stages once in evidence order with the same normalized graph', async () => {
    const callOrder: string[] = [];
    let normalizedReference: ReturnType<typeof normalizeElectricalGraph> | undefined;
    const normalizeGraph = jest.fn((value) => {
      callOrder.push('normalize');
      normalizedReference = normalizeElectricalGraph(value);
      return normalizedReference;
    });
    const validateInvariants = jest.fn((value) => {
      callOrder.push('invariants');
      expect(value).toBe(normalizedReference);
      return [];
    });
    const routeCalculations = jest.fn((value) => {
      callOrder.push('calculator');
      expect(value).toBe(normalizedReference);
      return [];
    });
    const compareLogic = jest.fn((value, envelope) => {
      callOrder.push('logic');
      expect(value).toBe(normalizedReference);
      expect(envelope.role).toBe('logic');
      return [];
    });
    const synthesize = jest.fn((value) => {
      callOrder.push('synthesis');
      expect(value.normalizedGraph).toBe(normalizedReference);
      return synthesizeDrawingReview(value);
    });

    const result = await executeSLDTeam(rasterInput(), {
      prepareRaster: async () => prepared(),
      resolveVisionKey: () => ({ key: KEY, source: 'user' }),
      runCouncil: async () => ({ envelopes: envelopes(), failures: [] }),
      normalizeGraph,
      validateInvariants,
      routeCalculations,
      compareLogic,
      synthesize,
    });

    expect(callOrder).toEqual(['normalize', 'invariants', 'calculator', 'logic', 'synthesis']);
    expect(normalizeGraph).toHaveBeenCalledTimes(1);
    expect(validateInvariants).toHaveBeenCalledTimes(1);
    expect(routeCalculations).toHaveBeenCalledTimes(1);
    expect(compareLogic).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true, drawingSynthesis: { drawingHash: DRAWING_HASH } });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('stops calculator and logic stages when electrical invariants block the graph', async () => {
    const blockingIssue: ElectricalIssue = {
      id: 'issue:dangling-edge:test',
      code: 'DANGLING_EDGE',
      judgment: 'BLOCK',
      severity: 'critical',
      message: '연결 참조 대상이 없습니다.',
      evidence: {
        drawingHash: DRAWING_HASH,
        stableIds: [],
        originalEvidenceIds: [],
        sourceIds: [],
        pages: [],
        bounds: [],
      },
      requiredInputs: ['repair graph structure'],
    };
    const routeCalculations = jest.fn(() => []);
    const compareLogic = jest.fn(() => []);

    const result = await executeSLDTeam(rasterInput(), {
      prepareRaster: async () => prepared(),
      resolveVisionKey: () => ({ key: KEY, source: 'user' }),
      runCouncil: async () => ({ envelopes: envelopes(), failures: [] }),
      validateInvariants: () => [blockingIssue],
      routeCalculations,
      compareLogic,
    });

    expect(routeCalculations).not.toHaveBeenCalled();
    expect(compareLogic).not.toHaveBeenCalled();
    expect(result.drawingSynthesis).toMatchObject({
      verdict: 'CONDITIONAL',
      requiresHumanReview: true,
      stages: { calculator: 'NOT_RUN', logicResolver: 'NOT_RUN' },
    });
  });

  it('stops before raster preparation and council dispatch when the request is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const prepareRaster = jest.fn(async () => prepared());
    const runCouncil = jest.fn(async () => ({ envelopes: envelopes(), failures: [] }));

    const result = await executeSLDTeam(rasterInput({ signal: controller.signal }), { prepareRaster, runCouncil, resolveVisionKey: () => ({ key: KEY, source: 'user' }) });

    expect(result.success).toBe(false);
    expect(prepareRaster).not.toHaveBeenCalled();
    expect(runCouncil).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('fails closed when the request aborts while a council dependency is in flight', async () => {
    const controller = new AbortController();
    const result = await executeSLDTeam(rasterInput({ signal: controller.signal }), {
      prepareRaster: async () => prepared(),
      resolveVisionKey: () => ({ key: KEY, source: 'user' }),
      runCouncil: async () => { controller.abort(); return { envelopes: envelopes(), failures: [] }; },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('요청이 중단되어 독립 도면 검토를 완료하지 않았습니다.');
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it.each([
    [1, 'variant:original', 4, 19],
    [2, 'variant:upscale-2x', 9, 34],
    [4, 'variant:upscale-4x', 16, 55],
  ] as const)('plans scale %i with %s symbols and exact adaptive calls', async (scale, symbolVariant, regionCount, plannedCalls) => {
    const prepareRaster = jest.fn(async () => prepared(scale));
    const runCouncil = jest.fn(async () => ({ envelopes: envelopes(), failures: [] }));
    const result = await executeSLDTeam(rasterInput(), { prepareRaster, resolveVisionKey: () => ({ key: KEY, source: 'user' }), runCouncil });

    expect(runCouncil).toHaveBeenCalledWith(expect.objectContaining({ regions: expect.any(Array) }));
    expect(result.drawingReview?.coverage).toMatchObject({
      plannedCalls,
      complete: true,
      roles: {
        symbols: { variantId: symbolVariant, expectedRegionCount: regionCount, actualRegionCount: regionCount, plannedCalls: regionCount + 1 },
        connections: { variantId: 'variant:line-enhanced', expectedRegionCount: regionCount, actualRegionCount: regionCount },
        text: { variantId: 'variant:text-high-contrast', expectedRegionCount: regionCount, actualRegionCount: regionCount, plannedCalls: regionCount + 3 },
        logic: { variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
      },
    });
  });

  it.each([
    [2, 'upscale-2x'],
    [4, 'upscale-4x'],
  ] as const)('holds scale %i when required %s evidence falls back to original', async (scale, requiredKind) => {
    const runCouncil = jest.fn(async () => ({ envelopes: envelopes(), failures: [] }));
    const result = await executeSLDTeam(rasterInput(), {
      prepareRaster: async () => preparedWithoutRequiredUpscale(scale),
      resolveVisionKey: () => ({ key: KEY, source: 'user' }),
      runCouncil,
    });

    expect(runCouncil).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.drawingReview?.coverage).toMatchObject({
      complete: false,
      roles: { symbols: { variantId: 'variant:original' } },
    });
    expect(result.standards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        standard: 'VISION-COUNCIL',
        judgment: 'HOLD',
        note: expect.stringContaining(requiredKind),
      }),
    ]));
    expect(result.drawingSynthesis).toMatchObject({ verdict: 'CONDITIONAL', requiresHumanReview: true });
  });

  it.each(['symbols', 'connections', 'text', 'logic', 'coverage-auditor'] as const)('fails closed and exposes HOLD when required %s review is absent', async (missing) => {
    const runCouncil = jest.fn(async () => ({ envelopes: envelopes().filter((item) => item.role !== missing), failures: [] }));
    const result = await executeSLDTeam(rasterInput(), { prepareRaster: async () => prepared(), resolveVisionKey: () => ({ key: KEY, source: 'user' }), runCouncil });

    expect(result.success).toBe(true);
    expect(result.standards).toEqual(expect.arrayContaining([expect.objectContaining({ standard: 'VISION-COUNCIL', judgment: 'HOLD', note: expect.stringContaining(missing) })]));
    expect(result.drawingReview?.envelopes).toHaveLength(4);
    expect(result.drawingSynthesis).toMatchObject({
      verdict: 'CONDITIONAL',
      requiresHumanReview: true,
      missingRoles: expect.arrayContaining([missing]),
    });
  });

  it.each(['symbols', 'connections'] as const)('fails closed when the %s graph evidence is empty', async (role) => {
    const incomplete = envelopes().map((envelope) => {
      if (envelope.role !== role) return envelope;
      return role === 'symbols' ? sealed('symbols', { symbols: [] }) : sealed('connections', { lines: [] });
    });
    const result = await executeSLDTeam(rasterInput(), { prepareRaster: async () => prepared(), resolveVisionKey: () => ({ key: KEY, source: 'user' }), runCouncil: async () => ({ envelopes: incomplete, failures: [] }) });

    expect(result.success).toBe(true);
    expect(result.standards).toEqual(expect.arrayContaining([expect.objectContaining({ standard: 'VISION-COUNCIL', judgment: 'HOLD', note: expect.stringMatching(/graph(?:가 불완전| edges가 비어)/) })]));
    expect(result.drawingSynthesis).toMatchObject({ verdict: 'CONDITIONAL', requiresHumanReview: true });
  });

  it('preserves broad-read devices and links as ambiguous candidates when the independent graph is empty', async () => {
    const empty = envelopes().map((envelope) => {
      if (envelope.role === 'symbols') return sealed('symbols', { symbols: [] });
      if (envelope.role === 'connections') return sealed('connections', { lines: [] });
      return envelope;
    });
    const analyzeBroad = jest.fn(async () => ({
      components: [
        { id: 'BROAD-BUS-01', type: 'bus' as const, label: 'Main Bus', position: { x: 50, y: 15 } },
        { id: 'BROAD-VCB-01', type: 'breaker' as const, label: 'VCB-1', position: { x: 50, y: 35 } },
      ],
      connections: [{ id: 'BROAD-LINK-01', from: 'BROAD-BUS-01', to: 'BROAD-VCB-01' }],
      suggestedCalculations: [],
      confidence: 0.96,
      rawDescription: 'broad candidate read',
    }));

    const result = await executeSLDTeam(rasterInput(), {
      prepareRaster: async () => prepared(),
      resolveVisionKey: () => ({ key: KEY, source: 'user' }),
      runCouncil: async () => ({ envelopes: empty, failures: [] }),
      analyzeBroad,
    });

    expect(analyzeBroad).toHaveBeenCalledTimes(1);
    expect(result.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'BROAD-BUS-01', label: 'Main Bus', confidence: 0.79 }),
      expect.objectContaining({ id: 'BROAD-VCB-01', label: 'VCB-1', confidence: 0.79 }),
    ]));
    expect(result.connections).toEqual([
      expect.objectContaining({ from: 'BROAD-BUS-01', to: 'BROAD-VCB-01' }),
    ]);
    expect(result.confidence).toBe(0.79);
    expect(result.standards).toEqual(expect.arrayContaining([
      expect.objectContaining({ judgment: 'HOLD', note: expect.stringContaining('보조 전체 판독 후보') }),
    ]));
    expect(result.drawingSynthesis).toMatchObject({ verdict: 'CONDITIONAL', requiresHumanReview: true });
  });

  it('preserves nonfatal failures and graph conflicts as HOLD instead of silently returning a clean review', async () => {
    const faulty = envelopes();
    const line = faulty.find((item) => item.role === 'connections')?.data.lines?.[0];
    if (!line) throw new Error('fixture is invalid');
    line.start = { x: 300, y: 50 };
    line.path = [line.start, line.end];
    const connections = faulty.find((item) => item.role === 'connections') as RoleReviewEnvelope;
    const seal = { role: connections.role, drawingHash: connections.drawingHash, provider: connections.provider, model: connections.model, promptVersion: connections.promptVersion, durationMs: connections.durationMs, data: connections.data };
    connections.outputHash = createHash('sha256').update(canonicalize(seal)).digest('hex');
    const result = await executeSLDTeam(rasterInput(), {
      prepareRaster: async () => prepared(),
      resolveVisionKey: () => ({ key: KEY, source: 'user' }),
      runCouncil: async () => ({ envelopes: faulty, failures: [{ role: 'symbols', sourceId: 'region:0', error: 'temporary source failure', fatal: false }] }),
    });

    expect(result.success).toBe(true);
    expect(result.standards).toEqual(expect.arrayContaining([expect.objectContaining({ standard: 'VISION-COUNCIL', judgment: 'HOLD' })]));
    expect(result.drawingReview?.graph?.conflicts).toContain('UNBOUND_LINE_ENDPOINT:LINE-001');
    expect(result.drawingSynthesis).toMatchObject({ verdict: 'CONDITIONAL', requiresHumanReview: true });
  });

  it('uses the selected provider env fallback only and redacts a key-resolution failure', async () => {
    const previousGemini = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const previousOpenAI = process.env.OPENAI_API_KEY;
    try {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'gemini-server-only-key';
      process.env.OPENAI_API_KEY = 'openai-other-provider-key';
      const runCouncil = jest.fn(async () => { throw new Error('gemini-server-only-key leaked'); });
      const envResult = await executeSLDTeam(rasterInput({ vision: { provider: 'gemini' } }), { prepareRaster: async () => prepared(), runCouncil });
      expect(runCouncil).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ apiKey: 'gemini-server-only-key' }) }));
      expect(JSON.stringify(envResult)).not.toContain('gemini-server-only-key');
    } finally {
      if (previousGemini === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY; else process.env.GOOGLE_GENERATIVE_AI_API_KEY = previousGemini;
      if (previousOpenAI === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousOpenAI;
    }

    const result = await executeSLDTeam(rasterInput(), { prepareRaster: async () => prepared(), resolveVisionKey: () => { throw new Error(KEY); } });
    expect(result.success).toBe(false);
    expect(result.error ?? '').not.toContain(KEY);
    expect(result.error ?? '').toContain('[REDACTED]');
  });

  it('does not collapse ambiguous graph candidates into a legacy first-choice type', async () => {
    const ambiguous = envelopes();
    const symbol = ambiguous.find((item) => item.role === 'symbols')?.data.symbols?.[0];
    if (!symbol) throw new Error('fixture is invalid');
    symbol.typeCandidates = ['VCB', 'ACB'];
    const owner = ambiguous.find((item) => item.role === 'symbols') as RoleReviewEnvelope;
    const seal = { role: owner.role, drawingHash: owner.drawingHash, provider: owner.provider, model: owner.model, promptVersion: owner.promptVersion, durationMs: owner.durationMs, data: owner.data };
    owner.outputHash = createHash('sha256').update(canonicalize(seal)).digest('hex');
    const result = await executeSLDTeam(rasterInput(), { prepareRaster: async () => prepared(), resolveVisionKey: () => ({ key: KEY, source: 'user' }), runCouncil: async () => ({ envelopes: ambiguous, failures: [] }) });
    expect(result.components?.find((item) => item.id === 'AMB-01')).toMatchObject({ type: 'unknown', label: 'VCB-A' });
    expect(result.drawingReview?.graph?.symbols.find((item) => item.id === 'AMB-01')?.typeCandidates).toEqual(['VCB', 'ACB']);
  });

  it('never touches council dependencies for DXF/PDF inputs', async () => {
    const prepareRaster = jest.fn(async () => prepared());
    const runCouncil = jest.fn(async () => ({ envelopes: envelopes(), failures: [] }));
    await executeSLDTeam({ sessionId: 'dxf-no-council', classification: 'sld_dxf' }, { prepareRaster, runCouncil, resolveVisionKey: () => ({ key: KEY, source: 'user' }) });
    await executeSLDTeam({ sessionId: 'pdf-no-council', classification: 'sld_pdf' }, { prepareRaster, runCouncil, resolveVisionKey: () => ({ key: KEY, source: 'user' }) });
    expect(prepareRaster).not.toHaveBeenCalled();
    expect(runCouncil).not.toHaveBeenCalled();
  });

  it('parses the real DXF fixture from fileBuffer and bypasses the council', async () => {
    const dxf = readFileSync(join(process.cwd(), 'fixtures/drawings/synthetic/L1-02-text-spec.dxf'));
    const expected = parseDxfToSLD(dxf.toString('utf8'));
    const runCouncil = jest.fn();
    const result = await executeSLDTeam({ sessionId: 'dxf-fixture', classification: 'sld_dxf', fileBuffer: dxf.buffer.slice(dxf.byteOffset, dxf.byteOffset + dxf.byteLength) }, { runCouncil });

    expect(runCouncil).not.toHaveBeenCalled();
    expect(result.components?.map((component) => component.id)).toEqual(expected.components.map((component) => component.id));
    expect(result.connections?.map((connection) => [connection.from, connection.to])).toEqual(expected.connections.map((connection) => [connection.from, connection.to]));
  });

  it('uses the PDF parser mock with a non-empty buffer and bypasses the council', async () => {
    jest.mocked(parsePdfToSLD).mockResolvedValue({ components: [{ id: 'PDF-TR-01', type: 'transformer', label: 'PDF TR', position: { x: 25, y: 75 } }], connections: [], confidence: 1, suggestedCalculations: [], rawDescription: '' } as unknown as Awaited<ReturnType<typeof parsePdfToSLD>>);
    const runCouncil = jest.fn();
    const result = await executeSLDTeam({ sessionId: 'pdf-mock', classification: 'sld_pdf', fileBuffer: new Uint8Array([37, 80, 68, 70]).buffer }, { runCouncil });

    expect(parsePdfToSLD).toHaveBeenCalled();
    expect(runCouncil).not.toHaveBeenCalled();
    expect(result.components).toEqual([expect.objectContaining({ id: 'PDF-TR-01', type: 'transformer', position: { x: 25, y: 75 } })]);
  });

  it('reports only vector roles that actually produced evidence and passed topology validation', async () => {
    jest.mocked(parsePdfToSLD).mockResolvedValue({
      components: [{ id: 'PDF-TR-01', type: 'transformer', label: 'PDF TR', position: { x: 25, y: 75 } }],
      connections: [{ from: 'PDF-TR-01', to: 'MISSING-LOAD' }],
      sourceTexts: [], confidence: 1, suggestedCalculations: [], rawDescription: '',
    } as unknown as Awaited<ReturnType<typeof parsePdfToSLD>>);

    const result = await executeSLDTeam({
      sessionId: 'pdf-vector-audit', classification: 'sld_pdf',
      fileBuffer: new Uint8Array([37, 80, 68, 70]).buffer,
    });

    expect(result.vectorAudit).toEqual({
      parser: 'pdf', pageNumber: 1, complete: false, roles: ['symbols', 'connections'],
    });
  });

  it('keeps the caller-owned PDF buffer intact across multi-page parser calls', async () => {
    jest.mocked(parsePdfToSLD).mockImplementation(async (buffer) => {
      structuredClone(buffer, { transfer: [buffer] });
      return {
        components: [{ id: 'PDF-VCB-01', type: 'breaker', label: 'VCB-1', position: { x: 20, y: 20 } }],
        connections: [],
        sourceTexts: [],
        confidence: 0.85,
        suggestedCalculations: [],
        rawDescription: '',
      } as unknown as Awaited<ReturnType<typeof parsePdfToSLD>>;
    });
    const shared = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]).buffer;

    const first = await executeSLDTeam({
      sessionId: 'pdf-page-1',
      classification: 'sld_pdf',
      fileBuffer: shared,
      params: { pageNumber: 1 },
    });
    const second = await executeSLDTeam({
      sessionId: 'pdf-page-2',
      classification: 'sld_pdf',
      fileBuffer: shared,
      params: { pageNumber: 2 },
    });

    expect(shared.byteLength).toBe(8);
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
  });
});
