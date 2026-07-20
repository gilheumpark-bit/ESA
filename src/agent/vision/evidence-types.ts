/**
 * Drawing evidence contracts — original coordinates are source of truth.
 * Generative upscale is forbidden; transforms only map derived pixels back.
 */

import { createHash } from 'node:crypto';

export type Point = { x: number; y: number };
export type EvidenceBounds = Point & { w: number; h: number };

export type CoordinateTransform = {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
};

export type ImageVariantKind =
  | 'original'
  | 'lanczos-2x'
  | 'lanczos-4x'
  | 'text-high-contrast'
  | 'line-sharpen';

export interface ImageQualityProfile {
  width: number;
  height: number;
  channels: number;
  contrast: number;
  edgeDensity: number;
  gradientVariance: number;
  lowContrast: boolean;
  blurry: boolean;
  recommendedScale: 1 | 2 | 4;
  warnings: string[];
  minCharHeightPxEstimate?: number;
}

export interface DrawingSnapshot {
  drawingHash: string;
  mimeType: string;
  byteLength: number;
  pageIndex: number;
  quality: ImageQualityProfile;
  createdAt: string;
}

export interface ImageVariant {
  variantId: string;
  kind: ImageVariantKind;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  transform: CoordinateTransform;
}

export type RegionKind =
  | 'grid'
  | 'dense-split'
  | 'title-block'
  | 'legend'
  | 'h-strip'
  | 'v-strip'
  | 'full-page';

export type RegionLifecycle =
  | 'planned'
  | 'running'
  | 'complete'
  | 'failed'
  | 'skipped-empty';

export interface PrecisionRegion {
  regionId: string;
  pageIndex: number;
  kind: RegionKind;
  bounds: EvidenceBounds;
  status: RegionLifecycle;
}

export function toOriginalPoint(point: Point, transform: CoordinateTransform): Point {
  return {
    x: (point.x - transform.offsetX) / transform.scaleX,
    y: (point.y - transform.offsetY) / transform.scaleY,
  };
}

export function toVariantPoint(point: Point, transform: CoordinateTransform): Point {
  return {
    x: point.x * transform.scaleX + transform.offsetX,
    y: point.y * transform.scaleY + transform.offsetY,
  };
}

export function createDrawingSnapshot(
  bytes: ArrayBuffer,
  mimeType: string,
  quality: ImageQualityProfile,
  pageIndex = 0,
): DrawingSnapshot {
  const drawingHash = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
  return {
    drawingHash,
    mimeType,
    byteLength: bytes.byteLength,
    pageIndex,
    quality,
    createdAt: new Date().toISOString(),
  };
}

export function identityTransform(): CoordinateTransform {
  return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
}

export function scaleTransform(scale: number): CoordinateTransform {
  return { scaleX: scale, scaleY: scale, offsetX: 0, offsetY: 0 };
}
