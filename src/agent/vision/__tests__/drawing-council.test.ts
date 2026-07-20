import { runDrawingCouncil } from '../drawing-council';
import type { DrawingSnapshot, ImageVariant, PrecisionRegion } from '../evidence-types';
import type { VLMOptions, VLMReviewRole, VLMRoleAnalysisResult } from '../vlm-client';

const options: VLMOptions = { provider: 'openai', apiKey: 'sk-council-test-key', maxRetries: 0 };

function snapshot(): DrawingSnapshot {
  return {
    drawingHash: 'drawing-hash',
    mimeType: 'image/png',
    page: 3,
    width: 100,
    height: 80,
    quality: {
      width: 100,
      height: 80,
      channels: 3,
      contrast: 1,
      edgeDensity: 0.2,
      gradientVariance: 1,
      lowContrast: false,
      blurry: false,
      recommendedScale: 1,
      warnings: [],
    },
  };
}

function variants(): ImageVariant[] {
  return [
    { id: 'variant:original', kind: 'original', buffer: new ArrayBuffer(1), width: 100, height: 80, transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 } },
    { id: 'variant:text', kind: 'text-high-contrast', buffer: new ArrayBuffer(3), width: 100, height: 80, transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 } },
    { id: 'variant:lines', kind: 'line-enhanced', buffer: new ArrayBuffer(4), width: 100, height: 80, transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 } },
  ];
}

function regions(): PrecisionRegion[] {
  return [{
    id: 'region:right',
    variantId: 'variant:original',
    variantBounds: { x: 50, y: 0, w: 50, h: 80 },
    originalBounds: { x: 50, y: 0, w: 50, h: 80 },
    buffer: new ArrayBuffer(2),
  }];
}

function resultFor(role: VLMReviewRole, sourceByteLength = 1): VLMRoleAnalysisResult {
  if (role === 'symbols') {
    return {
      role,
      data: {
        symbols: [{ id: 'same', typeCandidates: ['VCB'], rawLabel: 'VCB', bounds: { x: 0, y: 0, w: 1000, h: 1000, page: 1 }, ports: [{ x: 1000, y: 0 }], confidence: 1 }],
        warnings: [], confidence: 1,
      }, rawText: '{}', model: `symbol-${sourceByteLength}`, durationMs: 1, retryCount: 0,
    };
  }
  if (role === 'connections') {
    return {
      role,
      data: {
        lines: [{ id: 'same', lineKind: 'power', path: [{ x: 0, y: 0 }, { x: 1000, y: 1000 }], start: { x: 0, y: 0 }, end: { x: 1000, y: 1000 }, junctions: [], crossovers: [], confidence: 1 }],
        warnings: [], confidence: 1,
      }, rawText: '{}', model: `line-${sourceByteLength}`, durationMs: 1, retryCount: 0,
    };
  }
  if (role === 'text') {
    return {
      role,
      data: {
        texts: [{ id: 'same', raw: 'PPT', candidates: ['PT', 'PPT'], bounds: { x: 0, y: 0, w: 1000, h: 1000, page: 1 }, confidence: 1 }],
        warnings: [], confidence: 1,
      }, rawText: '{}', model: `text-${sourceByteLength}`, durationMs: 1, retryCount: 0,
    };
  }
  return {
    role,
    data: {
      logic: [{ id: 'logic', topic: 'DIRECTION', subjectIds: ['same'], attributes: { fromId: 'same', toId: 'same', protectedById: 'same' }, statement: 'feeds', evidenceBounds: [{ x: 0, y: 0, w: 1000, h: 1000, page: 1 }], confidence: 1 }],
      warnings: [], confidence: 1,
    }, rawText: '{}', model: `logic-${sourceByteLength}`, durationMs: 1, retryCount: 0,
  };
}

