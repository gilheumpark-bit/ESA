import { createHash } from 'node:crypto';
import sharp from 'sharp';
import * as adaptive from '../adaptive-regions';
import { preparePrecisionRegions } from '../vision-splitter';
import { prepareLazyPrecisionRegions, createRequestPreparationCache, regionDescriptorKey, type PrecisionRegionDescriptor } from '../lazy-precision-regions';
import { runDrawingCouncil, type DrawingCouncilInput } from '../drawing-council';
import type { DrawingSnapshot, ImageVariant } from '../evidence-types';
import type { VLMReviewRole, VLMRoleAnalysisResult } from '../vlm-client';

const hash = (buffer: ArrayBuffer) => createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
const bytes = (value: number) => new Uint8Array([value]).buffer;
async function image() {
  const input = Buffer.from('<svg width="128" height="96" xmlns="http://www.w3.org/2000/svg"><rect width="128" height="96" fill="white"/><path d="M4 12H124M4 48H124M4 84H124M24 4V92M64 4V92M104 4V92" stroke="black" stroke-width="2"/></svg>');
  return Uint8Array.from(await sharp(input).png().toBuffer()).buffer;
}

afterEach(() => jest.restoreAllMocks());

describe('request-local lazy image preparation', () => {
  it('plans all regions without generating a crop', async () => {
    const prepared = await prepareLazyPrecisionRegions(await image());
    expect(prepared.regions.length).toBeGreaterThan(0);
    expect(prepared.regions.every((region) => !('buffer' in region))).toBe(true);
    expect(prepared.statistics()).toEqual({ plannedRegions: prepared.regions.length, cropCount: 0, cacheHits: 0, cropBytes: 0 });
  });

  it('retains every eager region identity, coordinate and exact selected PNG bytes', async () => {
    const source = await image();
    const eager = await preparePrecisionRegions(source);
    const lazy = await prepareLazyPrecisionRegions(source);
    expect(lazy.profile).toEqual(eager.profile);
    expect(lazy.variants.map((item) => [item.id, hash(item.buffer)])).toEqual(eager.variants.map((item) => [item.id, hash(item.buffer)]));
    expect(lazy.regions.map(regionDescriptorKey)).toEqual(eager.regions.map(regionDescriptorKey));
    for (const index of [0, Math.floor(lazy.regions.length / 2), lazy.regions.length - 1]) {
      const actual = await lazy.materializeRegion(lazy.regions[index]);
      expect(regionDescriptorKey(actual)).toBe(regionDescriptorKey(eager.regions[index]));
      expect(hash(actual.buffer)).toBe(hash(eager.regions[index].buffer));
    }
    expect(lazy.statistics().cropCount).toBe(3);
  });

  it('single-flights the same crop without sharing a mutable returned buffer', async () => {
    const prepared = await prepareLazyPrecisionRegions(await image());
    const region = prepared.regions[1];
    const [left, right] = await Promise.all([prepared.materializeRegion(region), prepared.materializeRegion(region)]);
    const expected = hash(right.buffer);
    new Uint8Array(left.buffer).fill(0);
    left.originalBounds.x = 999;
    expect(hash(right.buffer)).toBe(expected);
    expect(hash((await prepared.materializeRegion(region)).buffer)).toBe(expected);
    expect(prepared.statistics().cropCount).toBe(1);
    expect(prepared.statistics().cacheHits).toBe(2);
  });

  it('rejects unknown or modified geometry before extraction', async () => {
    const prepared = await prepareLazyPrecisionRegions(await image());
    const region = prepared.regions[0];
    await expect(prepared.materializeRegion({ ...region, id: 'unregistered' })).rejects.toThrow('등록된');
    await expect(prepared.materializeRegion({ ...region, originalBounds: { ...region.originalBounds, x: 1 } })).rejects.toThrow('등록된');
    expect(prepared.statistics().cropCount).toBe(0);
  });

  it('does not start a crop for an already cancelled operation', async () => {
    const prepared = await prepareLazyPrecisionRegions(await image());
    const controller = new AbortController();
    controller.abort();
    await expect(prepared.materializeRegion(prepared.regions[0], controller.signal)).rejects.toThrow();
    expect(prepared.statistics().cropCount).toBe(0);
  });

  it('evicts a rejected crop so a later attempt can recover', async () => {
    const prepared = await prepareLazyPrecisionRegions(await image());
    const crop = jest.spyOn(adaptive, 'cropAnalysisRegions').mockRejectedValueOnce(new Error('synthetic crop failure'));
    await expect(prepared.materializeRegion(prepared.regions[0])).rejects.toThrow('synthetic crop failure');
    const recovered = await prepared.materializeRegion(prepared.regions[0]);
    expect(recovered.buffer.byteLength).toBeGreaterThan(0);
    expect(crop).toHaveBeenCalledTimes(2);
    expect(prepared.statistics().cropCount).toBe(1);
  });

  it('does not retain cancelled caller access to cached pixels', async () => {
    const prepared = await prepareLazyPrecisionRegions(await image());
    await prepared.materializeRegion(prepared.regions[0]);
    const controller = new AbortController();
    controller.abort();
    await expect(prepared.materializeRegion(prepared.regions[0], controller.signal)).rejects.toThrow();
  });
});

