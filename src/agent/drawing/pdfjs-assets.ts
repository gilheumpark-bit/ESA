import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

function assetDirectoryUrl(directory: string): string {
  return pathToFileURL(`${directory}${sep}`).href;
}

/** Server-side pdf.js binary assets. NodeBinaryDataFactory reads these paths directly. */
export function pdfjsNodeDocumentOptions(): {
  cMapUrl: string;
  cMapPacked: true;
  standardFontDataUrl: string;
  wasmUrl: string;
  useSystemFonts: true;
} {
  return {
    cMapUrl: assetDirectoryUrl(join(/* turbopackIgnore: true */ process.cwd(), 'node_modules', 'pdfjs-dist', 'cmaps')),
    cMapPacked: true,
    standardFontDataUrl: assetDirectoryUrl(join(/* turbopackIgnore: true */ process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts')),
    wasmUrl: assetDirectoryUrl(join(/* turbopackIgnore: true */ process.cwd(), 'node_modules', 'pdfjs-dist', 'wasm')),
    useSystemFonts: true,
  };
}
