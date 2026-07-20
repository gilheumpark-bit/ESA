import {
  createDrawingSnapshot,
  toOriginalPoint,
  toVariantPoint,
} from '../evidence-types';

describe('evidence types', () => {
  it('round-trips variant coordinates through the source transform', () => {
    const transform = { scaleX: 4, scaleY: 4, offsetX: 0, offsetY: 0 };
    const original = toOriginalPoint({ x: 400, y: 200 }, transform);

    expect(original).toEqual({ x: 100, y: 50 });
    expect(toVariantPoint(original, transform)).toEqual({ x: 400, y: 200 });
  });

  it('creates a stable source hash and carries the measured quality profile', () => {
    const profile = {
      width: 100,
      height: 80,
      channels: 3,
      contrast: 0.5,
      edgeDensity: 0.2,
      gradientVariance: 10,
      lowContrast: false,
      blurry: false,
      recommendedScale: 2 as const,
      warnings: [],
    };
    const first = createDrawingSnapshot(
      Uint8Array.from([1, 2, 3]).buffer,
      'image/png',
      profile,
    );
    const second = createDrawingSnapshot(
      Uint8Array.from([1, 2, 3]).buffer,
      'image/png',
      profile,
    );

    expect(first.drawingHash).toBe(second.drawingHash);
    expect(first.quality).toEqual(profile);
  });
});
