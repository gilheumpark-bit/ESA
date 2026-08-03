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
    const hitType = canonicalSymbolType(hit.type, hit.label);
    const dup = kept.find((k) => {
      const samePhysicalBounds = k.evidence.some((evidence) => evidence.pageIndex === hit.pageIndex
        && (boundsNear(evidence.bounds, hit.bounds, tolerance)
          || boundsStronglyOverlap(evidence.bounds, hit.bounds)
          || boundsPartialReadOverlap(evidence.bounds, hit.bounds)));
      if (!samePhysicalBounds) return false;
      const sameType = k.typeCandidates.some((candidate) => typesCompatible(candidate, hitType));
      return sameType || labelsEquivalent(k.rawLabel, hit.label);
    });

    if (dup) {
      const previousMaxConfidence = Math.max(...dup.evidence.map((item) => item.confidence));
      const incoming = evidenceRefs(hit, `${dup.id}-e${dup.evidence.length}`)
        .filter((item) => !dup.evidence.some((existing) => existing.evidenceId === item.evidenceId));
      dup.evidence.push(...incoming);
      const typeConflict = !dup.typeCandidates.some((candidate) => typesCompatible(candidate, hitType));
      dup.typeCandidates = unique([...dup.typeCandidates, hitType]);
      if (typeConflict) {
        dup.confirmedType = undefined;
        dup.certainty = 'ambiguous';
        dup.rawLabel = dup.rawLabel ?? hit.label;
      } else if (hit.confidence > previousMaxConfidence) {
        dup.rawLabel = hit.label ?? dup.rawLabel;
        if (hit.certainty === 'confirmed' || hit.confidence >= 0.85) {
          dup.confirmedType = hitType;
          dup.certainty = 'confirmed';
        }
      }
      continue;
    }

    const page = hit.pageIndex + 1;
    const seq = (pageSequences.get(hit.pageIndex) ?? 0) + 1;
    pageSequences.set(hit.pageIndex, seq);
    const displayId = `P${String(page).padStart(2, '0')}-S${String(seq).padStart(3, '0')}`;
    const id = stableId('sym', [hit.pageIndex, normalizeType(hitType), normalizeLabel(hit.label), boundsKey(hit.bounds)]);
    kept.push({
      id,
      displayId,
      typeCandidates: [hitType],
      confirmedType: hit.certainty === 'confirmed' ? hitType : undefined,
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
      // The same heavy conductor is often called `bus` in the full-page read
      // and `power` in a crop. Geometry, not that role-name disagreement,
      // identifies the physical line. Ground/control remain electrically
      // distinct and must never be folded into it.
      if (!lineKindsEquivalentForDedup(k.lineKind, hit.lineKind)) return false;
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
      if (hit.lineKind === 'bus' || (dup.lineKind === 'unknown' && hit.lineKind !== 'unknown')) {
        dup.lineKind = hit.lineKind;
      }
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
  const relatedPairs = new Set<string>();
  let seq = 0;

  const appendRelation = (from: SymbolNode, to: SymbolNode, line: LineNode, certainty: Certainty): void => {
    const pairKey = [from.id, to.id].sort().join('|');
    if (relatedPairs.has(pairKey)) return;
    relatedPairs.add(pairKey);
    const page = pageIndex + 1;
    const displayId = `P${String(page).padStart(2, '0')}-R${String(++seq).padStart(3, '0')}`;
    relations.push({
      id: `rel-${pageIndex}-${seq}`,
      displayId,
      from: from.id,
      to: to.id,
      lineId: line.id,
      certainty,
      evidence: [...from.evidence, ...to.evidence, ...line.evidence],
    });
  };

  const endpointSymbols = new Map(pageLines.map((line) => {
    const start = nearestSymbol(pageSymbols, line.path[0]);
    const end = nearestSymbol(pageSymbols, line.path[line.path.length - 1]);
    return [line.id, { start, end }] as const;
  }));

  for (const line of pageLines) {
    const symbolsOnConductor = orderedSymbolsOnConductor(pageSymbols, line);
    for (let index = 1; index < symbolsOnConductor.length; index += 1) {
      const from = symbolsOnConductor[index - 1];
      const to = symbolsOnConductor[index];
      if (from.id === to.id) continue;
      appendRelation(
        from,
        to,
        line,
        line.certainty === 'confirmed' && from.certainty === 'confirmed' && to.certainty === 'confirmed'
          ? 'confirmed'
          : 'ambiguous',
      );
    }
  }

  // Precision crops often leave a small gap between a branch endpoint and the
  // bus segment seen in a neighboring crop. Trace only a perpendicular
  // endpoint-to-segment continuation, then attach the branch device to a
  // busbar already anchored elsewhere in that conductor component. Relations
  // created through this inferred bridge stay ambiguous.
  const adjacency = buildLineAdjacency(pageLines);
  for (const line of pageLines) {
    const direct = endpointSymbols.get(line.id);
    const directlyBound = [...new Map([direct?.start, direct?.end]
      .filter((symbol): symbol is SymbolNode => Boolean(symbol))
      .map((symbol) => [symbol.id, symbol])).values()];
    if (directlyBound.length !== 1 || isBusbar(directlyBound[0])) continue;
    const component = connectedLineIds(line.id, adjacency);
    const busbars = [...new Map(component.flatMap((lineId) => {
      const bound = endpointSymbols.get(lineId);
      return [bound?.start, bound?.end]
        .filter((symbol): symbol is SymbolNode => symbol !== null && symbol !== undefined)
        .filter(isBusbar);
    }).map((symbol) => [symbol.id, symbol])).values()];
    if (busbars.length === 0) continue;
    const targetPoint = direct?.start?.id === directlyBound[0].id
      ? line.path[line.path.length - 1]
      : line.path[0];
    const busbar = busbars.sort((left, right) => symbolDistance(left, targetPoint) - symbolDistance(right, targetPoint))[0];
    appendRelation(busbar, directlyBound[0], line, 'ambiguous');
  }

  // A precision grid can split one conductor into two valid crop-edge
  // fragments. When the geometry reconciler proves those fragments meet,
  // connect the devices observed across the whole conductor component. Use a
  // minimum spanning tree so a branched conductor yields the smallest useful
  // relation set rather than an all-to-all clique. These are always ambiguous:
  // the application joined the fragments; no reviewer saw the complete edge.
  const processedLineIds = new Set<string>();
  const lineById = new Map(pageLines.map((line) => [line.id, line]));
  for (const line of pageLines) {
    if (processedLineIds.has(line.id)) continue;
    const componentIds = connectedLineIds(line.id, adjacency);
    componentIds.forEach((id) => processedLineIds.add(id));
    if (componentIds.length < 2) continue;
    const componentLines = componentIds
      .map((id) => lineById.get(id))
      .filter((candidate): candidate is LineNode => candidate !== undefined);
    const symbolsByLine = new Map(componentLines.map((candidate) => {
      const bound = endpointSymbols.get(candidate.id);
      const boundSymbols = [
        ...orderedSymbolsOnConductor(pageSymbols, candidate),
        bound?.start,
        bound?.end,
      ].filter((symbol): symbol is SymbolNode => symbol !== null && symbol !== undefined);
      return [candidate.id, [...new Map(boundSymbols.map((symbol) => [symbol.id, symbol])).values()]] as const;
    }));
    const componentSymbols = [...new Map([...symbolsByLine.values()].flat()
      .map((symbol) => [symbol.id, symbol])).values()];
    if (componentSymbols.length < 2) continue;
    const symbolLineIds = new Map(componentSymbols.map((symbol) => [
      symbol.id,
      [...symbolsByLine.entries()]
        .filter(([, boundSymbols]) => boundSymbols.some((candidate) => candidate.id === symbol.id))
        .map(([lineId]) => lineId),
    ]));

    const parent = new Map(componentSymbols.map((symbol) => [symbol.id, symbol.id]));
    const find = (id: string): string => {
      const current = parent.get(id) ?? id;
      if (current === id) return id;
      const root = find(current);
      parent.set(id, root);
      return root;
    };
    const union = (left: string, right: string): void => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
    };

    for (let leftIndex = 0; leftIndex < componentSymbols.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < componentSymbols.length; rightIndex += 1) {
        const left = componentSymbols[leftIndex];
        const right = componentSymbols[rightIndex];
        if (relatedPairs.has([left.id, right.id].sort().join('|'))) union(left.id, right.id);
      }
    }

    const candidates = componentSymbols.flatMap((left, leftIndex) =>
      componentSymbols.slice(leftIndex + 1).map((right) => ({
        left,
        right,
        hops: shortestLineHops(symbolLineIds.get(left.id) ?? [], symbolLineIds.get(right.id) ?? [], adjacency),
        distance: dist(symbolCenter(left), symbolCenter(right)),
      })))
      .filter((candidate) => Number.isFinite(candidate.hops))
      .sort((a, b) => a.hops - b.hops || a.distance - b.distance || a.left.id.localeCompare(b.left.id) || a.right.id.localeCompare(b.right.id));
    for (const candidate of candidates) {
      if (find(candidate.left.id) === find(candidate.right.id)) continue;
      const relationLine = closestLineToSymbols(componentLines, candidate.left, candidate.right);
      appendRelation(candidate.left, candidate.right, relationLine, 'ambiguous');
      union(candidate.left.id, candidate.right.id);
    }
  }
  return relations;
}

