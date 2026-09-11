import type { DrawingCouncilInput } from '../drawing-council';
import type { VLMRoleAnalysisResult, VLMReviewRole } from '../vlm-client';

export function schedulingInput(regions = true, concurrency = 4, tripleText = false): DrawingCouncilInput {
  const bytes = (id: number) => new Uint8Array([id]).buffer;
  const bounds = { x: 0, y: 0, w: 100, h: 80 };
  return {
    snapshot: { drawingHash: 'synthetic-schedule-fixture', mimeType: 'image/png', page: 1, width: 100, height: 80,
      quality: { width: 100, height: 80, channels: 3, contrast: 1, edgeDensity: 0.1, gradientVariance: 1,
        lowContrast: false, blurry: false, recommendedScale: 1, warnings: [] } },
    options: { provider: 'openai', apiKey: 'synthetic-not-a-live-key', maxRetries: 0 },
    variants: [
      { id: 'original', kind: 'original', buffer: bytes(1), width: 100, height: 80, transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 } },
      { id: 'text', kind: 'text-high-contrast', buffer: bytes(2), width: 100, height: 80, transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 } },
      { id: 'lines', kind: 'line-enhanced', buffer: bytes(3), width: 100, height: 80, transform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 } },
      ...(tripleText ? [{ id: 'upscale', kind: 'upscale-4x' as const, buffer: bytes(4), width: 400, height: 320, transform: { scaleX: 4, scaleY: 4, offsetX: 0, offsetY: 0 } }] : []),
    ],
    regions: regions ? ['original', 'text', 'lines'].map((variantId, index) => ({
      id: `crop-${variantId}`, variantId, originalBounds: { ...bounds }, variantBounds: { ...bounds }, buffer: bytes(9 + index),
    })) : [],
    maxConcurrentCalls: concurrency,
  };
}
export function schedulingResponse(role: VLMReviewRole): VLMRoleAnalysisResult {
  const bounds = { x: 0, y: 0, w: 1000, h: 1000, page: 1 };
  const common = { warnings: [], confidence: 0.6 };
  const data = role === 'symbols' ? { ...common, symbols: [{ id: 'S1', typeCandidates: ['breaker', 'fuse'], rawLabel: 'UI fixture', bounds, ports: [], confidence: 0.6 }] }
    : role === 'connections' ? { ...common, lines: [{ id: 'L1', lineKind: 'power' as const, start: { x: 0, y: 0 }, end: { x: 1000, y: 1000 },
      path: [{ x: 0, y: 0 }, { x: 1000, y: 1000 }], junctions: [], crossovers: [], confidence: 0.6 }] }
      : role === 'text' ? { ...common, texts: [{ id: 'T1', raw: 'AB', candidates: ['AB', 'AC'], bounds, confidence: 0.6 }] }
        : role === 'logic' ? { ...common, logic: [] } : { ...common, rescanTargets: [] };
  return { role, data, rawText: '{}', model: 'synthetic-scheduling-model', durationMs: 1, retryCount: 0 };
}
export const isPrecision = (buffer: ArrayBuffer) => new Uint8Array(buffer)[0] >= 9;
