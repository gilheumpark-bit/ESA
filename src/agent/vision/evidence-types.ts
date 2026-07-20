import { createHash } from 'node:crypto';

export type Point = { x: number; y: number };
export type EvidenceBounds = Point & { w: number; h: number };

export interface CoordinateTransform {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

export type ImageVariantKind =
  | 'original'
  | 'upscale-2x'
  | 'upscale-4x'
  | 'text-high-contrast'
  | 'line-enhanced';

export interface DrawingSnapshot {
  drawingHash: string;
  mimeType: string;
  page: number;
  width: number;
  height: number;
  quality: ImageQualityProfile;
}

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
}

export interface ImageVariant {
  id: string;
  kind: ImageVariantKind;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  transform: CoordinateTransform;
}

export interface PrecisionRegion {
  id: string;
  variantId: string;
  variantBounds: EvidenceBounds;
  originalBounds: EvidenceBounds;
  buffer: ArrayBuffer;
}

export function createDrawingSnapshot(
  buffer: ArrayBuffer,
  mimeType: string,
  quality: ImageQualityProfile,
  page = 1,
): DrawingSnapshot {
  if (buffer.byteLength === 0) {
    throw new Error('빈 도면 이미지는 분석할 수 없습니다.');
  }

  return {
    drawingHash: createHash('sha256')
      .update(new Uint8Array(buffer))
      .digest('hex'),
    mimeType,
    page,
    width: quality.width,
    height: quality.height,
    quality,
  };
}

function assertScale(transform: CoordinateTransform): void {
  if (!(transform.scaleX > 0) || !(transform.scaleY > 0)) {
    throw new Error('좌표 변환 배율은 0보다 커야 합니다.');
  }
}

export function toOriginalPoint(
  point: Point,
  transform: CoordinateTransform,
): Point {
  assertScale(transform);

  return {
    x: (point.x - transform.offsetX) / transform.scaleX,
    y: (point.y - transform.offsetY) / transform.scaleY,
  };
}

export function toVariantPoint(
  point: Point,
  transform: CoordinateTransform,
): Point {
  assertScale(transform);

  return {
    x: point.x * transform.scaleX + transform.offsetX,
    y: point.y * transform.scaleY + transform.offsetY,
  };
}