function shortestLineHops(
  fromIds: readonly string[],
  toIds: readonly string[],
  adjacency: Map<string, Set<string>>,
): number {
  const targets = new Set(toIds);
  const visited = new Set<string>();
  let frontier = [...new Set(fromIds)];
  let hops = 0;
  while (frontier.length > 0) {
    if (frontier.some((id) => targets.has(id))) return hops;
    const next: string[] = [];
    for (const id of frontier) {
      if (visited.has(id)) continue;
      visited.add(id);
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visited.has(neighbor)) next.push(neighbor);
      }
    }
    frontier = [...new Set(next)];
    hops += 1;
  }
  return Number.POSITIVE_INFINITY;
}

function symbolCenter(symbol: SymbolNode): { x: number; y: number } {
  const bounds = symbol.evidence[0]?.bounds;
  return bounds
    ? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
    : { x: 0, y: 0 };
}

function closestLineToSymbols(lines: LineNode[], left: SymbolNode, right: SymbolNode): LineNode {
  const leftCenter = symbolCenter(left);
  const rightCenter = symbolCenter(right);
  return [...lines].sort((a, b) => {
    const score = (line: LineNode) =>
      projectPointOnPath(leftCenter, line.path).distance + projectPointOnPath(rightCenter, line.path).distance;
    return score(a) - score(b) || a.id.localeCompare(b.id);
  })[0];
}

