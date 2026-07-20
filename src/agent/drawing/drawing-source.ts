import { createHash } from 'node:crypto';

import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';

import { createImageVariants } from '../vision/image-variants';
import { profileImage } from '../vision/image-quality';
import type { ImageQualityProfile } from '../vision/evidence-types';

export type PreparedFormatClass =
  | 'raster-image'
  | 'vector-pdf'
  | 'raster-pdf'
  | 'mixed-pdf'
  | 'dxf';

export type PreparedRenderMode = 'vector' | 'raster' | 'hybrid';

export interface PreparedDrawingPage {
  pageIndex: number;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  renderScale: number;
  renderMode: PreparedRenderMode;
  textSample: string;
  vectorOpCount: number;
  rasterOpCount: number;
  imageBuffer?: ArrayBuffer;
  renderHash: string;
  quality: ImageQualityProfile;
  preparationError?: 'PARTIAL_BUDGET_EXCEEDED' | 'CANCELLED';
}

export interface PreparedDrawingSource {
  documentHash: string;
  mimeType: string;
  formatClass: PreparedFormatClass;
  pages: PreparedDrawingPage[];
  totalPageCount?: number;
}

export interface PrepareDrawingSourceInput {
  bytes: ArrayBuffer;
  mimeType: string;
  fileName?: string;
  requestedPages?: number[] | 'all';
  budget?: { maxPages: number; maxPixels: number; deadlineMs: number };
  signal?: AbortSignal;
  shouldCancel?: () => boolean;
}

const MAX_PDF_PAGES = 500;
const MAX_RENDER_SIDE = 2_400;
const MAX_RENDER_PIXELS = 20_000_000;

function sha256(...parts: Array<ArrayBuffer | string>): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(typeof part === 'string' ? part : Buffer.from(part));
  }
  return hash.digest('hex');
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer;
}

function isDxf(input: PrepareDrawingSourceInput): boolean {
  return input.mimeType.toLowerCase().includes('dxf')
    || (input.fileName ?? '').toLowerCase().endsWith('.dxf');
}

function isPdf(input: PrepareDrawingSourceInput): boolean {
  return input.mimeType.toLowerCase().includes('pdf')
    || (input.fileName ?? '').toLowerCase().endsWith('.pdf');
}

function assertSource(input: PrepareDrawingSourceInput): void {
  if (!(input.bytes instanceof ArrayBuffer) || input.bytes.byteLength === 0) {
    throw new Error('DRAWING_SOURCE_EMPTY');
  }
  if (typeof input.mimeType !== 'string' || input.mimeType.length > 128) {
    throw new Error('DRAWING_SOURCE_MIME_INVALID');
  }
}

async function prepareImage(
  input: PrepareDrawingSourceInput,
  documentHash: string,
): Promise<PreparedDrawingSource> {
  const quality = await profileImage(input.bytes);
  const variants = await createImageVariants(input.bytes, quality);
  const original = variants.find((variant) => variant.kind === 'original');
  if (!original) throw new Error('DRAWING_SOURCE_NORMALIZATION_FAILED');
  return {
    documentHash,
    mimeType: input.mimeType,
    formatClass: 'raster-image',
    totalPageCount: 1,
    pages: [{
      pageIndex: 0,
      width: original.width,
      height: original.height,
      sourceWidth: original.width,
      sourceHeight: original.height,
      renderScale: 1,
      renderMode: 'raster',
      textSample: input.fileName ?? '',
      vectorOpCount: 0,
      rasterOpCount: 1,
      imageBuffer: original.buffer,
      renderHash: sha256(original.buffer, 'page:0'),
      quality,
    }],
  };
}

function vectorQuality(width: number, height: number): ImageQualityProfile {
  return {
    width,
    height,
    channels: 4,
    contrast: 1,
    edgeDensity: 1,
    gradientVariance: 1,
    lowContrast: false,
    blurry: false,
    recommendedScale: 1,
    warnings: ['VECTOR_SOURCE'],
  };
}

