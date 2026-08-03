import sharp from 'sharp';

import type { EvidenceBounds } from '../vision/evidence-types';
import type { RawLineHit } from './evidence-deduplicator';

type Orientation = 'horizontal' | 'vertical';
type Segment = {
  orientation: Orientation;
  axis: number;
  start: number;
  end: number;
  samples: number;
};

const DETECTOR_ID = 'raster-line-detector-v1';

function segmentLength(segment: Segment): number {
  return segment.end - segment.start;
}

function intervalsOverlap(left: Segment, right: Segment): number {
  return Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
}

function mergeParallelRuns(runs: Segment[]): Segment[] {
  const merged: Segment[] = [];
  for (const run of [...runs].sort((a, b) => a.orientation.localeCompare(b.orientation) || a.axis - b.axis || a.start - b.start)) {
    const match = merged.find((candidate) => {
      if (candidate.orientation !== run.orientation || Math.abs(candidate.axis - run.axis) > 4) return false;
      const overlap = intervalsOverlap(candidate, run);
      return overlap / Math.max(1, Math.min(segmentLength(candidate), segmentLength(run))) >= 0.6;
    });
    if (!match) {
      merged.push({ ...run });
      continue;
    }
    const total = match.samples + run.samples;
    match.axis = (match.axis * match.samples + run.axis * run.samples) / total;
    match.start = Math.min(match.start, run.start);
    match.end = Math.max(match.end, run.end);
    match.samples = total;
  }
  return merged;
}

function exclusionOverlapRatio(segment: Segment, bounds: EvidenceBounds): number {
  const padding = 2;
  if (segment.orientation === 'horizontal') {
    if (segment.axis < bounds.y - padding || segment.axis > bounds.y + bounds.h + padding) return 0;
    const overlap = Math.max(0, Math.min(segment.end, bounds.x + bounds.w + padding) - Math.max(segment.start, bounds.x - padding));
    return overlap / Math.max(1, segmentLength(segment));
  }
  if (segment.axis < bounds.x - padding || segment.axis > bounds.x + bounds.w + padding) return 0;
  const overlap = Math.max(0, Math.min(segment.end, bounds.y + bounds.h + padding) - Math.max(segment.start, bounds.y - padding));
  return overlap / Math.max(1, segmentLength(segment));
}

function pointDistanceToBounds(point: { x: number; y: number }, bounds: EvidenceBounds): number {
  const dx = Math.max(bounds.x - point.x, 0, point.x - (bounds.x + bounds.w));
  const dy = Math.max(bounds.y - point.y, 0, point.y - (bounds.y + bounds.h));
  return Math.hypot(dx, dy);
}

function endpoints(segment: Segment): [{ x: number; y: number }, { x: number; y: number }] {
  return segment.orientation === 'horizontal'
    ? [{ x: segment.start, y: segment.axis }, { x: segment.end, y: segment.axis }]
    : [{ x: segment.axis, y: segment.start }, { x: segment.axis, y: segment.end }];
}

function segmentsInteract(left: Segment, right: Segment, tolerance = 3): boolean {
  if (left.orientation === right.orientation) {
    if (Math.abs(left.axis - right.axis) > tolerance) return false;
    return Math.max(left.start, right.start) <= Math.min(left.end, right.end) + tolerance;
  }
  const horizontal = left.orientation === 'horizontal' ? left : right;
  const vertical = left.orientation === 'vertical' ? left : right;
  return vertical.axis >= horizontal.start - tolerance
    && vertical.axis <= horizontal.end + tolerance
    && horizontal.axis >= vertical.start - tolerance
    && horizontal.axis <= vertical.end + tolerance;
}

/**
 * Detect straight raster conductors without asking the model to redraw them.
 * It is deliberately a fallback: results are ambiguous, symbol-internal
 * strokes are removed, and isolated text-like dashes are not emitted.
 */
export async function detectRasterLineHits(
  imageBuffer: ArrayBuffer,
  pageIndex: number,
  equipmentBounds: readonly EvidenceBounds[],
  ignoredBounds: readonly EvidenceBounds[] = [],
): Promise<RawLineHit[]> {
  if (imageBuffer.byteLength === 0) return [];
  const { data, info } = await sharp(Buffer.from(imageBuffer), { animated: false, limitInputPixels: 40_000_000 })
    .rotate()
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (!width || !height || channels < 3) return [];
  const minRun = Math.max(8, Math.round(Math.min(width, height) * 0.006));
  const maxGap = 1;
  const inkAt = (x: number, y: number): boolean => {
    const offset = (y * width + x) * channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    return luma < 235 || (Math.max(red, green, blue) - Math.min(red, green, blue) > 30 && Math.min(red, green, blue) < 245);
  };
  const runs: Segment[] = [];
  const scan = (orientation: Orientation, fixedCount: number, variableCount: number): void => {
    for (let fixed = 0; fixed < fixedCount; fixed += 1) {
      let start = -1;
      let lastInk = -1;
      let gap = 0;
      const flush = (): void => {
        if (start >= 0 && lastInk - start >= minRun) {
          runs.push({ orientation, axis: fixed, start, end: lastInk, samples: 1 });
        }
        start = -1;
        lastInk = -1;
        gap = 0;
      };
      for (let variable = 0; variable < variableCount; variable += 1) {
        const x = orientation === 'horizontal' ? variable : fixed;
        const y = orientation === 'horizontal' ? fixed : variable;
        if (inkAt(x, y)) {
          if (start < 0) start = variable;
          lastInk = variable;
          gap = 0;
        } else if (start >= 0 && ++gap > maxGap) {
          flush();
        }
      }
      flush();
    }
  };
  scan('horizontal', height, width);
  scan('vertical', width, height);

  const merged = mergeParallelRuns(runs)
    .filter((segment) => !equipmentBounds
      .some((bounds) => exclusionOverlapRatio(segment, bounds) >= 0.5))
    .filter((segment) => !ignoredBounds
      .some((bounds) => exclusionOverlapRatio(segment, bounds) >= 0.75));
  const longThreshold = Math.max(minRun * 2, Math.min(width, height) * 0.08);
  const veryLongThreshold = Math.min(width, height) * 0.15;
  const plausible = merged.filter((segment) => segmentLength(segment) >= minRun * 2);
  const retained = plausible.filter((segment, index) => {
    const [start, end] = endpoints(segment);
    const nearEquipment = equipmentBounds.some((bounds) =>
      pointDistanceToBounds(start, bounds) <= 10 || pointDistanceToBounds(end, bounds) <= 10);
    const networked = plausible.some((other, otherIndex) => otherIndex !== index && segmentsInteract(segment, other));
    return segmentLength(segment) >= veryLongThreshold
      || (segmentLength(segment) >= longThreshold && (networked || nearEquipment))
      || (networked && nearEquipment);
  });

  return retained.map((segment, index) => ({
    localId: `${DETECTOR_ID}-${pageIndex}-${index + 1}`,
    lineKind: 'unknown',
    path: endpoints(segment),
    junctions: [],
    crossovers: [],
    confidence: 0.65,
    pageIndex,
    regionId: DETECTOR_ID,
    certainty: 'ambiguous',
    sourceEvidenceIds: [`${DETECTOR_ID}:p${pageIndex + 1}:${index + 1}`],
  }));
}