function lineKindsEquivalentForDedup(
  left: LineNode['lineKind'],
  right: LineNode['lineKind'],
): boolean {
  if (left === right) return true;
  const conductorKinds = new Set<LineNode['lineKind']>(['bus', 'power', 'unknown']);
  return conductorKinds.has(left) && conductorKinds.has(right);
}

/**
 * Vision models commonly return one long polyline even when it passes through
 * one or more breakers. Binding only the two endpoints silently skips those
 * devices. Keep the endpoint candidates, add every symbol whose actual bounds
 * intersect the conductor, then order them by distance along the polyline so
 * the graph contains each adjacent electrical relationship.
 */
function orderedSymbolsOnConductor(symbols: SymbolNode[], line: LineNode): SymbolNode[] {
  const candidates = new Map<string, { symbol: SymbolNode; offset: number; distance: number }>();
  const append = (symbol: SymbolNode | null): void => {
    if (!symbol) return;
    const bounds = symbol.evidence[0]?.bounds;
    if (!bounds) return;
    const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
    const projection = projectPointOnPath(center, line.path);
    const previous = candidates.get(symbol.id);
    if (!previous || projection.distance < previous.distance) {
      candidates.set(symbol.id, { symbol, ...projection });
    }
  };

  append(nearestSymbol(symbols, line.path[0]));
  append(nearestSymbol(symbols, line.path[line.path.length - 1]));
  for (const symbol of symbols) {
    const bounds = symbol.evidence[0]?.bounds;
    // Deterministic raster fallback lines are intentionally ambiguous and can
    // sit a few antialias pixels above a roof/device boundary. Allow that
    // bounded gap only on ambiguous lines; confirmed reviewer geometry keeps
    // the strict two-pixel contact rule.
    const contactTolerance = line.certainty === 'confirmed' ? 2 : 10;
    if (bounds && pathIntersectsBounds(line.path, bounds, contactTolerance)) append(symbol);
  }

  return [...candidates.values()]
    .sort((left, right) => left.offset - right.offset || left.distance - right.distance || left.symbol.id.localeCompare(right.symbol.id))
    .map(({ symbol }) => symbol);
}

function projectPointOnPath(
  point: { x: number; y: number },
  path: LineNode['path'],
): { offset: number; distance: number } {
  let traversed = 0;
  let best = { offset: 0, distance: Number.POSITIVE_INFINITY };
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const lengthSquared = vx * vx + vy * vy;
    if (lengthSquared === 0) continue;
    const segmentLength = Math.sqrt(lengthSquared);
    const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSquared));
    const projected = { x: start.x + ratio * vx, y: start.y + ratio * vy };
    const distance = dist(point, projected);
    if (distance < best.distance) best = { offset: traversed + ratio * segmentLength, distance };
    traversed += segmentLength;
  }
  return best;
}

