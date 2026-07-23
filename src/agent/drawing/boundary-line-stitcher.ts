import type {
  BoundaryContinuation,
  StitchReceipt,
  UnresolvedEndpoint,
  UnresolvedEndpointReason,
} from '../vision/continuity-types';
import type { RawLineHit } from './evidence-deduplicator';

const EPSILON = 1e-6;

export interface BoundaryLineStitchInput {
  continuations: readonly BoundaryContinuation[];
  localLines: readonly RawLineHit[];
  globalLines: readonly RawLineHit[];
  endpointTolerance?: number;
  tangentCosineThreshold?: number;
}

export interface BoundaryLineStitchResult {
  lines: RawLineHit[];
  unresolvedEndpoints: UnresolvedEndpoint[];
  receipts: StitchReceipt[];
  continuations: BoundaryContinuation[];
}

export function stitchBoundaryLines(input: BoundaryLineStitchInput): BoundaryLineStitchResult {
  const endpointTolerance = input.endpointTolerance ?? 12;
  const tangentCosineThreshold = input.tangentCosineThreshold ?? 0.85;
  const lines = input.localLines.map(cloneLine);
  const unresolvedEndpoints: UnresolvedEndpoint[] = [];
  const receipts: StitchReceipt[] = [];
  const continuations = input.continuations.map((continuation) => ({
    ...continuation,
    point: { ...continuation.point },
    tangent: { ...continuation.tangent },
    seams: continuation.seams.map((seam) => ({ ...seam })),
    observations: continuation.observations.map((observation) => ({
      ...observation,
      point: { ...observation.point },
      tangent: { ...observation.tangent },
    })),
  }));
  const pageUnresolvedSequences = new Map<number, number>();

  for (const continuation of continuations) {
    const refs = endpointRefs(lines, continuation.displayId);
    const expectedRegions = new Set(continuation.observations.map((item) => item.regionDisplayId));
    const matchedRegions = new Set(refs.flatMap((ref) => lineRegionIds(ref.line).filter((id) => expectedRegions.has(id))));
    const checks: StitchReceipt['checks'] = {
      adjacency: refs.length === 2
        && refs.every((ref) => lineRegionIds(ref.line).some((id) => expectedRegions.has(id)))
        && matchedRegions.size === expectedRegions.size,
      cardinality: refs.length === 2,
      distance: refs.length === 2 && refs.every((ref) => distance(ref.point, continuation.point) <= endpointTolerance),
      tangent: refs.length === 2 && refs.every((ref) => tangentAligned(ref, continuation.tangent, tangentCosineThreshold)),
      lineKind: refs.length === 2 && lineKindsCompatible(refs[0].line.lineKind, refs[1].line.lineKind, continuation.lineKind),
      globalCorroboration: globalLineCorroborates(input.globalLines, refs, continuation, endpointTolerance),
    };
    const consumedLocalLineIds = refs.map((ref) => ref.line.localId);

    if (Object.values(checks).every(Boolean)) {
      const merged = mergeAtContinuation(refs[0], refs[1], continuation);
      const removal = [...new Set(refs.map((ref) => ref.index))].sort((a, b) => b - a);
      for (const index of removal) lines.splice(index, 1);
      lines.push(merged);
      continuation.status = 'merged';
      receipts.push({
        continuationIds: [continuation.displayId],
        consumedLocalLineIds,
        outputLineId: merged.localId,
        checks,
        status: 'merged',
      });
      continue;
    }

    const reason = failureReason(checks);
    continuation.status = 'hold';
    const source = refs[0]?.line;
    const sequence = (pageUnresolvedSequences.get(continuation.pageIndex) ?? 0) + 1;
    pageUnresolvedSequences.set(continuation.pageIndex, sequence);
    const displayId = `P${String(continuation.pageIndex + 1).padStart(2, '0')}-U${String(sequence).padStart(3, '0')}`;
    unresolvedEndpoints.push({
      id: `unresolved-${continuation.pageIndex}-${sequence}-${continuation.displayId}`,
      displayId,
      pageIndex: continuation.pageIndex,
      regionId: source?.regionId,
      localLineId: source?.localId ?? continuation.sourceLineId,
      continuationId: continuation.displayId,
      point: { ...continuation.point },
      reason,
    });
    receipts.push({
      continuationIds: [continuation.displayId],
      consumedLocalLineIds,
      checks,
      status: 'hold',
    });
  }

  return {
    lines: lines.sort(lineOrder),
    unresolvedEndpoints,
    receipts,
    continuations,
  };
}

