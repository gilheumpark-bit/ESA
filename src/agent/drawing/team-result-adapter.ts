import type { TeamResult } from '@/agent/teams/types';
import type { BoundaryContinuationPlan } from '@/agent/vision/continuity-types';
import type { EvidenceBounds } from '@/agent/vision/evidence-types';

import type { RawLineHit, RawSymbolHit } from './evidence-deduplicator';
import type { OcrReading } from './types-v3';
import {
  boundsCenterInside,
  classifyTextContent,
  detectScheduleBounds,
  detectTitleBlockBounds,
  pathInsideBounds,
} from './content-zone-classifier';

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

function canonicalOcrText(value: string): string {
  const normalized = value.normalize('NFKC').toUpperCase();
  const arrows = [...(normalized.match(/[▲▼↑↓]/g) ?? [])].sort().join('');
  const body = normalized.replace(/[▲▼↑↓]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
  return `${arrows}|${body}`;
}

function seedTerms(seed: RawTextSeed): Set<string> {
  return new Set([seed.text, ...(seed.candidates ?? [])].map(canonicalOcrText).filter((value) => value !== '|'));
}

function substantiallyOverlaps(left: RawTextSeed, right: RawTextSeed): boolean {
  if (left.pageIndex !== right.pageIndex) return false;
  const x1 = Math.max(left.bounds.x, right.bounds.x);
  const y1 = Math.max(left.bounds.y, right.bounds.y);
  const x2 = Math.min(left.bounds.x + left.bounds.w, right.bounds.x + right.bounds.w);
  const y2 = Math.min(left.bounds.y + left.bounds.h, right.bounds.y + right.bounds.h);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const smallerArea = Math.min(left.bounds.w * left.bounds.h, right.bounds.w * right.bounds.h);
  return smallerArea > 0 && intersection / smallerArea >= 0.35;
}

function sameTextAnchor(left: RawTextSeed, right: RawTextSeed): boolean {
  if (!substantiallyOverlaps(left, right)) return false;
  const leftTerms = seedTerms(left);
  return [...seedTerms(right)].some((term) => leftTerms.has(term));
}

/** Merge full-page, region, and rescan OCR hits for the same physical label. */
export function deduplicateTextSeeds(seeds: RawTextSeed[]): RawTextSeed[] {
  const merged: RawTextSeed[] = [];
  for (const seed of seeds) {
    const existingIndex = merged.findIndex((candidate) => sameTextAnchor(candidate, seed));
    if (existingIndex < 0) {
      merged.push({
        ...seed,
        candidates: seed.candidates ? [...seed.candidates] : undefined,
        readings: seed.readings ? [...seed.readings] : undefined,
        sourceEvidenceIds: seed.sourceEvidenceIds ? [...seed.sourceEvidenceIds] : undefined,
      });
      continue;
    }

    const existing = merged[existingIndex];
    const readings = [...(existing.readings ?? []), ...(seed.readings ?? [])];
    const readingKeys = new Set<string>();
    merged[existingIndex] = {
      ...existing,
      candidates: [...new Set([existing.text, ...(existing.candidates ?? []), seed.text, ...(seed.candidates ?? [])])],
      readings: readings.filter((reading) => {
        const key = `${reading.callId}:${reading.variantId}:${reading.text}`;
        if (readingKeys.has(key)) return false;
        readingKeys.add(key);
        return true;
      }),
      sourceEvidenceIds: [...new Set([...(existing.sourceEvidenceIds ?? []), ...(seed.sourceEvidenceIds ?? [])])],
    };
  }
  return merged;
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
  continuity?: {
    plan: BoundaryContinuationPlan;
    localLines: RawLineHit[];
    globalLines: RawLineHit[];
  };
}

type Position = { x: number; y: number };

function normalizedEquipmentType(type: string, label: string | null | undefined): string {
  const normalizedLabel = label?.normalize('NFKC').trim().toUpperCase() ?? '';
  if (/^(?:SHUNT\s+)?REACTOR$|^(?:분로\s*)?리액터$/.test(normalizedLabel)) return 'reactor';
  return type;
}

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

function adaptContinuityReview(result: TeamResult, pageIndex: number): AdaptedTeamResult['continuity'] {
  const plan = result.drawingReview?.continuityPlan;
  if (!plan) return undefined;
  const regionBySourceId = new Map<string, string>();
  for (const continuation of plan.continuations) {
    for (const observation of continuation.observations) {
      regionBySourceId.set(observation.regionId, observation.regionDisplayId);
    }
  }
  const localLines: RawLineHit[] = [];
  const globalLines: RawLineHit[] = [];
  for (const envelope of result.drawingReview?.envelopes ?? []) {
    if (envelope.role !== 'connections') continue;
    for (const line of envelope.data.lines ?? []) {
      const regionDisplayId = line.sourceId ? regionBySourceId.get(line.sourceId) : undefined;
      const adapted: RawLineHit = {
        localId: line.id,
        lineKind: line.lineKind,
        path: line.path.map((point) => ({ ...point })),
        junctions: line.junctions.map((point) => ({ ...point })),
        crossovers: line.crossovers.map((point) => ({ ...point })),
        confidence: line.confidence,
        pageIndex,
        regionId: line.sourceId ?? 'full-page',
        certainty: line.confidence >= 0.8 ? 'confirmed' : 'ambiguous',
        sourceEvidenceIds: [line.id],
      };
      if (regionDisplayId) adapted.regionDisplayId = regionDisplayId;
      if (line.startAnchorId) adapted.startAnchorId = line.startAnchorId;
      if (line.endAnchorId) adapted.endAnchorId = line.endAnchorId;
      if (line.openEndReason !== undefined) adapted.openEndReason = line.openEndReason;
      if (regionDisplayId) {
        if (adapted.startAnchorId || adapted.endAnchorId) localLines.push(adapted);
      } else if (!line.sourceId?.includes(':region:')) {
        globalLines.push(adapted);
      }
    }
  }
  return { plan, localLines, globalLines };
}

export function adaptTeamResult(
  result: TeamResult,
  context: TeamAdapterContext,
): AdaptedTeamResult {
  const reviewGraph = result.drawingReview?.graph;
  const reviewedTexts = adaptReviewTexts(result, context.pageIndex);
  const continuity = adaptContinuityReview(result, context.pageIndex);
  const titleBlockBounds = detectTitleBlockBounds(reviewedTexts, context.width, context.height);
  const componentCandidates = (result.components ?? []).filter((component) =>
    component.properties?.synthetic === undefined
    && classifyTextContent(component.label) !== 'note');
  const positions = [
    ...componentCandidates.flatMap((component) => component.position ? [component.position] : []),
    ...(result.vectorTexts ?? []).map((item) => item.position),
  ];
  const mapPosition = sourcePositionMapper(positions, context);
  const symbolSize = clamp(Math.min(context.width, context.height) * 0.025, 16, 64);
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
  const scheduleBounds = detectScheduleBounds([...reviewedTexts, ...vectorTexts], context.width, context.height);
  const graphSymbols: RawSymbolHit[] = reviewGraph?.symbols
    .filter((symbol) => classifyTextContent(symbol.rawLabel ?? '') !== 'note')
    .filter((symbol) => !titleBlockBounds || !boundsCenterInside(symbol.bounds, titleBlockBounds))
    .filter((symbol) => !scheduleBounds.some((bounds) => boundsCenterInside(symbol.bounds, bounds)))
    .map((symbol) => ({
        localId: symbol.id,
        type: normalizedEquipmentType(symbol.typeCandidates[0] ?? 'other', symbol.rawLabel),
        label: symbol.rawLabel ?? undefined,
        bounds: { x: symbol.bounds.x, y: symbol.bounds.y, w: symbol.bounds.w, h: symbol.bounds.h },
        confidence: symbol.confidence,
        pageIndex: context.pageIndex,
        regionId: symbol.sourceIds.join(',') || 'full-page',
        certainty: symbol.typeCandidates.length === 1 && symbol.confidence >= 0.85 ? 'confirmed' : 'ambiguous',
        sourceEvidenceIds: symbol.originalEvidenceIds ?? [symbol.originalEvidenceId ?? symbol.id],
      })) ?? [];
  const graphLines: RawLineHit[] = reviewGraph?.lines
    .filter((line) => !titleBlockBounds || !pathInsideBounds(line.path, titleBlockBounds))
    .filter((line) => !scheduleBounds.some((bounds) => pathInsideBounds(line.path, bounds)))
    .map((line) => ({
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
      })) ?? [];
  const components = componentCandidates.filter((component) => {
    if (!component.position) return false;
    const point = mapPosition(component.position);
    return !scheduleBounds.some((bounds) => boundsCenterInside({ x: point.x, y: point.y, w: 0, h: 0 }, bounds));
  });
  const countableComponentIds = new Set(components.map((component) => component.id));
  const mapped = new Map<string, Position>();
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
      type: normalizedEquipmentType(component.type, component.label),
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

  const lines: RawLineHit[] = [];
  for (let index = 0; index < (result.connections ?? []).length; index += 1) {
    const connection = result.connections?.[index];
    if (!connection) continue;
    if (!countableComponentIds.has(connection.from) || !countableComponentIds.has(connection.to)) continue;
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
    symbols: graphSymbols.length > 0 ? graphSymbols : symbols,
    lines: graphLines.length > 0 ? graphLines : lines,
    texts: reviewedTexts.length > 0 ? reviewedTexts : vectorTexts.length > 0 ? vectorTexts : texts,
    ...(continuity ? { continuity } : {}),
  };
}