function pathIntersectsBounds(path: LineNode['path'], bounds: EvidenceBounds, tolerance: number): boolean {
  const expanded = {
    x: bounds.x - tolerance,
    y: bounds.y - tolerance,
    w: bounds.w + tolerance * 2,
    h: bounds.h + tolerance * 2,
  };
  for (let index = 1; index < path.length; index += 1) {
    if (segmentIntersectsBounds(path[index - 1], path[index], expanded)) return true;
  }
  return false;
}

function segmentIntersectsBounds(
  start: { x: number; y: number },
  end: { x: number; y: number },
  bounds: EvidenceBounds,
): boolean {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  if (maxX < bounds.x || minX > bounds.x + bounds.w || maxY < bounds.y || minY > bounds.y + bounds.h) return false;
  if (pointInsideBounds(start, bounds) || pointInsideBounds(end, bounds)) return true;

  const edges = [
    [{ x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.w, y: bounds.y }],
    [{ x: bounds.x + bounds.w, y: bounds.y }, { x: bounds.x + bounds.w, y: bounds.y + bounds.h }],
    [{ x: bounds.x + bounds.w, y: bounds.y + bounds.h }, { x: bounds.x, y: bounds.y + bounds.h }],
    [{ x: bounds.x, y: bounds.y + bounds.h }, { x: bounds.x, y: bounds.y }],
  ] as const;
  return edges.some(([edgeStart, edgeEnd]) => segmentsIntersect(start, end, edgeStart, edgeEnd));
}

function pointInsideBounds(point: { x: number; y: number }, bounds: EvidenceBounds): boolean {
  return point.x >= bounds.x && point.x <= bounds.x + bounds.w
    && point.y >= bounds.y && point.y <= bounds.y + bounds.h;
}

function segmentsIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  const orientation = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return ((o1 <= 0 && o2 >= 0) || (o1 >= 0 && o2 <= 0))
    && ((o3 <= 0 && o4 >= 0) || (o3 >= 0 && o4 <= 0));
}

function buildLineAdjacency(lines: LineNode[], tolerance = 55): Map<string, Set<string>> {
  const adjacency = new Map(lines.map((line) => [line.id, new Set<string>()]));
  for (let leftIndex = 0; leftIndex < lines.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < lines.length; rightIndex += 1) {
      const left = lines[leftIndex];
      const right = lines[rightIndex];
      if (!lineKindsConnect(left.lineKind, right.lineKind) || !expandedBoundsIntersect(pathBounds(left.path), pathBounds(right.path), tolerance)) continue;
      if (!linesMeet(left.path, right.path, tolerance)) continue;
      adjacency.get(left.id)?.add(right.id);
      adjacency.get(right.id)?.add(left.id);
    }
  }
  return adjacency;
}

function connectedLineIds(startId: string, adjacency: Map<string, Set<string>>): string[] {
  const visited = new Set<string>();
  const pending = [startId];
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    for (const neighbor of adjacency.get(id) ?? []) pending.push(neighbor);
  }
  return [...visited];
}

function linesMeet(left: LineNode['path'], right: LineNode['path'], tolerance: number): boolean {
  return endpointMeetsPath(left[0], directionAt(left, 0), right, tolerance)
    || endpointMeetsPath(left[left.length - 1], directionAt(left, left.length - 1), right, tolerance)
    || endpointMeetsPath(right[0], directionAt(right, 0), left, tolerance)
    || endpointMeetsPath(right[right.length - 1], directionAt(right, right.length - 1), left, tolerance);
}

function directionAt(path: LineNode['path'], index: number): { x: number; y: number } {
  const adjacentIndex = index === 0 ? 1 : path.length - 2;
  return { x: path[index].x - path[adjacentIndex].x, y: path[index].y - path[adjacentIndex].y };
}