interface EndpointRef {
  line: RawLineHit;
  index: number;
  atStart: boolean;
  point: { x: number; y: number };
}

function endpointRefs(lines: RawLineHit[], continuationId: string): EndpointRef[] {
  const refs: EndpointRef[] = [];
  lines.forEach((line, index) => {
    if (line.startAnchorId === continuationId && line.path[0]) {
      refs.push({ line, index, atStart: true, point: line.path[0] });
    }
    if (line.endAnchorId === continuationId && line.path.at(-1)) {
      refs.push({ line, index, atStart: false, point: line.path.at(-1)! });
    }
  });
  return refs;
}

function mergeAtContinuation(
  first: EndpointRef,
  second: EndpointRef,
  continuation: BoundaryContinuation,
): RawLineHit {
  const firstPath = first.atStart ? [...first.line.path].reverse() : [...first.line.path];
  const secondPath = second.atStart ? [...second.line.path] : [...second.line.path].reverse();
  const startAnchorId = first.atStart ? first.line.endAnchorId : first.line.startAnchorId;
  const endAnchorId = second.atStart ? second.line.endAnchorId : second.line.startAnchorId;
  const merged: RawLineHit = {
    localId: `stitched-${continuation.displayId}-${first.line.localId}-${second.line.localId}`,
    lineKind: mergedLineKind(first.line.lineKind, second.line.lineKind),
    path: [...firstPath.map((point) => ({ ...point })), ...secondPath.slice(1).map((point) => ({ ...point }))],
    junctions: uniquePoints([...(first.line.junctions ?? []), ...(second.line.junctions ?? [])]),
    crossovers: uniquePoints([...(first.line.crossovers ?? []), ...(second.line.crossovers ?? [])]),
    confidence: Math.min(first.line.confidence, second.line.confidence),
    pageIndex: continuation.pageIndex,
    regionId: `${first.line.regionId}+${second.line.regionId}`,
    regionDisplayIds: [...new Set([...lineRegionIds(first.line), ...lineRegionIds(second.line)])],
    certainty: first.line.certainty === 'confirmed' && second.line.certainty === 'confirmed' ? 'confirmed' : 'ambiguous',
    sourceEvidenceIds: [...new Set([...(first.line.sourceEvidenceIds ?? []), ...(second.line.sourceEvidenceIds ?? [])])],
  };
  if (startAnchorId) merged.startAnchorId = startAnchorId;
  if (endAnchorId) merged.endAnchorId = endAnchorId;
  const start = merged.path[0];
  const end = merged.path.at(-1)!;
  if ((end.x - start.x) * continuation.tangent.x + (end.y - start.y) * continuation.tangent.y < 0) {
    merged.path.reverse();
    const previousStartAnchor = merged.startAnchorId;
    const previousEndAnchor = merged.endAnchorId;
    delete merged.startAnchorId;
    delete merged.endAnchorId;
    if (previousEndAnchor) merged.startAnchorId = previousEndAnchor;
    if (previousStartAnchor) merged.endAnchorId = previousStartAnchor;
  }
  return merged;
}

function tangentAligned(ref: EndpointRef, expected: { x: number; y: number }, threshold: number): boolean {
  if (ref.line.path.length < 2) return false;
  const neighbor = ref.atStart ? ref.line.path[1] : ref.line.path.at(-2)!;
  const vector = { x: neighbor.x - ref.point.x, y: neighbor.y - ref.point.y };
  const denominator = Math.hypot(vector.x, vector.y) * Math.hypot(expected.x, expected.y);
  if (denominator === 0) return false;
  return Math.abs(vector.x * expected.x + vector.y * expected.y) / denominator >= threshold;
}

