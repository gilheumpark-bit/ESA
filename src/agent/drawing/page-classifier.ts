import type { DocumentInventory, DocumentInventoryPage } from './types-v3';
import { createHash } from 'node:crypto';

export interface ClassifyDocumentInput {
  bytes: ArrayBuffer;
  mimeType: string;
  fileName?: string;
  requestedPages?: 'all' | number[];
  /** Optional page dimensions when known (PDF render / image size) */
  pageHints?: Array<{ width: number; height: number; hasVectorOps?: boolean; isRasterOnly?: boolean }>;
}

export function classifyDocument(input: ClassifyDocumentInput): DocumentInventory {
  const drawingHash = createHash('sha256').update(Buffer.from(input.bytes)).digest('hex');
  const mime = input.mimeType.toLowerCase();
  const name = (input.fileName ?? '').toLowerCase();

  if (mime.includes('dxf') || name.endsWith('.dxf')) {
    return {
      drawingHash,
      mimeType: input.mimeType,
      formatClass: 'dxf',
      pages: [{ pageIndex: 0, width: 0, height: 0, renderMode: 'vector', drawingKind: 'sld' }],
      requestedPagePolicy: 'all',
    };
  }

  if (mime.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(name)) {
    const hint = input.pageHints?.[0];
    return {
      drawingHash,
      mimeType: input.mimeType,
      formatClass: 'raster-image',
      pages: [{
        pageIndex: 0,
        width: hint?.width ?? 0,
        height: hint?.height ?? 0,
        renderMode: 'raster',
        drawingKind: 'sld',
      }],
      requestedPagePolicy: 'all',
    };
  }

  // PDF
  const pageCount = Math.max(1, input.pageHints?.length ?? detectPdfPageCount(input.bytes) ?? 1);
  const pages: DocumentInventoryPage[] = [];
  for (let i = 0; i < pageCount; i++) {
    const hint = input.pageHints?.[i];
    let renderMode: DocumentInventoryPage['renderMode'] = 'hybrid';
    if (hint?.isRasterOnly) renderMode = 'raster';
    else if (hint?.hasVectorOps) renderMode = 'vector';
    pages.push({
      pageIndex: i,
      width: hint?.width ?? 0,
      height: hint?.height ?? 0,
      renderMode,
      drawingKind: 'unknown',
    });
  }

  const modes = new Set(pages.map((p) => p.renderMode));
  let formatClass: DocumentInventory['formatClass'] = 'mixed-pdf';
  if (modes.size === 1 && modes.has('vector')) formatClass = 'vector-pdf';
  if (modes.size === 1 && modes.has('raster')) formatClass = 'raster-pdf';

  const requestedPagePolicy =
    input.requestedPages === undefined || input.requestedPages === 'all'
      ? 'all'
      : { pages: input.requestedPages };

  return {
    drawingHash,
    mimeType: input.mimeType,
    formatClass,
    pages,
    requestedPagePolicy,
  };
}

export function resolveRequestedPages(inventory: DocumentInventory): number[] {
  if (inventory.requestedPagePolicy === 'all') {
    return inventory.pages.map((p) => p.pageIndex);
  }
  const allowed = new Set(inventory.pages.map((p) => p.pageIndex));
  return inventory.requestedPagePolicy.pages.filter((p) => allowed.has(p));
}

export function surveyPageKind(input: {
  textSample?: string;
  vectorOpCount?: number;
  rasterCoverage?: number;
}): DocumentInventoryPage['drawingKind'] {
  const text = (input.textSample ?? '').toUpperCase();
  if (!text.trim() && (input.vectorOpCount ?? 0) === 0 && (input.rasterCoverage ?? 0) < 0.05) {
    return 'empty';
  }
  if (/LEGEND|범례|SYMBOL/.test(text)) return 'legend';
  if (/TITLE|표제|DRAWING NO|도면번호/.test(text) && (input.vectorOpCount ?? 0) < 30) return 'title';
  if (/SEQUENCE|시퀀스|PLC/.test(text)) return 'sequence';
  if (/LAYOUT|평면도|FLOOR/.test(text)) return 'layout';
  if (/SLD|단선|SINGLE.?LINE|VCB|TR-|BUS/.test(text) || (input.vectorOpCount ?? 0) > 40) return 'sld';
  return 'unknown';
}

function detectPdfPageCount(bytes: ArrayBuffer): number | null {
  try {
    const text = Buffer.from(bytes).toString('latin1');
    const matches = text.match(/\/Type\s*\/Page[^s]/g);
    if (matches && matches.length > 0) return matches.length;
    const countMatch = text.match(/\/Count\s+(\d+)/);
    if (countMatch) return Math.max(1, Number(countMatch[1]));
  } catch {
    /* ignore */
  }
  return null;
}
