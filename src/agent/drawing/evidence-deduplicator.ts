/**
 * Merge overlapping region detections into original-coordinate entities.
 */

import { createHash } from 'node:crypto';

import type { EvidenceBounds } from '../vision/evidence-types';
import type { Certainty, LineNode, RelationEdge, SymbolNode, TextNode, UnresolvedItem } from './types-v3';

export interface RawSymbolHit {
  localId: string;
  type: string;
  label?: string;
  bounds: EvidenceBounds;
  confidence: number;
  pageIndex: number;
  regionId: string;
  certainty?: Certainty;
  sourceEvidenceIds?: string[];
}

export interface RawLineHit {
  localId: string;
  lineKind: LineNode['lineKind'];
  path: Array<{ x: number; y: number }>;
  junctions?: Array<{ x: number; y: number }>;
  crossovers?: Array<{ x: number; y: number }>;
  confidence: number;
  pageIndex: number;
  regionId: string;
  regionDisplayId?: string;
  regionDisplayIds?: string[];
  startAnchorId?: string;
  endAnchorId?: string;
  openEndReason?: 'page-edge' | 'device-boundary' | 'unresolved' | null;
  certainty?: Certainty;
  sourceEvidenceIds?: string[];
}

function evidenceRefs(
  hit: Pick<RawSymbolHit, 'sourceEvidenceIds' | 'pageIndex' | 'bounds' | 'regionId' | 'confidence'>,
  fallbackId: string,
) {
  const ids = hit.sourceEvidenceIds?.length ? [...new Set(hit.sourceEvidenceIds)] : [fallbackId];
  return ids.map((evidenceId) => ({
    evidenceId,
    pageIndex: hit.pageIndex,
    bounds: hit.bounds,
    regionId: hit.regionId,
    confidence: hit.confidence,
  }));
}

export function deduplicateSymbols(
  hits: RawSymbolHit[],
  tolerance = 24,
): SymbolNode[] {
  const kept: SymbolNode[] = [];
  const pageSequences = new Map<number, number>();
  const ordered = [...hits].sort((left, right) =>
    left.pageIndex - right.pageIndex
    || left.bounds.y - right.bounds.y
    || left.bounds.x - right.bounds.x
    || left.localId.localeCompare(right.localId));

  for (const hit of ordered) {
    const dup = kept.find((k) => {
      if (k.evidence[0]?.pageIndex !== hit.pageIndex) return false;
      if (!boundsNear(k.evidence[0].bounds, hit.bounds, tolerance)) return false;
      const sameType = k.typeCandidates.some((candidate) => typesCompatible(candidate, hit.type));
      return sameType || labelsEquivalent(k.rawLabel, hit.label);
    });

    if (dup) {
      const previousMaxConfidence = Math.max(...dup.evidence.map((item) => item.confidence));
      const incoming = evidenceRefs(hit, `${dup.id}-e${dup.evidence.length}`)
        .filter((item) => !dup.evidence.some((existing) => existing.evidenceId === item.evidenceId));
      dup.evidence.push(...incoming);
      const typeConflict = !dup.typeCandidates.some((candidate) => typesCompatible(candidate, hit.type));
      dup.typeCandidates = unique([...dup.typeCandidates, hit.type]);
      if (typeConflict) {
        dup.confirmedType = undefined;
        dup.certainty = 'ambiguous';
        dup.rawLabel = dup.rawLabel ?? hit.label;
      } else if (hit.confidence > previousMaxConfidence) {
        dup.rawLabel = hit.label ?? dup.rawLabel;
        if (hit.certainty === 'confirmed' || hit.confidence >= 0.85) {
          dup.confirmedType = hit.type;
          dup.certainty = 'confirmed';
        }
      }
      continue;
    }

    const page = hit.pageIndex + 1;
    const seq = (pageSequences.get(hit.pageIndex) ?? 0) + 1;
    pageSequences.set(hit.pageIndex, seq);
    const displayId = `P${String(page).padStart(2, '0')}-S${String(seq).padStart(3, '0')}`;
    const id = stableId('sym', [hit.pageIndex, normalizeType(hit.type), normalizeLabel(hit.label), boundsKey(hit.bounds)]);
    kept.push({
      id,
      displayId,
      typeCandidates: [hit.type],
      confirmedType: hit.certainty === 'confirmed' ? hit.type : undefined,
      rawLabel: hit.label,
      certainty: hit.certainty ?? (hit.confidence >= 0.85 ? 'confirmed' : 'ambiguous'),
      evidence: evidenceRefs(hit, `${id}-e0`),
    });
  }
  return kept;
}

