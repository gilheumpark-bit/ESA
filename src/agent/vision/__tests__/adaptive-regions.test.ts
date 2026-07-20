import sharp from 'sharp';
import { cropPrecisionRegions, planAdaptiveBounds } from '../adaptive-regions';
import type { ImageVariant } from '../evidence-types';

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

describe('adaptive precision regions', () => {
  it('covers the source bounds with integer overlapping regions', () => {
    const bounds = planAdaptiveBounds(1200, 800, 4, 0.18);

    expect(bounds).toHaveLength(4);
    expect(bounds[0]).toMatchObject({ x: 0, y: 0 });
    expect(bounds.some((item) => item.x + item.w === 1200 && item.y + item.h === 800)).toBe(true);
    expect(bounds[0].x + bounds[0].w).toBeGreaterThan(bounds[1].x);
    for (const item of bounds) {
      expect(Number.isInteger(item.x) && Number.isInteger(item.y)).toBe(true);
      expect(Number.isInteger(item.w) && Number.isInteger(item.h)).toBe(true);
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.w).toBeGreaterThan(0);
      expect(item.h).toBeGreaterThan(0);
      expect(item.x + item.w).toBeLessThanOrEqual(1200);
      expect(item.y + item.h).toBeLessThanOrEqual(800);
    }
  });

  it('rejects invalid source dimensions, grid sizes, and overlap', () => {
    expect(() => planAdaptiveBounds(0, 100, 4, 0)).toThrow();
    expect(() => planAdaptiveBounds(100, Number.NaN, 4, 0)).toThrow();
    expect(() => planAdaptiveBounds(100, 100, 8 as 4, 0)).toThrow();
    expect(() => planAdaptiveBounds(100, 100, 4, Number.POSITIVE_INFINITY)).toThrow();
    expect(() => planAdaptiveBounds(100, 100, 4, 0.26)).toThrow();
  });

  it('creates exact PNG crops and maps region bounds back to the original image', async () => {
    const png = await sharp({
      create: { width: 100, height: 60, channels: 3, background: '#336699' },
    }).png().toBuffer();
    const variant: ImageVariant = {
      id: 'variant:upscale-2x',
      kind: 'upscale-2x',
      buffer: toArrayBuffer(png),
      width: 100,
      height: 60,
      transform: { scaleX: 2, scaleY: 2, offsetX: 4, offsetY: 6 },
    };
    const bounds = [{ x: 14, y: 16, w: 30, h: 20 }];

    const [region] = await cropPrecisionRegions(variant, bounds);
    const metadata = await sharp(Buffer.from(region.buffer)).metadata();

    expect(metadata).toMatchObject({ width: 30, height: 20, format: 'png' });
    expect(region).toMatchObject({
      id: 'variant:upscale-2x:region:0',
      variantId: 'variant:upscale-2x',
      variantBounds: bounds[0],
      originalBounds: { x: 5, y: 5, w: 15, h: 10 },
    });
    await expect(cropPrecisionRegions(variant, [{ x: 90, y: 50, w: 20, h: 20 }])).rejects.toThrow();
  });
});
