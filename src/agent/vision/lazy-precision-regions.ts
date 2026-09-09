import { createHash } from 'node:crypto';
import { cropAnalysisRegions, planAnalysisRegions } from './adaptive-regions';
import { createImageVariants } from './image-variants';
import { profileImage } from './image-quality';
import { precisionGridSize } from './vision-splitter';
import { toOriginalPoint, type AnalysisRegionPlan, type ImageVariant, type PrecisionRegion } from './evidence-types';

/** Geometry is available before expensive PNG crops. Never use an empty fake image. */
export type PrecisionRegionDescriptor = Omit<PrecisionRegion, 'buffer'>;
export type MaterializeRegion = (region: PrecisionRegionDescriptor, signal?: AbortSignal) => Promise<PrecisionRegion>;

export function regionDescriptorKey(region: PrecisionRegionDescriptor): string {
  const bounds = (value: PrecisionRegionDescriptor['originalBounds'] | undefined) =>
    value ? [value.x, value.y, value.w, value.h] : null;
  return JSON.stringify([
    region.id, region.displayId ?? null, region.variantId,
    bounds(region.variantBounds), bounds(region.logicalVariantBounds),
    bounds(region.originalBounds), bounds(region.logicalOriginalBounds),
  ]);
}

function describe(variant: ImageVariant, plan: AnalysisRegionPlan, index: number): PrecisionRegionDescriptor {
  const originalBounds = (bounds: AnalysisRegionPlan['cropBounds']) => {
    const start = toOriginalPoint(bounds, variant.transform);
    const end = toOriginalPoint({ x: bounds.x + bounds.w, y: bounds.y + bounds.h }, variant.transform);
    return Object.freeze({ x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y });
  };
  return Object.freeze({
    id: `${variant.id}:region:${index}`,
    displayId: plan.displayId,
    variantId: variant.id,
    variantBounds: Object.freeze({ ...plan.cropBounds }),
    logicalVariantBounds: Object.freeze({ ...plan.logicalBounds }),
    originalBounds: originalBounds(plan.cropBounds),
    logicalOriginalBounds: originalBounds(plan.logicalBounds),
  });
}

/** Same variants, grid, overlap, coordinates and selected pixels as the eager path. */
export async function prepareLazyPrecisionRegions(buffer: ArrayBuffer) {
  const profile = await profileImage(buffer);
  const variants = await createImageVariants(buffer, profile);
  const selected = variants.filter((variant) =>
    variant.kind === (profile.recommendedScale === 4 ? 'upscale-4x' : profile.recommendedScale === 2 ? 'upscale-2x' : 'original')
    || variant.kind === 'text-high-contrast' || variant.kind === 'line-enhanced');
  const gridSize = precisionGridSize(profile.recommendedScale, profile.edgeDensity);
  const entries = selected.flatMap((variant) => planAnalysisRegions(variant.width, variant.height, gridSize, 0.18)
    .map((plan, index) => ({ variant, plan, region: describe(variant, plan, index) })));
  const registered = new Map(entries.map((entry) => [entry.region.id, entry]));
  // This cache belongs to this prepared page only, never a process-global user cache.
  const crops = new Map<string, Promise<PrecisionRegion>>();
  let cropCount = 0;
  let cacheHits = 0;
  let cropBytes = 0;
  const materializeRegion: MaterializeRegion = async (region, signal) => {
    signal?.throwIfAborted();
    const entry = registered.get(region.id);
    if (!entry || regionDescriptorKey(region) !== regionDescriptorKey(entry.region)) {
      throw new Error('정밀 구획 준비 요청이 등록된 원본 좌표와 일치하지 않습니다.');
    }
    let pending = crops.get(region.id);
    if (!pending) {
      pending = cropAnalysisRegions(entry.variant, [entry.plan]).then(([crop]) => {
        // Single-region extraction uses index zero; retain the original grid identity.
        const result = { ...crop, id: entry.region.id };
        if (regionDescriptorKey(result) !== regionDescriptorKey(entry.region)) {
          throw new Error('정밀 구획 출력 좌표가 계획과 일치하지 않습니다.');
        }
        cropCount += 1;
        cropBytes += result.buffer.byteLength;
        return result;
      });
      crops.set(region.id, pending);
      const captured = pending;
      void pending.catch(() => { if (crops.get(region.id) === captured) crops.delete(region.id); });
    } else {
      cacheHits += 1;
    }
    const crop = await pending;
    signal?.throwIfAborted();
    // Callers can annotate or transfer buffers without damaging the cached source.
    return {
      ...crop,
      variantBounds: { ...crop.variantBounds },
      originalBounds: { ...crop.originalBounds },
      logicalVariantBounds: crop.logicalVariantBounds ? { ...crop.logicalVariantBounds } : undefined,
      logicalOriginalBounds: crop.logicalOriginalBounds ? { ...crop.logicalOriginalBounds } : undefined,
      buffer: crop.buffer.slice(0),
    };
  };
  return {
    profile, variants, regions: entries.map((entry) => entry.region), materializeRegion,
    statistics: () => ({ plannedRegions: entries.length, cropCount, cacheHits, cropBytes }),
  };
}

/** One-page, single-flight cache. Construct inside one document run, not at module scope. */
export function createRequestPreparationCache<T>(prepare: (buffer: ArrayBuffer, mimeType: string) => Promise<T>) {
  let current: { key: string; promise: Promise<T> } | undefined;
  return (buffer: ArrayBuffer, mimeType: string): Promise<T> => {
    const key = `${mimeType}:${createHash('sha256').update(new Uint8Array(buffer)).digest('hex')}`;
    if (current?.key === key) return current.promise;
    const promise = Promise.resolve().then(() => prepare(buffer, mimeType));
    const entry = { key, promise };
    current = entry;
    void promise.catch(() => { if (current === entry) current = undefined; });
    return promise;
  };
}
