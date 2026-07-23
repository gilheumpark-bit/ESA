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
  readonly drawingHash: string;
  readonly mimeType: string;
  readonly page: number;
  readonly width: number;
  readonly height: number;
  readonly quality: ImageQualityProfile;
}

export interface ImageQualityProfile {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly contrast: number;
  readonly edgeDensity: number;
  readonly gradientVariance: number;
  readonly lowContrast: boolean;
  readonly blurry: boolean;
  readonly recommendedScale: 1 | 2 | 4;
  readonly warnings: readonly string[];
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
  displayId?: string;
  variantId: string;
  variantBounds: EvidenceBounds;
  logicalVariantBounds?: EvidenceBounds;
  originalBounds: EvidenceBounds;
  logicalOriginalBounds?: EvidenceBounds;
  buffer: ArrayBuffer;
}

export interface AnalysisRegionPlan {
  id: string;
  displayId: string;
  pageIndex: number;
  row: number;
  column: number;
  logicalBounds: EvidenceBounds;
  cropBounds: EvidenceBounds;
}

export function createDrawingSnapshot(
  buffer: ArrayBuffer | ArrayBufferView,
  mimeType: string,
  quality: ImageQualityProfile,
  page = 1,
): DrawingSnapshot {
  const bytes = toByteView(buffer);

  if (bytes.byteLength === 0) {
    throw new Error('빈 도면 이미지는 분석할 수 없습니다.');
  }

  const snapshotQuality: ImageQualityProfile = {
    width: quality.width,
    height: quality.height,
    channels: quality.channels,
    contrast: quality.contrast,
    edgeDensity: quality.edgeDensity,
    gradientVariance: quality.gradientVariance,
    lowContrast: quality.lowContrast,
    blurry: quality.blurry,
    recommendedScale: quality.recommendedScale,
    warnings: [...quality.warnings],
  };

  return {
    drawingHash: createHash('sha256').update(bytes).digest('hex'),
    mimeType,
    page,
    width: snapshotQuality.width,
    height: snapshotQuality.height,
    quality: snapshotQuality,
  };
}

function toByteView(buffer: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (ArrayBuffer.isView(buffer)) {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  return new Uint8Array(buffer);
}

function assertFinitePoint(point: Point): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error('좌표는 유한한 수여야 합니다.');
  }
}

function assertFiniteResult(point: Point): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error('좌표 변환 결과는 유한한 수여야 합니다.');
  }
}

function assertTransform(transform: CoordinateTransform): void {
  if (
    !Number.isFinite(transform.scaleX) ||
    !Number.isFinite(transform.scaleY) ||
    !Number.isFinite(transform.offsetX) ||
    !Number.isFinite(transform.offsetY)
  ) {
    throw new Error('좌표 변환 값은 유한한 수여야 합니다.');
  }

  if (!(transform.scaleX > 0) || !(transform.scaleY > 0)) {
    throw new Error('좌표 변환 배율은 0보다 커야 합니다.');
  }
}

export function toOriginalPoint(
  point: Point,
  transform: CoordinateTransform,
): Point {
  assertFinitePoint(point);
  assertTransform(transform);

  const original = {
    x: (point.x - transform.offsetX) / transform.scaleX,
    y: (point.y - transform.offsetY) / transform.scaleY,
  };

  assertFiniteResult(original);
  return original;
}

export function toVariantPoint(
  point: Point,
  transform: CoordinateTransform,
): Point {
  assertFinitePoint(point);
  assertTransform(transform);

  const variant = {
    x: point.x * transform.scaleX + transform.offsetX,
    y: point.y * transform.scaleY + transform.offsetY,
  };

  assertFiniteResult(variant);
  return variant;
}
