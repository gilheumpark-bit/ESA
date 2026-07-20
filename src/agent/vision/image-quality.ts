/**
 * Deterministic raster quality profiling (no generative models).
 */

import type { ImageQualityProfile } from './evidence-types';

export interface RawImageMeta {
  width: number;
  height: number;
  channels: number;
  /** 0..1 sample of absolute pixel deltas — optional; defaults used when absent */
  contrastSample?: number;
  edgeDensitySample?: number;
  gradientVarianceSample?: number;
}

export function profileImageQuality(meta: RawImageMeta): ImageQualityProfile {
  const contrast = clamp01(meta.contrastSample ?? estimateDefaultContrast(meta));
  const edgeDensity = clamp01(meta.edgeDensitySample ?? 0.15);
  const gradientVariance = Math.max(0, meta.gradientVarianceSample ?? 12);
  const lowContrast = contrast < 0.18;
  const blurry = gradientVariance < 4 || (edgeDensity < 0.05 && contrast < 0.25);
  const minCharHeightPxEstimate = Math.max(4, Math.round(Math.min(meta.width, meta.height) * 0.012));

  let recommendedScale: 1 | 2 | 4 = 1;
  if (minCharHeightPxEstimate < 10 || lowContrast) recommendedScale = 2;
  if (minCharHeightPxEstimate < 7 || blurry) recommendedScale = 4;

  const warnings: string[] = [];
  if (lowContrast) warnings.push('LOW_CONTRAST');
  if (blurry) warnings.push('BLURRY');
  if (meta.width * meta.height > 40_000_000) warnings.push('PIXEL_BUDGET_RISK');
  if (minCharHeightPxEstimate < 8) warnings.push('LOW_RESOLUTION_HOLD');

  return {
    width: meta.width,
    height: meta.height,
    channels: meta.channels,
    contrast,
    edgeDensity,
    gradientVariance,
    lowContrast,
    blurry,
    recommendedScale,
    warnings,
    minCharHeightPxEstimate,
  };
}

function estimateDefaultContrast(meta: RawImageMeta): number {
  // Without pixel samples, assume mid contrast; callers with sharp can override.
  if (meta.width < 800 || meta.height < 600) return 0.22;
  return 0.35;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