function lineKindsCompatible(
  left: RawLineHit['lineKind'],
  right: RawLineHit['lineKind'],
  planned: BoundaryContinuation['lineKind'],
): boolean {
  const known = [left, right, planned].filter((kind) => kind !== 'unknown');
  return new Set(known).size <= 1;
}

function mergedLineKind(left: RawLineHit['lineKind'], right: RawLineHit['lineKind']): RawLineHit['lineKind'] {
  return left === 'unknown' ? right : left;
}

function globalLineCorroborates(
  globalLines: readonly RawLineHit[],
  refs: readonly EndpointRef[],
  continuation: BoundaryContinuation,
  tolerance: number,
): boolean {
  if (refs.length !== 2) return false;
  const pageLines = globalLines.filter((line) =>
    line.pageIndex === continuation.pageIndex && line.path.length >= 2);
  const sourceLine = pageLines.find((line) => line.localId === continuation.sourceLineId);
  if (!sourceLine || pointToPathDistance(continuation.point, sourceLine.path) > tolerance) return false;

  // The exact global source must be the unique nearest full-page line for each local
  // fragment. This remains discriminating even when parallel conductors are closer
  // than an absolute pixel threshold.
  const sourceTolerance = tolerance / 4;
  return refs.every((ref) => {
    const neighbor = ref.atStart ? ref.line.path[1] : ref.line.path.at(-2);
    if (!neighbor) return false;
    const score = (line: RawLineHit) => Math.max(
      pointToPathDistance(ref.point, line.path),
      pointToPathDistance(neighbor, line.path),
    );
    const sourceScore = score(sourceLine);
    if (sourceScore > sourceTolerance) return false;
    return pageLines.every((line) =>
      line.localId === sourceLine.localId
      || pathsEquivalent(line.path, sourceLine.path)
      || sourceScore + EPSILON < score(line));
  });
}

function pathsEquivalent(
  left: Array<{ x: number; y: number }>,
  right: Array<{ x: number; y: number }>,
): boolean {
  return left.every((point) => pointToPathDistance(point, right) <= EPSILON)
    && right.every((point) => pointToPathDistance(point, left) <= EPSILON);
}

function pointToPathDistance(point: { x: number; y: number }, path: Array<{ x: number; y: number }>): number {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < path.length; index += 1) {
    best = Math.min(best, pointToSegmentDistance(point, path[index - 1], path[index]));
  }
  return best;
}

function pointToSegmentDistance(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy });
}

function failureReason(checks: StitchReceipt['checks']): UnresolvedEndpointReason {
  if (!checks.cardinality) return 'UNPAIRED_CONTINUATION';
  if (!checks.adjacency) return 'REGION_MISMATCH';
  if (!checks.distance) return 'DISTANCE_MISMATCH';
  if (!checks.tangent) return 'TANGENT_MISMATCH';
  if (!checks.lineKind) return 'LINE_KIND_MISMATCH';
  return 'GLOBAL_CORROBORATION_MISSING';
}

function cloneLine(line: RawLineHit): RawLineHit {
  return {
    ...line,
    path: line.path.map((point) => ({ ...point })),
    junctions: line.junctions?.map((point) => ({ ...point })),
    crossovers: line.crossovers?.map((point) => ({ ...point })),
    sourceEvidenceIds: line.sourceEvidenceIds ? [...line.sourceEvidenceIds] : undefined,
    regionDisplayIds: line.regionDisplayIds ? [...line.regionDisplayIds] : undefined,
  };
}

function lineRegionIds(line: RawLineHit): string[] {
  return line.regionDisplayIds ?? (line.regionDisplayId ? [line.regionDisplayId] : []);
}

function uniquePoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${Math.round(point.x * 10)},${Math.round(point.y * 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((point) => ({ ...point }));
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function lineOrder(left: RawLineHit, right: RawLineHit): number {
  return left.pageIndex - right.pageIndex
    || (left.path[0]?.y ?? 0) - (right.path[0]?.y ?? 0)
    || (left.path[0]?.x ?? 0) - (right.path[0]?.x ?? 0)
    || left.localId.localeCompare(right.localId);
}
