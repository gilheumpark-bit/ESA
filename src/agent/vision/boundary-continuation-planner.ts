import { createHash } from 'node:crypto';

import type { AnalysisRegionPlan, EvidenceBounds, Point } from './evidence-types';
import type {
  BoundaryContinuation,
  BoundaryContinuationInput,
  BoundaryContinuationPlan,
  ContinuationObservation,
  GlobalLineCandidate,
} from './continuity-types';

const EPSILON = 1e-6;

interface Seam {
  orientation: 'vertical' | 'horizontal';
  index: number;
  value: number;
}

interface Crossing {
  point: Point;
  tangent: Point;
  seams: Seam[];
  segmentStart: Point;
  segmentEnd: Point;
}

function assertPoint(point: Point, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(`${label} 좌표는 유한해야 합니다.`);
  }
}

function internalSeams(regions: readonly AnalysisRegionPlan[]): Seam[] {
  if (regions.length === 0) return [];
  const minX = Math.min(...regions.map((region) => region.logicalBounds.x));
  const minY = Math.min(...regions.map((region) => region.logicalBounds.y));
  const maxX = Math.max(...regions.map((region) => region.logicalBounds.x + region.logicalBounds.w));
  const maxY = Math.max(...regions.map((region) => region.logicalBounds.y + region.logicalBounds.h));
  const xs = [...new Set(regions.flatMap((region) => [
    region.logicalBounds.x,
    region.logicalBounds.x + region.logicalBounds.w,
  ]))].filter((value) => value > minX && value < maxX).sort((a, b) => a - b);
  const ys = [...new Set(regions.flatMap((region) => [
    region.logicalBounds.y,
    region.logicalBounds.y + region.logicalBounds.h,
  ]))].filter((value) => value > minY && value < maxY).sort((a, b) => a - b);
  return [
    ...xs.map((value, index) => ({ orientation: 'vertical' as const, index: index + 1, value })),
    ...ys.map((value, index) => ({ orientation: 'horizontal' as const, index: index + 1, value })),
  ];
}

function normalizedTangent(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= EPSILON) throw new Error('연속 포트 입력 선분 길이는 0보다 커야 합니다.');
  return { x: dx / length, y: dy / length };
}

function alignedWithSeam(start: Point, end: Point, seams: readonly Seam[], tolerance: number): boolean {
  return seams.some((seam) => seam.orientation === 'vertical'
    ? Math.abs(start.x - seam.value) <= tolerance && Math.abs(end.x - seam.value) <= tolerance
    : Math.abs(start.y - seam.value) <= tolerance && Math.abs(end.y - seam.value) <= tolerance);
}

function segmentCrossing(start: Point, end: Point, seam: Seam): Point | null {
  if (seam.orientation === 'vertical') {
    const dx = end.x - start.x;
    if (Math.abs(dx) <= EPSILON) return null;
    const t = (seam.value - start.x) / dx;
    if (t <= EPSILON || t >= 1 - EPSILON) return null;
    return { x: seam.value, y: start.y + t * (end.y - start.y) };
  }
  const dy = end.y - start.y;
  if (Math.abs(dy) <= EPSILON) return null;
  const t = (seam.value - start.y) / dy;
  if (t <= EPSILON || t >= 1 - EPSILON) return null;
  return { x: start.x + t * (end.x - start.x), y: seam.value };
}

function signedDistanceToSeam(point: Point, seam: Seam): number {
  return seam.orientation === 'vertical' ? point.x - seam.value : point.y - seam.value;
}

function appendCrossing(
  crossings: Crossing[],
  crossing: Omit<Crossing, 'seams'>,
  seam: Seam,
  tolerance: number,
): void {
  const existing = crossings.find((candidate) =>
    Math.hypot(candidate.point.x - crossing.point.x, candidate.point.y - crossing.point.y)
      <= Math.max(EPSILON, tolerance));
  if (existing) {
    if (!existing.seams.some((item) => item.orientation === seam.orientation && item.index === seam.index)) {
      existing.seams.push(seam);
    }
    return;
  }
  crossings.push({ ...crossing, seams: [seam] });
}

