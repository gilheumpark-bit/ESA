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
  if (role === 'coverage-auditor') {
    return {
      role,
      data: { rescanTargets: [], warnings: [], confidence: 1 },
      rawText: '{}', model: `coverage-${sourceByteLength}`, durationMs: 1, retryCount: 0,
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
  it('finishes the full connection survey before annotated region calls and allowlists C anchors', async () => {
    const precisionRegions: PrecisionRegion[] = [
      {
        id: 'lines:left',
        displayId: 'P03-A01',
        variantId: 'variant:lines',
        variantBounds: { x: 0, y: 0, w: 50, h: 80 },
        logicalVariantBounds: { x: 0, y: 0, w: 50, h: 80 },
        originalBounds: { x: 0, y: 0, w: 50, h: 80 },
        logicalOriginalBounds: { x: 0, y: 0, w: 50, h: 80 },
        buffer: new ArrayBuffer(21),
      },
      {
        id: 'lines:right',
        displayId: 'P03-A02',
        variantId: 'variant:lines',
        variantBounds: { x: 50, y: 0, w: 50, h: 80 },
        logicalVariantBounds: { x: 50, y: 0, w: 50, h: 80 },
        originalBounds: { x: 50, y: 0, w: 50, h: 80 },
        logicalOriginalBounds: { x: 50, y: 0, w: 50, h: 80 },
        buffer: new ArrayBuffer(22),
      },
    ];
    let fullConnectionComplete = false;
    const regionContexts: string[] = [];
    const annotatedPorts: string[][] = [];

    const result = await runDrawingCouncil(
      { snapshot: snapshot(), variants: variants(), regions: precisionRegions, options, maxRegionCallsPerRole: 2 },
      async (buffer, _mime, role, _options, context) => {
        if (role === 'symbols') {
          return {
            ...resultFor(role, buffer.byteLength),
            data: { symbols: [], warnings: [], confidence: 1 },
          };
        }
        if (role === 'connections' && buffer.byteLength === 4) {
          fullConnectionComplete = true;
        }
        if (role === 'connections' && buffer.byteLength >= 21) {
          expect(fullConnectionComplete).toBe(true);
          regionContexts.push(context ?? '');
          const reviewed = resultFor(role, buffer.byteLength);
          const lines = reviewed.data.lines ?? [];
          lines[0] = { ...lines[0], startAnchorId: 'P03-C001' };
          return reviewed;
        }
        return resultFor(role, buffer.byteLength);
      },
      async (region, ports) => {
        annotatedPorts.push(ports.map((port) => port.displayId));
        return region;
      },
    );

    expect(result.continuityPlan?.continuations.map((port) => port.displayId)).toEqual(['P03-C001']);
    expect(annotatedPorts).toEqual([['P03-C001'], ['P03-C001']]);
    expect(regionContexts).toHaveLength(2);
    expect(regionContexts.every((context) => context.includes('P03-C001'))).toBe(true);
    expect(result.failures.filter((failure) => failure.role === 'connections')).toEqual([]);
  });

  it('runs a post-review coverage auditor with coverage context and returns rescan targets', async () => {
    let auditContext = '';
    const result = await runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: regions(), options, maxRegionCallsPerRole: 1 }, async (buffer, _mime, role, _options, context) => {
      if ((role as string) === 'coverage-auditor') {
        auditContext = context ?? '';
        return {
          role,
          data: {
            rescanTargets: [{
              id: 'miss-1',
              reason: 'boundary-clip',
              bounds: { x: 450, y: 0, w: 100, h: 1000, page: 1 },
              suggestedRoles: ['symbols', 'connections'],
              confidence: 0.9,
            }],
            warnings: [],
            confidence: 0.9,
          },
          rawText: '{}',
          model: 'coverage-model',
          durationMs: 1,
          retryCount: 0,
        } as never;
      }
      return resultFor(role, buffer.byteLength);
    });

    const audit = result.envelopes.find((item) => (item.role as string) === 'coverage-auditor');
    expect(auditContext).toContain('region:right');
    expect(auditContext).toContain('reviewedSourceIds');
    expect(result.envelopes.find((item) => item.role === 'symbols')?.reviewedSourceIds)
      .toEqual(expect.arrayContaining(['variant:original', 'region:right']));
    expect((audit?.data as { rescanTargets?: unknown[] } | undefined)?.rescanTargets).toHaveLength(1);
  });

  it('shows the coverage auditor prior independent attempts without summing duplicate findings', async () => {
    let auditContext = '';
    const prior = {
      role: 'connections' as const,
      drawingHash: snapshot().drawingHash,
      provider: 'openai' as const,
      model: 'prior-model',
      promptVersion: 'prior-prompt',
      outputHash: 'prior-output',
      durationMs: 1,
      reviewedSourceIds: ['variant:lines', 'variant:lines:region:0'],
      data: {
        lines: [
          { id: 'prior-1', lineKind: 'power' as const, path: [{ x: 0, y: 0 }, { x: 10, y: 10 }], start: { x: 0, y: 0 }, end: { x: 10, y: 10 }, junctions: [], crossovers: [], confidence: 0.9 },
          { id: 'prior-2', lineKind: 'power' as const, path: [{ x: 10, y: 10 }, { x: 20, y: 20 }], start: { x: 10, y: 10 }, end: { x: 20, y: 20 }, junctions: [], crossovers: [], confidence: 0.9 },
        ],
        warnings: [], confidence: 0.9,
      },
    };

    await runDrawingCouncil({
      snapshot: snapshot(), variants: variants(), regions: regions(), options,
      maxRegionCallsPerRole: 1, priorEnvelopes: [prior],
    }, async (buffer, _mime, role, _options, context) => {
      if (role === 'coverage-auditor') auditContext = context ?? '';
      return resultFor(role, buffer.byteLength);
    });

    expect(auditContext).toContain('attempts');
    expect(auditContext).toContain('prior-output');
    expect(auditContext).toContain('"lines":2');
    expect(auditContext).toContain('"lines":1');
  });

  it('triple-reads text with independent original, 4x, and high-contrast calls', async () => {
    const inputVariants = [
      ...variants(),
      { id: 'variant:upscale-4x', kind: 'upscale-4x' as const, buffer: new ArrayBuffer(6), width: 400, height: 320, transform: { scaleX: 4, scaleY: 4, offsetX: 0, offsetY: 0 } },
    ];
    const textCalls: number[] = [];

    const result = await runDrawingCouncil({ snapshot: snapshot(), variants: inputVariants, regions: [], options }, async (buffer, _mime, role) => {
      if (role === 'text') textCalls.push(buffer.byteLength);
      return resultFor(role, buffer.byteLength);
    });

    expect(textCalls).toEqual([1, 6, 3]);
    expect(result.envelopes.find((item) => item.role === 'text')?.data.texts?.map((item) => item.sourceId)).toEqual([
      'variant:original',
      'variant:upscale-4x',
      'variant:text',
    ]);
  });

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
    expect(invoke).toHaveBeenCalledTimes(6);
    expect(result.envelopes.map((item) => item.role)).toEqual(['symbols', 'connections', 'text', 'logic', 'coverage-auditor']);
    expect(result.envelopes.find((item) => item.role === 'logic')?.data.logic).toHaveLength(1);
  });

  it.each([
    [1, 'variant:original'],
    [2, 'variant:upscale-2x'],
    [4, 'variant:upscale-4x'],
  ] as const)('selects the scale %i symbol full source while retaining role-specific full sources', async (recommendedScale, symbolSourceId) => {
    const inputVariants = [...variants(),
      { id: 'variant:upscale-2x', kind: 'upscale-2x' as const, buffer: new ArrayBuffer(5), width: 200, height: 160, transform: { scaleX: 2, scaleY: 2, offsetX: 0, offsetY: 0 } },
      { id: 'variant:upscale-4x', kind: 'upscale-4x' as const, buffer: new ArrayBuffer(6), width: 400, height: 320, transform: { scaleX: 4, scaleY: 4, offsetX: 0, offsetY: 0 } },
    ];
    const result = await runDrawingCouncil({ snapshot: { ...snapshot(), quality: { ...snapshot().quality, recommendedScale } }, variants: inputVariants, regions: [], options }, async (buffer, _mime, role) => resultFor(role, buffer.byteLength));

    expect(result.envelopes.find((item) => item.role === 'symbols')?.data.symbols?.[0]?.sourceId).toBe(symbolSourceId);
    expect(result.envelopes.find((item) => item.role === 'connections')?.data.lines?.[0]?.sourceId).toBe('variant:lines');
    expect(result.envelopes.find((item) => item.role === 'text')?.data.texts?.map((item) => item.sourceId)).toEqual([
      'variant:original', 'variant:upscale-4x', 'variant:text',
    ]);
    expect(result.envelopes.find((item) => item.role === 'logic')?.data.logic?.[0]?.sourceId).toBe('variant:original');
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

  it('rejects a full variant transform that does not cover the complete snapshot before invoking', async () => {
    const transformedVariants = variants().map((variant) => variant.kind === 'text-high-contrast'
      ? { ...variant, width: 160, height: 80, transform: { scaleX: 2, scaleY: 2, offsetX: 0, offsetY: 0 } }
      : variant);
    const invoke = jest.fn(async (buffer: ArrayBuffer, _mime: string, role: VLMReviewRole) => resultFor(role, buffer.byteLength));

    await expect(runDrawingCouncil({ snapshot: snapshot(), variants: transformedVariants, regions: [], options }, invoke)).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects region bounds that disagree with their variant transform before invoking', async () => {
    const invoke = jest.fn(async (buffer: ArrayBuffer, _mime: string, role: VLMReviewRole) => resultFor(role, buffer.byteLength));
    const mismatched = { ...regions()[0], variantBounds: { x: 0, y: 0, w: 50, h: 80 } };

    await expect(runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: [mismatched], options }, invoke)).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
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

    expect(result.envelopes.map((item) => item.role)).toEqual(['symbols', 'logic', 'coverage-auditor']);
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
    const clock = jest.spyOn(Date, 'now').mockReturnValue(100);
    const first = await runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: [], options }, async (_buffer, _mime, role) => resultFor(role));
    const second = await runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: [], options }, async (_buffer, _mime, role) => {
      const value = resultFor(role);
      return { ...value, data: { ...value.data, confidence: value.data.confidence, warnings: value.data.warnings } };
    });
    clock.mockRestore();

    expect(first.envelopes.map((item) => item.outputHash)).toEqual(second.envelopes.map((item) => item.outputHash));
    expect(Object.isFrozen(first.envelopes[0])).toBe(true);
    expect(Object.isFrozen(first.envelopes[0].data)).toBe(true);
    expect(() => first.envelopes[0].data.warnings.push('mutate')).toThrow();
  });

  it('uses PNG MIME for prepared sources even when the uploaded snapshot was JPEG', async () => {
    const jpegSnapshot = { ...snapshot(), mimeType: 'image/jpeg' };
    const seenMime: string[] = [];
    await runDrawingCouncil({ snapshot: jpegSnapshot, variants: variants(), regions: [], options }, async (buffer, mime, role) => {
      seenMime.push(mime);
      return resultFor(role, buffer.byteLength);
    });

    expect(seenMime).toEqual(['image/png', 'image/png', 'image/png', 'image/png', 'image/png']);
  });

  it('propagates external pre-abort and does not invoke queued work', async () => {
    const controller = new AbortController();
    controller.abort();
    const invoke = jest.fn(async (buffer: ArrayBuffer, _mime: string, role: VLMReviewRole) => resultFor(role, buffer.byteLength));

    await expect(runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: regions(), options: { ...options, signal: controller.signal } }, invoke)).rejects.toThrow('aborted');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('propagates mid-flight abort and never starts queued source calls', async () => {
    const controller = new AbortController();
    const invoke = jest.fn((_buffer: ArrayBuffer, _mime: string, _role: VLMReviewRole, callOptions: VLMOptions) => new Promise<VLMRoleAnalysisResult>((_resolve, reject) => {
      callOptions.signal?.addEventListener('abort', () => reject(new Error('provider observed abort')), { once: true });
    }));
    const manyRegions = Array.from({ length: 16 }, (_, index) => ({
      ...regions()[0],
      id: `region:${index}`,
      buffer: new ArrayBuffer(index + 2),
    }));
    const pending = runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: manyRegions, options: { ...options, signal: controller.signal } }, invoke);
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();

    await expect(pending).rejects.toThrow('aborted');
    expect(invoke.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('limits 53 calls globally and schedules every primary role full source before regions', async () => {
    const manyRegions = Array.from({ length: 16 }, (_, index) => ({
      ...regions()[0],
      id: `region:${index}`,
      buffer: new ArrayBuffer(index + 2),
    }));
    const started: string[] = [];
    let active = 0;
    let maximum = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const invoke = jest.fn(async (buffer: ArrayBuffer, _mime: string, role: VLMReviewRole) => {
      active += 1;
      maximum = Math.max(maximum, active);
      started.push(`${role}:${buffer.byteLength}`);
      await gate;
      active -= 1;
      return resultFor(role, buffer.byteLength);
    });
    const pending = runDrawingCouncil({ snapshot: snapshot(), variants: [{ ...variants()[0] }], regions: manyRegions, options }, invoke);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(maximum).toBeLessThanOrEqual(4);
    expect(started).toEqual(['symbols:1', 'connections:1', 'text:1', 'logic:1']);
    release?.();
    await pending;
    expect(invoke).toHaveBeenCalledTimes(53);
  });

  it('rejects unsafe provider configuration, duplicate kinds, and input-count overflow before invoking', async () => {
    const invoke = jest.fn(async (buffer: ArrayBuffer, _mime: string, role: VLMReviewRole) => resultFor(role, buffer.byteLength));
    await expect(runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: [], options: { ...options, provider: 'invalid' as never } }, invoke)).rejects.toThrow();
    await expect(runDrawingCouncil({ snapshot: snapshot(), variants: variants(), regions: [], options: { ...options, apiKey: '   ' } }, invoke)).rejects.toThrow();
    await expect(runDrawingCouncil({ snapshot: snapshot(), variants: [...variants(), { ...variants()[1], id: 'variant:text:two' }], regions: [], options }, invoke)).rejects.toThrow();
    await expect(runDrawingCouncil({ snapshot: snapshot(), variants: [variants()[0]], regions: Array.from({ length: 49 }, (_, index) => ({ ...regions()[0], id: `r:${index}` })), options }, invoke)).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('contains aggregate budget overflow as an isolated fatal role failure', async () => {
    const manyRegions = Array.from({ length: 16 }, (_, index) => ({
      ...regions()[0],
      id: `region:${index}`,
      buffer: new ArrayBuffer(index + 2),
    }));
    const result = await runDrawingCouncil({ snapshot: snapshot(), variants: [variants()[0]], regions: manyRegions, options }, async (buffer, _mime, role) => ({
      ...resultFor(role, buffer.byteLength),
      model: `${role}-${buffer.byteLength}-${'m'.repeat(180)}`,
    }));

    expect(result.envelopes.map((item) => item.role)).toEqual(['logic', 'coverage-auditor']);
    expect(result.failures.filter((item) => item.fatal).map((item) => item.role)).toEqual(['symbols', 'connections', 'text']);
  });
});