function prepareDxf(
  input: PrepareDrawingSourceInput,
  documentHash: string,
): PreparedDrawingSource {
  const width = 2_000;
  const height = 1_400;
  return {
    documentHash,
    mimeType: input.mimeType,
    formatClass: 'dxf',
    totalPageCount: 1,
    pages: [{
      pageIndex: 0,
      width,
      height,
      sourceWidth: width,
      sourceHeight: height,
      renderScale: 1,
      renderMode: 'vector',
      textSample: input.fileName ?? '',
      vectorOpCount: 1,
      rasterOpCount: 0,
      renderHash: sha256(input.bytes, 'page:0'),
      quality: vectorQuality(width, height),
    }],
  };
}

function installPdfCanvasGlobals(): void {
  // pdf.js reads these at runtime. Keep its browser DOM declarations out of
  // the native canvas implementation's structurally different TypeScript API.
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.DOMMatrix ??= DOMMatrix;
  globals.ImageData ??= ImageData;
  globals.Path2D ??= Path2D;
}

/** Enumerates pages without rendering them, so queued-job cost estimates are honest. */
export async function enumerateDrawingPageCount(
  input: PrepareDrawingSourceInput,
): Promise<number> {
  assertSource(input);
  if (!isPdf(input)) return 1;
  installPdfCanvasGlobals();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let loadingTask: ReturnType<typeof pdfjs.getDocument> | undefined;
  try {
    loadingTask = pdfjs.getDocument({ data: new Uint8Array(input.bytes.slice(0)) });
    const document = await loadingTask.promise;
    if (!Number.isSafeInteger(document.numPages) || document.numPages < 1 || document.numPages > MAX_PDF_PAGES) {
      throw new Error('DRAWING_SOURCE_PDF_PAGE_LIMIT');
    }
    return document.numPages;
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'DRAWING_SOURCE_PDF_PAGE_LIMIT') throw cause;
    throw new Error('DRAWING_SOURCE_PDF_INVALID');
  } finally {
    await loadingTask?.destroy().catch(() => undefined);
  }
}

function renderScale(width: number, height: number): number {
  const longest = Math.max(width, height);
  let scale = longest > 0 ? Math.min(3, Math.max(1, MAX_RENDER_SIDE / longest)) : 1;
  const pixels = width * height * scale * scale;
  if (pixels > MAX_RENDER_PIXELS) {
    scale *= Math.sqrt(MAX_RENDER_PIXELS / pixels);
  }
  return Math.max(0.25, scale);
}