export function deduplicateLines(hits: RawLineHit[], tolerance = 18): LineNode[] {
  const kept: LineNode[] = [];
  const pageSequences = new Map<number, number>();
  const ordered = [...hits].sort((left, right) =>
    left.pageIndex - right.pageIndex
    || (left.path[0]?.y ?? 0) - (right.path[0]?.y ?? 0)
    || (left.path[0]?.x ?? 0) - (right.path[0]?.x ?? 0)
    || left.localId.localeCompare(right.localId));
  for (const hit of ordered) {
    if (hit.path.length < 2) continue;
    const start = hit.path[0];
    const end = hit.path[hit.path.length - 1];
    const dup = kept.find((k) => {
      if (k.evidence[0]?.pageIndex !== hit.pageIndex) return false;
      if (k.lineKind !== hit.lineKind) return false;
      const ks = k.path[0];
      const ke = k.path[k.path.length - 1];
      return (dist(ks, start) <= tolerance && dist(ke, end) <= tolerance)
        || (dist(ks, end) <= tolerance && dist(ke, start) <= tolerance)
        || substantiallyOverlappingSegments(ks, ke, start, end, tolerance);
    });
    if (dup) {
      const incoming = evidenceRefs({ ...hit, bounds: pathBounds(hit.path) }, `${dup.id}-e${dup.evidence.length}`)
        .filter((item) => !dup.evidence.some((existing) => existing.evidenceId === item.evidenceId));
      dup.evidence.push(...incoming);
      dup.junctions = mergePoints(dup.junctions, hit.junctions ?? [], tolerance);
      dup.crossovers = mergePoints(dup.crossovers, hit.crossovers ?? [], tolerance);
      if (dist(start, end) > dist(dup.path[0], dup.path[dup.path.length - 1])) {
        dup.path = hit.path.map((point) => ({ ...point }));
      }
      continue;
    }
    const page = hit.pageIndex + 1;
    const seq = (pageSequences.get(hit.pageIndex) ?? 0) + 1;
    pageSequences.set(hit.pageIndex, seq);
    const displayId = `P${String(page).padStart(2, '0')}-L${String(seq).padStart(3, '0')}`;
    const id = stableId('line', [hit.pageIndex, hit.lineKind, hit.path.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(';')]);
    kept.push({
      id,
      displayId,
      lineKind: hit.lineKind,
      path: hit.path,
      junctions: [...(hit.junctions ?? [])],
      crossovers: [...(hit.crossovers ?? [])],
      certainty: hit.certainty ?? (hit.confidence >= 0.8 ? 'confirmed' : 'ambiguous'),
      evidence: evidenceRefs({ ...hit, bounds: pathBounds(hit.path) }, `${id}-e0`),
    });
  }
  return kept;
}

export function assignDisplayIdsForTexts(
  texts: Array<{
    text: string;
    bounds: EvidenceBounds;
    pageIndex: number;
    certainty: Certainty;
    confidence: number;
    candidates?: string[];
  }>,
): TextNode[] {
  const pageSequences = new Map<number, number>();
  return [...texts].sort((left, right) =>
    left.pageIndex - right.pageIndex
    || left.bounds.y - right.bounds.y
    || left.bounds.x - right.bounds.x
    || left.text.localeCompare(right.text)).map((t) => {
    const page = t.pageIndex + 1;
    const seq = (pageSequences.get(t.pageIndex) ?? 0) + 1;
    pageSequences.set(t.pageIndex, seq);
    const displayId = `P${String(page).padStart(2, '0')}-T${String(seq).padStart(3, '0')}`;
    const id = `txt-${t.pageIndex}-${seq}`;
    return {
      id,
      displayId,
      rawText: t.text,
      confirmedText: t.certainty === 'confirmed' ? t.text : undefined,
      candidates: t.candidates ?? [t.text],
      certainty: t.certainty,
      evidence: [{
        evidenceId: `${id}-e0`,
        pageIndex: t.pageIndex,
        bounds: t.bounds,
        confidence: t.confidence,
      }],
    };
  });
}

export function buildPageRelations(
  symbols: SymbolNode[],
  lines: LineNode[],
  pageIndex: number,
): RelationEdge[] {
  // 모호한 기기 후보도 선로 종단 후보로 연결해 사용자가 번호 관계를 검토할 수
  // 있게 한다. 단, 어느 한쪽이라도 미확정이면 관계 전체를 ambiguous로 유지한다.
  const pageSymbols = symbols.filter((s) => s.evidence[0]?.pageIndex === pageIndex && s.certainty !== 'unread');
  const pageLines = lines.filter((l) => l.evidence[0]?.pageIndex === pageIndex && l.certainty !== 'unread');
  const relations: RelationEdge[] = [];
  let seq = 0;

  for (const line of pageLines) {
    const start = line.path[0];
    const end = line.path[line.path.length - 1];
    const from = nearestSymbol(pageSymbols, start);
    const to = nearestSymbol(pageSymbols, end);
    if (!from || !to || from.id === to.id) continue;
    const page = pageIndex + 1;
    const displayId = `P${String(page).padStart(2, '0')}-R${String(++seq).padStart(3, '0')}`;
    relations.push({
      id: `rel-${pageIndex}-${seq}`,
      displayId,
      from: from.id,
      to: to.id,
      lineId: line.id,
      certainty: line.certainty === 'confirmed' && from.certainty === 'confirmed' && to.certainty === 'confirmed'
        ? 'confirmed'
        : 'ambiguous',
      evidence: [...from.evidence, ...to.evidence, ...line.evidence],
    });
  }
  return relations;
}