describe('one-page preparation cache', () => {
  it('single-flights identical content, including a different ArrayBuffer instance', async () => {
    const prepare = jest.fn(async () => ({ marker: 'prepared' }));
    const cached = createRequestPreparationCache(prepare);
    const a = cached(bytes(1), 'image/png');
    const b = cached(bytes(1), 'image/png');
    expect(a).toBe(b);
    expect(await a).toBe(await b);
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it('does not reuse changed content or another MIME contract', async () => {
    const prepare = jest.fn(async () => ({}));
    const cached = createRequestPreparationCache(prepare);
    const input = bytes(1);
    await cached(input, 'image/png');
    new Uint8Array(input)[0] = 2;
    await cached(input, 'image/png');
    await cached(input, 'image/jpeg');
    expect(prepare).toHaveBeenCalledTimes(3);
  });
  it('retains only the current page, not every page in a large drawing', async () => {
    const prepare = jest.fn(async () => ({}));
    const cached = createRequestPreparationCache(prepare);
    await cached(bytes(1), 'image/png');
    await cached(bytes(2), 'image/png');
    await cached(bytes(1), 'image/png');
    expect(prepare).toHaveBeenCalledTimes(3);
  });
  it('does not share prepared pages across separate document runs', async () => {
    const prepare = jest.fn(async () => ({}));
    await createRequestPreparationCache(prepare)(bytes(1), 'image/png');
    await createRequestPreparationCache(prepare)(bytes(1), 'image/png');
    expect(prepare).toHaveBeenCalledTimes(2);
  });
  it('retries after preparation rejects', async () => {
    const prepare = jest.fn<Promise<object>, [ArrayBuffer, string]>().mockRejectedValueOnce(new Error('fail')).mockResolvedValue({});
    const cached = createRequestPreparationCache(prepare);
    await expect(cached(bytes(1), 'image/png')).rejects.toThrow('fail');
    await expect(cached(bytes(1), 'image/png')).resolves.toEqual({});
    expect(prepare).toHaveBeenCalledTimes(2);
  });
  it('a late rejection of an old page cannot evict the new page', async () => {
    let rejectOld!: (error: Error) => void;
    const prepare = jest.fn<Promise<object>, [ArrayBuffer, string]>()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }))
      .mockResolvedValue({ marker: 'new' });
    const cached = createRequestPreparationCache(prepare);
    const old = cached(bytes(1), 'image/png');
    const handled = old.catch(() => undefined);
    await Promise.resolve();
    const current = await cached(bytes(2), 'image/png');
    rejectOld(new Error('late failure'));
    await handled;
    expect(await cached(bytes(2), 'image/png')).toBe(current);
    expect(prepare).toHaveBeenCalledTimes(2);
  });
});

