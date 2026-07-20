import sharp from 'sharp';
import type { ImageQualityProfile } from '../evidence-types';
import { createImageVariants } from '../image-variants';
import { profileImage } from '../image-quality';

jest.setTimeout(30_000);

function toArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

function profileFor(width: number, height: number): ImageQualityProfile {
  return {
    width,
    height,
    channels: 3,
    contrast: 0.5,
    edgeDensity: 0.2,
    gradientVariance: 10,
    lowContrast: false,
    blurry: false,
    recommendedScale: 2,
    warnings: [],
  };
}

describe('image variants', () => {
  it('creates source-linked original, scale, text, and line variants', async () => {
    const input = await sharp({
      create: {
        width: 100,
        height: 80,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();
    const buffer = toArrayBuffer(input);
    const variants = await createImageVariants(buffer, await profileImage(buffer));

    expect(variants.map((item) => item.kind)).toEqual([
      'original',
      'upscale-2x',
      'upscale-4x',
      'text-high-contrast',
      'line-enhanced',
    ]);
    expect(variants.map((item) => [item.width, item.height])).toEqual([
      [100, 80],
      [200, 160],
      [400, 320],
      [400, 320],
      [200, 160],
    ]);
    expect(variants.map((item) => item.transform)).toEqual([
      { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 },
      { scaleX: 2, scaleY: 2, offsetX: 0, offsetY: 0 },
      { scaleX: 4, scaleY: 4, offsetX: 0, offsetY: 0 },
      { scaleX: 4, scaleY: 4, offsetX: 0, offsetY: 0 },
      { scaleX: 2, scaleY: 2, offsetX: 0, offsetY: 0 },
    ]);

    const outputDimensions = await Promise.all(
      variants.map(async (variant) => {
        const metadata = await sharp(Buffer.from(variant.buffer)).metadata();
        return [metadata.width, metadata.height];
      }),
    );

    expect(outputDimensions).toEqual(
      variants.map((variant) => [variant.width, variant.height]),
    );
  });

  it('normalizes EXIF orientation before fixing variant dimensions and transforms', async () => {
    const input = await sharp({
      create: {
        width: 100,
        height: 80,
        channels: 3,
        background: '#ffffff',
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const buffer = toArrayBuffer(input);
    const variants = await createImageVariants(buffer, await profileImage(buffer));
    const original = variants[0];
    const twice = variants[1];

    expect([original.width, original.height]).toEqual([80, 100]);
    expect(original.transform).toEqual({
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
    });
    expect([twice.width, twice.height]).toEqual([160, 200]);
    expect(twice.transform).toEqual({
      scaleX: 2,
      scaleY: 2,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it('rejects empty and corrupted source bytes', async () => {
    await expect(
      createImageVariants(new ArrayBuffer(0), profileFor(1, 1)),
    ).rejects.toThrow('빈 도면 이미지는 분석할 수 없습니다.');
    await expect(
      createImageVariants(
        Uint8Array.from([1, 2, 3]).buffer,
        profileFor(1, 1),
      ),
    ).rejects.toThrow();
  });

  it('bounds non-integer 4x scaling by the 64M-pixel limit', async () => {
    const input = await sharp({
      create: {
        width: 2049,
        height: 2049,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();
    const variants = await createImageVariants(
      toArrayBuffer(input),
      profileFor(2049, 2049),
    );
    const fourTimes = variants.find((variant) => variant.kind === 'upscale-4x');

    expect(fourTimes).toBeDefined();
    expect(fourTimes?.width).toBe(8000);
    expect(fourTimes?.height).toBe(8000);
    expect((fourTimes?.width ?? 0) * (fourTimes?.height ?? 0)).toBeLessThanOrEqual(
      64_000_000,
    );
    expect(fourTimes?.transform.scaleX).not.toBe(4);
  });
});
