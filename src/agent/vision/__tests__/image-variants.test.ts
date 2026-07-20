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

  it('uses fill resizing to preserve capped non-square source edges and transforms', async () => {
    const sourceWidth = 2049;
    const sourceHeight = 2000;
    const input = await sharp(Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${sourceWidth}" height="${sourceHeight}">
        <rect width="100%" height="100%" fill="#000000" />
        <rect x="0" y="0" width="32" height="32" fill="#ff0000" />
        <rect x="2017" y="0" width="32" height="32" fill="#00ff00" />
        <rect x="0" y="1968" width="32" height="32" fill="#0000ff" />
        <rect x="2017" y="1968" width="32" height="32" fill="#ffff00" />
        <rect x="0" y="984" width="32" height="32" fill="#ff00ff" />
      </svg>
    `))
      .png()
      .toBuffer();
    const variants = await createImageVariants(
      toArrayBuffer(input),
      profileFor(sourceWidth, sourceHeight),
    );
    const fourTimes = variants.find((variant) => variant.kind === 'upscale-4x');

    expect(fourTimes).toBeDefined();
    if (!fourTimes) {
      throw new Error('upscale-4x variant is required');
    }

    const actualMetadata = await sharp(Buffer.from(fourTimes.buffer)).metadata();
    expect([actualMetadata.width, actualMetadata.height]).toEqual([
      fourTimes.width,
      fourTimes.height,
    ]);
    expect(fourTimes.transform.scaleX).toBeCloseTo(
      fourTimes.width / sourceWidth,
    );
    expect(fourTimes.transform.scaleY).toBeCloseTo(
      fourTimes.height / sourceHeight,
    );
    expect(fourTimes.transform.offsetX).toBe(0);
    expect(fourTimes.transform.offsetY).toBe(0);
    expect((fourTimes?.width ?? 0) * (fourTimes?.height ?? 0)).toBeLessThanOrEqual(
      64_000_000,
    );
    expect(fourTimes.transform.scaleX).not.toBe(4);

    const samplePixel = async (left: number, top: number): Promise<Buffer> =>
      (await sharp(Buffer.from(fourTimes.buffer))
        .extract({ left, top, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true })).data;
    const expectedPixel = async (left: number, top: number): Promise<Buffer> =>
      (await sharp(input)
        .rotate()
        .resize({
          width: fourTimes.width,
          height: fourTimes.height,
          fit: 'fill',
          kernel: sharp.kernel.lanczos3,
        })
        .extract({ left, top, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true })).data;
    const samples = [
      [
        Math.floor(16 * fourTimes.transform.scaleX),
        Math.floor(16 * fourTimes.transform.scaleY),
      ],
      [
        Math.floor((sourceWidth - 16) * fourTimes.transform.scaleX),
        Math.floor((sourceHeight - 16) * fourTimes.transform.scaleY),
      ],
      [
        Math.floor(16 * fourTimes.transform.scaleX),
        Math.floor(984 * fourTimes.transform.scaleY),
      ],
    ] as const;
    const renderedSamples: Array<{ actual: Buffer; expected: Buffer }> = [];
    for (const [left, top] of samples) {
      renderedSamples.push({
        actual: await samplePixel(left, top),
        expected: await expectedPixel(left, top),
      });
    }
    const [topLeft, bottomRight, leftEdge] = renderedSamples;

    expect(topLeft.actual).toEqual(topLeft.expected);
    expect(bottomRight.actual).toEqual(bottomRight.expected);
    expect(leftEdge.actual).toEqual(leftEdge.expected);

    expect(topLeft.actual[0]).toBeGreaterThan(200);
    expect(bottomRight.actual[0]).toBeGreaterThan(200);
    expect(bottomRight.actual[1]).toBeGreaterThan(200);
    expect(leftEdge.actual[0]).toBeGreaterThan(80);
    expect(leftEdge.actual[2]).toBeGreaterThan(80);
  });

  it('rejects profiles that do not describe the oriented source or valid quality shape', async () => {
    const input = await sharp({
      create: {
        width: 128,
        height: 96,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();
    const buffer = toArrayBuffer(input);

    await expect(
      createImageVariants(buffer, profileFor(999, 777)),
    ).rejects.toThrow('품질 프로필 치수가 방향 정규화된 원본과 일치하지 않습니다.');
    await expect(
      createImageVariants(buffer, {
        ...profileFor(128, 96),
        recommendedScale: 3,
      } as unknown as ImageQualityProfile),
    ).rejects.toThrow('품질 프로필 recommendedScale 값이 올바르지 않습니다.');
  });
});