function endpointMeetsPath(
  point: { x: number; y: number },
  direction: { x: number; y: number },
  path: LineNode['path'],
  tolerance: number,
): boolean {
  const directionLength = Math.hypot(direction.x, direction.y);
  if (directionLength === 0) return false;
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const lengthSquared = vx * vx + vy * vy;
    if (lengthSquared === 0) continue;
    const projection = Math.max(0, Math.min(1, ((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSquared));
    const closest = { x: start.x + projection * vx, y: start.y + projection * vy };
    if (dist(point, closest) > tolerance) continue;
    if (projection <= 0.05 || projection >= 0.95) return true;
    const segmentLength = Math.sqrt(lengthSquared);
    const parallelRatio = Math.abs(direction.x * vx + direction.y * vy) / (directionLength * segmentLength);
    if (parallelRatio <= 0.35) return true;
  }
  return false;
}

function lineKindsConnect(left: LineNode['lineKind'], right: LineNode['lineKind']): boolean {
  if (left === right) return true;
  const powerKinds = new Set<LineNode['lineKind']>(['power', 'bus', 'unknown']);
  return powerKinds.has(left) && powerKinds.has(right);
}

function expandedBoundsIntersect(left: EvidenceBounds, right: EvidenceBounds, tolerance: number): boolean {
  return left.x - tolerance <= right.x + right.w
    && left.x + left.w + tolerance >= right.x
    && left.y - tolerance <= right.y + right.h
    && left.y + left.h + tolerance >= right.y;
}

function isBusbar(symbol: SymbolNode): boolean {
  return [symbol.confirmedType, ...symbol.typeCandidates]
    .filter((value): value is string => Boolean(value))
    .some((value) => ['bus', 'busbar'].includes(normalizeType(value)));
}

function symbolDistance(symbol: SymbolNode, point: { x: number; y: number }): number {
  const bounds = symbol.evidence[0]?.bounds;
  if (!bounds) return Number.POSITIVE_INFINITY;
  const dx = Math.max(bounds.x - point.x, 0, point.x - (bounds.x + bounds.w));
  const dy = Math.max(bounds.y - point.y, 0, point.y - (bounds.y + bounds.h));
  return Math.hypot(dx, dy);
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
    const dx = Math.max(b.x - point.x, 0, point.x - (b.x + b.w));
    const dy = Math.max(b.y - point.y, 0, point.y - (b.y + b.h));
    const d = Math.hypot(dx, dy);
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
  return normalizeType(canonicalSymbolType(a)) === normalizeType(canonicalSymbolType(b));
}

function boundsStronglyOverlap(a: EvidenceBounds, b: EvidenceBounds): boolean {
  const overlapWidth = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const overlapHeight = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const smallerArea = Math.min(a.w * a.h, b.w * b.h);
  // Full-page and overlap-padded crops can shift the same glyph by roughly a
  // third of its height. Distinct physical symbols do not overlap their drawn
  // bodies, so a majority-area overlap is a stronger identity signal than the
  // shifted centers while still preserving adjacent repeated devices.
  return smallerArea > 0 && (overlapWidth * overlapHeight) / smallerArea >= 0.5;
}

function boundsPartialReadOverlap(a: EvidenceBounds, b: EvidenceBounds): boolean {
  const overlapWidth = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const overlapHeight = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  if (overlapWidth <= 0 || overlapHeight <= 0) return false;
  const areaA = a.w * a.h;
  const areaB = b.w * b.h;
  const smallerArea = Math.min(areaA, areaB);
  if (smallerArea <= 0 || (overlapWidth * overlapHeight) / smallerArea < 0.2) return false;
  const smaller = areaA <= areaB ? a : b;
  const larger = areaA <= areaB ? b : a;
  const isPartialGlyph = smaller.h / larger.h <= 0.5 || smaller.w / larger.w <= 0.5;
  if (!isPartialGlyph) return false;
  const smallerCenter = { x: smaller.x + smaller.w / 2, y: smaller.y + smaller.h / 2 };
  const largerCenter = { x: larger.x + larger.w / 2, y: larger.y + larger.h / 2 };
  return dist(smallerCenter, largerCenter) <= Math.max(larger.w, larger.h) * 0.8;
}

function canonicalSymbolType(value: string, label?: string): string {
  const normalized = normalizeType(value);
  if (normalized === 'breaker' || normalized === 'circuitbreaker') return 'breaker';
  if (['transformer', 'transformerwinding', 'powertransformer', 'distributiontransformer'].includes(normalized)) {
    const compactLabel = normalizeLabel(label);
    // PTx3 / PPT / VT nameplates identify instrument transformers, not a
    // power transformer. Prefer the explicit label over a broad crop type.
    if (/^(?:PT|PPT|VT)X?\d+/.test(compactLabel)) return 'vt_pt';
    return 'transformer';
  }
  if (['load', 'houseload', 'residentialload', 'house'].includes(normalized)) return 'load';
  return value.trim();
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
