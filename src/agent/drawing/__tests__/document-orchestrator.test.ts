import { runDocumentAnalysis } from '../document-orchestrator';
import { _resetJobsForTests, cancelOwnedJob, createJob, updateJob } from '../drawing-job-store';
import { evaluatePredictionAgainstLabel } from '../sld-evaluator-v2';
import { DRAWING_DOCUMENT_SCHEMA_VERSION } from '../types-v3';
import type { PreparedDrawingPage, PreparedDrawingSource } from '../drawing-source';
import type { TeamInput } from '../../teams/types';
import sharp from 'sharp';

async function makePng(width = 100, height = 80): Promise<ArrayBuffer> {
  const png = await sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer();
  return Uint8Array.from(png).buffer;
}

async function makeNetworkPng(): Promise<ArrayBuffer> {
  const png = await sharp(Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
      <rect width="400" height="300" fill="white"/>
      <path d="M40 150 H360 M200 30 V270" stroke="black" stroke-width="3"/>
    </svg>`)).png().toBuffer();
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
      width: 100, height: 80, channels: 4, contrast: 1, edgeDensity: 0.01,
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
    const deps = {
      prepareSource: async (request: { requestedPages?: 'all' | number[] }) => {
        const selected = Array.isArray(request.requestedPages) ? new Set<number>(request.requestedPages) : null;
        return {
          ...source,
          totalPageCount: 2,
          pages: selected ? pages.filter((page) => selected.has(page.pageIndex)) : pages,
        };
      },
      executeTeam: executeTeam as never,
    };

    const first = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'application/pdf', ownerId: 'owner-a',
      budget: { maxPages: 2, maxVlmCalls: 10, maxPixels: 100_000, deadlineMs: 60_000 },
      maxPagesPerRun: 1,
      preparationPages: [0],
    }, deps);
    expect(first.document.jobStatus).toBe('PARTIAL');
    expect(executeTeam).toHaveBeenCalledTimes(1);

    const resumed = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'application/pdf', ownerId: 'owner-a', jobId: first.job.jobId,
      budget: { maxPages: 2, maxVlmCalls: 10, maxPixels: 100_000, deadlineMs: 60_000 },
      maxPagesPerRun: 1,
      preparationPages: [1],
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
      preparationPages: [0],
    }, deps);
    expect(executeTeam).toHaveBeenCalledTimes(3);
  });

  it('compacts more than 48 audit targets into the precision regions they can actually call', async () => {
    const quality = {
      width: 100, height: 80, channels: 3, contrast: 1, edgeDensity: 0.02,
      gradientVariance: 1, lowContrast: false, blurry: false,
      recommendedScale: 1 as const, warnings: [],
    };
    const source: PreparedDrawingSource = {
      documentHash: 'c'.repeat(64), mimeType: 'image/png', formatClass: 'raster-image',
      pages: [{
        pageIndex: 0, width: 100, height: 80, sourceWidth: 100, sourceHeight: 80,
        renderScale: 1, renderMode: 'raster', textSample: '', vectorOpCount: 0,
        rasterOpCount: 1, renderHash: 'render-target-compaction', quality, imageBuffer: await makePng(),
      }],
    };
    const auditTargets = Array.from({ length: 60 }, (_, index) => ({
      id: `audit-${index + 1}`,
      sourceId: `line-${index + 1}`,
      reason: 'low-coverage' as const,
      bounds: { x: (index % 10) * 9, y: (index % 8) * 9, w: 8, h: 8, page: 1 },
      suggestedRoles: [(['symbols', 'connections', 'text'] as const)[index % 3]],
      confidence: 0.9,
    }));
    const review = (targets: typeof auditTargets) => ({
      snapshot: { drawingHash: source.documentHash, mimeType: 'image/png', page: 1, width: 100, height: 80, quality },
      envelopes: ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'].map((role) => ({
        role, outputHash: `${role}-hash`, drawingHash: source.documentHash, provider: 'openai', model: 'test', promptVersion: 'test', durationMs: 1,
        data: role === 'coverage-auditor'
          ? { rescanTargets: targets, warnings: [], confidence: 0.95 }
          : { warnings: [], confidence: 0.95 },
      })),
      failures: [],
      coverage: {
        roles: {
          symbols: { variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1, regionIds: [] },
          connections: { variantId: 'variant:line-enhanced', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1, regionIds: [] },
          text: { variantId: 'variant:text-high-contrast', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 3, regionIds: [] },
          logic: { variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
          'coverage-auditor': { variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
        },
        plannedCalls: 7, actualCalls: 7, complete: true, maxRegionCallsPerRole: 16,
      },
      graph: { drawingHash: source.documentHash, symbols: [], lines: [], texts: [], edges: [], conflicts: [] as string[] },
    });
    let attempt = 0;
    const executeTeam = jest.fn(async () => {
      attempt += 1;
      return {
        success: true, components: [], connections: [], confidence: 0.95,
        drawingReview: review(attempt === 1 ? auditTargets : []),
        drawingSynthesis: { calculations: [] },
      };
    });

    await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-target-compaction',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 60, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeTeam as never });

    const retry = (executeTeam.mock.calls as unknown as Array<[TeamInput]>)[1]?.[0];
    const targets = retry?.params?.rescanTargets as Array<{ suggestedRoles: string[] }>;
    expect(executeTeam).toHaveBeenCalledTimes(2);
    expect(targets.length).toBeLessThanOrEqual(4);
    expect(new Set(targets.flatMap((target) => target.suggestedRoles)))
      .toEqual(new Set(['symbols', 'connections', 'text']));
  });

  it('첫 페이지가 아닌 페이지의 재스캔 대상도 팀 스냅샷 페이지(1)로 낸다', async () => {
    // 실측(2026-08-05, KIMM 83p 설계세트 p5 를 PDF 로 직접 투입): 구획 17개 중
    // 3개가 `rescanTargets[1] 값이 현재 도면 범위를 벗어났습니다` 로 실패했다.
    // 원인은 좌표가 아니라 **페이지 번호**였다 — 팀에 넘기는 스냅샷은
    // `createDrawingSnapshot` 이 페이지 인자 없이 불려 항상 page=1 인데,
    // 오케스트레이터가 문서 페이지 번호(pageIndex+1)를 넣고 있었다.
    // 즉 1페이지가 아닌 모든 페이지에서 재스캔 복구가 통째로 죽어 있었다.
    // 이번 세션의 다른 측정은 전부 단일 페이지(pageIndex 0 → 1)라 우연히 맞았다.
    const quality = {
      width: 100, height: 80, channels: 3, contrast: 1, edgeDensity: 0.02,
      gradientVariance: 1, lowContrast: false, blurry: false,
      recommendedScale: 1 as const, warnings: [],
    };
    const source: PreparedDrawingSource = {
      documentHash: 'f'.repeat(64), mimeType: 'application/pdf', formatClass: 'vector-pdf',
      pages: [{
        // 문서 5페이지. page.pageIndex + 1 === 5 이므로 종전 코드면 거부된다.
        pageIndex: 4, width: 100, height: 80, sourceWidth: 100, sourceHeight: 80,
        renderScale: 1, renderMode: 'raster', textSample: '', vectorOpCount: 0,
        rasterOpCount: 1, renderHash: 'render-p4', quality, imageBuffer: await makePng(),
      }],
    };
    const failing = {
      snapshot: { drawingHash: source.documentHash, mimeType: 'image/png', page: 1, width: 100, height: 80, quality },
      envelopes: ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'].map((role) => ({
        role, outputHash: `${role}-hash`, drawingHash: source.documentHash, provider: 'openai', model: 'test', promptVersion: 'test', durationMs: 1,
        data: role === 'coverage-auditor'
          ? { rescanTargets: [], warnings: [], confidence: 0.95 }
          : { warnings: [], confidence: 0.95 },
      })),
      failures: [{ role: 'connections' as const, sourceId: 'variant:line-enhanced:region:1', error: 'region read failed', fatal: false }],
      coverage: {
        roles: {
          symbols: { variantId: 'variant:original', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 5 },
          connections: { variantId: 'variant:line-enhanced', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 5 },
          text: { variantId: 'variant:text-high-contrast', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 7 },
          logic: { variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
          'coverage-auditor': { variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
        },
        plannedCalls: 19, complete: true, maxRegionCallsPerRole: 16,
      },
      graph: {
        drawingHash: source.documentHash,
        symbols: [], lines: [], texts: [], edges: [], conflicts: [] as string[],
      },
    };
    let attempt = 0;
    const executeTeam = jest.fn(async () => {
      attempt += 1;
      return {
        success: true, components: [], connections: [], confidence: 0.95,
        drawingReview: failing, drawingSynthesis: { calculations: [] },
      };
    });

    await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'application/pdf', ownerId: 'owner-page5-target',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 60, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeTeam as never });

    const retry = (executeTeam.mock.calls as unknown as Array<[TeamInput]>)[1]?.[0];
    const targets = (retry?.params?.rescanTargets ?? []) as Array<{ bounds: { page: number } }>;
    expect(targets.length).toBeGreaterThan(0);
    // 회귀 지점: 종전에는 5 였고 sld-team 검증이 전부 걸러냈다.
    expect(targets.every((target) => target.bounds.page === 1)).toBe(true);
    void attempt;
  });

  it('retries failed precision coverage up to the gap-rescan limit', async () => {
    const quality = {
      width: 100, height: 80, channels: 3, contrast: 1, edgeDensity: 0.02,
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
    const review = (complete: boolean, plannedCalls = 19) => ({
      snapshot: { drawingHash: source.documentHash, mimeType: 'image/png', page: 1, width: 100, height: 80, quality },
      envelopes: ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'].map((role) => ({
        role, outputHash: `${role}-hash`, drawingHash: source.documentHash, provider: 'openai', model: 'test', promptVersion: 'test', durationMs: 1,
        data: role === 'coverage-auditor'
          ? { rescanTargets: complete ? [] : [{ id: 'boundary-1', sourceId: 'variant:original', reason: 'boundary-clip', bounds: { x: 40, y: 0, w: 20, h: 80, page: 1 }, suggestedRoles: ['symbols', 'connections'], confidence: 0.95 }], warnings: [], confidence: 0.95 }
          : { warnings: [], confidence: 0.95 },
      })),
      failures: [],
      coverage: {
        roles: {
          symbols: { variantId: 'variant:original', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 5 },
          connections: { variantId: 'variant:line-enhanced', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 5 },
          text: { variantId: 'variant:text-high-contrast', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 7 },
          logic: { variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
          'coverage-auditor': { variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
        },
        plannedCalls, complete: true, maxRegionCallsPerRole: 16,
      },
      graph: {
        drawingHash: source.documentHash,
        symbols: [{ id: 'VCB-01', sourceIds: ['variant:original'], typeCandidates: ['VCB'], rawLabel: 'VCB-1', bounds: { x: 10, y: 10, w: 10, h: 10, page: 1 }, ports: [], confidence: 0.95 }],
        lines: [], texts: [], edges: [], conflicts: [] as string[],
      },
    });
    let attempt = 0;
    const executeTeam = jest.fn(async () => {
      attempt += 1;
      return {
        success: true, components: [], connections: [], confidence: 0.95,
        drawingReview: review(attempt > 1),
        drawingSynthesis: {
          calculations: [{
          id: 'calc-1', calculatorId: 'breaker-sizing', scopeKey: 'VCB-01@p1', status: 'CALCULATED', judgment: 'HOLD',
          missingInputs: [], ambiguousInputs: [], inputEvidence: [{ evidenceId: 'spec-1', originalEvidenceIds: ['txt-1'], sourceIds: ['variant:text'], adapterField: 'loadCurrent', normalizedField: 'current_A', value: 80, sourceUnit: 'A', targetUnit: 'A', bounds: { page: 1, x: 1, y: 1, w: 2, h: 2 }, confidence: 0.9, transform: 'identity' }],
          optionalDefaultsUsed: [], internalMechanics: [], scopeIssues: [], calculatorResult: { value: 100, unit: 'A' },
          }],
          conflicts: attempt === 1 ? [{
            id: 'transient-conflict', kind: 'CONTRADICTION', topic: 'PROTECTION_CHAIN', severity: 'major', status: 'open', action: 'TARGETED_REVIEW', reasonCode: 'transient', message: '재스캔 전 충돌',
            graphEvidenceIds: ['VCB-01'], graphOriginalEvidenceIds: ['original:VCB-01'], graphSourceIds: ['variant:original'], graphEvidencePages: [1], graphEvidenceBounds: [{ x: 10, y: 10, w: 10, h: 10, page: 1 }], logicEvidenceIds: ['logic-transient'], logicEvidenceBounds: [{ x: 8, y: 8, w: 20, h: 20, page: 1 }], graphConflictIds: [],
          }] : [],
        },
      };
    });

    const result = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-a',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 57, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeTeam as never });

    expect(executeTeam).toHaveBeenCalledTimes(2);
    const secondAttemptInput = (executeTeam.mock.calls as unknown as Array<[TeamInput]>)[1]?.[0];
    expect(secondAttemptInput).toMatchObject({
      params: { rescanTargets: expect.arrayContaining([
        expect.objectContaining({ id: 'precision-region-0-0', reason: 'boundary-clip' }),
      ]) },
      priorDrawingReviewEnvelopes: expect.arrayContaining([
        expect.objectContaining({ role: 'connections', outputHash: 'connections-hash' }),
      ]),
    });
    expect((secondAttemptInput?.params?.rescanTargets as unknown[])).toHaveLength(4);
    expect(result.document.coverageLedger.regionsFailed).toBe(0);
    expect(result.document.coverageLedger.unresolvedRescans).toBe(0);
    expect(result.document.jobStatus).toBe('COMPLETE');
    expect(result.document.calculations).toEqual([expect.objectContaining({
      id: 'P01-calc-1', calculatorId: 'breaker-sizing', value: 100, compliant: null,
    })]);
    expect(result.document.unresolvedItems).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ELECTRICAL_LOGIC_CONFLICT' }),
    ]));

    let holdAttempt = 0;
    const executeTeamHold = jest.fn(async () => {
      holdAttempt += 1;
      return {
        success: true, components: [], connections: [], confidence: 0.95,
        drawingReview: review(false, holdAttempt === 1 ? 19 : 15),
        drawingSynthesis: { calculations: [] },
      };
    });
    const held = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-boundary-hold',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 49, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeTeamHold as never });

    expect(executeTeamHold).toHaveBeenCalledTimes(3);
    expect(held.document.jobStatus).toBe('PARTIAL');
    expect(held.document.unresolvedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'BOUNDARY_CLIP', pageIndex: 0, bounds: { x: 40, y: 0, w: 20, h: 80 } }),
    ]));

    let firstPassFinished = false;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => (firstPassFinished ? 59_000 : 0));
    const executeNearDeadline = jest.fn(async () => {
      firstPassFinished = true;
      return {
        success: true, components: [], connections: [], confidence: 0.95,
        drawingReview: review(false),
        drawingSynthesis: { calculations: [] },
      };
    });
    await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-near-deadline',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 57, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeNearDeadline as never });
    nowSpy.mockRestore();

    expect(executeNearDeadline).toHaveBeenCalledTimes(1);

    const executeTeamLogic = jest.fn(async () => ({
      success: true, components: [], connections: [], confidence: 0.95,
      drawingReview: review(true),
      drawingSynthesis: {
        calculations: [],
        conflicts: [{
          id: 'logic-conflict-1', kind: 'CONTRADICTION', topic: 'PROTECTION_CHAIN', severity: 'critical',
          status: 'open', action: 'TARGETED_REVIEW', reasonCode: 'protected-device-mismatch',
          message: '독립 논리 판독과 조립 그래프의 보호 관계가 일치하지 않습니다.',
          graphEvidenceIds: ['VCB-01'], graphOriginalEvidenceIds: ['original:VCB-01'],
          graphSourceIds: ['variant:original'], graphEvidencePages: [1],
          graphEvidenceBounds: [{ x: 10, y: 10, w: 10, h: 10, page: 1 }],
          logicEvidenceIds: ['logic-1'], logicEvidenceBounds: [{ x: 8, y: 8, w: 20, h: 20, page: 1 }],
          graphConflictIds: [],
        }],
      },
    }));
    const logicHeld = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-logic-hold',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 19, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeTeamLogic as never });

    expect(logicHeld.document.unresolvedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ELECTRICAL_LOGIC_CONFLICT', candidates: expect.arrayContaining(['VCB-01', 'logic-1']) }),
    ]));
    expect(logicHeld.document.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'HOLD', problem: expect.stringContaining('ELECTRICAL_LOGIC_CONFLICT') }),
    ]));

    const failedReview = {
      ...review(true),
      failures: [{
        role: 'connections' as const,
        sourceId: 'variant:line-enhanced:region:1',
        error: 'Invalid connections review output: line.path must contain at least two points.',
        fatal: false,
      }],
    };
    const diagnosed = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-role-diagnostic',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 19, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: async () => ({
      success: true,
      components: [],
      connections: [],
      confidence: 0.95,
      drawingReview: failedReview,
      drawingSynthesis: { calculations: [] },
    }) as never });

    const failedRegion = diagnosed.document.coverageLedger.regions.find((region) => region.regionId === 'p0-r1');
    expect(failedRegion?.roleCalls.connections).toEqual([
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('line.path must contain at least two points'),
      }),
    ]);

    const conflictOnlyReview = review(true);
    conflictOnlyReview.graph.conflicts = ['UNBOUND_LINE_ENDPOINT:LINE-1'];
    const executeWithoutTargets = jest.fn(async () => ({
      success: true,
      components: [],
      connections: [],
      confidence: 0.95,
      drawingReview: conflictOnlyReview,
      drawingSynthesis: { calculations: [] },
    }));
    const noTargetRetry = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-no-target-retry',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 57, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeWithoutTargets as never });

    expect(executeWithoutTargets).toHaveBeenCalledTimes(1);
    expect(noTargetRetry.document.jobStatus).toBe('PARTIAL');
    expect(noTargetRetry.document.unresolvedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'HOLD_RESCAN_UNRESOLVED' }),
    ]));
    const conflictAuditCall = noTargetRetry.document.coverageLedger.regions
      .find((region) => region.regionId === 'p0-full')
      ?.roleCalls['coverage-auditor']
      ?.find((call) => call.success === false);
    expect(conflictAuditCall?.error).toContain('UNBOUND_LINE_ENDPOINT:LINE-1');

    const conflictWithLineEvidence = review(true);
    conflictWithLineEvidence.graph.conflicts = ['UNBOUND_LINE_ENDPOINT:LINE-1'];
    conflictWithLineEvidence.graph.lines = [{
      id: 'LINE-1', originalEvidenceId: 'original:LINE-1', originalEvidenceIds: ['original:LINE-1'],
      sourceIds: ['variant:line-enhanced'], lineKind: 'power',
      path: [{ x: 70, y: 10 }, { x: 90, y: 30 }],
      start: { x: 70, y: 10 }, end: { x: 90, y: 30 },
      junctions: [], crossovers: [], confidence: 0.9, pages: [1],
    }] as never;
    let targetedConflictAttempt = 0;
    const executeTargetedConflict = jest.fn(async () => {
      targetedConflictAttempt += 1;
      return {
        success: true,
        components: [],
        connections: [],
        confidence: 0.95,
        drawingReview: targetedConflictAttempt === 1 ? conflictWithLineEvidence : review(true),
        drawingSynthesis: { calculations: [] },
      };
    });
    const recoveredConflict = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-targeted-graph-conflict',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 57, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeTargetedConflict as never });

    expect(executeTargetedConflict).toHaveBeenCalledTimes(2);
    const conflictTargets = (executeTargetedConflict.mock.calls as unknown as Array<[TeamInput]>)[1]?.[0]
      .params?.rescanTargets as Array<{ id: string; suggestedRoles: string[]; bounds: { page: number } }>;
    expect(conflictTargets).toHaveLength(2);
    expect(conflictTargets.every((target) => target.id.startsWith('precision-region-0-'))).toBe(true);
    expect(conflictTargets.every((target) => target.bounds.page === 1)).toBe(true);
    expect(conflictTargets.every((target) =>
      target.suggestedRoles.includes('symbols') && target.suggestedRoles.includes('connections'))).toBe(true);
    expect(recoveredConflict.document.coverageLedger.unresolvedRescans).toBe(0);

    // 모호성은 구조 위반이 아니다 — 전면 판독을 버리지 않는다.
    //
    // 실측(2026-08-07, 교재형 수변전 p6): 오케스트레이터가 사설 정규식
    // `/UNBOUND|AMBIGUOUS_LINE|SELF_LINE/` 으로 판정해, symbols·connections·
    // text·logic 이 **모두 성공한** 전면 판독이 AMBIGUOUS_LINE_ENDPOINT 3건
    // 때문에 failed 가 됐다. 3회 중 2회가 이 경로로 무너져 변압기를 3 대신
    // 1 로 읽었다. 정본은 electrical-invariants 의 BLOCKING/HOLDING 집합이다.
    const ambiguousOnlyReview = review(true);
    ambiguousOnlyReview.graph.conflicts = [
      'AMBIGUOUS_LINE_ENDPOINT:LINE-1',
      'AMBIGUOUS_LINE_ENDPOINT:LINE-2',
      'AMBIGUOUS_SYMBOL_TYPE:SYM-1',
    ];
    const executeAmbiguousOnly = jest.fn(async () => ({
      success: true,
      components: [],
      connections: [],
      confidence: 0.95,
      drawingReview: ambiguousOnlyReview,
      drawingSynthesis: { calculations: [] },
    }));
    const ambiguousRun = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-ambiguous-only',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 57, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeAmbiguousOnly as never });

    const ambiguousAudit = ambiguousRun.document.coverageLedger.regions
      .find((region) => region.regionId === 'p0-full')
      ?.roleCalls['coverage-auditor'] ?? [];
    expect(ambiguousAudit.some((call) => call.success === false)).toBe(false);
    expect(ambiguousRun.document.coverageLedger.rolesPresent).toContain('coverage-auditor');
    // 비차단 충돌은 기하 기록을 만들지 않는다.
    expect(ambiguousRun.document.unresolvedItems.some((item) => item.code === 'GRAPH_CONFLICT_LINE')).toBe(false);

    // 차단 충돌은 선의 기하를 확인 항목으로 남긴다 — 33차의 측정 장치.
    // SELF 가 진짜 자기 루프인지 기기 몸체에 붙은 짧은 스텁 선 오탐인지는
    // 좌표·길이가 있어야 사후 판정이 된다. 08-09 KIMM 3건·08-13 교재 6건은
    // 충돌 문자열만 남아 판정 불가였다.
    const selfGeometryReview = review(true);
    selfGeometryReview.graph.conflicts = [
      'SELF_LINE_ENDPOINT:LINE-7',
      'AMBIGUOUS_LINE_ENDPOINT:LINE-8',
    ];
    selfGeometryReview.graph.lines = [{
      id: 'LINE-7', originalEvidenceId: 'original:LINE-7', originalEvidenceIds: ['original:LINE-7'],
      sourceIds: ['variant:line-enhanced'], lineKind: 'power',
      path: [{ x: 40, y: 20 }, { x: 40, y: 60 }],
      start: { x: 40, y: 20 }, end: { x: 40, y: 60 },
      junctions: [], crossovers: [], confidence: 0.9, pages: [1],
    }, {
      id: 'LINE-8', originalEvidenceId: 'original:LINE-8', originalEvidenceIds: ['original:LINE-8'],
      sourceIds: ['variant:line-enhanced'], lineKind: 'power',
      path: [{ x: 0, y: 0 }, { x: 9, y: 9 }],
      start: { x: 0, y: 0 }, end: { x: 9, y: 9 },
      junctions: [], crossovers: [], confidence: 0.9, pages: [1],
    }] as never;
    const executeSelfGeometry = jest.fn(async () => ({
      success: true,
      components: [],
      connections: [],
      confidence: 0.95,
      drawingReview: selfGeometryReview,
      drawingSynthesis: { calculations: [] },
    }));
    const selfRun = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-self-geometry',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 57, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeSelfGeometry as never });

    const geometryItems = selfRun.document.unresolvedItems.filter((item) => item.code === 'GRAPH_CONFLICT_LINE');
    // 차단(SELF)만 기록되고 모호(AMBIGUOUS)는 기록되지 않는다.
    expect(geometryItems).toHaveLength(1);
    expect(geometryItems[0]).toMatchObject({
      pageIndex: 0,
      bounds: { x: 40, y: 20, w: 1, h: 40 },
    });
    expect(geometryItems[0].note).toContain('SELF_LINE_ENDPOINT');
    expect(geometryItems[0].note).toContain('LINE-7');
    expect(geometryItems[0].note).toContain('(40,20)→(40,60)');
    expect(geometryItems[0].note).toContain('길이 40px');

    let failedRegionAttempt = 0;
    const executeFailedRegion = jest.fn(async () => {
      failedRegionAttempt += 1;
      return {
        success: true,
        components: [],
        connections: [],
        confidence: 0.95,
        drawingReview: failedRegionAttempt === 1 ? failedReview : review(true),
        drawingSynthesis: { calculations: [] },
      };
    });
    const recoveredRegion = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-failed-region-target',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 40, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeFailedRegion as never });

    expect(executeFailedRegion).toHaveBeenCalledTimes(2);
    expect((executeFailedRegion.mock.calls as unknown as Array<[TeamInput]>)[1]?.[0]).toMatchObject({
      params: {
        rescanTargets: [expect.objectContaining({
          sourceId: 'p0-r1',
          reason: 'low-coverage',
          suggestedRoles: ['connections'],
        })],
      },
    });
    expect(recoveredRegion.document.coverageLedger.regionsFailed).toBe(0);


    const redundantFailureReview = {
      ...review(true),
      failures: [{
        role: 'text' as const,
        sourceId: 'variant:upscale-2x',
        error: 'redundant text variant timed out',
        fatal: false,
      }],
    };
    const redundantFailure = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-redundant-failure',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 19, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: async () => ({
      success: true,
      components: [],
      connections: [],
      confidence: 0.95,
      drawingReview: redundantFailureReview,
      drawingSynthesis: { calculations: [] },
    }) as never });

    expect(redundantFailure.document.coverageLedger.unresolvedRescans).toBe(0);
    expect(redundantFailure.document.jobStatus).toBe('COMPLETE');

    const measuredReview = review(true);
    const measured = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-measured-calls',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 19, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: async () => ({
      success: true,
      components: [],
      connections: [],
      confidence: 0.95,
      drawingReview: {
        ...measuredReview,
        coverage: { ...measuredReview.coverage, actualCalls: 5 },
      },
      drawingSynthesis: { calculations: [] },
    }) as never });

    expect(measured.job.vlmCallsUsed).toBe(5);
    expect(measured.document.pages[0].vlmCalls).toBe(5);

    let fullFailureAttempt = 0;
    const fullFailureReview = {
      ...review(true),
      failures: [
        {
          role: 'connections' as const,
          sourceId: 'variant:line-enhanced',
          error: 'full-page connection reader timed out',
          fatal: false,
        },
        {
          role: 'connections' as const,
          sourceId: 'role',
          error: 'connections role produced no usable envelope',
          fatal: false,
        },
      ],
    };
    const executeFullFailure = jest.fn(async () => {
      fullFailureAttempt += 1;
      return {
        success: true,
        components: [],
        connections: [],
        confidence: 0.95,
        drawingReview: fullFailureAttempt === 1 ? fullFailureReview : review(true, 7),
        drawingSynthesis: { calculations: [] },
      };
    });
    const recoveredFullSource = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'image/png', ownerId: 'owner-full-source-retry',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 26, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeFullFailure as never });

    expect(executeFullFailure).toHaveBeenCalledTimes(2);
    const fullRetryTargets = ((executeFullFailure.mock.calls as unknown as Array<[TeamInput]>)[1]?.[0]
      .params?.rescanTargets ?? []) as Array<Record<string, unknown>>;
    expect(fullRetryTargets).toHaveLength(1);
    expect(fullRetryTargets[0]).toMatchObject({
      sourceId: 'p0-full',
      retryScope: 'full-source',
      suggestedRoles: ['connections'],
    });
    expect(recoveredFullSource.document.jobStatus).toBe('COMPLETE');
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
      width: 100, height: 80, channels: 4, contrast: 1, edgeDensity: 0.01,
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
      width: 100, height: 80, channels: 4, contrast: 1, edgeDensity: 0.01,
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
      width: 100, height: 80, channels: 3, contrast: 1, edgeDensity: 0.02,
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
      width: 100, height: 80, channels: 4, contrast: 1, edgeDensity: 0.01,
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
      width: 100, height: 80, channels: 4, contrast: 1, edgeDensity: 0.01,
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
      envelopes: ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'].map((role) => ({
        role, outputHash: `${role}-hash`, drawingHash: source.documentHash,
        provider: 'openai', model: 'test', promptVersion: 'test', durationMs: 1,
        data: role === 'coverage-auditor'
          ? { rescanTargets: [], warnings: [], confidence: 0.95 }
          : { warnings: [], confidence: 0.95 },
      })),
      failures: [],
      coverage: {
        roles: {
          symbols: { variantId: 'variant:original', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 5 },
          connections: { variantId: 'variant:line-enhanced', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 5 },
          text: { variantId: 'variant:text-high-contrast', expectedRegionCount: 4, actualRegionCount: 4, plannedCalls: 7 },
          logic: { variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
          'coverage-auditor': { variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
        },
        plannedCalls: 19, complete: true, maxRegionCallsPerRole: 16,
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
      budget: { maxPages: 1, maxVlmCalls: 19, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeTeam as never });

    expect(executeTeam.mock.calls.map(([teamInput]) => teamInput.classification)).toEqual(['sld_pdf', 'sld_image']);
    expect(result.document.jobStatus).toBe('COMPLETE');
    expect(result.job.pageDigests[0]).toMatchObject({
      provider: 'openai',
      model: expect.any(String),
    });

    const changedEffort = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'application/pdf', ownerId: 'owner-vector-vision',
      jobId: result.job.jobId,
      vision: { provider: 'openai', apiKey: 'test-request-key', effort: 'high' },
      budget: { maxPages: 1, maxVlmCalls: 100, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeTeam as never });

    expect(executeTeam.mock.calls.map(([teamInput]) => teamInput.classification))
      .toEqual(['sld_pdf', 'sld_image', 'sld_pdf', 'sld_image']);
    expect(changedEffort.job.pageDigests[0]).toMatchObject({ effort: 'high' });
    expect(changedEffort.document.verification.productionFingerprint).toMatchObject({ effort: 'high' });

    const changedModel = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'application/pdf', ownerId: 'owner-vector-vision',
      jobId: changedEffort.job.jobId,
      vision: { provider: 'openai', model: 'gpt-4.1', apiKey: 'test-request-key', effort: 'high' },
      budget: { maxPages: 1, maxVlmCalls: 100, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeTeam as never });

    expect(executeTeam.mock.calls.map(([teamInput]) => teamInput.classification))
      .toEqual(['sld_pdf', 'sld_image', 'sld_pdf', 'sld_image', 'sld_pdf', 'sld_image']);
    expect(changedModel.job.pageDigests[0]).toMatchObject({ provider: 'openai', model: 'gpt-4.1', effort: 'high' });

    // 역할별 프로필도 지문이다. 여기서 재사용이 일어나면 프로필 A/B 는
    // 이전 봉투를 다시 채점하는 셈이라 아무것도 측정하지 못한다.
    const changedProfile = await runDocumentAnalysis({
      bytes: await makePng(), mimeType: 'application/pdf', ownerId: 'owner-vector-vision',
      jobId: changedModel.job.jobId,
      vision: {
        provider: 'openai',
        model: 'gpt-4.1',
        apiKey: 'test-request-key',
        effort: 'high',
        effortProfile: { symbols: 'low' },
      },
      budget: { maxPages: 1, maxVlmCalls: 100, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeTeam as never });

    expect(executeTeam.mock.calls.map(([teamInput]) => teamInput.classification))
      .toEqual(['sld_pdf', 'sld_image', 'sld_pdf', 'sld_image', 'sld_pdf', 'sld_image', 'sld_pdf', 'sld_image']);
    expect(changedProfile.job.pageDigests[0]).toMatchObject({ effortProfile: 'symbols:low' });
  });

  it('keeps the coverage ledger to the full page when the council selects no precision regions', async () => {
    const image = await makePng();
    const quality = {
      width: 100, height: 80, channels: 3, contrast: 1, edgeDensity: 0.01,
      gradientVariance: 1, lowContrast: false, blurry: false,
      recommendedScale: 1 as const, warnings: [],
    };
    const source: PreparedDrawingSource = {
      documentHash: 'a'.repeat(64), mimeType: 'image/png', formatClass: 'raster-image',
      pages: [{
        pageIndex: 0, width: 100, height: 80, sourceWidth: 100, sourceHeight: 80,
        renderScale: 1, renderMode: 'raster', textSample: '', vectorOpCount: 0,
        rasterOpCount: 1, renderHash: 'adaptive-full-only', quality, imageBuffer: image,
      }],
    };
    const fullSources = {
      symbols: 'variant:original', connections: 'variant:line-enhanced',
      text: 'variant:text-high-contrast', logic: 'variant:original',
      'coverage-auditor': 'variant:original',
    } as const;
    const envelopes = Object.entries(fullSources).map(([role, sourceId]) => ({
      role, outputHash: `${role}-hash`, drawingHash: source.documentHash,
      provider: 'openai', model: 'test', promptVersion: 'test', durationMs: 1,
      reviewedSourceIds: [sourceId],
      data: role === 'coverage-auditor'
        ? { rescanTargets: [], warnings: [], confidence: 0.95 }
        : { warnings: [], confidence: 0.95 },
    }));
    const executeTeam = jest.fn(async (_teamInput: TeamInput) => ({
      success: true, components: [], connections: [], confidence: 0.95,
      drawingReview: {
        snapshot: { drawingHash: source.documentHash, mimeType: 'image/png', page: 1, width: 100, height: 80, quality },
        envelopes,
        failures: [],
        coverage: {
          roles: {
            symbols: { variantId: fullSources.symbols, expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1, regionIds: [] },
            connections: { variantId: fullSources.connections, expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1, regionIds: [] },
            text: { variantId: fullSources.text, expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 3, regionIds: [] },
            logic: { variantId: fullSources.logic, expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
            'coverage-auditor': { variantId: fullSources['coverage-auditor'], expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1 },
          },
          plannedCalls: 7, actualCalls: 7, complete: true, maxRegionCallsPerRole: 16,
        },
        graph: { drawingHash: source.documentHash, symbols: [], lines: [], texts: [], edges: [], conflicts: [] },
      },
      drawingSynthesis: { calculations: [], conflicts: [] },
    }));

    const result = await runDocumentAnalysis({
      bytes: image, mimeType: 'image/png', ownerId: 'owner-adaptive-full-only',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 7, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: executeTeam as never });

    expect(executeTeam).toHaveBeenCalledTimes(1);
    expect(executeTeam.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ maxPrecisionRegionCallsPerRole: 0 }));
    expect(result.job.vlmCallsUsed).toBe(7);
    expect(result.document.coverageLedger).toMatchObject({
      plannedRegionCount: 1,
      regionsComplete: 1,
      regionsFailed: 0,
      unresolvedRescans: 0,
    });
    expect(result.document.coverageLedger.regions.map((region) => region.regionId)).toEqual(['p0-full']);
  });

  it('uses the selected source page dimensions for a non-contiguous page conflict fallback', async () => {
    const quality = {
      width: 320, height: 240, channels: 4, contrast: 1, edgeDensity: 0.02,
      gradientVariance: 1, lowContrast: false, blurry: false,
      recommendedScale: 1 as const, warnings: [],
    };
    const source: PreparedDrawingSource = {
      documentHash: '7'.repeat(64), mimeType: 'image/png', formatClass: 'raster-image', totalPageCount: 3,
      pages: [{
        pageIndex: 2, width: 320, height: 240, sourceWidth: 320, sourceHeight: 240,
        renderScale: 1, renderMode: 'raster', textSample: 'VCB', vectorOpCount: 0,
        rasterOpCount: 1, renderHash: 'selected-page-3', quality, imageBuffer: await makePng(320, 240),
      }],
    };
    const roles = ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'] as const;
    const drawingReview = {
      snapshot: { drawingHash: source.documentHash, mimeType: 'image/png', page: 3, width: 320, height: 240, quality },
      envelopes: roles.map((role) => ({
        role, outputHash: `${role}-hash`, drawingHash: source.documentHash,
        provider: 'openai', model: 'test', promptVersion: 'test', durationMs: 1,
        data: role === 'coverage-auditor'
          ? { rescanTargets: [], warnings: [], confidence: 0.95 }
          : { warnings: [], confidence: 0.95 },
      })),
      failures: [],
      coverage: {
        roles: Object.fromEntries(roles.map((role) => [role, {
          variantId: 'variant:original', expectedRegionCount: 0, actualRegionCount: 0, plannedCalls: 1,
        }])),
        plannedCalls: 19, actualCalls: 5, complete: true, maxRegionCallsPerRole: 16,
      },
      graph: { drawingHash: source.documentHash, symbols: [], lines: [], texts: [], edges: [], conflicts: [] },
    };
    const conflict = {
      id: 'page-three-conflict', kind: 'CONTRADICTION', topic: 'PROTECTION_CHAIN', severity: 'critical',
      status: 'open', action: 'TARGETED_REVIEW', reasonCode: 'missing-bounds', message: '근거 범위가 없습니다.',
      graphEvidenceIds: [], graphOriginalEvidenceIds: [], graphSourceIds: [], graphEvidencePages: [3],
      graphEvidenceBounds: [], logicEvidenceIds: [], logicEvidenceBounds: [], graphConflictIds: [],
    };

    const result = await runDocumentAnalysis({
      bytes: await makePng(320, 240), mimeType: 'image/png', ownerId: 'owner-selected-page',
      requestedPages: [2], preparationPages: [2],
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 19, maxPixels: 100_000, deadlineMs: 60_000 },
    }, { prepareSource: async () => source, executeTeam: async () => ({
      success: true, components: [], connections: [], confidence: 0.95,
      drawingReview, drawingSynthesis: { calculations: [], conflicts: [conflict] },
    }) as never });

    expect(result.document.unresolvedItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'ELECTRICAL_LOGIC_CONFLICT', pageIndex: 2,
        bounds: { x: 0, y: 0, w: 320, h: 240 },
      }),
    ]));
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

  it('aborts in-flight team work when the document deadline expires', async () => {
    const imageBuffer = await makePng();
    const source: PreparedDrawingSource = {
      documentHash: 'a'.repeat(64),
      mimeType: 'image/png',
      formatClass: 'raster-image',
      totalPageCount: 1,
      pages: [{
        pageIndex: 0,
        width: 100,
        height: 80,
        sourceWidth: 100,
        sourceHeight: 80,
        renderScale: 1,
        renderMode: 'raster',
        textSample: '',
        vectorOpCount: 0,
        rasterOpCount: 1,
        renderHash: 'deadline-raster',
        quality: {
          width: 100,
          height: 80,
          channels: 4,
          contrast: 1,
          edgeDensity: 0.02,
          gradientVariance: 1,
          lowContrast: false,
          blurry: false,
          recommendedScale: 1,
          warnings: [],
        },
        imageBuffer,
      }],
    };
    let observedSignal: AbortSignal | undefined;
    const executeTeam = jest.fn(async (teamInput: TeamInput) => {
      observedSignal = teamInput.signal;
      await new Promise<void>((resolve) => {
        const fallback = setTimeout(resolve, 800);
        const finish = () => {
          clearTimeout(fallback);
          resolve();
        };
        if (teamInput.signal?.aborted) finish();
        else teamInput.signal?.addEventListener('abort', finish, { once: true });
      });
      return {
        success: false,
        components: [],
        connections: [],
        confidence: 0,
        error: teamInput.signal?.aborted ? 'document deadline' : 'unbounded team call',
      };
    });

    const started = Date.now();
    const result = await runDocumentAnalysis({
      bytes: imageBuffer,
      mimeType: 'image/png',
      ownerId: 'owner-in-flight-deadline',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 19, maxPixels: 100_000, deadlineMs: 200 },
    }, { prepareSource: async () => source, executeTeam: executeTeam as never });

    expect(executeTeam).toHaveBeenCalledTimes(1);
    expect(observedSignal).toBeDefined();
    expect(observedSignal?.aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(600);
    expect(result.document.jobStatus).toBe('PARTIAL');
  });

  it('does not emit raster conductors when no symbol review survived', async () => {
    const bytes = await makeNetworkPng();
    const result = await runDocumentAnalysis({
      bytes,
      mimeType: 'image/png',
      ownerId: 'owner-no-symbol-evidence',
      vision: { provider: 'openai', apiKey: 'test-request-key' },
      budget: { maxPages: 1, maxVlmCalls: 120, maxPixels: 1_000_000, deadlineMs: 60_000 },
    }, {
      executeTeam: async () => ({
        teamId: 'TEAM-SLD',
        success: false,
        components: [],
        connections: [],
        confidence: 0,
        durationMs: 0,
        error: 'all symbol roles failed',
      }),
    });

    expect(result.document.evidenceGraph.symbols).toHaveLength(0);
    expect(result.document.evidenceGraph.lines).toHaveLength(0);
  });
});
