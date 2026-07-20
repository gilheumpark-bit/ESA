import sharp from 'sharp';
import {
  toOriginalPoint,
  type EvidenceBounds,
  type ImageVariant,
  type PrecisionRegion,
} from './evidence-types';

const MAX_INPUT_PIXELS = 64_000_000;

function assertDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('도면 치수는 1 이상의 유한한 정수여야 합니다.');
  }
}

function assertGridSize(gridSize: number): asserts gridSize is 4 | 9 | 16 {
  if (gridSize !== 4 && gridSize !== 9 && gridSize !== 16) {
    throw new Error('정밀 영역 gridSize는 4, 9, 16 중 하나여야 합니다.');
  }
}

function assertOverlap(overlap: number): void {
  if (!Number.isFinite(overlap) || overlap < 0 || overlap > 0.25) {
    throw new Error('중첩 비율은 0~0.25의 유한한 수여야 합니다.');
  }
}

function assertBounds(bounds: EvidenceBounds, width: number, height: number): void {
  const values = [bounds.x, bounds.y, bounds.w, bounds.h];
  if (!values.every(Number.isSafeInteger) || bounds.x < 0 || bounds.y < 0 || bounds.w < 1 || bounds.h < 1) {
    throw new Error('정밀 영역 경계는 양의 정수 직사각형이어야 합니다.');
  }
  if (bounds.x + bounds.w > width || bounds.y + bounds.h > height) {
    throw new Error('정밀 영역 경계가 variant 이미지 밖으로 나갔습니다.');
  }
}

function toArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

export function planAdaptiveBounds(
  width: number,
  height: number,
  gridSize: 4 | 9 | 16,
  overlap: number,
): EvidenceBounds[] {
  assertDimensions(width, height);
  assertGridSize(gridSize);
  assertOverlap(overlap);

  const side = Math.sqrt(gridSize);
  const bounds: EvidenceBounds[] = [];
  for (let row = 0; row < side; row += 1) {
    const baseTop = Math.floor((row * height) / side);
    const baseBottom = Math.ceil(((row + 1) * height) / side);
    const padY = Math.ceil((baseBottom - baseTop) * overlap);
    for (let column = 0; column < side; column += 1) {
      const baseLeft = Math.floor((column * width) / side);
      const baseRight = Math.ceil(((column + 1) * width) / side);
      const padX = Math.ceil((baseRight - baseLeft) * overlap);
      const x = Math.max(0, baseLeft - padX);
      const y = Math.max(0, baseTop - padY);
      const right = Math.min(width, baseRight + padX);
      const bottom = Math.min(height, baseBottom + padY);
      const item = { x, y, w: right - x, h: bottom - y };
      assertBounds(item, width, height);
      bounds.push(item);
    }
  }

  return bounds;
}

export async function cropPrecisionRegions(
  variant: ImageVariant,
  bounds: readonly EvidenceBounds[],
): Promise<PrecisionRegion[]> {
  assertDimensions(variant.width, variant.height);
  if (variant.width * variant.height > MAX_INPUT_PIXELS) {
    throw new Error('정밀 crop 입력이 허용 픽셀 수를 초과합니다.');
  }
  for (const item of bounds) {
    assertBounds(item, variant.width, variant.height);
  }

  const source = Buffer.from(variant.buffer);
  const regions: PrecisionRegion[] = [];
  for (let index = 0; index < bounds.length; index += 1) {
    const item = bounds[index];
    const { data, info } = await sharp(source, {
      animated: false,
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .extract({ left: item.x, top: item.y, width: item.w, height: item.h })
      .png()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== item.w || info.height !== item.h || info.format !== 'png') {
      throw new Error('정밀 crop 출력 치수가 요청 경계와 일치하지 않습니다.');
    }

    const origin = toOriginalPoint({ x: item.x, y: item.y }, variant.transform);
    const end = toOriginalPoint({ x: item.x + item.w, y: item.y + item.h }, variant.transform);
    regions.push({
      id: `${variant.id}:region:${index}`,
      variantId: variant.id,
      variantBounds: { ...item },
      originalBounds: { x: origin.x, y: origin.y, w: end.x - origin.x, h: end.y - origin.y },
      buffer: toArrayBuffer(data),
    });
  }

  return regions;
}
