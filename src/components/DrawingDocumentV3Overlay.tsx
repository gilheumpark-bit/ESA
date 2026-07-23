'use client';

import type { DrawingDocumentV3 } from '@/agent/drawing/types-v3';

interface DrawingDocumentV3OverlayProps {
  document: DrawingDocumentV3;
  pageIndex: number;
  width: number;
  height: number;
  selectedDisplayId?: string;
  onSelectDisplayId?: (id: string) => void;
}

function pageBounds(document: DrawingDocumentV3, pageIndex: number): { width: number; height: number } {
  const quality = document.pages.find((page) => page.pageIndex === pageIndex)?.quality;
  if (quality) return { width: quality.width, height: quality.height };
  const evidence = [
    ...document.evidenceGraph.symbols.flatMap((node) => node.evidence),
    ...document.evidenceGraph.lines.flatMap((node) => node.evidence),
    ...document.evidenceGraph.texts.flatMap((node) => node.evidence),
  ].filter((item) => item.pageIndex === pageIndex);
  return {
    width: Math.max(1, ...evidence.map((item) => item.bounds.x + item.bounds.w)),
    height: Math.max(1, ...evidence.map((item) => item.bounds.y + item.bounds.h)),
  };
}

/** Evidence labels rendered in the same coordinate space as the analyzed page. */
export function DrawingDocumentV3Overlay({
  document,
  pageIndex,
  width,
  height,
  selectedDisplayId,
  onSelectDisplayId,
}: DrawingDocumentV3OverlayProps) {
  const symbols = document.evidenceGraph.symbols.filter((node) =>
    node.evidence.some((item) => item.pageIndex === pageIndex));
  const lines = document.evidenceGraph.lines.filter((node) =>
    node.evidence.some((item) => item.pageIndex === pageIndex));
  const texts = document.evidenceGraph.texts.filter((node) =>
    node.evidence.some((item) => item.pageIndex === pageIndex));
  const continuityRegions = (document.continuity?.regions ?? []).filter((region) => region.pageIndex === pageIndex);
  const continuationPorts = (document.continuity?.continuations ?? []).filter((port) => port.pageIndex === pageIndex);
  const unresolvedEndpoints = (document.continuity?.unresolvedEndpoints ?? []).filter((endpoint) => endpoint.pageIndex === pageIndex);
  const source = pageBounds(document, pageIndex);
  const sx = width / source.width;
  const sy = height / source.height;
  const selectedRelation = document.evidenceGraph.relations.find((relation) => relation.displayId === selectedDisplayId);
  const selectedCrossPage = document.crossPageRelations.find((relation) => relation.displayId === selectedDisplayId);
  const relatedSymbolIds = new Set([
    selectedRelation?.from,
    selectedRelation?.to,
    selectedCrossPage?.fromRef,
    selectedCrossPage?.toRef,
  ].filter((id): id is string => Boolean(id)));

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 h-full w-full" aria-label={`도면 ${pageIndex + 1}페이지 분석 근거`}>
      {continuityRegions.map((region) => (
        <g key={region.id} role="button" tabIndex={0} aria-label={`${region.displayId} 분석 구획`} className="drawing-overlay-target cursor-pointer" onClick={() => onSelectDisplayId?.(region.displayId)} onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelectDisplayId?.(region.displayId);
        }}>
          <rect
            x={region.logicalBounds.x * sx}
            y={region.logicalBounds.y * sy}
            width={region.logicalBounds.w * sx}
            height={region.logicalBounds.h * sy}
            fill="none"
            stroke={selectedDisplayId === region.displayId ? 'var(--color-error)' : 'var(--text-tertiary)'}
            strokeWidth={selectedDisplayId === region.displayId ? 3 : 1}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
          <text x={(region.logicalBounds.x + 4) * sx} y={(region.logicalBounds.y + 14) * sy} fontSize="10" fontWeight="700" fill="var(--text-secondary)">{region.displayId}</text>
        </g>
      ))}
      {lines.map((line) => {
        const selected = selectedDisplayId === line.displayId || selectedRelation?.lineId === line.id;
        return (
          <g key={line.id}>
          <polyline
            points={line.path.map((point) => `${point.x * sx},${point.y * sy}`).join(' ')}
            fill="none"
            stroke={selected ? 'var(--color-error)' : 'var(--color-warning)'}
            strokeWidth={selected ? 4 : 2}
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            role="button"
            tabIndex={0}
            aria-label={`${line.displayId} 선로`}
            points={line.path.map((point) => `${point.x * sx},${point.y * sy}`).join(' ')}
            fill="none"
            stroke="transparent"
            strokeWidth="14"
            vectorEffect="non-scaling-stroke"
            className="drawing-overlay-target drawing-overlay-line-target cursor-pointer"
            onClick={() => onSelectDisplayId?.(line.displayId)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelectDisplayId?.(line.displayId);
            }}
          />
          </g>
        );
      })}
      {symbols.map((symbol) => {
        const evidence = symbol.evidence.find((item) => item.pageIndex === pageIndex);
        if (!evidence) return null;
        const selected = selectedDisplayId === symbol.displayId || relatedSymbolIds.has(symbol.id);
        return (
          <g key={symbol.id} role="button" tabIndex={0} aria-label={`${symbol.displayId} 기기`} onClick={() => onSelectDisplayId?.(symbol.displayId)} onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') onSelectDisplayId?.(symbol.displayId);
          }} className="drawing-overlay-target cursor-pointer">
            <rect x={evidence.bounds.x * sx} y={evidence.bounds.y * sy} width={Math.max(8, evidence.bounds.w * sx)} height={Math.max(8, evidence.bounds.h * sy)} fill={selected ? 'var(--color-error)' : 'var(--color-primary)'} fillOpacity={selected ? 0.18 : 0.09} stroke={selected ? 'var(--color-error)' : 'var(--color-primary)'} strokeWidth={selected ? 3 : 2} />
            <text x={evidence.bounds.x * sx} y={Math.max(12, evidence.bounds.y * sy - 3)} fontSize="11" fontWeight="700" fill="var(--color-primary)">{symbol.displayId}</text>
          </g>
        );
      })}
      {texts.map((node) => {
        const evidence = node.evidence.find((item) => item.pageIndex === pageIndex);
        if (!evidence) return null;
        return <text key={node.id} role="button" tabIndex={0} aria-label={`${node.displayId} 문자`} className="drawing-overlay-target cursor-pointer" onClick={() => onSelectDisplayId?.(node.displayId)} onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelectDisplayId?.(node.displayId);
        }} x={evidence.bounds.x * sx} y={(evidence.bounds.y + evidence.bounds.h) * sy} fontSize="10" fontWeight={selectedDisplayId === node.displayId ? '700' : '500'} fill={node.certainty === 'confirmed' ? 'var(--color-success)' : 'var(--color-warning)'}>{node.displayId}</text>;
      })}
      {continuationPorts.map((port) => {
        const selected = selectedDisplayId === port.displayId;
        return <g key={port.id} role="button" tabIndex={0} aria-label={`${port.displayId} 경계 연결점`} className="drawing-overlay-target cursor-pointer" onClick={() => onSelectDisplayId?.(port.displayId)} onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelectDisplayId?.(port.displayId);
        }}>
          <circle cx={port.point.x * sx} cy={port.point.y * sy} r={selected ? 7 : 5} fill="var(--bg-primary)" stroke={port.status === 'hold' ? 'var(--color-error)' : 'var(--color-primary)'} strokeWidth={selected ? 4 : 2} vectorEffect="non-scaling-stroke" />
          <text x={port.point.x * sx + 7} y={port.point.y * sy - 7} fontSize="9" fontWeight="700" fill={port.status === 'hold' ? 'var(--color-error)' : 'var(--color-primary)'}>{port.displayId}</text>
        </g>;
      })}
      {unresolvedEndpoints.map((endpoint) => {
        const x = endpoint.point.x * sx;
        const y = endpoint.point.y * sy;
        return <g key={endpoint.id} role="button" tabIndex={0} aria-label={`${endpoint.displayId} 미해결 선 끝`} className="drawing-overlay-target cursor-pointer" onClick={() => onSelectDisplayId?.(endpoint.displayId)} onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onSelectDisplayId?.(endpoint.displayId);
        }}>
          <path d={`M ${x - 6} ${y - 6} L ${x + 6} ${y + 6} M ${x + 6} ${y - 6} L ${x - 6} ${y + 6}`} fill="none" stroke="var(--color-error)" strokeWidth={selectedDisplayId === endpoint.displayId ? 4 : 3} vectorEffect="non-scaling-stroke" />
          <text x={x + 8} y={y + 12} fontSize="9" fontWeight="700" fill="var(--color-error)">{endpoint.displayId}</text>
        </g>;
      })}
    </svg>
  );
}