describe('sealed independent drawing council', () => {
  it('starts four isolated roles concurrently with role-specific variants and keeps logic full-image only', async () => {
    const started: VLMReviewRole[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const invoke = jest.fn(async (buffer: ArrayBuffer, _mime: string, role: VLMReviewRole) => {
      started.push(role);
      await gate;
      return resultFor(role, buffer.byteLength);
    });

    const pending = runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: regions(), options, maxRegionCallsPerRole: 1 }, invoke);
    await Promise.resolve();

    expect([...new Set(started)].sort()).toEqual(['connections', 'logic', 'symbols', 'text']);
    release?.();
    const result = await pending;
    expect(invoke).toHaveBeenCalledTimes(5);
    expect(result.envelopes.map((item) => item.role)).toEqual(['symbols', 'connections', 'text', 'logic']);
    expect(result.envelopes.find((item) => item.role === 'logic')?.data.logic).toHaveLength(1);
  });

  it('remaps normalized geometry to original pixels, namespaces source ids, and rewrites logic references', async () => {
    const result = await runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: regions(), options, maxRegionCallsPerRole: 1 }, async (buffer, _mime, role) => resultFor(role, buffer.byteLength));
    const symbols = result.envelopes.find((item) => item.role === 'symbols')?.data.symbols ?? [];
    const logic = result.envelopes.find((item) => item.role === 'logic')?.data.logic?.[0];

    expect(symbols).toMatchObject([
      { id: 's0:same', sourceId: 'variant:original', bounds: { x: 0, y: 0, w: 100, h: 80, page: 3 }, ports: [{ x: 100, y: 0 }] },
      { id: 's1:same', sourceId: 'region:right', bounds: { x: 50, y: 0, w: 50, h: 80, page: 3 } },
    ]);
    expect(logic).toMatchObject({
      id: 's0:logic',
      subjectIds: ['s0:same'],
      attributes: { fromId: 's0:same', toId: 's0:same', protectedById: 's0:same' },
      evidenceBounds: [{ x: 0, y: 0, w: 100, h: 80, page: 3 }],
    });
  });

  it('uses a selected variant transform when mapping full-image normalized coordinates', async () => {
    const transformedVariants = variants().map((variant) => variant.kind === 'text-high-contrast'
      ? { ...variant, width: 160, height: 80, transform: { scaleX: 2, scaleY: 2, offsetX: 0, offsetY: 0 } }
      : variant);
    const result = await runDrawingCouncil({ snapshot: snapshot(), variants: transformedVariants, regions: [], options }, async (buffer, _mime, role) => resultFor(role, buffer.byteLength));

    expect(result.envelopes.find((item) => item.role === 'text')?.data.texts?.[0].bounds).toEqual({ x: 0, y: 0, w: 80, h: 40, page: 3 });
  });

  it('rejects invalid sources and call budgets before invoking a provider', async () => {
    const invoke = jest.fn(async (_buffer: ArrayBuffer, _mime: string, role: VLMReviewRole) => resultFor(role));
    await expect(runDrawingCouncil({ snapshot: snapshot(), variants: [], regions: [], options }, invoke)).rejects.toThrow();
    await expect(runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: [{ ...regions()[0], id: 'variant:original' }], options }, invoke)).rejects.toThrow();
    await expect(runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: [{ ...regions()[0], originalBounds: { x: 90, y: 0, w: 20, h: 80 } }], options }, invoke)).rejects.toThrow();
    await expect(runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: [], options, maxRegionCallsPerRole: 1.5 }, invoke)).rejects.toThrow();
    await expect(runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: [], options, maxRegionCallsPerRole: 17 }, invoke)).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps successful roles, reports deterministic redacted failures, and rejects mismatched role payloads', async () => {
    const key = options.apiKey;
    const invoke = jest.fn(async (buffer: ArrayBuffer, _mime: string, role: VLMReviewRole) => {
      if (role === 'text') throw new Error(`${key} text provider failed ${'x'.repeat(500)}`);
      if (role === 'symbols' && buffer.byteLength === 2) throw new Error('region unavailable');
      if (role === 'connections') return { ...resultFor(role, buffer.byteLength), role: 'text' as VLMReviewRole };
      return resultFor(role, buffer.byteLength);
    });

    const result = await runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: regions(), options, maxRegionCallsPerRole: 1 }, invoke);

    expect(result.envelopes.map((item) => item.role)).toEqual(['symbols', 'logic']);
    expect(result.envelopes[0].data.warnings).toContain('REGION_REVIEW_FAILED:region:right');
    expect(result.failures.map((item) => [item.role, item.sourceId, item.fatal])).toEqual([
      ['symbols', 'region:right', false],
      ['connections', 'variant:lines', true],
      ['connections', 'role', true],
      ['text', 'variant:text', true],
      ['text', 'role', true],
    ]);
    expect(result.failures.find((item) => item.role === 'text')?.error).not.toContain(key);
    expect(result.failures.find((item) => item.role === 'text')?.error.length).toBeLessThanOrEqual(300);
  });

  it('seals canonical output independently of input key order and freezes returned data', async () => {
    const first = await runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: [], options }, async (_buffer, _mime, role) => resultFor(role));
    const second = await runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: [], options }, async (_buffer, _mime, role) => {
      const value = resultFor(role);
      return { ...value, data: { ...value.data, confidence: value.data.confidence, warnings: value.data.warnings } };
    });

    expect(first.envelopes.map((item) => item.outputHash)).toEqual(second.envelopes.map((item) => item.outputHash));
    expect(Object.isFrozen(first.envelopes[0])).toBe(true);
    expect(Object.isFrozen(first.envelopes[0].data)).toBe(true);
    expect(() => first.envelopes[0].data.warnings.push('mutate')).toThrow();
  });
});
