import { runDocumentAnalysis } from '../document-orchestrator';
import { _resetJobsForTests } from '../drawing-job-store';
import { evaluatePredictionAgainstLabel } from '../sld-evaluator-v2';
import { DRAWING_DOCUMENT_SCHEMA_VERSION } from '../types-v3';

describe('document-orchestrator + evaluator', () => {
  beforeEach(() => {
    _resetJobsForTests();
  });

  it('builds V3 document with separated counts and no source bytes', async () => {
    const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const { document, job } = await runDocumentAnalysis({
      bytes: pngHeader.buffer,
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
            { variantId: 'lanczos-4x', text: 'PPT', confidence: 0.8, callId: '2' },
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
    const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 4, 5]);
    const { document } = await runDocumentAnalysis({
      bytes: pngHeader.buffer,
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
    expect(evalResult.receipt.signature).toBeTruthy();
  });

  it('marks budget exceeded as PARTIAL not silent success', async () => {
    const { document } = await runDocumentAnalysis({
      bytes: Uint8Array.from([1, 2, 3, 4]).buffer,
      mimeType: 'image/png',
      budget: { maxVlmCalls: 0, maxPages: 1, deadlineMs: 1, maxPixels: 100 },
      seedDetections: { symbols: [] },
    });
    // without seeds and no vision, page fails → PARTIAL
    expect(document.jobStatus === 'PARTIAL' || document.verification.documentStatus === 'PARTIAL').toBe(true);
  });
});