async function preparePdf(
  input: PrepareDrawingSourceInput,
  documentHash: string,
): Promise<PreparedDrawingSource> {
  installPdfCanvasGlobals();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let loadingTask: ReturnType<typeof pdfjs.getDocument>;
  let document: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    loadingTask = pdfjs.getDocument({ data: new Uint8Array(input.bytes.slice(0)) });
    document = await loadingTask.promise;
  } catch {
    throw new Error('DRAWING_SOURCE_PDF_INVALID');
  }
  if (!Number.isSafeInteger(document.numPages) || document.numPages < 1 || document.numPages > MAX_PDF_PAGES) {
    await loadingTask!.destroy();
    throw new Error('DRAWING_SOURCE_PDF_PAGE_LIMIT');
  }

  const requested = input.requestedPages === undefined || input.requestedPages === 'all'
    ? Array.from({ length: document.numPages }, (_, index) => index)
    : [...new Set(input.requestedPages)].sort((left, right) => left - right);
  if (requested.length === 0 || requested.some((pageIndex) => !Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex >= document.numPages)) {
    await loadingTask!.destroy();
    throw new Error('DRAWING_REQUESTED_PAGE_OUT_OF_RANGE');
  }
  const maxPages = input.budget?.maxPages ?? MAX_PDF_PAGES;
  const maxPixels = input.budget?.maxPixels ?? Number.MAX_SAFE_INTEGER;
  const deadline = Date.now() + (input.budget?.deadlineMs ?? 10 * 60_000);
  let renderedPages = 0;
  let renderedPixels = 0;

  const skippedPage = (
    pageIndex: number,
    reason: PreparedDrawingPage['preparationError'],
  ): PreparedDrawingPage => ({
    pageIndex,
    width: 1,
    height: 1,
    sourceWidth: 1,
    sourceHeight: 1,
    renderScale: 1,
    renderMode: 'raster',
    textSample: '',
    vectorOpCount: 0,
    rasterOpCount: 0,
    renderHash: sha256(documentHash, `page:${pageIndex}:${reason}`),
    quality: {
      width: 1, height: 1, channels: 4, contrast: 0, edgeDensity: 0,
      gradientVariance: 0, lowContrast: true, blurry: true,
      recommendedScale: 4, warnings: reason ? [reason] : [],
    },
    preparationError: reason,
  });

  const pages: PreparedDrawingPage[] = [];
  try {
    for (const pageIndex of requested) {
      const cancelled = input.signal?.aborted || input.shouldCancel?.();
      if (cancelled || renderedPages >= maxPages || Date.now() >= deadline) {
        pages.push(skippedPage(pageIndex, cancelled ? 'CANCELLED' : 'PARTIAL_BUDGET_EXCEEDED'));
        continue;
      }
      const pageNumber = pageIndex + 1;
      const page = await document.getPage(pageNumber);
      const sourceViewport = page.getViewport({ scale: 1 });
      const scale = renderScale(sourceViewport.width, sourceViewport.height);
      const viewport = page.getViewport({ scale });
      const width = Math.max(1, Math.ceil(viewport.width));
      const height = Math.max(1, Math.ceil(viewport.height));
      const pagePixels = width * height;
      if (renderedPixels + pagePixels > maxPixels) {
        pages.push(skippedPage(pageIndex, 'PARTIAL_BUDGET_EXCEEDED'));
        page.cleanup();
        continue;
      }

      const [operatorList, textContent] = await Promise.all([
        page.getOperatorList(),
        page.getTextContent(),
      ]);
      const vectorOps = new Set<number>([
        pdfjs.OPS.constructPath,
        pdfjs.OPS.showText,
        pdfjs.OPS.showSpacedText,
      ]);
      const rasterOps = new Set<number>([
        pdfjs.OPS.paintImageXObject,
        pdfjs.OPS.paintInlineImageXObject,
        pdfjs.OPS.paintImageMaskXObject,
      ]);
      const vectorOpCount = operatorList.fnArray.filter((op) => vectorOps.has(op)).length;
      const rasterOpCount = operatorList.fnArray.filter((op) => rasterOps.has(op)).length;
      const renderMode: PreparedRenderMode = vectorOpCount > 0 && rasterOpCount > 0
        ? 'hybrid'
        : rasterOpCount > 0
          ? 'raster'
          : 'vector';

      const canvas = createCanvas(width, height);
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      await page.render({
        canvas: canvas as never,
        canvasContext: context as never,
        viewport,
      } as never).promise;
      const png = canvas.toBuffer('image/png');
      const imageBuffer = toArrayBuffer(png);
      const quality = await profileImage(imageBuffer);
      const textSample = textContent.items
        .filter((item): item is typeof item & { str: string } => 'str' in item && typeof item.str === 'string')
        .map((item) => item.str)
        .join(' ')
        .slice(0, 20_000);

      pages.push({
        pageIndex,
        width,
        height,
        sourceWidth: sourceViewport.width,
        sourceHeight: sourceViewport.height,
        renderScale: scale,
        renderMode,
        textSample,
        vectorOpCount,
        rasterOpCount,
        imageBuffer,
        renderHash: sha256(imageBuffer, `page:${pageIndex}`),
        quality,
      });
      renderedPages += 1;
      renderedPixels += pagePixels;
      page.cleanup();
    }
  } finally {
    await loadingTask!.destroy();
  }

  const modes = new Set(pages.map((page) => page.renderMode));
  const formatClass: PreparedFormatClass = modes.size === 1 && modes.has('vector')
    ? 'vector-pdf'
    : modes.size === 1 && modes.has('raster')
      ? 'raster-pdf'
      : 'mixed-pdf';
  return { documentHash, mimeType: input.mimeType, formatClass, pages, totalPageCount: document.numPages };
}

export async function prepareDrawingSource(
  input: PrepareDrawingSourceInput,
): Promise<PreparedDrawingSource> {
  assertSource(input);
  const documentHash = sha256(input.bytes);
  if (isDxf(input)) return prepareDxf(input, documentHash);
  if (isPdf(input)) return preparePdf(input, documentHash);
  return prepareImage(input, documentHash);
}