function snapshot(): DrawingSnapshot {
  return { drawingHash: 'performance-fixture', mimeType: 'image/png', page: 1, width: 100, height: 80,
    quality: { width: 100, height: 80, channels: 3, contrast: 1, edgeDensity: 0.2, gradientVariance: 1,
      lowContrast: false, blurry: false, recommendedScale: 1, warnings: [] } };
}
function variants(): ImageVariant[] {
  return [
    { id: 'original', kind: 'original', buffer: bytes(1), width: 100, height: 80, transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 } },
    { id: 'text', kind: 'text-high-contrast', buffer: bytes(2), width: 100, height: 80, transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 } },
    { id: 'lines', kind: 'line-enhanced', buffer: bytes(3), width: 100, height: 80, transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 } },
  ];
}
function descriptor(index = 0): PrecisionRegionDescriptor {
  return { id: `region-${index}`, variantId: 'original', variantBounds: { x: index * 10, y: 0, w: 10, h: 80 }, originalBounds: { x: index * 10, y: 0, w: 10, h: 80 } };
}
function response(role: VLMReviewRole): VLMRoleAnalysisResult {
  const data = role === 'symbols' ? {
    symbols: [{ id: 'uncertain-symbol', typeCandidates: ['breaker', 'fuse'], rawLabel: 'UI fixture',
      bounds: { x: 0, y: 0, w: 1000, h: 1000, page: 1 }, ports: [], confidence: 0.6 }],
    warnings: [], confidence: 0.6,
  }
    : role === 'connections' ? { lines: [], warnings: [], confidence: 1 }
      : role === 'text' ? { texts: [], warnings: [], confidence: 1 }
        : role === 'logic' ? { logic: [], warnings: [], confidence: 1 }
          : { rescanTargets: [], warnings: [], confidence: 1 };
  return { role, data, rawText: '{}', model: 'synthetic-performance-model', durationMs: 1, retryCount: 0 };
}
const invoke = async (_buffer: ArrayBuffer, _mime: string, role: VLMReviewRole) => response(role);
const input = (): DrawingCouncilInput => ({ snapshot: snapshot(), variants: variants(), regions: [descriptor()], options: { provider: 'openai', apiKey: 'synthetic-not-a-key', maxRetries: 0 } });

