import type { TeamResult } from '@/agent/teams/types';

import { adaptTeamResult, deduplicateTextSeeds } from '../team-result-adapter';

describe('adaptTeamResult', () => {
  it('merges the same OCR anchor across full-page, region, and rescan evidence', () => {
    const merged = deduplicateTextSeeds([
      { text: '▲ 75 MW', candidates: ['▲ 75 MW'], pageIndex: 0, bounds: { x: 100, y: 80, w: 60, h: 16 }, sourceEvidenceIds: ['full'] },
      { text: '75 MW ▲', candidates: ['75 MW ▲'], pageIndex: 0, bounds: { x: 101, y: 80, w: 59, h: 16 }, sourceEvidenceIds: ['region'] },
      { text: '▲ 75 MW', candidates: ['▲ 75 MW'], pageIndex: 0, bounds: { x: 100, y: 81, w: 60, h: 15 }, sourceEvidenceIds: ['rescan'] },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].sourceEvidenceIds).toEqual(['full', 'region', 'rescan']);
    expect(merged[0].candidates).toEqual(expect.arrayContaining(['▲ 75 MW', '75 MW ▲']));
  });

  it('keeps identical labels at separate drawing locations', () => {
    const merged = deduplicateTextSeeds([
      { text: 'VCB', pageIndex: 0, bounds: { x: 10, y: 10, w: 30, h: 12 } },
      { text: 'VCB', pageIndex: 0, bounds: { x: 300, y: 10, w: 30, h: 12 } },
    ]);

    expect(merged).toHaveLength(2);
  });
  it('uses real component endpoints for deterministic vector connections', () => {
    const result: TeamResult = {
      teamId: 'TEAM-SLD',
      success: true,
      components: [
        { id: 'a', type: 'breaker', label: 'VCB-1', position: { x: 10, y: 20 }, confidence: 0.95 },
        { id: 'b', type: 'transformer', label: 'TR-1', position: { x: 80, y: 70 }, confidence: 0.95 },
      ],
      connections: [{ from: 'a', to: 'b' }],
      confidence: 0.95,
      durationMs: 1,
    };

    const adapted = adaptTeamResult(result, { pageIndex: 0, width: 1_000, height: 500 });
    expect(adapted.lines).toHaveLength(1);
    expect(adapted.lines[0].path).toEqual([
      { x: 100, y: 100 },
      { x: 800, y: 350 },
    ]);
  });

  it('keeps broad-read connection candidates when the sealed review graph has no lines', () => {
    const result = {
      teamId: 'TEAM-SLD', success: true,
      components: [
        { id: 'a', type: 'breaker', label: 'VCB-1', position: { x: 10, y: 20 }, confidence: 0.79 },
        { id: 'b', type: 'transformer', label: 'TR-1', position: { x: 80, y: 70 }, confidence: 0.79 },
      ],
      connections: [{ from: 'a', to: 'b' }], confidence: 0.79, durationMs: 1,
      drawingReview: {
        snapshot: { drawingHash: 'a'.repeat(64), mimeType: 'image/png', page: 1, width: 1_000, height: 500, quality: { width: 1_000, height: 500, channels: 3, contrast: 1, edgeDensity: 1, gradientVariance: 1, lowContrast: false, blurry: false, recommendedScale: 1, warnings: [] } },
        envelopes: [], failures: [], coverage: { roles: {}, plannedCalls: 1, complete: false, maxRegionCallsPerRole: 16 },
        graph: { drawingHash: 'a'.repeat(64), symbols: [{ id: 'reviewed-a', sourceIds: ['original'], typeCandidates: ['VCB'], rawLabel: 'VCB-1', bounds: { x: 90, y: 90, w: 20, h: 20, page: 1 }, ports: [], confidence: 0.9 }], lines: [], texts: [], edges: [], conflicts: [] },
      },
    } as unknown as TeamResult;

    const adapted = adaptTeamResult(result, { pageIndex: 0, width: 1_000, height: 500 });
    expect(adapted.symbols.map((item) => item.localId)).toEqual(['reviewed-a']);
    expect(adapted.lines).toEqual([expect.objectContaining({ path: [{ x: 100, y: 100 }, { x: 800, y: 350 }], certainty: 'ambiguous' })]);
  });

  it('uses the explicit Shunt Reactor label to resolve capacitor/load model drift', () => {
    const result: TeamResult = {
      teamId: 'TEAM-SLD', success: true,
      components: [
        { id: 'r1', type: 'capacitor', label: 'Shunt Reactor', position: { x: 50, y: 50 }, confidence: 0.79 },
        { id: 'r2', type: 'load', label: 'SHUNT REACTOR', position: { x: 50.2, y: 50.1 }, confidence: 0.79 },
        { id: 'b1', type: 'breaker', label: 'Reactor Breaker', position: { x: 70, y: 70 }, confidence: 0.79 },
      ],
      connections: [], confidence: 0.79, durationMs: 1,
    };

    const adapted = adaptTeamResult(result, { pageIndex: 0, width: 1_000, height: 1_000 });
    expect(adapted.symbols.map((item) => item.type)).toEqual(['reactor', 'reactor', 'breaker']);
  });

  it('preserves distinct OCR variant sources instead of cloning one reading', () => {
    const result = {
      teamId: 'TEAM-SLD',
      success: true,
      components: [],
      connections: [],
      confidence: 0.9,
      durationMs: 1,
      drawingReview: {
        snapshot: {
          drawingHash: 'a'.repeat(64), mimeType: 'image/png', page: 1, width: 1_000, height: 500,
          quality: { width: 1_000, height: 500, channels: 3, contrast: 1, edgeDensity: 1, gradientVariance: 1, lowContrast: false, blurry: false, recommendedScale: 1, warnings: [] },
        },
        envelopes: [{
          role: 'text', drawingHash: 'a'.repeat(64), provider: 'gemini', model: 'test', promptVersion: 'v1', outputHash: 'b'.repeat(64), durationMs: 1,
          data: {
            warnings: [], confidence: 0.9,
            texts: [
              { id: 'o', sourceId: 'variant:original:region:0', raw: 'PT', candidates: ['PT'], bounds: { x: 100, y: 100, w: 40, h: 20, page: 1 }, confidence: 0.9 },
              { id: 'u', sourceId: 'variant:upscale-4x:region:0', raw: 'PPT', candidates: ['PPT'], bounds: { x: 101, y: 100, w: 40, h: 20, page: 1 }, confidence: 0.8 },
              { id: 'h', sourceId: 'variant:text-high-contrast:region:0', raw: 'PT', candidates: ['PT'], bounds: { x: 100, y: 101, w: 40, h: 20, page: 1 }, confidence: 0.9 },
            ],
          },
        }],
        failures: [],
        coverage: { roles: {}, plannedCalls: 3, complete: true, maxRegionCallsPerRole: 16 },
      },
    } as unknown as TeamResult;

    const adapted = adaptTeamResult(result, { pageIndex: 2, width: 1_000, height: 500 });
    expect(adapted.texts).toHaveLength(1);
    expect(adapted.texts[0].readings).toEqual([
      expect.objectContaining({ variantId: 'original', text: 'PT' }),
      expect.objectContaining({ variantId: 'upscale-4x', text: 'PPT' }),
      expect.objectContaining({ variantId: 'text-high-contrast', text: 'PT' }),
    ]);
    expect(adapted.texts[0].sourceEvidenceIds).toEqual(['o', 'u', 'h']);
  });

  it('keeps all parser-originated vector text anchors, not only component labels', () => {
    const result: TeamResult = {
      teamId: 'TEAM-SLD', success: true,
      components: [{ id: 'a', type: 'breaker', label: 'VCB-1', position: { x: 10, y: 20 }, confidence: 0.95 }],
      connections: [], confidence: 0.95, durationMs: 1,
      vectorTexts: [
        { text: 'VCB-1', position: { x: 10, y: 20 }, confidence: 0.99 },
        { text: '정격 100A', position: { x: 30, y: 20 }, confidence: 0.99 },
        { text: 'TO SHEET 2', position: { x: 90, y: 90 }, confidence: 0.99 },
      ],
    };
    const adapted = adaptTeamResult(result, { pageIndex: 0, width: 1_000, height: 500 });
    expect(adapted.texts.map((item) => item.text)).toEqual(['VCB-1', '정격 100A', 'TO SHEET 2']);
    expect(adapted.texts.every((item) => item.sourceEvidenceIds?.[0]?.startsWith('vector-text-p0-'))).toBe(true);
  });

  it('preserves numbered region anchors separately from full-page corroboration lines', () => {
    const result = {
      teamId: 'TEAM-SLD', success: true, components: [], connections: [], confidence: 0.95, durationMs: 1,
      drawingReview: {
        snapshot: { drawingHash: 'c'.repeat(64), mimeType: 'image/png', page: 1, width: 100, height: 100, quality: { width: 100, height: 100, channels: 3, contrast: 1, edgeDensity: 1, gradientVariance: 1, lowContrast: false, blurry: false, recommendedScale: 1, warnings: [] } },
        continuityPlan: {
          regions: [
            { id: 'p0-a1', displayId: 'P01-A01', pageIndex: 0, row: 0, column: 0, logicalBounds: { x: 0, y: 0, w: 50, h: 100 }, cropBounds: { x: 0, y: 0, w: 60, h: 100 } },
            { id: 'p0-a2', displayId: 'P01-A02', pageIndex: 0, row: 0, column: 1, logicalBounds: { x: 50, y: 0, w: 50, h: 100 }, cropBounds: { x: 40, y: 0, w: 60, h: 100 } },
          ],
          continuations: [{ id: 'c1', displayId: 'P01-C001', pageIndex: 0, point: { x: 50, y: 50 }, seams: [{ orientation: 'vertical', index: 1 }], tangent: { x: 1, y: 0 }, lineKind: 'power', sourceLineId: 'full-line', source: 'global-vision', status: 'planned', observations: [
            { regionId: 'line:region:0', regionDisplayId: 'P01-A01', side: 'right', point: { x: 50, y: 50 }, tangent: { x: 1, y: 0 }, confidence: 0.95 },
            { regionId: 'line:region:1', regionDisplayId: 'P01-A02', side: 'left', point: { x: 50, y: 50 }, tangent: { x: 1, y: 0 }, confidence: 0.95 },
          ] }], seamAlignedLineIds: [], warnings: [],
        },
        envelopes: [{ role: 'connections', drawingHash: 'c'.repeat(64), provider: 'gemini', model: 'test', promptVersion: 'v5', outputHash: 'd'.repeat(64), durationMs: 1, data: { warnings: [], confidence: 0.95, lines: [
          { id: 'full-line', sourceId: 'line', lineKind: 'power', path: [{ x: 0, y: 50 }, { x: 100, y: 50 }], start: { x: 0, y: 50 }, end: { x: 100, y: 50 }, junctions: [], crossovers: [], confidence: 0.95 },
          { id: 'left', sourceId: 'line:region:0', lineKind: 'power', path: [{ x: 0, y: 50 }, { x: 50, y: 50 }], start: { x: 0, y: 50 }, end: { x: 50, y: 50 }, endAnchorId: 'P01-C001', junctions: [], crossovers: [], confidence: 0.95 },
          { id: 'right', sourceId: 'line:region:1', lineKind: 'power', path: [{ x: 50, y: 50 }, { x: 100, y: 50 }], start: { x: 50, y: 50 }, end: { x: 100, y: 50 }, startAnchorId: 'P01-C001', junctions: [], crossovers: [], confidence: 0.95 },
        ] } }],
        failures: [], coverage: { roles: {}, plannedCalls: 1, complete: true, maxRegionCallsPerRole: 16 },
      },
    } as unknown as TeamResult;

    const adapted = adaptTeamResult(result, { pageIndex: 0, width: 100, height: 100 });
    expect(adapted.continuity?.localLines).toEqual([
      expect.objectContaining({ localId: 'left', regionDisplayId: 'P01-A01', endAnchorId: 'P01-C001' }),
      expect.objectContaining({ localId: 'right', regionDisplayId: 'P01-A02', startAnchorId: 'P01-C001' }),
    ]);
    expect(adapted.continuity?.globalLines).toEqual([expect.objectContaining({ localId: 'full-line' })]);
  });

  it('does not promote synthetic junctions or prose notes into countable equipment', () => {
    const result = {
      teamId: 'TEAM-SLD', success: true, connections: [], confidence: 0.9, durationMs: 1,
      components: [
        { id: 'junction-1', type: 'bus', label: '접점 (junction)', position: { x: 10, y: 10 }, confidence: 0.9, properties: { synthetic: 'junction' } },
        { id: 'note-1', type: 'breaker', label: 'IF YOU DO NOT HAVE VCB, USE LBS INSTEAD', position: { x: 20, y: 20 }, confidence: 0.9 },
        { id: 'vcb-1', type: 'breaker', label: 'VCB-1', position: { x: 30, y: 30 }, confidence: 0.9 },
      ],
    } as unknown as TeamResult;

    const adapted = adaptTeamResult(result, { pageIndex: 0, width: 100, height: 100 });
    expect(adapted.symbols.map((item) => item.localId)).toEqual(['vcb-1']);
  });

  it('suppresses schedule-local cells without deleting physical equipment elsewhere on a mixed page', () => {
    const result = {
      teamId: 'TEAM-SLD', success: true, confidence: 0.55, durationMs: 1,
      components: [
        { id: 'cell-vcb', type: 'breaker', label: 'VCB-1', position: { x: 10, y: 10 }, confidence: 0.55 },
        { id: 'cell-tr', type: 'transformer', label: 'TR-1', position: { x: 80, y: 80 }, confidence: 0.55 },
      ],
      connections: [{ from: 'cell-vcb', to: 'cell-tr' }],
      vectorTexts: [
        { text: 'CABLE SCHEDULE', position: { x: 5, y: 5 }, confidence: 0.99 },
        { text: 'CABLE SCHEDULE', position: { x: 55, y: 5 }, confidence: 0.99 },
        { text: 'VCB-1', position: { x: 10, y: 10 }, confidence: 0.99 },
      ],
    } as unknown as TeamResult;

    const adapted = adaptTeamResult(result, { pageIndex: 0, width: 100, height: 100 });
    expect(adapted.symbols.map((item) => item.label)).toEqual(['TR-1']);
    expect(adapted.lines).toEqual([]);
    expect(adapted.texts.map((item) => item.text)).toContain('CABLE SCHEDULE');
  });

  it('applies schedule zones to Vision graph symbols and lines as well as vector fallback', () => {
    const result = {
      teamId: 'TEAM-SLD', success: true, components: [], connections: [], confidence: 0.9, durationMs: 1,
      vectorTexts: [
        { text: 'CABLE SCHEDULE', position: { x: 5, y: 5 }, confidence: 0.99 },
        { text: 'CABLE SCHEDULE', position: { x: 55, y: 5 }, confidence: 0.99 },
      ],
      drawingReview: {
        graph: {
          symbols: [
            { id: 'schedule-vcb', sourceIds: ['vision'], typeCandidates: ['vcb'], rawLabel: 'VCB-1', bounds: { x: 10, y: 10, w: 8, h: 8 }, confidence: 0.95 },
            { id: 'field-tr', sourceIds: ['vision'], typeCandidates: ['transformer'], rawLabel: 'TR-1', bounds: { x: 80, y: 80, w: 8, h: 8 }, confidence: 0.95 },
          ],
          lines: [
            { id: 'schedule-line', sourceIds: ['vision'], lineKind: 'power', path: [{ x: 10, y: 15 }, { x: 30, y: 15 }], junctions: [], crossovers: [], confidence: 0.95 },
            { id: 'field-line', sourceIds: ['vision'], lineKind: 'power', path: [{ x: 70, y: 70 }, { x: 90, y: 70 }], junctions: [], crossovers: [], confidence: 0.95 },
          ],
        },
        envelopes: [], failures: [], coverage: { roles: {}, plannedCalls: 0, complete: true, maxRegionCallsPerRole: 16 },
      },
    } as unknown as TeamResult;

    const adapted = adaptTeamResult(result, { pageIndex: 0, width: 100, height: 100 });
    expect(adapted.symbols.map((item) => item.localId)).toEqual(['field-tr']);
    expect(adapted.lines.map((item) => item.localId)).toEqual(['field-line']);
  });
});
