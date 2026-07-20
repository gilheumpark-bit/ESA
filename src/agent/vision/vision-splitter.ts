/**
 * Vision Splitter
 * ---------------
 * Raster drawings are normalized, physically cropped into overlapping regions,
 * analyzed with a configured Vision LLM, then merged back into global image
 * coordinates. API keys stay in the in-memory request contract only.
 */

import type { ExtractedComponent, ExtractedConnection } from '../teams/types';
import { cropPrecisionRegions, planAdaptiveBounds } from './adaptive-regions';
import { profileImage } from './image-quality';
import { createImageVariants } from './image-variants';

export interface SplitOptions {
  gridSize: number;
  overlap: number;
  model: 'gemini' | 'openai' | 'claude';
  modelName?: string;
  apiKey?: string;
  maxConcurrency?: number;
  deduplicateTolerance?: number;
  /**
   * Enables the explicit adaptive preparation path. It defaults to true there;
   * splitAndAnalyze intentionally keeps its legacy original-crop VLM path.
   */
  precision?: boolean;
}

export interface VisionSplitResult {
  regionIndex: number;
  regionBounds: { x: number; y: number; w: number; h: number };
  components: ExtractedComponent[];
  connections: ExtractedConnection[];
  texts: { text: string; position: { x: number; y: number }; confidence: number }[];
  regionConfidence: number;
}

export interface CroppedImageRegion {
  index: number;
  buffer: ArrayBuffer;
  bounds: { x: number; y: number; w: number; h: number };
}

export interface MergedVisionResult {
  components: ExtractedComponent[];
  connections: ExtractedConnection[];
  confidence: number;
}

const MAX_INPUT_PIXELS = 40_000_000;

export function precisionGridSize(recommendedScale: 1 | 2 | 4): 4 | 9 | 16 {
  if (recommendedScale === 4) return 16;
  if (recommendedScale === 2) return 9;
  return 4;
}

/**
 * Prepare physical crops for later role selection without calling any Vision LLM.
 * Set precision to false to retain only original-variant, 4-region preparation.
 */
export async function preparePrecisionRegions(
  imageBuffer: ArrayBuffer,
  options: Pick<SplitOptions, 'precision'> = {},
) {
  const profile = await profileImage(imageBuffer);
  const variants = await createImageVariants(imageBuffer, profile);
  const precision = options.precision ?? true;
  const selected = precision
    ? variants.filter((variant) =>
      variant.kind === (profile.recommendedScale === 4 ? 'upscale-4x' : profile.recommendedScale === 2 ? 'upscale-2x' : 'original')
      || variant.kind === 'text-high-contrast'
      || variant.kind === 'line-enhanced')
    : variants.filter((variant) => variant.kind === 'original');
  const gridSize = precision ? precisionGridSize(profile.recommendedScale) : 4;
  const regions = [];

  for (const variant of selected) {
    const bounds = planAdaptiveBounds(variant.width, variant.height, gridSize, 0.18);
    regions.push(...await cropPrecisionRegions(variant, bounds));
  }

  return { profile, variants, regions };
}

function normalizedGridSize(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 16) {
    throw new Error('Vision gridSize는 1~16의 정수여야 합니다.');
  }
  return value;
}

function normalizedOverlap(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 0.25) {
    throw new Error('Vision overlap은 0~0.25 범위여야 합니다.');
  }
  return value;
}

function planRegions(width: number, height: number, gridSize: number, overlap: number) {
  const cols = gridSize <= 4 ? Math.min(2, gridSize) : Math.min(4, Math.ceil(Math.sqrt(gridSize)));
  const rows = Math.ceil(gridSize / cols);
  const baseWidth = Math.ceil(width / cols);
  const baseHeight = Math.ceil(height / rows);
  const overlapPx = Math.ceil(Math.max(baseWidth, baseHeight) * overlap);
  const regions: Array<{ x: number; y: number; w: number; h: number }> = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols && regions.length < gridSize; col++) {
      const baseX = col * baseWidth;
      const baseY = row * baseHeight;
      const x = Math.max(0, baseX - overlapPx);
      const y = Math.max(0, baseY - overlapPx);
      const right = Math.min(width, baseX + baseWidth + overlapPx);
      const bottom = Math.min(height, baseY + baseHeight + overlapPx);
      regions.push({ x, y, w: right - x, h: bottom - y });
    }
  }
  return regions;
}

/** Normalize orientation and return actual PNG crops for each planned region. */
export async function cropImageIntoRegions(
  imageBuffer: ArrayBuffer,
  options: Pick<SplitOptions, 'gridSize' | 'overlap' | 'model'>,
): Promise<CroppedImageRegion[]> {
  if (imageBuffer.byteLength === 0) throw new Error('빈 도면 이미지는 분석할 수 없습니다.');
  const gridSize = normalizedGridSize(options.gridSize);
  const overlap = normalizedOverlap(options.overlap);
  const sharp = (await import('sharp')).default;
  const source = Buffer.from(imageBuffer);
  const normalized = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
    .rotate()
    .png()
    .toBuffer({ resolveWithObject: true });
  const width = normalized.info.width;
  const height = normalized.info.height;
  if (!width || !height || width * height > MAX_INPUT_PIXELS) {
    throw new Error('도면 이미지 해상도가 허용 범위를 초과합니다.');
  }

  const bounds = planRegions(width, height, gridSize, overlap);
  return Promise.all(bounds.map(async (region, index) => {
    const cropped = await sharp(normalized.data, { limitInputPixels: MAX_INPUT_PIXELS })
      .extract({ left: region.x, top: region.y, width: region.w, height: region.h })
      .png()
      .toBuffer();
    return {
      index,
      buffer: Uint8Array.from(cropped).buffer,
      bounds: region,
    };
  }));
}

