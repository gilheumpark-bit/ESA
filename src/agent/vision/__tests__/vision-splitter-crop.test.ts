import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  cropImageIntoRegions,
  mergeVisionSplitResults,
  preparePrecisionRegions,
  type VisionSplitResult,
} from '../vision-splitter';

function quadrantImage(width: number, height: number): Buffer {
  const pixels = Buffer.alloc(width * height * 3);
  const colors = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const quadrant = (y >= height / 2 ? 2 : 0) + (x >= width / 2 ? 1 : 0);
      const offset = (y * width + x) * 3;
      const color = colors[quadrant];
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
    }
  }
  return pixels;
}

describe('vision image splitting', () => {
  it('creates real cropped region buffers instead of repeating the source image', async () => {
    const width = 100;
    const height = 80;
    const png = await sharp(quadrantImage(width, height), {
      raw: { width, height, channels: 3 },
    }).png().toBuffer();

    const regions = await cropImageIntoRegions(
      Uint8Array.from(png).buffer,
      { gridSize: 4, overlap: 0, model: 'gemini' },
    );

    expect(regions).toHaveLength(4);
    expect(regions.map((region) => region.bounds)).toEqual([
      { x: 0, y: 0, w: 50, h: 40 },
      { x: 50, y: 0, w: 50, h: 40 },
      { x: 0, y: 40, w: 50, h: 40 },
      { x: 50, y: 40, w: 50, h: 40 },
    ]);

    const hashes = await Promise.all(regions.map(async (region) => {
      const metadata = await sharp(Buffer.from(region.buffer)).metadata();
      expect(metadata).toMatchObject({ width: 50, height: 40, format: 'png' });
      return createHash('sha256').update(Buffer.from(region.buffer)).digest('hex');
    }));
    expect(new Set(hashes).size).toBe(4);
  });

  it('merges overlap duplicates and rewrites connections to canonical IDs', () => {
    const results: VisionSplitResult[] = [
      {
        regionIndex: 0,
        regionBounds: { x: 0, y: 0, w: 60, h: 50 },
        components: [
          { id: 'r0-a', type: 'breaker', label: 'CB-1', position: { x: 49, y: 20 }, confidence: 0.8 },
          { id: 'r0-load', type: 'load', label: 'LOAD', position: { x: 20, y: 20 }, confidence: 0.9 },
        ],
        connections: [{ from: 'r0-a', to: 'r0-load' }],
        texts: [],
        regionConfidence: 0.8,
      },
      {
        regionIndex: 1,
        regionBounds: { x: 40, y: 0, w: 60, h: 50 },
        components: [
          { id: 'r1-a', type: 'breaker', label: 'CB-1', position: { x: 51, y: 20 }, confidence: 0.95 },
          { id: 'r1-panel', type: 'panel', label: 'P-1', position: { x: 80, y: 20 }, confidence: 0.9 },
        ],
        connections: [{ from: 'r1-a', to: 'r1-panel' }],
        texts: [],
        regionConfidence: 0.9,
      },
    ];

    const merged = mergeVisionSplitResults(results, 5);
    expect(merged.components.filter((component) => component.type === 'breaker')).toHaveLength(1);
    expect(merged.connections).toHaveLength(2);
    const ids = new Set(merged.components.map((component) => component.id));
    for (const connection of merged.connections) {
      expect(ids.has(connection.from)).toBe(true);
      expect(ids.has(connection.to)).toBe(true);
    }
  });

  it('prepares selected precision variants without sending them to a VLM', async () => {
    const png = await sharp({
      create: { width: 100, height: 80, channels: 3, background: '#888888' },
    }).png().toBuffer();

    const prepared = await preparePrecisionRegions(Uint8Array.from(png).buffer);

    expect(prepared.profile.recommendedScale).toBe(4);
    expect(prepared.variants.map((variant) => variant.kind)).toEqual([
      'original',
      'upscale-2x',
      'upscale-4x',
      'text-high-contrast',
      'line-enhanced',
    ]);
    expect(prepared.regions).toHaveLength(48);
    expect(new Set(prepared.regions.map((region) => region.variantId))).toEqual(
      new Set(['variant:upscale-4x', 'variant:text-high-contrast', 'variant:line-enhanced']),
    );
  });
});
