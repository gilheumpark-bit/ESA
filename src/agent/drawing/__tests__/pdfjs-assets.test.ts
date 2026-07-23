import { pdfjsNodeDocumentOptions } from '../pdfjs-assets';

describe('pdfjsNodeDocumentOptions', () => {
  it('returns file URLs with a trailing slash on Windows and POSIX', () => {
    const options = pdfjsNodeDocumentOptions();

    for (const value of [options.cMapUrl, options.standardFontDataUrl, options.wasmUrl]) {
      expect(value).toMatch(/^file:\/\//);
      expect(value).toMatch(/\/$/);
      expect(value).not.toMatch(/\\/);
    }
  });
});
