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
}

export interface PreparedDrawingSource {
  documentHash: string;
  mimeType: string;
  formatClass: PreparedFormatClass;
  pages: PreparedDrawingPage[];
}

export interface PrepareDrawingSourceInput {
  bytes: ArrayBuffer;
  mimeType: string;
  fileName?: string;
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

  const pages: PreparedDrawingPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const sourceViewport = page.getViewport({ scale: 1 });
      const scale = renderScale(sourceViewport.width, sourceViewport.height);
      const viewport = page.getViewport({ scale });
      const width = Math.max(1, Math.ceil(viewport.width));
      const height = Math.max(1, Math.ceil(viewport.height));

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
        pageIndex: pageNumber - 1,
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
        renderHash: sha256(imageBuffer, `page:${pageNumber - 1}`),
        quality,
      });
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
  return { documentHash, mimeType: input.mimeType, formatClass, pages };
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