function insideBounds(point: Point, bounds: EvidenceBounds): boolean {
  return point.x >= bounds.x - EPSILON
    && point.x <= bounds.x + bounds.w + EPSILON
    && point.y >= bounds.y - EPSILON
    && point.y <= bounds.y + bounds.h + EPSILON;
}

function regionAt(point: Point, regions: readonly AnalysisRegionPlan[]): AnalysisRegionPlan | undefined {
  return regions.find((region) => {
    const bounds = region.logicalBounds;
    const maxX = bounds.x + bounds.w;
    const maxY = bounds.y + bounds.h;
    return point.x >= bounds.x && point.x < maxX && point.y >= bounds.y && point.y < maxY;
  }) ?? regions.find((region) => insideBounds(point, region.logicalBounds));
}

function observationSide(
  region: AnalysisRegionPlan,
  point: Point,
  tolerance: number,
): ContinuationObservation['side'] {
  const bounds = region.logicalBounds;
  const onLeft = Math.abs(point.x - bounds.x) <= tolerance;
  const onRight = Math.abs(point.x - (bounds.x + bounds.w)) <= tolerance;
  const onTop = Math.abs(point.y - bounds.y) <= tolerance;
  const onBottom = Math.abs(point.y - (bounds.y + bounds.h)) <= tolerance;
  if ((onLeft || onRight) && (onTop || onBottom)) return 'corner';
  if (onLeft) return 'left';
  if (onRight) return 'right';
  if (onTop) return 'top';
  return 'bottom';
}

function observationsFor(
  crossing: Crossing,
  line: GlobalLineCandidate,
  regions: readonly AnalysisRegionPlan[],
  tolerance: number,
): ContinuationObservation[] {
  const step = Math.max(0.5, tolerance * 2);
  const samples = [
    {
      x: crossing.point.x - crossing.tangent.x * step,
      y: crossing.point.y - crossing.tangent.y * step,
    },
    {
      x: crossing.point.x + crossing.tangent.x * step,
      y: crossing.point.y + crossing.tangent.y * step,
    },
  ];
  const seen = new Set<string>();
  const observations: ContinuationObservation[] = [];
  for (const sample of samples) {
    const region = regionAt(sample, regions);
    if (!region || seen.has(region.id)) continue;
    seen.add(region.id);
    observations.push({
      regionId: region.id,
      regionDisplayId: region.displayId,
      side: observationSide(region, crossing.point, Math.max(tolerance, 0.5)),
      point: { ...crossing.point },
      tangent: { ...crossing.tangent },
      confidence: line.confidence,
    });
  }
  return observations;
}

function stableId(pageIndex: number, lineId: string, crossing: Crossing): string {
  const key = JSON.stringify({
    pageIndex,
    lineId,
    x: Math.round(crossing.point.x * 1000),
    y: Math.round(crossing.point.y * 1000),
    seams: crossing.seams.map((seam) => [seam.orientation, seam.index]),
  });
  return `continuation-${createHash('sha256').update(key).digest('hex').slice(0, 20)}`;
}

