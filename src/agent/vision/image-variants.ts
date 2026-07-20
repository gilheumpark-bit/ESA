/**
 * Non-generative image variants via sharp (Lanczos, contrast, sharpen).
 */

import type { ImageVariant, ImageVariantKind } from './evidence-types';
import { identityTransform, scaleTransform } from './evidence-types';

const MAX_INPUT_PIXELS = 40_000_000;

export async function buildImageVariants(
  imageBuffer: ArrayBuffer,
  kinds: ImageVariantKind[] = [
    'original',
    'lanczos-2x',
    'lanczos-4x',
    'text-high-contrast',
    'line-sharpen',
  ],
): Promise<ImageVariant[]> {
  if (imageBuffer.byteLength === 0) throw new Error('빈 도면 이미지는 변형할 수 없습니다.');
  const sharp = (await import('sharp')).default;
  const source = Buffer.from(imageBuffer);
  const base = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
    .rotate()
    .png()
    .toBuffer({ resolveWithObject: true });

  const width = base.info.width;
  const height = base.info.height;
  if (!width || !height) throw new Error('이미지 크기를 읽을 수 없습니다.');
  if (width * height > MAX_INPUT_PIXELS) {
    throw new Error('도면 이미지 해상도가 허용 범위를 초과합니다.');
  }

  const variants: ImageVariant[] = [];
  for (const kind of kinds) {
    variants.push(await makeVariant(sharp, base.data, width, height, kind));
  }
  return variants;
}

async function makeVariant(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sharp: any,
  data: Buffer,
  width: number,
  height: number,
  kind: ImageVariantKind,
): Promise<ImageVariant> {
  let pipeline = sharp(data, { limitInputPixels: MAX_INPUT_PIXELS });
  let transform = identityTransform();
  let outW = width;
  let outH = height;

  if (kind === 'lanczos-2x') {
    outW = width * 2;
    outH = height * 2;
    pipeline = pipeline.resize(outW, outH, { kernel: 'lanczos3' });
    transform = scaleTransform(2);
  } else if (kind === 'lanczos-4x') {
    outW = width * 4;
    outH = height * 4;
    pipeline = pipeline.resize(outW, outH, { kernel: 'lanczos3' });
    transform = scaleTransform(4);
  } else if (kind === 'text-high-contrast') {
    pipeline = pipeline.greyscale().normalize().linear(1.35, -20);
  } else if (kind === 'line-sharpen') {
    pipeline = pipeline.greyscale().sharpen({ sigma: 1.2 });
  }

  const buf = await pipeline.png().toBuffer();
  return {
    variantId: kind,
    kind,
    buffer: Uint8Array.from(buf).buffer,
    width: outW,
    height: outH,
    transform,
  };
}