describe('council selection and performance contracts', () => {
  it('does not load regions when the existing plan selects none', async () => {
    const materializeRegion = jest.fn(async (region: PrecisionRegionDescriptor) => ({ ...region, buffer: bytes(4) }));
    const result = await runDrawingCouncil({ ...input(), maxRegionCallsPerRole: 0, materializeRegion }, invoke);
    expect(materializeRegion).not.toHaveBeenCalled();
    expect(result.performance?.selectedRegions).toBe(0);
    expect(result.callCounts?.attempted).toBe(5);
  });
  it('supplies identical actual role inputs and outcomes for eager and lazy regions', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    const actual = { ...descriptor(), buffer: bytes(4) };
    const calls: string[][] = [[], []];
    const run = (which: number) => async (buffer: ArrayBuffer, _mime: string, role: VLMReviewRole, _options: unknown, context?: string) => {
      calls[which].push(JSON.stringify([role, hash(buffer), context ?? null]));
      return response(role);
    };
    const eager = await runDrawingCouncil({ ...input(), regions: [actual] }, run(0));
    const lazy = await runDrawingCouncil({ ...input(), materializeRegion: async () => actual }, run(1));
    expect(lazy.precisionPlan?.symbols).toEqual(['region-0']);
    expect(lazy.performance?.preparedRegions).toBe(1);
    expect(calls[1]).toHaveLength(6);
    expect(calls[1]).toEqual(calls[0]);
    expect(lazy.envelopes).toEqual(eager.envelopes);
    expect(lazy.failures).toEqual(eager.failures);
    expect(lazy.precisionPlan).toEqual(eager.precisionPlan);
    expect(lazy.callCounts).toEqual(eager.callCounts);
  });
  it('never sends unmaterialized metadata as an image', async () => {
    const spy = jest.fn(invoke);
    await expect(runDrawingCouncil(input(), spy)).rejects.toThrow('ArrayBuffer');
    expect(spy).not.toHaveBeenCalled();
  });
  it('rejects invalid region geometry before spending provider calls', async () => {
    const spy = jest.fn(invoke);
    const region = { ...descriptor(), originalBounds: { x: 500, y: 0, w: 10, h: 80 } };
    await expect(runDrawingCouncil({ ...input(), regions: [region], materializeRegion: async () => ({ ...region, buffer: bytes(4) }) }, spy)).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
  it.each(['failure', 'changed-id', 'changed-coordinates', 'empty-buffer'] as const)(
    'keeps full-page receipts when selected crop preparation has %s', async (mode) => {
      const result = await runDrawingCouncil({ ...input(), materializeRegion: async (region) => {
        if (mode === 'failure') throw new Error('fixture extraction failure');
        return { ...region, ...(mode === 'changed-id' ? { id: 'another-region' } : {}),
          ...(mode === 'changed-coordinates' ? { originalBounds: { ...region.originalBounds, x: 1 } } : {}),
          buffer: mode === 'empty-buffer' ? new ArrayBuffer(0) : bytes(4) };
      } }, invoke);
      expect(result.precisionPlan?.symbols).toEqual(['region-0']);
      expect(result.envelopes.some((item) => item.role === 'symbols' && item.reviewedSourceIds?.includes('original'))).toBe(true);
      expect(result.failures.some((item) => item.role === 'symbols' && item.sourceId === 'region-0')).toBe(true);
      expect(result.callCounts?.attempted).toBe(5);
      expect(result.performance?.preparationFailures).toBe(1);
      expect(result.performance?.preparedRegions).toBe(0);
    },
  );
  it('bounds image preparation concurrency independently from model concurrency', async () => {
    const prior = await runDrawingCouncil({ ...input(), regions: [] }, invoke);
    let active = 0;
    let maximum = 0;
    const result = await runDrawingCouncil({ ...input(), regions: Array.from({ length: 8 }, (_, index) => descriptor(index)),
      maxConcurrentCalls: 8, priorEnvelopes: prior.envelopes, materializeRegion: async (region) => {
        active++; maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active--;
        return { ...region, buffer: bytes(4) };
      } }, invoke);
    expect(maximum).toBe(2);
    expect(result.performance?.preparedRegions).toBe(8);
    expect(result.failures).toEqual([]);
  });
  it('preserves already sealed roles on cancellation during crop preparation', async () => {
    const controller = new AbortController();
    const result = await runDrawingCouncil({ ...input(), options: { ...input().options, signal: controller.signal }, settleOnAbort: true,
      materializeRegion: async (region) => { controller.abort(); return { ...region, buffer: bytes(4) }; } }, invoke);
    expect(result.envelopes).toHaveLength(4);
    expect(result.failures.some((failure) => failure.role === 'coverage-auditor' && failure.fatal)).toBe(true);
    expect(result.callCounts?.attempted).toBe(4);
  });
  it('records bounded queue and service durations without credentials or model responses', async () => {
    const result = await runDrawingCouncil({ ...input(), materializeRegion: async (region) => ({ ...region, buffer: bytes(4) }) }, invoke);
    const measured = result.performance!;
    expect(measured.version).toBe('drawing-perf-v1');
    expect(measured.calls).toHaveLength(result.callCounts!.attempted);
    expect(measured.calls.every((call) => Number.isFinite(call.queueMs) && call.queueMs >= 0 && Number.isFinite(call.serviceMs) && call.serviceMs >= 0)).toBe(true);
    expect(Object.keys(measured.stages).sort()).toEqual(['audit', 'full', 'precision', 'regionPreparation']);
    expect(JSON.stringify(measured)).not.toContain('synthetic-not-a-key');
    expect(JSON.stringify(measured)).not.toContain('rawText');
  });
});
