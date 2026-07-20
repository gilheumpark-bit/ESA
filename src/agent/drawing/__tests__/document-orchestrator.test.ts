import { runDocumentAnalysis } from '../document-orchestrator';
import { _resetJobsForTests, cancelOwnedJob, createJob, updateJob } from '../drawing-job-store';
import { evaluatePredictionAgainstLabel } from '../sld-evaluator-v2';
import { DRAWING_DOCUMENT_SCHEMA_VERSION } from '../types-v3';
import type { PreparedDrawingPage, PreparedDrawingSource } from '../drawing-source';
import sharp from 'sharp';

async function makePng(width = 100, height = 80): Promise<ArrayBuffer> {
  const png = await sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer();
  return Uint8Array.from(png).buffer;
}

describe('document-orchestrator + evaluator', () => {
  beforeEach(() => {
    _resetJobsForTests();
  });

  it('builds V3 document with separated counts and no source bytes', async () => {
    const { document, job } = await runDocumentAnalysis({
      bytes: await makePng(),
      mimeType: 'image/png',
      fileName: 'test.png',
      seedDetections: {
        symbols: [
          {
            localId: '1',
            type: 'vcb',
            label: 'VCB-1',
            bounds: { x: 100, y: 100, w: 40, h: 40 },
            confidence: 0.95,
            pageIndex: 0,
            regionId: 'r0',
            certainty: 'confirmed',
          },
          {
            localId: '2',
            type: 'transformer',
            label: 'TR-1',
            bounds: { x: 300, y: 100, w: 40, h: 40 },
            confidence: 0.9,
            pageIndex: 0,
            regionId: 'r0',
            certainty: 'confirmed',
          },
        ],
        lines: [{
          localId: 'l1',
          lineKind: 'power',
          path: [{ x: 140, y: 120 }, { x: 300, y: 120 }],
          confidence: 0.9,
          pageIndex: 0,
          regionId: 'r0',
          certainty: 'confirmed',
        }],
        texts: [{
          text: 'PT',
          candidates: ['PT', 'PPT'],
          bounds: { x: 200, y: 80, w: 30, h: 14 },
          pageIndex: 0,
          readings: [
            { variantId: 'original', text: 'PT', confidence: 0.9, callId: '1' },
            { variantId: 'upscale-4x', text: 'PPT', confidence: 0.8, callId: '2' },
            { variantId: 'text-high-contrast', text: 'PT', confidence: 0.9, callId: '3' },
          ],
          adjacentSymbolTypes: ['voltage_transformer'],
          legendTerms: ['PT'],
        }],
      },
    });

    expect(document.schemaVersion).toBe(DRAWING_DOCUMENT_SCHEMA_VERSION);
    expect(document.equipmentCounts.length).toBeGreaterThan(0);
    expect((document as unknown as { quantities?: unknown }).quantities).toBeUndefined();
    expect(JSON.stringify(document)).not.toMatch(/89PNG/);
    expect(job.documentHash).toBe(document.documentHash);
    expect(['COMPLETE', 'PARTIAL', 'HOLD']).toContain(document.verification.documentStatus);
    expect(document.verification.verified95).toBe(false);
  });

  it('evaluator rejects injected metrics and computes from prediction', async () => {
    const { document } = await runDocumentAnalysis({
      bytes: await makePng(),
      mimeType: 'image/png',
      seedDetections: {
        symbols: [{
          localId: '1',
          type: 'vcb',
          label: 'VCB-1',
          bounds: { x: 10, y: 10, w: 20, h: 20 },
          confidence: 1,
          pageIndex: 0,
          regionId: 'r',
          certainty: 'confirmed',
        }],
      },
    });

    expect(() => evaluatePredictionAgainstLabel(
      { ...document, injectedMetrics: { symbolMacroF1: 0.99 } } as never,
      {
        labelId: 'g1',
        symbols: [{ type: 'vcb', label: 'VCB-1', bounds: { x: 10, y: 10, w: 20, h: 20 }, pageIndex: 0 }],
        edges: [],
        texts: [],
      },
    )).toThrow(/INJECTED/);

    const evalResult = evaluatePredictionAgainstLabel(document, {
      labelId: 'g1',
      symbols: [{ type: 'vcb', label: 'VCB-1', bounds: { x: 10, y: 10, w: 20, h: 20 }, pageIndex: 0 }],
      edges: [],
      texts: [],
    });
    expect(typeof evalResult.metrics.symbolMacroF1).toBe('number');
    expect(evalResult.receipt).toMatchObject({ signatureAlgorithm: 'none', signature: '' });
  });

  it('marks budget exceeded as PARTIAL not silent success', async () => {
    const { document } = await runDocumentAnalysis({
      bytes: await makePng(10, 10),
      mimeType: 'image/png',
      budget: { maxVlmCalls: 0, maxPages: 1, deadlineMs: 1, maxPixels: 100 },
      seedDetections: { symbols: [] },
    });
    // without seeds and no vision, page fails → PARTIAL
    expect(document.jobStatus === 'PARTIAL' || document.verification.documentStatus === 'PARTIAL').toBe(true);
  });

  it('resumes the same owned job and calls only pages that did not complete', async () => {
    const quality = {
      width: 100, height: 80, channels: 4, contrast: 1, edgeDensity: 1,
      gradientVariance: 1, lowContrast: false, blurry: false,
      recommendedScale: 1 as const, warnings: ['VECTOR_SOURCE'],
    };
    const pages: PreparedDrawingPage[] = [0, 1].map((pageIndex) => ({
      pageIndex, width: 100, height: 80, sourceWidth: 100, sourceHeight: 80,
      renderScale: 1, renderMode: 'vector', textSample: `PAGE ${pageIndex + 1}`,
      vectorOpCount: 1, rasterOpCount: 0, renderHash: `render-${pageIndex}`, quality,
    }));
    const source: PreparedDrawingSource = {
      documentHash: 'd'.repeat(64), mimeType: 'application/pdf', formatClass: 'vector-pdf', pages,
    };
    const executeTeam = jest.fn(async (teamInput: { params?: Record<string, unknown> }) => {
      const pageNumber = Number(teamInput.params?.pageNumber ?? 1);
      return {
        success: true,
        components: [{ id: `VCB-${pageNumber}`, type: 'vcb', label: `VCB-${pageNumber}`, position: { x: 10, y: 10 }, confidence: 0.95 }],
        connections: [],
        confidence: 0.95,
        vectorAudit: { parser: 'pdf', pageNumber, complete: true, roles: ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'] },
      };
    });
    const deps = { prepareSource: async () => source, executeTeam: executeTeam as never };

    const first = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'application/pdf', ownerId: 'owner-a',
      budget: { maxPages: 1, maxVlmCalls: 10, maxPixels: 100_000, deadlineMs: 60_000 },
    }, deps);
    expect(first.document.jobStatus).toBe('PARTIAL');
    expect(executeTeam).toHaveBeenCalledTimes(1);

    const resumed = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'application/pdf', ownerId: 'owner-a', jobId: first.job.jobId,
      budget: { maxPages: 2, maxVlmCalls: 10, maxPixels: 100_000, deadlineMs: 60_000 },
    }, deps);

    expect(resumed.job.jobId).toBe(first.job.jobId);
    expect(resumed.document.jobStatus).toBe('COMPLETE');
    expect(resumed.document.pages.map((page) => page.status)).toEqual(['complete', 'complete']);
    expect(resumed.document.evidenceGraph.symbols.map((symbol) => symbol.rawLabel)).toEqual(['VCB-1', 'VCB-2']);
    expect(executeTeam).toHaveBeenCalledTimes(2);

    updateJob(first.job.jobId, {
      pageDigests: {
        ...resumed.job.pageDigests,
        0: { ...resumed.job.pageDigests[0], pageRenderHash: 'stale-render' },
      },
    });
    await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'application/pdf', ownerId: 'owner-a', jobId: first.job.jobId,
      budget: { maxPages: 2, maxVlmCalls: 10, maxPixels: 100_000, deadlineMs: 60_000 },
    }, deps);
    expect(executeTeam).toHaveBeenCalledTimes(3);
  });

  it('retries failed precision coverage up to the gap-rescan limit', async () => {
    const quality = {
      width: 100, height: 80, channels: 3, contrast: 1, edgeDensity: 0.2,
      gradientVariance: 1, lowContrast: false, blurry: false,
      recommendedScale: 1 as const, warnings: [],
    };
    const source: PreparedDrawingSource = {
      documentHash: 'e'.repeat(64), mimeType: 'image/png', formatClass: 'raster-image',
      pages: [{
        pageIndex: 0, width: 100, height: 80, sourceWidth: 100, sourceHeight: 80,
        renderScale: 1, renderMode: 'raster', textSample: '', vectorOpCount: 0,
        rasterOpCount: 1, renderHash: 'render-0', quality, imageBuffer: await makePng(),
      }],
    };
    const review = (complete: boolean) => ({
      snapshot: { drawingHash: source.documentHash, mimeType: 'image/png', page: 1, width: 100, height: 80, quality },
      envelopes: ['symbols', 'connections', 'text', 'logic'].map((role) => ({
        role, outputHash: `${role}-hash`, drawingHash: source.documentHash, provider: 'openai', model: 'test', promptVersion: 'test', durationMs: 1,
        data: { warnings: [], confidence: 0.95 },
      })),
      failures: complete ? [] : [{ role: 'connections', sourceId: 'variant:line-enhanced:region:0', error: 'retry', fatal: false }],
      coverage: {
        roles: {
          symbols: { variantId: 'variant:original', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 5 },
          connections: { variantId: 'variant:line-enhanced', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 5 },
          text: { variantId: 'variant:text-high-contrast', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 7 },
          logic: { variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
        },
        plannedCalls: 18, complete, maxRegionCallsPerRole: 16,
      },
      graph: {
        drawingHash: source.documentHash,
        symbols: [{ id: 'VCB-01', sourceIds: ['variant:original'], typeCandidates: ['VCB'], rawLabel: 'VCB-1', bounds: { x: 10, y: 10, w: 10, h: 10, page: 1 }, ports: [], confidence: 0.95 }],
        lines: [], texts: [], edges: [], conflicts: [],
      },
    });
    let attempt = 0;
    const executeTeam = jest.fn(async () => ({
      success: true, components: [], connections: [], confidence: 0.95,
      drawingReview: review(++attempt > 1),
      drawingSynthesis: {
        calculations: [{
          id: 'calc-1', calculatorId: 'breaker-sizing', scopeKey: 'VCB-01@p1', status: 'CALCULATED', judgment: 'HOLD',
          missingInputs: [], ambiguousInputs: [], inputEvidence: [{ evidenceId: 'spec-1', originalEvidenceIds: ['txt-1'], sourceIds: ['variant:text'], adapterField: 'loadCurrent', normalizedField: 'current_A', value: 80, sourceUnit: 'A', targetUnit: 'A', bounds: { page: 1, x: 1, y: 1, w: 2, h: 2 }, confidence: 0.9, transform: 'identity' }],
          optionalDefaultsUsed: [], internalMechanics: [], scopeIssues: [], calculatorResult: { value: 100, unit: 'A' },
        }],
      },
    }));

    const result = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-a',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 54, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeTeam as never });

    expect(executeTeam).toHaveBeenCalledTimes(2);
    expect(result.document.coverageLedger.regionsFailed).toBe(0);
    expect(result.document.coverageLedger.unresolvedRescans).toBe(0);
    expect(result.document.jobStatus).toBe('COMPLETE');
    expect(result.document.calculations).toEqual([expect.objectContaining({
      id: 'P01-calc-1', calculatorId: 'breaker-sizing', value: 100, compliant: null,
    })]);
  });

  it('returns concrete re-upload guidance when low-resolution OCR remains ambiguous', async () => {
    const quality = {
      width: 100, height: 80, channels: 3, contrast: 0.05, edgeDensity: 0.01,
      gradientVariance: 0.01, lowContrast: true, blurry: true,
      recommendedScale: 4 as const, warnings: ['LOW_CONTRAST', 'BLURRY'],
    };
    const source: PreparedDrawingSource = {
      documentHash: 'f'.repeat(64), mimeType: 'image/png', formatClass: 'raster-image',
      pages: [{ pageIndex: 0, width: 100, height: 80, sourceWidth: 100, sourceHeight: 80, renderScale: 1, renderMode: 'raster', textSample: '', vectorOpCount: 0, rasterOpCount: 1, renderHash: 'low-render', quality, imageBuffer: await makePng() }],
    };
    const result = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-low',
      seedDetections: { texts: [{ text: '1OOA', pageIndex: 0, bounds: { x: 10, y: 10, w: 20, h: 8 }, readings: [
        { variantId: 'original', text: '1OOA', confidence: 0.5, callId: 'a' },
        { variantId: 'upscale-4x', text: '100A', confidence: 0.5, callId: 'b' },
        { variantId: 'text-high-contrast', text: 'IOOA', confidence: 0.5, callId: 'c' },
      ] }] },
    }, { prepareSource: async () => source });
    expect(result.document.unresolvedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'LOW_RESOLUTION_HOLD', recommendedUpload: expect.objectContaining({ minLongEdgePx: 2400, minCharHeightPx: 12 }) }),
    ]));
  });

  it('does not claim vector coverage complete without a role audit receipt', async () => {
    const quality = {
      width: 100, height: 80, channels: 4, contrast: 1, edgeDensity: 1,
      gradientVariance: 1, lowContrast: false, blurry: false,
      recommendedScale: 1 as const, warnings: ['VECTOR_SOURCE'],
    };
    const source: PreparedDrawingSource = {
      documentHash: 'a'.repeat(64), mimeType: 'application/dxf', formatClass: 'dxf',
      pages: [{ pageIndex: 0, width: 100, height: 80, sourceWidth: 100, sourceHeight: 80, renderScale: 1, renderMode: 'vector', textSample: 'VCB', vectorOpCount: 1, rasterOpCount: 0, renderHash: 'vector-no-audit', quality }],
    };
    const result = await runDocumentAnalysis(
      { bytes: await makePng(), mimeType: 'application/dxf', ownerId: 'owner-vector' },
      { prepareSource: async () => source, executeTeam: async () => ({ success: true, components: [{ id: 'v1', type: 'vcb', label: 'VCB-1', position: { x: 10, y: 10 }, confidence: 0.95 }], connections: [], confidence: 0.95 }) as never },
    );
    expect(result.document.jobStatus).toBe('PARTIAL');
    expect(result.document.coverageLedger.regionsFailed).toBeGreaterThan(0);
    expect(result.document.unresolvedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ROLE_CALL_FAILED' }),
    ]));
  });

  it('credits individually completed vector roles while keeping incomplete audit coverage PARTIAL', async () => {
    const quality = {
      width: 100, height: 80, channels: 4, contrast: 1, edgeDensity: 1,
      gradientVariance: 1, lowContrast: false, blurry: false,
      recommendedScale: 1 as const, warnings: ['VECTOR_SOURCE'],
    };
    const source: PreparedDrawingSource = {
      documentHash: '7'.repeat(64), mimeType: 'application/dxf', formatClass: 'dxf',
      pages: [{ pageIndex: 0, width: 100, height: 80, sourceWidth: 100, sourceHeight: 80, renderScale: 1, renderMode: 'vector', textSample: 'VCB', vectorOpCount: 1, rasterOpCount: 0, renderHash: 'vector-partial-audit', quality }],
    };
    const result = await runDocumentAnalysis(
      { bytes: await makePng(), mimeType: 'application/dxf', ownerId: 'owner-vector-partial' },
      { prepareSource: async () => source, executeTeam: async () => ({
        success: true,
        components: [{ id: 'v1', type: 'vcb', label: 'VCB-1', position: { x: 10, y: 10 }, confidence: 0.95 }],
        connections: [], confidence: 0.95,
        vectorAudit: { parser: 'dxf', pageNumber: 1, complete: false, roles: ['symbols'] },
      }) as never },
    );

    const full = result.document.coverageLedger.regions[0];
    expect(full.roleCalls.symbols).toEqual([expect.objectContaining({ success: true })]);
    expect(full.roleCalls.connections).toEqual([expect.objectContaining({ success: false })]);
    expect(result.document.jobStatus).toBe('PARTIAL');
  });

  it('enforces maxVlmCalls cumulatively across resume runs', async () => {
    const quality = {
      width: 100, height: 80, channels: 3, contrast: 1, edgeDensity: 0.2,
      gradientVariance: 1, lowContrast: false, blurry: false,
      recommendedScale: 1 as const, warnings: [],
    };
    const source: PreparedDrawingSource = {
      documentHash: '8'.repeat(64), mimeType: 'image/png', formatClass: 'raster-image',
      pages: [{ pageIndex: 0, width: 100, height: 80, sourceWidth: 100, sourceHeight: 80, renderScale: 1, renderMode: 'raster', textSample: 'VCB', vectorOpCount: 0, rasterOpCount: 1, renderHash: 'resume-budget', quality, imageBuffer: await makePng() }],
    };
    const budget = { maxPages: 1, maxVlmCalls: 18, maxPixels: 100_000, deadlineMs: 60_000 };
    const queued = createJob({ documentHash: source.documentHash, ownerId: 'owner-budget-resume', budget, estimatedPages: 1 });
    updateJob(queued.jobId, { vlmCallsUsed: 17 });
    const executeTeam = jest.fn();

    const result = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-budget-resume', jobId: queued.jobId,
      budget, vision: { provider: 'openai', apiKey: 'test-request-key' },
    }, { prepareSource: async () => source, executeTeam: executeTeam as never });

    expect(executeTeam).not.toHaveBeenCalled();
    expect(result.job.vlmCallsUsed).toBe(17);
    expect(result.document.unresolvedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PARTIAL_BUDGET_EXCEEDED' }),
    ]));
  });

  it('keeps cancellation authoritative when it arrives during analysis', async () => {
    const quality = {
      width: 100, height: 80, channels: 4, contrast: 1, edgeDensity: 1,
      gradientVariance: 1, lowContrast: false, blurry: false,
      recommendedScale: 1 as const, warnings: ['VECTOR_SOURCE'],
    };
    const source: PreparedDrawingSource = {
      documentHash: 'c'.repeat(64), mimeType: 'application/dxf', formatClass: 'dxf',
      pages: [{ pageIndex: 0, width: 100, height: 80, sourceWidth: 100, sourceHeight: 80, renderScale: 1, renderMode: 'vector', textSample: 'VCB', vectorOpCount: 1, rasterOpCount: 0, renderHash: 'cancel-vector', quality }],
    };
    const budget = { maxPages: 1, maxVlmCalls: 10, maxPixels: 100_000, deadlineMs: 60_000 };
    const queued = createJob({ documentHash: source.documentHash, ownerId: 'owner-cancel', budget, estimatedPages: 1 });
    const result = await runDocumentAnalysis(
      { bytes: await makePng(), mimeType: 'application/dxf', ownerId: 'owner-cancel', jobId: queued.jobId, budget },
      { prepareSource: async () => source, executeTeam: async () => {
        cancelOwnedJob(queued.jobId, 'owner-cancel');
        return { success: true, components: [{ id: 'v1', type: 'vcb', label: 'VCB-1', position: { x: 10, y: 10 }, confidence: 0.95 }], connections: [], confidence: 0.95, vectorAudit: { parser: 'dxf', pageNumber: 1, complete: true, roles: ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'] } } as never;
      } },
    );
    expect(result.job.status).toBe('CANCELLED');
    expect(result.document.jobStatus).toBe('CANCELLED');
    expect(result.document.verification.claimsComplete).toBe(false);
    expect(result.document.title).toContain('취소');
  });

  it('runs Vision precision review for a rendered vector PDF when a BYOK key is present', async () => {
    const quality = {
      width: 100, height: 80, channels: 4, contrast: 1, edgeDensity: 1,
      gradientVariance: 1, lowContrast: false, blurry: false,
      recommendedScale: 1 as const, warnings: ['VECTOR_SOURCE'],
    };
    const source: PreparedDrawingSource = {
      documentHash: 'b'.repeat(64), mimeType: 'application/pdf', formatClass: 'vector-pdf',
      pages: [{
        pageIndex: 0, width: 100, height: 80, sourceWidth: 100, sourceHeight: 80,
        renderScale: 1, renderMode: 'vector', textSample: 'VCB-1', vectorOpCount: 1,
        rasterOpCount: 0, renderHash: 'vector-rendered', quality, imageBuffer: await makePng(),
      }],
    };
    const review = {
      snapshot: { drawingHash: source.documentHash, mimeType: 'image/png', page: 1, width: 100, height: 80, quality },
      envelopes: ['symbols', 'connections', 'text', 'logic'].map((role) => ({
        role, outputHash: `${role}-hash`, drawingHash: source.documentHash,
        provider: 'openai', model: 'test', promptVersion: 'test', durationMs: 1,
        data: { warnings: [], confidence: 0.95 },
      })),
      failures: [],
      coverage: {
        roles: {
          symbols: { variantId: 'variant:original', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 5 },
          connections: { variantId: 'variant:line-enhanced', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 5 },
          text: { variantId: 'variant:text-high-contrast', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 7 },
          logic: { variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
        },
        plannedCalls: 18, complete: true, maxRegionCallsPerRole: 16,
      },
      graph: {
        drawingHash: source.documentHash,
        symbols: [{
          id: 'VCB-01', sourceIds: ['variant:original'], typeCandidates: ['VCB'], rawLabel: 'VCB-1',
          bounds: { x: 10, y: 10, w: 10, h: 10, page: 1 }, ports: [], confidence: 0.95,
        }],
        lines: [], texts: [], edges: [], conflicts: [],
      },
    };
    const executeTeam = jest.fn(async (teamInput: { classification: string }) => (
      teamInput.classification === 'sld_pdf'
        ? {
            success: true,
            components: [{ id: 'VCB-01', type: 'vcb', label: 'VCB-1', position: { x: 10, y: 10 }, confidence: 0.95 }],
            connections: [], confidence: 0.95,
            vectorAudit: { parser: 'pdf', pageNumber: 1, complete: true, roles: ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'] },
          }
        : {
            success: true, components: [], connections: [], confidence: 0.95,
            drawingReview: review,
            drawingSynthesis: { calculations: [] },
          }
    ));

    const result = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'application/pdf', ownerId: 'owner-vector-vision',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 18, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeTeam as never });

    expect(executeTeam.mock.calls.map(([teamInput]) => teamInput.classification)).toEqual(['sld_pdf', 'sld_image']);
    expect(result.document.jobStatus).toBe('COMPLETE');
  });

  it('reports a source-preparation budget stop as failed instead of an empty page', async () => {
    const quality = {
      width: 1, height: 1, channels: 4, contrast: 0, edgeDensity: 0,
      gradientVariance: 0, lowContrast: true, blurry: true,
      recommendedScale: 4 as const, warnings: ['PARTIAL_BUDGET_EXCEEDED'],
    };
    const source: PreparedDrawingSource = {
      documentHash: '9'.repeat(64), mimeType: 'application/pdf', formatClass: 'vector-pdf', totalPageCount: 1,
      pages: [{
        pageIndex: 0, width: 1, height: 1, sourceWidth: 1, sourceHeight: 1,
        renderScale: 1, renderMode: 'raster', textSample: '', vectorOpCount: 0,
        rasterOpCount: 0, renderHash: 'budget-skipped', quality,
        preparationError: 'PARTIAL_BUDGET_EXCEEDED',
      }],
    };
    const executeTeam = jest.fn();

    const result = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'application/pdf', ownerId: 'owner-budget-preparation',
      budget: { maxPages: 1, maxVlmCalls: 18, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeTeam as never });

    expect(result.document.pages[0]).toMatchObject({
      status: 'failed',
      error: 'PARTIAL_BUDGET_EXCEEDED',
    });
    expect(result.document.pages[0].drawingKind).not.toBe('empty');
    expect(result.document.jobStatus).toBe('PARTIAL');
    expect(executeTeam).not.toHaveBeenCalled();
  });
});
