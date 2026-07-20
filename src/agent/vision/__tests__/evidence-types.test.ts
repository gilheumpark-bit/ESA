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

  it('hashes only the logical bytes of ArrayBuffer views', () => {
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
    const source = Uint8Array.from([1, 2, 3, 4, 5, 6]).buffer;
    const firstView = new DataView(source, 0, 3);
    const secondView = new DataView(source, 3, 3);
    const pooled = Buffer.allocUnsafe(6);

    pooled.set([7, 8, 9, 10, 11, 12]);

    expect(
      createDrawingSnapshot(firstView, 'image/png', profile).drawingHash,
    ).not.toBe(createDrawingSnapshot(secondView, 'image/png', profile).drawingHash);
    expect(
      createDrawingSnapshot(pooled.subarray(0, 3), 'image/png', profile)
        .drawingHash,
    ).not.toBe(
      createDrawingSnapshot(pooled.subarray(3, 6), 'image/png', profile)
        .drawingHash,
    );
  });

  it('round-trips finite anisotropic transforms with non-zero offsets', () => {
    const transform = { scaleX: 2.5, scaleY: 4, offsetX: -13, offsetY: 7 };
    const original = { x: 100, y: 50 };

    const variant = toVariantPoint(original, transform);

    expect(variant).toEqual({ x: 237, y: 207 });
    expect(toOriginalPoint(variant, transform)).toEqual(original);
  });

  it('rejects non-finite points and transform components', () => {
    const validTransform = { scaleX: 2, scaleY: 3, offsetX: 4, offsetY: 5 };

    for (const value of [NaN, Infinity, -Infinity]) {
      expect(() =>
        toVariantPoint({ x: value, y: 1 }, validTransform),
      ).toThrow();
      expect(() =>
        toOriginalPoint({ x: 1, y: value }, validTransform),
      ).toThrow();
      expect(() =>
        toVariantPoint({ x: 1, y: 1 }, { ...validTransform, scaleX: value }),
      ).toThrow();
      expect(() =>
        toOriginalPoint({ x: 1, y: 1 }, { ...validTransform, scaleY: value }),
      ).toThrow();
      expect(() =>
        toVariantPoint({ x: 1, y: 1 }, { ...validTransform, offsetX: value }),
      ).toThrow();
      expect(() =>
        toOriginalPoint({ x: 1, y: 1 }, { ...validTransform, offsetY: value }),
      ).toThrow();
    }
  });

  it('copies quality data so later caller mutations cannot alter a snapshot', () => {
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
      warnings: ['initial warning'],
    };
    const snapshot = createDrawingSnapshot(
      Uint8Array.from([1, 2, 3]).buffer,
      'image/png',
      profile,
    );

    profile.width = 999;
    profile.warnings.push('later warning');

    expect(snapshot.quality).not.toBe(profile);
    expect(snapshot.quality.width).toBe(100);
    expect(snapshot.quality.warnings).toEqual(['initial warning']);
    expect(snapshot.quality.warnings).not.toBe(profile.warnings);
  });
});
