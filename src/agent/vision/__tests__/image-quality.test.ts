import sharp from 'sharp';
import { profileImage } from '../image-quality';

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

describe('image quality profiling', () => {
  it('flags a flat low-contrast page and recommends enlargement', async () => {
    const flat = await sharp({
      create: { width: 80, height: 60, channels: 3, background: '#888888' },
    }).png().toBuffer();

    const result = await profileImage(toArrayBuffer(flat));

    expect(result.lowContrast).toBe(true);
    expect(result.recommendedScale).toBe(4);
    expect(result.warnings).toContain('LOW_CONTRAST');
  });

  it('detects an edge-rich checker image', async () => {
    const pixels = Buffer.alloc(80 * 60, 0).map(
      (_, index) => ((index + Math.floor(index / 80)) % 2 ? 255 : 0),
    );
    const checker = await sharp(pixels, {
      raw: { width: 80, height: 60, channels: 1 },
    }).png().toBuffer();

    const result = await profileImage(toArrayBuffer(checker));

    expect(result.edgeDensity).toBeGreaterThan(0.5);
    expect(result.lowContrast).toBe(false);
  });

  it('distinguishes sparse crisp SLD lines from the same lines after optical blur', async () => {
    const width = 1000;
    const height = 1000;
    const crispPixels = Buffer.alloc(width * height, 255);
    for (const x of [250, 750]) {
      for (let y = 0; y < height; y += 1) {
        crispPixels[y * width + x] = 0;
      }
    }
    const crisp = await sharp(crispPixels, {
      raw: { width, height, channels: 1 },
    }).png().toBuffer();
    const blurred = await sharp(crisp).blur(3).png().toBuffer();

    const crispProfile = await profileImage(toArrayBuffer(crisp));
    const blurredProfile = await profileImage(toArrayBuffer(blurred));

    expect(crispProfile.edgeDensity).toBeLessThan(0.01);
    expect(crispProfile.blurry).toBe(false);
    expect(blurredProfile.blurry).toBe(true);
    expect(blurredProfile.gradientVariance).toBeLessThan(crispProfile.gradientVariance);
  });

  it('uses EXIF orientation when reporting image dimensions', async () => {
    const rotated = await sharp({
      create: { width: 20, height: 40, channels: 3, background: '#224466' },
    }).withMetadata({ orientation: 6 }).jpeg().toBuffer();

    const result = await profileImage(toArrayBuffer(rotated));

    expect(result.width).toBe(40);
    expect(result.height).toBe(20);
    expect(result.channels).toBe(3);
  });

  it('rejects empty and damaged input', async () => {
    await expect(profileImage(new ArrayBuffer(0))).rejects.toThrow('빈 도면 이미지는 분석할 수 없습니다.');
    await expect(profileImage(Uint8Array.from([1, 2, 3]).buffer)).rejects.toThrow();
  });

  it('returns finite metrics for a one-pixel image and bounds large-image profiling', async () => {
    const onePixel = await sharp({
      create: { width: 1, height: 1, channels: 3, background: '#111111' },
    }).png().toBuffer();
    const large = await sharp({
      create: { width: 4096, height: 2048, channels: 3, background: '#777777' },
    }).png().toBuffer();

    const tiny = await profileImage(toArrayBuffer(onePixel));
    const bounded = await profileImage(toArrayBuffer(large));

    expect([tiny.contrast, tiny.edgeDensity, tiny.gradientVariance]).toEqual(
      expect.arrayContaining([expect.any(Number)]),
    );
    expect([tiny.contrast, tiny.edgeDensity, tiny.gradientVariance].every(Number.isFinite)).toBe(true);
    expect([bounded.contrast, bounded.edgeDensity, bounded.gradientVariance].every(Number.isFinite)).toBe(true);
    expect(bounded.width).toBe(4096);
    expect(bounded.height).toBe(2048);
  });
});
