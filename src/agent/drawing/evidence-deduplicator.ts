/**
 * Merge overlapping region detections into original-coordinate entities.
 */

import type { EvidenceBounds } from '../vision/evidence-types';
import type { Certainty, LineNode, RelationEdge, SymbolNode, TextNode } from './types-v3';

export interface RawSymbolHit {
  localId: string;
  type: string;
  label?: string;
  bounds: EvidenceBounds;
  confidence: number;
  pageIndex: number;
  regionId: string;
  certainty?: Certainty;
}

export interface RawLineHit {
  localId: string;
  lineKind: LineNode['lineKind'];
  path: Array<{ x: number; y: number }>;
  confidence: number;
  pageIndex: number;
  regionId: string;
  certainty?: Certainty;
}

export function deduplicateSymbols(
  hits: RawSymbolHit[],
  tolerance = 24,
): SymbolNode[] {
  const kept: SymbolNode[] = [];
  let seq = 0;

  for (const hit of hits) {
    const dup = kept.find((k) =>
      k.evidence[0]?.pageIndex === hit.pageIndex
      && typesCompatible(k.typeCandidates[0] ?? '', hit.type)
      && boundsNear(k.evidence[0].bounds, hit.bounds, tolerance)
      && labelsCompatible(k.rawLabel, hit.label));

    if (dup) {
      if (hit.confidence > (dup.evidence[0]?.confidence ?? 0)) {
        dup.typeCandidates = unique([hit.type, ...dup.typeCandidates]);
        dup.rawLabel = hit.label ?? dup.rawLabel;
        dup.evidence = [{
          evidenceId: `${dup.id}-e`,
          pageIndex: hit.pageIndex,
          bounds: hit.bounds,
          regionId: hit.regionId,
          confidence: hit.confidence,
        }];
      }
      continue;
    }

    const page = hit.pageIndex + 1;
    const displayId = `P${String(page).padStart(2, '0')}-S${String(++seq).padStart(3, '0')}`;
    const id = `sym-${hit.pageIndex}-${seq}`;
    kept.push({
      id,
      displayId,
      typeCandidates: [hit.type],
      confirmedType: hit.certainty === 'confirmed' ? hit.type : undefined,
      rawLabel: hit.label,
      certainty: hit.certainty ?? (hit.confidence >= 0.85 ? 'confirmed' : 'ambiguous'),
      evidence: [{
        evidenceId: `${id}-e0`,
        pageIndex: hit.pageIndex,
        bounds: hit.bounds,
        regionId: hit.regionId,
        confidence: hit.confidence,
      }],
    });
  }
  return kept;
}

export function deduplicateLines(hits: RawLineHit[], tolerance = 18): LineNode[] {
  const kept: LineNode[] = [];
  let seq = 0;
  for (const hit of hits) {
    if (hit.path.length < 2) continue;
    const start = hit.path[0];
    const end = hit.path[hit.path.length - 1];
    const dup = kept.find((k) => {
      if (k.evidence[0]?.pageIndex !== hit.pageIndex) return false;
      const ks = k.path[0];
      const ke = k.path[k.path.length - 1];
      return (dist(ks, start) <= tolerance && dist(ke, end) <= tolerance)
        || (dist(ks, end) <= tolerance && dist(ke, start) <= tolerance);
    });
    if (dup) continue;
    const page = hit.pageIndex + 1;
    const displayId = `P${String(page).padStart(2, '0')}-L${String(++seq).padStart(3, '0')}`;
    const id = `line-${hit.pageIndex}-${seq}`;
    kept.push({
      id,
      displayId,
      lineKind: hit.lineKind,
      path: hit.path,
      certainty: hit.certainty ?? (hit.confidence >= 0.8 ? 'confirmed' : 'ambiguous'),
      evidence: [{
        evidenceId: `${id}-e0`,
        pageIndex: hit.pageIndex,
        bounds: pathBounds(hit.path),
        regionId: hit.regionId,
        confidence: hit.confidence,
      }],
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
  return texts.map((t, i) => {
    const page = t.pageIndex + 1;
    const displayId = `P${String(page).padStart(2, '0')}-T${String(i + 1).padStart(3, '0')}`;
    const id = `txt-${t.pageIndex}-${i + 1}`;
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
  const pageSymbols = symbols.filter((s) => s.evidence[0]?.pageIndex === pageIndex && s.certainty === 'confirmed');
  const pageLines = lines.filter((l) => l.evidence[0]?.pageIndex === pageIndex && l.certainty === 'confirmed');
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
      certainty: 'confirmed',
      evidence: [...from.evidence, ...to.evidence, ...line.evidence],
    });
  }
  return relations;
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

function labelsCompatible(a?: string, b?: string): boolean {
  if (!a || !b) return true;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function typesCompatible(a: string, b: string): boolean {
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
