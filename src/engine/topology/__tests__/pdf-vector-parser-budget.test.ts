import { parsePdfToSLD } from '../pdf-vector-parser';

const cleanup = jest.fn();
const destroy = jest.fn(async () => undefined);

jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  OPS: { constructPath: 91 },
  getDocument: jest.fn(() => ({
    destroy,
    promise: Promise.resolve({
      getPage: async () => ({
        getViewport: () => ({ width: 100, height: 100 }),
        getTextContent: async () => ({
          items: [{ str: 'VCB-1', transform: [1, 0, 0, 1, 10, 10] }],
        }),
        getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
        cleanup,
      }),
    }),
  })),
}));

describe('PDF vector parser work budget', () => {
  beforeEach(() => {
    cleanup.mockClear();
    destroy.mockClear();
  });

  test('stops before semantic cross-products when the text budget is exceeded', async () => {
    const result = await parsePdfToSLD(
      new Uint8Array([1, 2, 3]).buffer,
      { pageNumber: 1, maxTextItems: 0 },
    );

    expect(result.confidence).toBe(0);
    expect(result.components).toHaveLength(0);
    expect(result.connections).toHaveLength(0);
    expect(result.rawDescription).toContain('PDF_RESOURCE_LIMIT');
    expect(cleanup).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  test('cancels the pdf.js loading boundary when the caller is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await parsePdfToSLD(
      new Uint8Array([1, 2, 3]).buffer,
      { pageNumber: 1, signal: controller.signal },
    );

    expect(result.confidence).toBe(0);
    expect(result.rawDescription).toContain('PDF_PARSE_CANCELLED');
    expect(destroy).toHaveBeenCalled();
  });
});
