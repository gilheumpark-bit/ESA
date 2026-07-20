'use client';

import type { DrawingDocumentV3 } from '@/agent/drawing/types-v3';

export interface DrawingEvidenceOverlayProps {
  document: DrawingDocumentV3;
  pageIndex: number;
  width: number;
  height: number;
  selectedDisplayId?: string;
  onSelectDisplayId?: (id: string) => void;
}

/** Numbered boxes in original page coordinates scaled to view box. */
export default function DrawingEvidenceOverlay({
  document,
  pageIndex,
  width,
  height,
  selectedDisplayId,
  onSelectDisplayId,
}: DrawingEvidenceOverlayProps) {
  const symbols = document.evidenceGraph.symbols.filter(
    (s) => s.evidence[0]?.pageIndex === pageIndex,
  );
  const texts = document.evidenceGraph.texts.filter(
    (t) => t.evidence[0]?.pageIndex === pageIndex,
  );

  // Assume document coords use ~2000x1400 planning space when unknown
  const srcW = 2000;
  const srcH = 1400;
  const sx = width / srcW;
  const sy = height / srcH;

  return (
    <svg
      width={width}
      height={height}
      className="pointer-events-auto absolute inset-0"
      aria-label="도면 번호 오버레이"
    >
      {symbols.map((s) => {
        const b = s.evidence[0]?.bounds;
        if (!b) return null;
        const selected = selectedDisplayId === s.displayId;
        return (
          <g
            key={s.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectDisplayId?.(s.displayId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectDisplayId?.(s.displayId);
            }}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={b.x * sx}
              y={b.y * sy}
              width={Math.max(8, b.w * sx)}
              height={Math.max(8, b.h * sy)}
              fill={selected ? 'rgba(30,58,95,0.25)' : 'rgba(180,83,9,0.12)'}
              stroke={selected ? '#1e3a5f' : '#b45309'}
              strokeWidth={selected ? 2 : 1}
            />
            <text
              x={b.x * sx}
              y={Math.max(10, b.y * sy - 2)}
              fontSize={10}
              fill="#1e3a5f"
              className="font-mono"
            >
              {s.displayId}
            </text>
          </g>
        );
      })}
      {texts.map((t) => {
        const b = t.evidence[0]?.bounds;
        if (!b) return null;
        return (
          <text
            key={t.id}
            x={b.x * sx}
            y={b.y * sy + 10}
            fontSize={9}
            fill={t.certainty === 'confirmed' ? '#047857' : '#b45309'}
            className="font-mono"
            onClick={() => onSelectDisplayId?.(t.displayId)}
            style={{ cursor: 'pointer' }}
          >
            {t.displayId}
          </text>
        );
      })}
    </svg>
  );
}
