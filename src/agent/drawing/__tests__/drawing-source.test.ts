import sharp from 'sharp';

import { prepareDrawingSource } from '../drawing-source';

describe('prepareDrawingSource', () => {
  it('measures and normalizes an image page from the actual pixels', async () => {
    const png = await sharp({
      create: {
        width: 120,
        height: 80,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    }).png().toBuffer();

    const source = await prepareDrawingSource({
      bytes: Uint8Array.from(png).buffer,
      mimeType: 'image/png',
      fileName: 'panel.png',
    });

    expect(source.formatClass).toBe('raster-image');
    expect(source.pages).toHaveLength(1);
    expect(source.pages[0]).toMatchObject({
      pageIndex: 0,
      width: 120,
      height: 80,
      renderMode: 'raster',
    });
    expect(source.pages[0].imageBuffer?.byteLength).toBeGreaterThan(0);
    expect(source.pages[0].quality.width).toBe(120);
    expect(source.pages[0].quality.height).toBe(80);
    expect(source.pages[0].renderHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