function crossingsForLine(
  line: GlobalLineCandidate,
  seams: readonly Seam[],
  tolerance: number,
): { crossings: Crossing[]; seamAligned: boolean } {
  if (line.path.length < 2) throw new Error('연속 포트 입력 선은 두 점 이상이어야 합니다.');
  line.path.forEach((point, index) => assertPoint(point, `${line.id}.path[${index}]`));
  const crossings: Crossing[] = [];
  let hadAlignedSegment = false;
  for (let index = 0; index < line.path.length - 1; index += 1) {
    const segmentStart = line.path[index];
    const segmentEnd = line.path[index + 1];
    if (alignedWithSeam(segmentStart, segmentEnd, seams, tolerance)) {
      hadAlignedSegment = true;
      continue;
    }
    const tangent = normalizedTangent(segmentStart, segmentEnd);
    for (const seam of seams) {
      const point = segmentCrossing(segmentStart, segmentEnd, seam);
      if (!point) continue;
      appendCrossing(crossings, { point, tangent, segmentStart, segmentEnd }, seam, tolerance);
    }
  }

  // segmentCrossing deliberately excludes endpoints. Recover only true through-crossings
  // at internal polyline vertices; a touch-and-return or line endpoint is not a port.
  for (let index = 1; index < line.path.length - 1; index += 1) {
    const previous = line.path[index - 1];
    const vertex = line.path[index];
    const next = line.path[index + 1];
    if (Math.hypot(next.x - previous.x, next.y - previous.y) <= EPSILON) continue;
    const tangent = normalizedTangent(previous, next);
    for (const seam of seams) {
      const vertexDistance = signedDistanceToSeam(vertex, seam);
      if (Math.abs(vertexDistance) > tolerance) continue;
      const previousDistance = signedDistanceToSeam(previous, seam);
      const nextDistance = signedDistanceToSeam(next, seam);
      if (Math.abs(previousDistance) <= tolerance || Math.abs(nextDistance) <= tolerance) continue;
      if (previousDistance * nextDistance >= 0) continue;
      appendCrossing(crossings, {
        point: { ...vertex },
        tangent,
        segmentStart: previous,
        segmentEnd: next,
      }, seam, tolerance);
    }
  }
  return { crossings, seamAligned: hadAlignedSegment && crossings.length === 0 };
}

export function planBoundaryContinuations(
  input: BoundaryContinuationInput,
): BoundaryContinuationPlan {
  if (!Number.isSafeInteger(input.pageIndex) || input.pageIndex < 0) {
    throw new Error('연속 포트 pageIndex는 0 이상의 정수여야 합니다.');
  }
  const tolerance = input.tolerance ?? 0.25;
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 20) {
    throw new Error('연속 포트 허용오차는 0~20의 유한한 수여야 합니다.');
  }
  const seams = internalSeams(input.regions);
  const seamAlignedLineIds: string[] = [];
  const continuations: BoundaryContinuation[] = [];
  for (const line of input.lines) {
    const planned = crossingsForLine(line, seams, tolerance);
    if (planned.seamAligned) {
      seamAlignedLineIds.push(line.id);
      continue;
    }
    for (const crossing of planned.crossings) {
      if (input.deviceBounds?.some((bounds) => insideBounds(crossing.point, bounds))) continue;
      const observations = observationsFor(crossing, line, input.regions, tolerance);
      if (observations.length < 2) continue;
      continuations.push({
        id: stableId(input.pageIndex, line.id, crossing),
        displayId: '',
        pageIndex: input.pageIndex,
        point: { ...crossing.point },
        seams: crossing.seams
          .map(({ orientation, index }) => ({ orientation, index }))
          .sort((left, right) => (left.orientation === right.orientation ? left.index - right.index : left.orientation === 'vertical' ? -1 : 1)),
        tangent: { ...crossing.tangent },
        lineKind: line.lineKind,
        sourceLineId: line.id,
        source: line.source,
        status: 'planned',
        observations,
      });
    }
  }
  continuations.sort((left, right) =>
    left.point.x - right.point.x
    || left.point.y - right.point.y
    || left.sourceLineId.localeCompare(right.sourceLineId));
  const page = String(input.pageIndex + 1).padStart(2, '0');
  continuations.forEach((continuation, index) => {
    continuation.displayId = `P${page}-C${String(index + 1).padStart(3, '0')}`;
  });
  return {
    regions: [...input.regions],
    continuations,
    seamAlignedLineIds: [...new Set(seamAlignedLineIds)].sort(),
    warnings: [],
  };
}
