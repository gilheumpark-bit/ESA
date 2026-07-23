import sharp from 'sharp';

import { annotatePrecisionRegion } from '../annotated-region-renderer';
import type { BoundaryContinuation } from '../continuity-types';
import type { PrecisionRegion } from '../evidence-types';

function arrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

describe('annotated precision region renderer', () => {
  it('adds A/C boundary marks without changing image size or a protected center symbol pixel', async () => {
    const source = await sharp({
      create: { width: 200, height: 120, channels: 3, background: '#ffffff' },
    })
      .composite([{ input: Buffer.from('<svg width="20" height="20"><rect width="20" height="20" fill="#000000"/></svg>'), left: 90, top: 50 }])
      .png()
      .toBuffer();
    const region: PrecisionRegion = {
      id: 'variant:region:0',
      displayId: 'P01-A01',
      variantId: 'variant',
      variantBounds: { x: 0, y: 0, w: 200, h: 120 },
      logicalVariantBounds: { x: 20, y: 20, w: 160, h: 80 },
      originalBounds: { x: 0, y: 0, w: 200, h: 120 },
      logicalOriginalBounds: { x: 20, y: 20, w: 160, h: 80 },
      buffer: arrayBuffer(source),
    };
    const port: BoundaryContinuation = {
      id: 'c1',
      displayId: 'P01-C001',
      pageIndex: 0,
      point: { x: 20, y: 60 },
      seams: [{ orientation: 'vertical', index: 1 }],
      tangent: { x: 1, y: 0 },
      lineKind: 'power',
      sourceLineId: 'line-1',
      source: 'global-vision',
      status: 'planned',
      observations: [{
        regionId: 'p0-a1',
        regionDisplayId: 'P01-A01',
        side: 'left',
        point: { x: 20, y: 60 },
        tangent: { x: 1, y: 0 },
        confidence: 0.95,
      }],
    };

    const annotated = await annotatePrecisionRegion(region, [port]);
    const before = await sharp(source).raw().toBuffer({ resolveWithObject: true });
    const after = await sharp(Buffer.from(annotated.buffer)).raw().toBuffer({ resolveWithObject: true });
    const pixel = (data: Buffer, x: number, y: number) => {
      const offset = (y * 200 + x) * after.info.channels;
      return [...data.subarray(offset, offset + 3)];
    };

    expect(after.info).toMatchObject({ width: 200, height: 120 });
    expect(pixel(after.data, 100, 60)).toEqual(pixel(before.data, 100, 60));
    expect(pixel(after.data, 24, 60)).not.toEqual([255, 255, 255]);
    expect(Buffer.compare(source, Buffer.from(annotated.buffer))).not.toBe(0);
  });
});