export function findUnboundLineItems(
  lines: LineNode[],
  relations: RelationEdge[],
): UnresolvedItem[] {
  const bound = new Set(relations.map((relation) => relation.lineId).filter(Boolean));
  return lines.filter((line) => line.certainty === 'confirmed' && !bound.has(line.id)).map((line) => {
    const evidence = line.evidence[0];
    return {
      id: `unbound-${line.id}`,
      code: 'LINE_CONTINUITY_UNCERTAIN' as const,
      displayId: line.displayId,
      pageIndex: evidence?.pageIndex ?? 0,
      regionId: evidence?.regionId,
      bounds: evidence?.bounds ?? pathBounds(line.path),
      userConfirmItems: [{ question: `${line.displayId} 선로의 양쪽 연결 장치를 확인하십시오.` }],
      note: '선로의 양쪽 종단 장치를 모두 확정하지 못해 관계 설명을 보류했습니다.',
    };
  });
}

function nearestSymbol(symbols: SymbolNode[], point: { x: number; y: number }, max = 80): SymbolNode | null {
  let best: SymbolNode | null = null;
  let bestD = max;
  for (const s of symbols) {
    const b = s.evidence[0]?.bounds;
    if (!b) continue;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const d = Math.hypot(cx - point.x, cy - point.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function boundsNear(a: EvidenceBounds, b: EvidenceBounds, tol: number): boolean {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return Math.hypot(ac.x - bc.x, ac.y - bc.y) <= tol;
}

function labelsEquivalent(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return normalizeLabel(a) === normalizeLabel(b);
}

function typesCompatible(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normalizeType(a) === normalizeType(b);
}

function normalizeType(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function normalizeLabel(value?: string): string {
  return value?.trim().toUpperCase().replace(/\s+/g, '') ?? '';
}

function boundsKey(bounds: EvidenceBounds): string {
  return [bounds.x, bounds.y, bounds.w, bounds.h].map((value) => Math.round(value)).join(',');
}

function stableId(prefix: string, parts: Array<string | number>): string {
  return `${prefix}-${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16)}`;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function substantiallyOverlappingSegments(
  aStart: { x: number; y: number },
  aEnd: { x: number; y: number },
  bStart: { x: number; y: number },
  bEnd: { x: number; y: number },
  tolerance: number,
): boolean {
  const ax = aEnd.x - aStart.x;
  const ay = aEnd.y - aStart.y;
  const bx = bEnd.x - bStart.x;
  const by = bEnd.y - bStart.y;
  const aLength = Math.hypot(ax, ay);
  const bLength = Math.hypot(bx, by);
  if (aLength === 0 || bLength === 0) return false;

  // Same axis within about six degrees.
  const crossRatio = Math.abs(ax * by - ay * bx) / (aLength * bLength);
  if (crossRatio > 0.1) return false;

  const perpendicularDistance = (point: { x: number; y: number }) =>
    Math.abs(ax * (aStart.y - point.y) - (aStart.x - point.x) * ay) / aLength;
  if (perpendicularDistance(bStart) > tolerance || perpendicularDistance(bEnd) > tolerance) return false;

  const ux = ax / aLength;
  const uy = ay / aLength;
  const b0 = (bStart.x - aStart.x) * ux + (bStart.y - aStart.y) * uy;
  const b1 = (bEnd.x - aStart.x) * ux + (bEnd.y - aStart.y) * uy;
  const overlap = Math.max(0, Math.min(aLength, Math.max(b0, b1)) - Math.max(0, Math.min(b0, b1)));
  return overlap / Math.min(aLength, bLength) >= 0.75;
}

function pathBounds(path: Array<{ x: number; y: number }>): EvidenceBounds {
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function mergePoints(
  current: Array<{ x: number; y: number }>,
  incoming: Array<{ x: number; y: number }>,
  tolerance: number,
): Array<{ x: number; y: number }> {
  const merged = current.map((point) => ({ ...point }));
  for (const point of incoming) {
    if (!merged.some((existing) => dist(existing, point) <= tolerance)) merged.push({ ...point });
  }
  return merged;
}
