/**
 * Adaptive region planning with lifecycle — no VLM calls.
 */

import type { EvidenceBounds, PrecisionRegion, RegionKind, RegionLifecycle } from './evidence-types';

export interface PlanRegionsInput {
  pageIndex: number;
  width: number;
  height: number;
  /** 4 | 9 | 16 preferred; other positives normalized */
  gridSize: number;
  overlap: number;
  denseClusters?: EvidenceBounds[];
  titleBlock?: EvidenceBounds;
  legendBlocks?: EvidenceBounds[];
  emptyAreas?: EvidenceBounds[];
  addBusStrips?: boolean;
}

export function normalizeGridSize(value: number): 4 | 9 | 16 {
  if (value <= 4) return 4;
  if (value <= 9) return 9;
  return 16;
}

export function planAnalysisRegions(input: PlanRegionsInput): PrecisionRegion[] {
  const gridSize = normalizeGridSize(input.gridSize);
  const overlap = Math.min(0.25, Math.max(0, input.overlap));
  const cols = gridSize === 4 ? 2 : gridSize === 9 ? 3 : 4;
  const rows = cols;
  const baseW = Math.ceil(input.width / cols);
  const baseH = Math.ceil(input.height / rows);
  const ovX = Math.ceil(baseW * overlap);
  const ovY = Math.ceil(baseH * overlap);

  const regions: PrecisionRegion[] = [];
  let seq = 0;

  const push = (kind: RegionKind, bounds: EvidenceBounds, status: RegionLifecycle = 'planned') => {
    if (bounds.w < 1 || bounds.h < 1) return;
    if (isFullyInsideEmpty(bounds, input.emptyAreas ?? [])) {
      regions.push({
        regionId: `p${input.pageIndex}-r${seq++}`,
        pageIndex: input.pageIndex,
        kind,
        bounds,
        status: 'skipped-empty',
      });
      return;
    }
    regions.push({
      regionId: `p${input.pageIndex}-r${seq++}`,
      pageIndex: input.pageIndex,
      kind,
      bounds,
      status,
    });
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const baseX = col * baseW;
      const baseY = row * baseH;
      const x = Math.max(0, baseX - ovX);
      const y = Math.max(0, baseY - ovY);
      const right = Math.min(input.width, baseX + baseW + ovX);
      const bottom = Math.min(input.height, baseY + baseH + ovY);
      push('grid', { x, y, w: right - x, h: bottom - y });
    }
  }

  for (const cluster of input.denseClusters ?? []) {
    const half = {
      x: cluster.x,
      y: cluster.y,
      w: Math.ceil(cluster.w / 2),
      h: Math.ceil(cluster.h / 2),
    };
    push('dense-split', half);
    push('dense-split', {
      x: cluster.x + half.w,
      y: cluster.y,
      w: cluster.w - half.w,
      h: half.h,
    });
  }

  if (input.titleBlock) push('title-block', input.titleBlock);
  for (const legend of input.legendBlocks ?? []) push('legend', legend);

  if (input.addBusStrips) {
    const stripH = Math.max(40, Math.round(input.height * 0.08));
    const stripW = Math.max(40, Math.round(input.width * 0.08));
    push('h-strip', { x: 0, y: Math.floor(input.height * 0.4), w: input.width, h: stripH });
    push('v-strip', { x: Math.floor(input.width * 0.45), y: 0, w: stripW, h: input.height });
  }

  return regions;
}

export function regionCoverageComplete(regions: PrecisionRegion[]): boolean {
  return regions.every((r) =>
    r.status === 'complete' || r.status === 'failed' || r.status === 'skipped-empty');
}

export function markRegion(
  regions: PrecisionRegion[],
  regionId: string,
  status: RegionLifecycle,
): PrecisionRegion[] {
  return regions.map((r) => (r.regionId === regionId ? { ...r, status } : r));
}

function isFullyInsideEmpty(bounds: EvidenceBounds, empties: EvidenceBounds[]): boolean {
  if (empties.length === 0) return false;
  return empties.some((e) =>
    bounds.x >= e.x
    && bounds.y >= e.y
    && bounds.x + bounds.w <= e.x + e.w
    && bounds.y + bounds.h <= e.y + e.h);
}
