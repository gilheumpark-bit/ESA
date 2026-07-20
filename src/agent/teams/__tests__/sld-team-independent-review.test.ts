import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { executeSLDTeam } from '../sld-team';
import { parseDxfToSLD } from '@/engine/topology/dxf-parser';
import { parsePdfToSLD } from '@/engine/topology/pdf-vector-parser';
import type { TeamInput } from '../types';
import type { DrawingSnapshot, ImageVariant, PrecisionRegion } from '../../vision/evidence-types';
import type { RoleReviewData, RoleReviewEnvelope, ReviewRole } from '../../vision/review-types';

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

function rasterInput(extra: Partial<TeamInput> = {}): TeamInput {
  return { sessionId: 'sld-independent-test', classification: 'sld_image', fileBuffer: new ArrayBuffer(8), fileName: 'fixture.png', mimeType: 'image/png', vision: { provider: 'openai', apiKey: ` ${KEY} ` }, ...extra };
}

describe('SLD raster independent council integration', () => {
  it('runs one full-region council, maps stable graph IDs, and keeps the BYOK secret out of the result', async () => {
    const prepareRaster = jest.fn(async () => prepared());
    const resolveVisionKey = jest.fn(() => ({ key: KEY, source: 'user' as const }));
    const runCouncil = jest.fn(async () => ({ envelopes: envelopes(), failures: [] }));

    const result = await executeSLDTeam(rasterInput(), { prepareRaster, resolveVisionKey, runCouncil });

    expect(runCouncil).toHaveBeenCalledTimes(1);
    expect(runCouncil).toHaveBeenCalledWith(expect.objectContaining({ snapshot, regions: expect.any(Array), maxRegionCallsPerRole: 16, options: expect.objectContaining({ apiKey: KEY }) }));
    expect(prepareRaster).toHaveBeenCalledTimes(1);
    expect(resolveVisionKey).toHaveBeenCalledWith('openai', ` ${KEY} `);
    expect(result.success).toBe(true);
    expect(result.components).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'VCB-01', type: 'breaker_vcb' }), expect.objectContaining({ id: 'TR-01', type: 'transformer' })]));
    expect(result.connections).toEqual([expect.objectContaining({ from: 'VCB-01', to: 'TR-01' })]);
    expect(result.drawingReview).toMatchObject({ snapshot: { drawingHash: DRAWING_HASH, width: 100, height: 80 }, coverage: { plannedCalls: 16, complete: true, maxRegionCallsPerRole: 16 } });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it.each([
    [1, 'variant:original', 4, 16],
    [2, 'variant:upscale-2x', 9, 31],
    [4, 'variant:upscale-4x', 16, 52],
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
        text: { variantId: 'variant:text-high-contrast', expectedRegionCount: regionCount, actualRegionCount: regionCount },
        logic: { variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
      },
    });
  });

  it.each(['symbols', 'connections', 'text', 'logic'] as const)('fails closed and exposes HOLD when required %s review is absent', async (missing) => {
    const runCouncil = jest.fn(async () => ({ envelopes: envelopes().filter((item) => item.role !== missing), failures: [] }));
    const result = await executeSLDTeam(rasterInput(), { prepareRaster: async () => prepared(), resolveVisionKey: () => ({ key: KEY, source: 'user' }), runCouncil });

    expect(result.success).toBe(false);
    expect(result.standards).toEqual(expect.arrayContaining([expect.objectContaining({ standard: 'VISION-COUNCIL', judgment: 'HOLD', note: expect.stringContaining(missing) })]));
    expect(result.drawingReview?.envelopes).toHaveLength(3);
  });

  it.each(['symbols', 'connections'] as const)('fails closed when the %s graph evidence is empty', async (role) => {
    const incomplete = envelopes().map((envelope) => {
      if (envelope.role !== role) return envelope;
      return role === 'symbols' ? sealed('symbols', { symbols: [] }) : sealed('connections', { lines: [] });
    });
    const result = await executeSLDTeam(rasterInput(), { prepareRaster: async () => prepared(), resolveVisionKey: () => ({ key: KEY, source: 'user' }), runCouncil: async () => ({ envelopes: incomplete, failures: [] }) });

    expect(result.success).toBe(false);
    expect(result.standards).toEqual(expect.arrayContaining([expect.objectContaining({ standard: 'VISION-COUNCIL', judgment: 'HOLD', note: expect.stringMatching(/graph(?:가 불완전| edges가 비어)/) })]));
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

    expect(result.success).toBe(false);
    expect(result.standards).toEqual(expect.arrayContaining([expect.objectContaining({ standard: 'VISION-COUNCIL', judgment: 'HOLD' })]));
    expect(result.drawingReview?.graph?.conflicts).toContain('UNBOUND_LINE_ENDPOINT:LINE-001');
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
    jest.mocked(parsePdfToSLD).mockResolvedValue({ components: [{ id: 'PDF-TR-01', type: 'transformer', label: 'PDF TR' }], connections: [], confidence: 1, suggestedCalculations: [], rawDescription: '' } as unknown as Awaited<ReturnType<typeof parsePdfToSLD>>);
    const runCouncil = jest.fn();
    const result = await executeSLDTeam({ sessionId: 'pdf-mock', classification: 'sld_pdf', fileBuffer: new Uint8Array([37, 80, 68, 70]).buffer }, { runCouncil });

    expect(parsePdfToSLD).toHaveBeenCalled();
    expect(runCouncil).not.toHaveBeenCalled();
    expect(result.components).toEqual([expect.objectContaining({ id: 'PDF-TR-01', type: 'transformer' })]);
  });
});
