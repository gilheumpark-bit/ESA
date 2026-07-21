import type { TeamResult } from '@/agent/teams/types';
import type { EvidenceBounds } from '@/agent/vision/evidence-types';

import type { RawLineHit, RawSymbolHit } from './evidence-deduplicator';
import type { OcrReading } from './types-v3';

export interface RawTextSeed {
  text: string;
  candidates?: string[];
  bounds: EvidenceBounds;
  pageIndex: number;
  readings?: OcrReading[];
  adjacentSymbolTypes?: string[];
  legendTerms?: string[];
  sourceEvidenceIds?: string[];
}

export interface TeamAdapterContext {
  pageIndex: number;
  width: number;
  height: number;
  positionSpace?: 'percent' | 'source';
}

export interface AdaptedTeamResult {
  symbols: RawSymbolHit[];
  lines: RawLineHit[];
  texts: RawTextSeed[];
}

type Position = { x: number; y: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sourcePositionMapper(
  positions: Position[],
  context: TeamAdapterContext,
): (position: Position) => Position {
  if (context.positionSpace !== 'source') {
    return (position) => ({
      x: clamp(position.x, 0, 100) / 100 * context.width,
      y: clamp(position.y, 0, 100) / 100 * context.height,
    });
  }
  const xs = positions.map((position) => position.x);
  const ys = positions.map((position) => position.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const padX = context.width * 0.04;
  const padY = context.height * 0.04;
  return (position) => ({
    x: padX + ((position.x - minX) / spanX) * (context.width - padX * 2),
    y: padY + ((maxY - position.y) / spanY) * (context.height - padY * 2),
  });
}

function ocrVariant(sourceId: string | undefined): OcrReading['variantId'] | null {
  if (!sourceId) return null;
  if (sourceId.includes('text-high-contrast')) return 'text-high-contrast';
  if (sourceId.includes('upscale-4x')) return 'upscale-4x';
  if (sourceId.includes('original')) return 'original';
  return null;
}

function nearBounds(a: EvidenceBounds, b: EvidenceBounds): boolean {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.w * a.h + b.w * b.h - intersection;
  if (union > 0 && intersection / union >= 0.4) return true;
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return Math.hypot(ac.x - bc.x, ac.y - bc.y) <= 6;
}

function adaptReviewTexts(result: TeamResult, pageIndex: number): RawTextSeed[] {
  const groups: RawTextSeed[] = [];
  for (const envelope of result.drawingReview?.envelopes ?? []) {
    if (envelope.role !== 'text') continue;
    for (const item of envelope.data.texts ?? []) {
      const bounds = { x: item.bounds.x, y: item.bounds.y, w: item.bounds.w, h: item.bounds.h };
      let group = groups.find((candidate) => nearBounds(candidate.bounds, bounds));
      if (!group) {
        group = {
          text: item.raw,
          candidates: [...item.candidates],
          bounds,
          pageIndex,
          readings: [],
          sourceEvidenceIds: [],
        };
        groups.push(group);
      }
      group.candidates = [...new Set([...(group.candidates ?? []), ...item.candidates])];
      group.sourceEvidenceIds = [...new Set([...(group.sourceEvidenceIds ?? []), item.id])];
      const variantId = ocrVariant(item.sourceId);
      if (variantId && !group.readings?.some((reading) => reading.variantId === variantId && reading.callId === `${envelope.outputHash}:${item.id}`)) {
        group.readings?.push({
          variantId,
          text: item.raw,
          confidence: item.confidence,
          callId: `${envelope.outputHash}:${item.id}`,
        });
      }
    }
  }
  return groups.map((group) => ({
    ...group,
    readings: group.readings?.sort((left, right) => {
      const order: OcrReading['variantId'][] = ['original', 'upscale-4x', 'text-high-contrast'];
      return order.indexOf(left.variantId) - order.indexOf(right.variantId);
    }),
  }));
}

export function adaptTeamResult(
  result: TeamResult,
  context: TeamAdapterContext,
): AdaptedTeamResult {
  const reviewGraph = result.drawingReview?.graph;
  const reviewedTexts = adaptReviewTexts(result, context.pageIndex);
  if (reviewGraph) {
    return {
      symbols: reviewGraph.symbols.map((symbol) => ({
        localId: symbol.id,
        type: symbol.typeCandidates[0] ?? 'other',
        label: symbol.rawLabel ?? undefined,
        bounds: { x: symbol.bounds.x, y: symbol.bounds.y, w: symbol.bounds.w, h: symbol.bounds.h },
        confidence: symbol.confidence,
        pageIndex: context.pageIndex,
        regionId: symbol.sourceIds.join(',') || 'full-page',
        certainty: symbol.typeCandidates.length === 1 && symbol.confidence >= 0.85 ? 'confirmed' : 'ambiguous',
        sourceEvidenceIds: symbol.originalEvidenceIds ?? [symbol.originalEvidenceId ?? symbol.id],
      })),
      lines: reviewGraph.lines.map((line) => ({
        localId: line.id,
        lineKind: line.lineKind,
        path: line.path.map((point) => ({ ...point })),
        junctions: line.junctions.map((point) => ({ ...point })),
        crossovers: line.crossovers.map((point) => ({ ...point })),
        confidence: line.confidence,
        pageIndex: context.pageIndex,
        regionId: line.sourceIds.join(',') || 'full-page',
        certainty: line.confidence >= 0.8 ? 'confirmed' : 'ambiguous',
        sourceEvidenceIds: line.originalEvidenceIds ?? [line.originalEvidenceId ?? line.id],
      })),
      texts: reviewedTexts,
    };
  }

  const components = result.components ?? [];
  const positions = [
    ...components.flatMap((component) => component.position ? [component.position] : []),
    ...(result.vectorTexts ?? []).map((item) => item.position),
  ];
  const mapPosition = sourcePositionMapper(positions, context);
  const mapped = new Map<string, Position>();
  const symbolSize = clamp(Math.min(context.width, context.height) * 0.025, 16, 64);
  const symbols: RawSymbolHit[] = [];
  const texts: RawTextSeed[] = [];
  for (const component of components) {
    if (!component.position) continue;
    const point = mapPosition(component.position);
    mapped.set(component.id, point);
    const bounds = {
      x: clamp(point.x - symbolSize / 2, 0, Math.max(0, context.width - symbolSize)),
      y: clamp(point.y - symbolSize / 2, 0, Math.max(0, context.height - symbolSize)),
      w: symbolSize,
      h: symbolSize,
    };
    symbols.push({
      localId: component.id,
      type: component.type,
      label: component.label,
      bounds,
      confidence: component.confidence,
      pageIndex: context.pageIndex,
      regionId: 'vector-full',
      certainty: component.confidence >= 0.85 ? 'confirmed' : 'ambiguous',
    });
    if (component.label) {
      texts.push({
        text: component.label,
        candidates: [component.label],
        bounds,
        pageIndex: context.pageIndex,
        readings: [],
      });
    }
  }

  const vectorTexts: RawTextSeed[] = (result.vectorTexts ?? []).map((item, index) => {
    const point = mapPosition(item.position);
    const height = clamp(symbolSize * 0.55, 10, 24);
    const width = clamp(height * Math.max(1, item.text.length) * 0.58, 10, context.width * 0.4);
    return {
      text: item.text,
      candidates: [item.text],
      bounds: {
        x: clamp(point.x, 0, Math.max(0, context.width - width)),
        y: clamp(point.y - height, 0, Math.max(0, context.height - height)),
        w: width,
        h: height,
      },
      pageIndex: context.pageIndex,
      readings: [],
      sourceEvidenceIds: [`vector-text-p${context.pageIndex}-${index}`],
    };
  });

  const lines: RawLineHit[] = [];
  for (let index = 0; index < (result.connections ?? []).length; index += 1) {
    const connection = result.connections?.[index];
    if (!connection) continue;
    const from = mapped.get(connection.from);
    const to = mapped.get(connection.to);
    if (!from || !to || (from.x === to.x && from.y === to.y)) continue;
    lines.push({
      localId: `vector-line-${index + 1}`,
      lineKind: 'power',
      path: [{ ...from }, { ...to }],
      junctions: [],
      crossovers: [],
      confidence: result.confidence,
      pageIndex: context.pageIndex,
      regionId: 'vector-full',
      certainty: result.confidence >= 0.8 ? 'confirmed' : 'ambiguous',
    });
  }
  return {
    symbols,
    lines,
    texts: reviewedTexts.length > 0 ? reviewedTexts : vectorTexts.length > 0 ? vectorTexts : texts,
  };
}
