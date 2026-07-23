'use client';

import { useEffect, useRef, useState } from 'react';

import type { DrawingDocumentV3 } from '@/agent/drawing/types-v3';

import { DrawingDocumentV3Overlay } from './DrawingDocumentV3Overlay';

interface DrawingSourcePreviewProps {
  file: File;
  document: DrawingDocumentV3;
  pageIndex: number;
  selectedDisplayId?: string;
  onSelectDisplayId?: (id: string) => void;
}

interface RenderSize { width: number; height: number }

function fallbackSize(document: DrawingDocumentV3, pageIndex: number): RenderSize {
  const quality = document.pages.find((page) => page.pageIndex === pageIndex)?.quality;
  return { width: quality?.width ?? 1_200, height: quality?.height ?? 800 };
}

/** Local-only source renderer. Original bytes never round-trip through report JSON. */
export function DrawingSourcePreview({
  file,
  document,
  pageIndex,
  selectedDisplayId,
  onSelectDisplayId,
}: DrawingSourcePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageUrl, setImageUrl] = useState<string>();
  const [size, setSize] = useState<RenderSize>(() => fallbackSize(document, pageIndex));
  const [loading, setLoading] = useState(file.type === 'application/pdf');
  const [error, setError] = useState<string>();
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const isImage = file.type.startsWith('image/');

  useEffect(() => {
    let active = true;
    if (!isImage) {
      queueMicrotask(() => {
        if (active) setImageUrl(undefined);
      });
      return () => {
        active = false;
      };
    }
    const url = URL.createObjectURL(file);
    queueMicrotask(() => {
      if (active) setImageUrl(url);
    });
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file, isImage]);

  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;
    let loadingTask: { destroy: () => Promise<void> } | undefined;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setError(undefined);
      }
    });
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
        const bytes = new Uint8Array(await file.arrayBuffer());
        const task = pdfjs.getDocument({
          data: bytes,
          cMapUrl: '/vendor/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
          wasmUrl: '/vendor/pdfjs/wasm/',
          useSystemFonts: true,
        });
        loadingTask = task;
        const pdf = await task.promise;
        if (pageIndex < 0 || pageIndex >= pdf.numPages) throw new Error('PAGE_OUT_OF_RANGE');
        const page = await pdf.getPage(pageIndex + 1);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.max(0.5, Math.min(2, 1_400 / Math.max(base.width, 1)));
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('CANVAS_UNAVAILABLE');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        if (!cancelled) setSize({ width: canvas.width, height: canvas.height });
        page.cleanup();
      } catch {
        if (!cancelled) setError('PDF 페이지를 화면에 그리지 못했습니다. 분석 결과 표는 계속 확인할 수 있습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [file, isPdf, pageIndex]);

  const renderSize = !isPdf && !isImage ? fallbackSize(document, pageIndex) : size;

  const overlay = (
    <DrawingDocumentV3Overlay
      document={document}
      pageIndex={pageIndex}
      width={renderSize.width}
      height={renderSize.height}
      selectedDisplayId={selectedDisplayId}
      onSelectDisplayId={onSelectDisplayId}
    />
  );

  return (
    <figure className="min-w-0 overflow-hidden rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-primary)] shadow-[var(--shadow-card)]" aria-busy={loading}>
      <figcaption className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 text-xs text-[var(--text-secondary)]">
        <span className="font-medium text-[var(--text-primary)]">원본 위 분석 근거</span>
        <span className="tabular-nums">{pageIndex + 1} / {document.pageCount}페이지</span>
      </figcaption>
      <div className="relative max-h-[70vh] overflow-auto bg-white p-2">
        {isPdf && loading && <div className="flex min-h-72 items-center justify-center text-sm text-[var(--text-secondary)]" role="status">PDF 페이지를 불러오는 중입니다.</div>}
        {isPdf && error && <div className="flex min-h-72 items-center justify-center px-6 text-center text-sm text-[var(--color-error)]" role="alert">{error}</div>}
        {isPdf && !error && (
          <div className={`relative mx-auto w-fit max-w-full ${loading ? 'hidden' : 'block'}`}>
            <canvas ref={canvasRef} className="block h-auto max-w-full outline outline-1 -outline-offset-1 outline-black/10" aria-label={`${pageIndex + 1}페이지 PDF 원본`} />
            {overlay}
          </div>
        )}
        {isImage && imageUrl && (
          <div className="relative mx-auto w-fit max-w-full">
            {/* The source remains a local object URL; no report/API persistence. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={`${file.name} 원본 도면`}
              className="block h-auto max-w-full outline outline-1 -outline-offset-1 outline-black/10"
              onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            />
            {overlay}
          </div>
        )}
        {!isPdf && !isImage && (
          <div className="relative mx-auto min-h-72 w-full" style={{ aspectRatio: `${renderSize.width} / ${renderSize.height}` }}>
            <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-sm text-[var(--text-secondary)]">DXF는 원본 미리보기 대신 추출 좌표와 관계도를 표시합니다.</p>
            {overlay}
          </div>
        )}
      </div>
    </figure>
  );
}
