'use client';

import Image from 'next/image';
import { useMemo } from 'react';

import type { DrawingIntelligenceReport } from '@/agent/report/drawing-intelligence-report';
import { buildEvidenceNumbers } from '@/components/drawing-evidence-labels';

interface DrawingEvidenceOverlayProps {
  src: string;
  report: DrawingIntelligenceReport;
  activeIds?: readonly string[];
  onSelect?: (id: string) => void;
}

function lineAnchor(path: readonly { x: number; y: number }[]): { x: number; y: number } {
  if (path.length === 0) return { x: 0, y: 0 };
  if (path.length === 1) return path[0];
  const middle = Math.floor((path.length - 1) / 2);
  const left = path[middle];
  const right = path[middle + 1] ?? left;
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function percent(value: number): string {
  return `${Math.max(0, Math.min(100, value / 10))}%`;
}

export function DrawingEvidenceOverlay({
  src,
  report,
  activeIds = [],
  onSelect,
}: DrawingEvidenceOverlayProps) {
  const active = useMemo(() => new Set(activeIds), [activeIds]);
  const numbers = useMemo(
    () => buildEvidenceNumbers(report.symbols, report.lines),
    [report.lines, report.symbols],
  );
  const page = report.source.page;
  const symbols = useMemo(
    () => report.symbols.filter((item) => item.bounds.page === page),
    [page, report.symbols],
  );
  const lines = useMemo(
    () => report.lines.filter((item) => item.pages.includes(page) && item.path.length > 0),
    [page, report.lines],
  );
  const quantities = useMemo(
    () => report.quantities.filter((item) => item.page === page),
    [page, report.quantities],
  );

  return (
    <figure className="overflow-hidden border border-[var(--border-default)] bg-[var(--bg-primary)] shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-default)] bg-[var(--bg-secondary)] px-4 py-3 text-xs text-[var(--text-secondary)]">
        <figcaption className="font-semibold text-[var(--text-primary)]">
          원본 도면 · {page}페이지
        </figcaption>
        <p>S = 기기 · L = 선로 · Q = 표기값 · 번호를 누르면 표의 근거가 함께 선택됩니다.</p>
      </div>

      <div className="overflow-x-auto">
        <div
          className="relative min-w-[680px] bg-white"
          style={{ aspectRatio: `${report.source.width} / ${report.source.height}` }}
        >
          <Image
            src={src}
            alt="분석 원본 단선결선도"
            fill
            unoptimized
            draggable={false}
            sizes="(max-width: 1024px) 100vw, 900px"
            className="select-none object-fill"
          />

          <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
            role="img"
            aria-label="도면 분석 근거 오버레이"
          >
            {lines.map((item) => {
              const selected = active.has(item.id);
              return (
                <polyline
                  key={item.id}
                  points={item.path.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill="none"
                  stroke={selected ? 'var(--color-error)' : 'var(--color-warning)'}
                  strokeWidth={selected ? 6 : 3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  opacity={selected ? 1 : 0.82}
                />
              );
            })}
            {symbols.map((item) => {
              const selected = active.has(item.id);
              return (
                <rect
                  key={item.id}
                  x={item.bounds.x}
                  y={item.bounds.y}
                  width={item.bounds.w}
                  height={item.bounds.h}
                  rx={4}
                  fill={selected ? 'var(--color-error)' : 'var(--color-primary)'}
                  fillOpacity={selected ? 0.14 : 0.08}
                  stroke={selected ? 'var(--color-error)' : 'var(--color-primary)'}
                  strokeWidth={selected ? 5 : 2.5}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {quantities.map((item, index) => {
              const selected = active.has(item.evidenceId);
              return (
                <rect
                  key={`${item.evidenceId}:${item.field}:${index}`}
                  x={item.bounds.x}
                  y={item.bounds.y}
                  width={item.bounds.w}
                  height={item.bounds.h}
                  rx={3}
                  fill={selected ? 'var(--color-error)' : 'var(--color-success)'}
                  fillOpacity={selected ? 0.14 : 0.08}
                  stroke={selected ? 'var(--color-error)' : 'var(--color-success)'}
                  strokeWidth={selected ? 5 : 2}
                  strokeDasharray={selected ? undefined : '5 3'}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>

          {symbols.map((item) => {
            const number = numbers.symbols[item.id];
            const selected = active.has(item.id);
            const label = item.label?.trim() || item.type;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`기기 ${number}: ${label}`}
                aria-pressed={selected}
                onClick={() => onSelect?.(item.id)}
                className="absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-start justify-center rounded-md bg-transparent p-1 focus-visible:z-20"
                style={{
                  left: percent(item.bounds.x + item.bounds.w / 2),
                  top: percent(item.bounds.y + item.bounds.h / 2),
                }}
              >
                <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-[11px] font-bold shadow-sm ${
                  selected
                    ? 'border-[var(--color-error)] bg-[var(--color-error)] text-white'
                    : 'border-[var(--color-primary)] bg-[var(--bg-primary)] text-[var(--color-primary)]'
                }`}>
                  {number}
                </span>
              </button>
            );
          })}

          {lines.map((item) => {
            const number = numbers.lines[item.id];
            const selected = active.has(item.id);
            const anchor = lineAnchor(item.path);
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`선로 ${number}: ${item.kind}`}
                aria-pressed={selected}
                onClick={() => onSelect?.(item.id)}
                className="absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-transparent focus-visible:z-20"
                style={{ left: percent(anchor.x), top: percent(anchor.y) }}
              >
                <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[11px] font-bold shadow-sm ${
                  selected
                    ? 'border-[var(--color-error)] bg-[var(--color-error)] text-white'
                    : 'border-[var(--color-warning)] bg-[var(--bg-primary)] text-[var(--color-warning)]'
                }`}>
                  {number}
                </span>
              </button>
            );
          })}

          {quantities.map((item, index) => {
            const number = `Q${String(index + 1).padStart(2, '0')}`;
            const selected = active.has(item.evidenceId);
            return (
              <button
                key={`${item.evidenceId}:${item.field}:${index}`}
                type="button"
                aria-label={`표기값 ${number}: ${String(item.value)} ${item.unit}`}
                aria-pressed={selected}
                onClick={() => onSelect?.(item.evidenceId)}
                className="absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-end justify-center rounded-md bg-transparent p-1 focus-visible:z-20"
                style={{
                  left: percent(item.bounds.x + item.bounds.w / 2),
                  top: percent(item.bounds.y + item.bounds.h / 2),
                }}
              >
                <span className={`rounded-sm border px-1.5 py-0.5 font-mono text-[11px] font-bold shadow-sm ${
                  selected
                    ? 'border-[var(--color-error)] bg-[var(--color-error)] text-white'
                    : 'border-[var(--color-success)] bg-[var(--bg-primary)] text-[var(--color-success)]'
                }`}>
                  {number}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </figure>
  );
}
