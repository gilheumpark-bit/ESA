import type { TeamResult } from '@/agent/teams/types';

import { adaptTeamResult } from '../team-result-adapter';

describe('adaptTeamResult', () => {
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
});