function providerKey(options: SplitOptions): string {
  const explicit = options.apiKey?.trim();
  if (explicit) return explicit;
  if (options.model === 'gemini') return process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ?? '';
  if (options.model === 'openai') return process.env.OPENAI_API_KEY?.trim() ?? '';
  if (options.model === 'claude') return process.env.ANTHROPIC_API_KEY?.trim() ?? '';
  return '';
}

function localToGlobal(
  position: ExtractedComponent['position'],
  bounds: CroppedImageRegion['bounds'],
): ExtractedComponent['position'] {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return undefined;
  if (position.x < 0 || position.x > 1000 || position.y < 0 || position.y > 1000) return undefined;
  return {
    x: bounds.x + (position.x / 1000) * bounds.w,
    y: bounds.y + (position.y / 1000) * bounds.h,
  };
}

function namespaceRegionResult(
  region: CroppedImageRegion,
  result: Awaited<ReturnType<typeof import('./vlm-client')['analyzeDrawingWithVLM']>>,
): VisionSplitResult {
  const idMap = new Map<string, string>();
  const components = result.components.map((component, index) => {
    const localId = component.id || `component-${index}`;
    const id = `r${region.index}:${localId.replace(/[^a-zA-Z0-9_.:-]/g, '-')}`;
    idMap.set(localId, id);
    return {
      ...component,
      id,
      position: localToGlobal(component.position, region.bounds),
    };
  });
  const connections = result.connections.map((connection) => ({
    ...connection,
    from: idMap.get(connection.from) ?? `r${region.index}:${connection.from}`,
    to: idMap.get(connection.to) ?? `r${region.index}:${connection.to}`,
  }));

  return {
    regionIndex: region.index,
    regionBounds: region.bounds,
    components,
    connections,
    texts: [],
    regionConfidence: result.confidence,
  };
}

async function analyzeRegion(
  region: CroppedImageRegion,
  options: SplitOptions,
  apiKey: string,
): Promise<VisionSplitResult> {
  const { analyzeDrawingWithVLM } = await import('./vlm-client');
  const result = await analyzeDrawingWithVLM(region.buffer, 'image/png', {
    provider: options.model === 'openai' ? 'openai' : options.model === 'claude' ? 'claude' : 'gemini',
    apiKey,
    model: options.modelName,
  });
  return namespaceRegionResult(region, result);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}

/** Physically crop, analyze, and return region-scoped results. */
export async function splitAndAnalyze(
  imageBuffer: ArrayBuffer,
  options: SplitOptions,
): Promise<VisionSplitResult[]> {
  const apiKey = providerKey(options);
  if (!apiKey) {
    throw new Error('이미지 도면 분석에는 Vision BYOK 키 또는 서버 Vision 키가 필요합니다.');
  }
  const regions = await cropImageIntoRegions(imageBuffer, options);
  const concurrency = Math.max(1, Math.min(4, options.maxConcurrency ?? 2));
  return mapWithConcurrency(regions, concurrency, (region) => analyzeRegion(region, options, apiKey));
}

function labelsCompatible(a: ExtractedComponent, b: ExtractedComponent): boolean {
  const left = a.label.trim().toLowerCase();
  const right = b.label.trim().toLowerCase();
  return !left || !right || left === right;
}

function isDuplicate(
  a: ExtractedComponent,
  b: ExtractedComponent,
  tolerance: number,
): boolean {
  if (a.type !== b.type || !a.position || !b.position || !labelsCompatible(a, b)) return false;
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) <= tolerance;
}

/** Merge overlap duplicates, preserve canonical IDs, and remove dangling edges. */
export function mergeVisionSplitResults(
  results: VisionSplitResult[],
  positionTolerance = 20,
): MergedVisionResult {
  const components: ExtractedComponent[] = [];
  const aliases = new Map<string, string>();

  for (const result of results) {
    for (const candidate of result.components) {
      const duplicateIndex = components.findIndex((existing) =>
        isDuplicate(existing, candidate, positionTolerance));
      if (duplicateIndex === -1) {
        components.push(candidate);
        aliases.set(candidate.id, candidate.id);
        continue;
      }
      const existing = components[duplicateIndex];
      aliases.set(candidate.id, existing.id);
      if (candidate.confidence > existing.confidence) {
        components[duplicateIndex] = { ...candidate, id: existing.id };
      }
    }
  }

  const validIds = new Set(components.map((component) => component.id));
  const seenEdges = new Set<string>();
  const connections: ExtractedConnection[] = [];
  for (const result of results) {
    for (const connection of result.connections) {
      const from = aliases.get(connection.from) ?? connection.from;
      const to = aliases.get(connection.to) ?? connection.to;
      if (!validIds.has(from) || !validIds.has(to) || from === to) continue;
      const key = `${from}\u0000${to}\u0000${connection.cableType ?? ''}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      connections.push({ ...connection, from, to });
    }
  }

  const confidence = results.length > 0
    ? results.reduce((sum, result) => sum + result.regionConfidence, 0) / results.length
    : 0;
  return { components, connections, confidence };
}

/** Backward-compatible component-only helper. */
export function deduplicateComponents(
  allComponents: ExtractedComponent[],
  positionTolerance = 10,
): ExtractedComponent[] {
  return mergeVisionSplitResults([
    {
      regionIndex: 0,
      regionBounds: { x: 0, y: 0, w: 0, h: 0 },
      components: allComponents,
      connections: [],
      texts: [],
      regionConfidence: 0,
    },
  ], positionTolerance).components;
}
