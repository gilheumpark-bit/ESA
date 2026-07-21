import sharp from 'sharp';

import { prepareDrawingSource } from '../drawing-source';

jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  OPS: {
    constructPath: 1,
    showText: 2,
    showSpacedText: 3,
    paintImageXObject: 4,
    paintInlineImageXObject: 5,
    paintImageMaskXObject: 6,
  },
  getDocument: jest.fn(() => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale }),
        getOperatorList: async () => ({ fnArray: [1], argsArray: [[]] }),
        getTextContent: async () => ({ items: [{ str: 'VCB-1' }] }),
        render: () => ({ promise: Promise.resolve() }),
        cleanup: jest.fn(),
      }),
    }),
    destroy: async () => undefined,
  })),
}));

function buildVectorPdf(pageCount: number): ArrayBuffer {
  const fontObject = 3 + pageCount * 2;
  const pageRefs = Array.from({ length: pageCount }, (_, index) => `${3 + index * 2} 0 R`).join(' ');
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageRefs}] /Count ${pageCount} >>`,
  ];
  for (let index = 0; index < pageCount; index += 1) {
    const contentRef = 4 + index * 2;
    const stream = `BT /F1 10 Tf 100 700 Td (VCB-${index + 1}) Tj ET\n100 100 m 400 700 l S\n`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentRef} 0 R /Resources << /Font << /F1 ${fontObject} 0 R >> >> >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Uint8Array.from(body, (character) => character.charCodeAt(0)).buffer;
}

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

  it('shares the pixel budget across every requested PDF page instead of dropping the tail', async () => {
    const maxPixels = 300_000;
    const source = await prepareDrawingSource({
      bytes: buildVectorPdf(3),
      mimeType: 'application/pdf',
      fileName: 'three-pages.pdf',
      requestedPages: 'all',
      budget: { maxPages: 3, maxPixels, deadlineMs: 60_000 },
    });

    expect(source.pages).toHaveLength(3);
    expect(source.pages.every((page) => page.preparationError === undefined)).toBe(true);
    expect(source.pages.reduce((sum, page) => sum + page.width * page.height, 0)).toBeLessThanOrEqual(maxPixels);
  });
});
