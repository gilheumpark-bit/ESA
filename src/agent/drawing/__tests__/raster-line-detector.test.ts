import sharp from 'sharp';

import { detectRasterLineHits } from '../raster-line-detector';

describe('deterministic raster conductor fallback', () => {
  it('keeps a conductor network but removes strokes wholly inside equipment bounds', async () => {
    const svg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
        <rect width="200" height="200" fill="white"/>
        <path d="M100 20 V180 M40 100 H160 M40 100 V150 M160 100 V150"
          stroke="#006b35" stroke-width="2" fill="none"/>
        <rect x="10" y="10" width="30" height="30" fill="none" stroke="black" stroke-width="2"/>
      </svg>`);
    const png = await sharp(svg).png().toBuffer();

    const lines = await detectRasterLineHits(
      Uint8Array.from(png).buffer,
      0,
      [{ x: 8, y: 8, w: 34, h: 34 }],
    );

    expect(lines.some((line) => line.path[0].x === line.path[1].x && line.path[0].x >= 98 && line.path[0].x <= 102)).toBe(true);
    expect(lines.some((line) => line.path[0].y === line.path[1].y && line.path[0].y >= 98 && line.path[0].y <= 102)).toBe(true);
    expect(lines.some((line) => line.path.every((point) => point.x >= 8 && point.x <= 42 && point.y >= 8 && point.y <= 42))).toBe(false);
    expect(lines.every((line) => line.certainty === 'ambiguous' && line.regionId === 'raster-line-detector-v1')).toBe(true);
  });

  it('does not turn isolated text-like dashes into conductors', async () => {
    const svg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
        <rect width="200" height="100" fill="white"/>
        <path d="M10 20 H25 M40 20 H55 M70 20 H85" stroke="black" stroke-width="2"/>
      </svg>`);
    const png = await sharp(svg).png().toBuffer();

    await expect(detectRasterLineHits(Uint8Array.from(png).buffer, 0, [])).resolves.toEqual([]);
  });

  it('removes a mostly internal equipment stroke while preserving an external feeder', async () => {
    const svg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="240" height="140">
        <rect width="240" height="140" fill="white"/>
        <path d="M20 70 H220 M80 30 V110" stroke="black" stroke-width="2"/>
      </svg>`);
    const png = await sharp(svg).png().toBuffer();

    const lines = await detectRasterLineHits(
      Uint8Array.from(png).buffer,
      0,
      [{ x: 70, y: 20, w: 30, h: 100 }],
    );

    expect(lines.some((line) => line.path[0].y === line.path[1].y)).toBe(true);
    expect(lines.some((line) => line.path[0].x === line.path[1].x)).toBe(false);
  });
});
