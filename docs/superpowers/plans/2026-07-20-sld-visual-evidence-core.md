# SLD Visual Evidence Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the quality profiling, multi-scale preprocessing, coordinate transforms, and adaptive tiling foundation required for 95% SLD evidence recovery.

**Architecture:** Preserve the original raster as the source of truth, derive role-specific `sharp` variants with explicit original-coordinate transforms, and produce adaptive overlapping regions without calling a VLM. Existing callers continue through `vision-splitter.ts`, which consumes this core rather than owning image preprocessing.

**Tech Stack:** TypeScript 5.9, Node.js 26, Sharp 0.34, Jest 30, ts-jest

## Global Constraints

- Supported scope is industrial single-line diagrams, not P&ID, PCB, ladder, or detailed control wiring.
- A transform may improve model readability but must never claim to restore visual evidence that is absent from the source.
- Every derived image must map its coordinates back to the original page.
- Unsupported or unreadable input returns an explicit quality warning and later becomes `HOLD`.
- No new image-processing dependency is allowed; use the existing pinned `sharp` package.
- Existing dirty working-tree changes are user-owned. Stage only task-specific hunks; do not commit unrelated changes.
- Design source: `docs/superpowers/specs/2026-07-20-sld-95-drawing-intelligence-design.md`.

## File Structure

- Create `src/agent/vision/evidence-types.ts`: canonical snapshot, quality, variant, transform, and region contracts.
- Create `src/agent/vision/image-quality.ts`: deterministic raster quality profiling.
- Create `src/agent/vision/image-variants.ts`: original, 2x, 4x, text, and line variants.
- Create `src/agent/vision/adaptive-regions.ts`: content-independent adaptive region planning and coordinate conversion.
- Modify `src/agent/vision/vision-splitter.ts`: delegate normalization, variants, and region planning to the new modules.
- Create focused tests beside existing Vision tests.

---

### Task 1: Canonical evidence and transform contracts

**Files:**
- Create: `src/agent/vision/evidence-types.ts`
- Test: `src/agent/vision/__tests__/evidence-types.test.ts`

**Interfaces:**
- Produces: `DrawingSnapshot`, `ImageQualityProfile`, `ImageVariant`, `ImageVariantKind`, `CoordinateTransform`, `EvidenceBounds`, `PrecisionRegion`, `createDrawingSnapshot`.
- Consumes: only platform `ArrayBuffer`; no provider types.

- [ ] **Step 1: Write the failing coordinate-roundtrip test**

```ts
import { createDrawingSnapshot, toOriginalPoint, toVariantPoint } from '../evidence-types';

it('round-trips variant coordinates through the source transform', () => {
  const transform = { scaleX: 4, scaleY: 4, offsetX: 0, offsetY: 0 };
  const original = toOriginalPoint({ x: 400, y: 200 }, transform);
  expect(original).toEqual({ x: 100, y: 50 });
  expect(toVariantPoint(original, transform)).toEqual({ x: 400, y: 200 });
});

it('creates a stable source hash and carries the measured quality profile', () => {
  const profile = {
    width: 100, height: 80, channels: 3, contrast: 0.5, edgeDensity: 0.2,
    gradientVariance: 10, lowContrast: false, blurry: false,
    recommendedScale: 2 as const, warnings: [],
  };
  const first = createDrawingSnapshot(Uint8Array.from([1, 2, 3]).buffer, 'image/png', profile);
  const second = createDrawingSnapshot(Uint8Array.from([1, 2, 3]).buffer, 'image/png', profile);
  expect(first.drawingHash).toBe(second.drawingHash);
  expect(first.quality).toEqual(profile);
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `npx jest src/agent/vision/__tests__/evidence-types.test.ts --runInBand`

Expected: FAIL with `Cannot find module '../evidence-types'`.

- [ ] **Step 3: Create the complete evidence contract**

```ts
import { createHash } from 'node:crypto';

export type Point = { x: number; y: number };
export type EvidenceBounds = Point & { w: number; h: number };

export interface CoordinateTransform {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

export type ImageVariantKind =
  | 'original'
  | 'upscale-2x'
  | 'upscale-4x'
  | 'text-high-contrast'
  | 'line-enhanced';

export interface DrawingSnapshot {
  drawingHash: string;
  mimeType: string;
  page: number;
  width: number;
  height: number;
  quality: ImageQualityProfile;
}

export interface ImageQualityProfile {
  width: number;
  height: number;
  channels: number;
  contrast: number;
  edgeDensity: number;
  gradientVariance: number;
  lowContrast: boolean;
  blurry: boolean;
  recommendedScale: 1 | 2 | 4;
  warnings: string[];
}

export interface ImageVariant {
  id: string;
  kind: ImageVariantKind;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  transform: CoordinateTransform;
}

export interface PrecisionRegion {
  id: string;
  variantId: string;
  variantBounds: EvidenceBounds;
  originalBounds: EvidenceBounds;
  buffer: ArrayBuffer;
}

export function createDrawingSnapshot(
  buffer: ArrayBuffer,
  mimeType: string,
  quality: ImageQualityProfile,
  page = 1,
): DrawingSnapshot {
  if (buffer.byteLength === 0) throw new Error('빈 도면 이미지는 분석할 수 없습니다.');
  return {
    drawingHash: createHash('sha256').update(Buffer.from(buffer)).digest('hex'),
    mimeType,
    page,
    width: quality.width,
    height: quality.height,
    quality,
  };
}

function assertScale(transform: CoordinateTransform): void {
  if (!(transform.scaleX > 0) || !(transform.scaleY > 0)) {
    throw new Error('좌표 변환 배율은 0보다 커야 합니다.');
  }
}

export function toOriginalPoint(point: Point, transform: CoordinateTransform): Point {
  assertScale(transform);
  return {
    x: (point.x - transform.offsetX) / transform.scaleX,
    y: (point.y - transform.offsetY) / transform.scaleY,
  };
}

export function toVariantPoint(point: Point, transform: CoordinateTransform): Point {
  assertScale(transform);
  return {
    x: point.x * transform.scaleX + transform.offsetX,
    y: point.y * transform.scaleY + transform.offsetY,
  };
}
```

- [ ] **Step 4: Run the test and typecheck**

Run: `npx jest src/agent/vision/__tests__/evidence-types.test.ts --runInBand`

Expected: 1 test PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 5: Commit only the new contract files**

```bash
git add src/agent/vision/evidence-types.ts src/agent/vision/__tests__/evidence-types.test.ts
git diff --cached --check
git commit -m "feat(vision): add source-linked evidence contracts"
```

### Task 2: Deterministic image quality profiling

**Files:**
- Create: `src/agent/vision/image-quality.ts`
- Test: `src/agent/vision/__tests__/image-quality.test.ts`

**Interfaces:**
- Consumes: `ArrayBuffer`.
- Produces: `profileImage(buffer: ArrayBuffer): Promise<ImageQualityProfile>`.

- [ ] **Step 1: Write failing tests for flat and edge-rich images**

```ts
import sharp from 'sharp';
import { profileImage } from '../image-quality';

it('flags a flat low-contrast page and recommends enlargement', async () => {
  const flat = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#888888' } })
    .png().toBuffer();
  const result = await profileImage(Uint8Array.from(flat).buffer);
  expect(result.lowContrast).toBe(true);
  expect(result.recommendedScale).toBe(4);
  expect(result.warnings).toContain('LOW_CONTRAST');
});

it('detects an edge-rich checker image', async () => {
  const raw = Buffer.alloc(80 * 60, 0).map((_, i) => ((i + Math.floor(i / 80)) % 2 ? 255 : 0));
  const image = await sharp(raw, { raw: { width: 80, height: 60, channels: 1 } }).png().toBuffer();
  const result = await profileImage(Uint8Array.from(image).buffer);
  expect(result.edgeDensity).toBeGreaterThan(0.5);
  expect(result.lowContrast).toBe(false);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npx jest src/agent/vision/__tests__/image-quality.test.ts --runInBand`

Expected: FAIL because `profileImage` does not exist.

- [ ] **Step 3: Implement bounded grayscale statistics**

```ts
import sharp from 'sharp';
import type { ImageQualityProfile } from './evidence-types';

const MAX_PROFILE_SIDE = 1024;

export async function profileImage(buffer: ArrayBuffer): Promise<ImageQualityProfile> {
  if (buffer.byteLength === 0) throw new Error('빈 도면 이미지는 분석할 수 없습니다.');
  const metadata = await sharp(Buffer.from(buffer), { animated: false }).rotate().metadata();
  const { data, info } = await sharp(Buffer.from(buffer), { animated: false })
    .rotate()
    .resize({ width: MAX_PROFILE_SIDE, height: MAX_PROFILE_SIDE, fit: 'inside', withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = [...data];
  const mean = pixels.reduce((sum, value) => sum + value, 0) / Math.max(1, pixels.length);
  const variance = pixels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, pixels.length);
  let edgeCount = 0;
  const gradients: number[] = [];
  for (let y = 1; y < info.height; y++) {
    for (let x = 1; x < info.width; x++) {
      const i = y * info.width + x;
      const gradient = Math.abs(data[i] - data[i - 1]) + Math.abs(data[i] - data[i - info.width]);
      gradients.push(gradient);
      if (gradient >= 32) edgeCount++;
    }
  }
  const gradientMean = gradients.reduce((sum, value) => sum + value, 0) / Math.max(1, gradients.length);
  const gradientVariance = gradients.reduce((sum, value) => sum + (value - gradientMean) ** 2, 0) / Math.max(1, gradients.length);
  const contrast = Math.min(1, Math.sqrt(variance) / 128);
  const edgeDensity = edgeCount / Math.max(1, gradients.length);
  const lowContrast = contrast < 0.08;
  const blurry = edgeDensity < 0.01 && !lowContrast;
  const warnings = [lowContrast ? 'LOW_CONTRAST' : '', blurry ? 'BLURRY' : ''].filter(Boolean);
  return {
    width: metadata.width ?? info.width,
    height: metadata.height ?? info.height,
    channels: metadata.channels ?? info.channels,
    contrast,
    edgeDensity,
    gradientVariance,
    lowContrast,
    blurry,
    recommendedScale: lowContrast || blurry ? 4 : Math.min(info.width, info.height) < 1200 ? 2 : 1,
    warnings,
  };
}
```

- [ ] **Step 4: Run focused tests**

Run: `npx jest src/agent/vision/__tests__/image-quality.test.ts --runInBand`

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent/vision/image-quality.ts src/agent/vision/__tests__/image-quality.test.ts
git diff --cached --check
git commit -m "feat(vision): profile drawing image quality"
```

### Task 3: Multi-scale role-specific variants

**Files:**
- Create: `src/agent/vision/image-variants.ts`
- Test: `src/agent/vision/__tests__/image-variants.test.ts`

**Interfaces:**
- Consumes: source `ArrayBuffer`, `ImageQualityProfile`.
- Produces: `createImageVariants(buffer, profile): Promise<ImageVariant[]>`.

- [ ] **Step 1: Write the failing variant/transform test**

```ts
import sharp from 'sharp';
import { createImageVariants } from '../image-variants';
import { profileImage } from '../image-quality';

it('creates source-linked original, scale, text, and line variants', async () => {
  const input = await sharp({ create: { width: 100, height: 80, channels: 3, background: '#ffffff' } })
    .png().toBuffer();
  const buffer = Uint8Array.from(input).buffer;
  const variants = await createImageVariants(buffer, await profileImage(buffer));
  expect(variants.map((item) => item.kind)).toEqual(expect.arrayContaining([
    'original', 'upscale-2x', 'upscale-4x', 'text-high-contrast', 'line-enhanced',
  ]));
  expect(variants.find((item) => item.kind === 'upscale-4x')?.transform.scaleX).toBe(4);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npx jest src/agent/vision/__tests__/image-variants.test.ts --runInBand`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the five bounded variants**

```ts
import sharp from 'sharp';
import type { ImageQualityProfile, ImageVariant, ImageVariantKind } from './evidence-types';

const MAX_VARIANT_PIXELS = 64_000_000;

async function render(source: Buffer, kind: ImageVariantKind, scale: 1 | 2 | 4): Promise<ImageVariant> {
  const metadata = await sharp(source, { animated: false }).rotate().metadata();
  const sourceWidth = metadata.width ?? 1;
  const sourceHeight = metadata.height ?? 1;
  const boundedScale = kind === 'original'
    ? 1
    : Math.min(scale, Math.sqrt(MAX_VARIANT_PIXELS / (sourceWidth * sourceHeight)));
  const width = Math.max(1, Math.round(sourceWidth * boundedScale));
  const height = Math.max(1, Math.round(sourceHeight * boundedScale));
  let pipeline = sharp(source, { animated: false }).rotate();
  if (Math.abs(boundedScale - 1) > Number.EPSILON) pipeline = pipeline.resize({ width, height, kernel: sharp.kernel.lanczos3 });
  if (kind === 'text-high-contrast') pipeline = pipeline.greyscale().normalise().sharpen().threshold(180);
  if (kind === 'line-enhanced') pipeline = pipeline.greyscale().normalise().sharpen({ sigma: 1 });
  const output = await pipeline.png().toBuffer();
  return {
    id: `variant:${kind}`,
    kind,
    buffer: Uint8Array.from(output).buffer,
    width,
    height,
    transform: { scaleX: width / sourceWidth, scaleY: height / sourceHeight, offsetX: 0, offsetY: 0 },
  };
}

export async function createImageVariants(
  buffer: ArrayBuffer,
  _profile: ImageQualityProfile,
): Promise<ImageVariant[]> {
  const source = Buffer.from(buffer);
  return Promise.all([
    render(source, 'original', 1),
    render(source, 'upscale-2x', 2),
    render(source, 'upscale-4x', 4),
    render(source, 'text-high-contrast', 4),
    render(source, 'line-enhanced', 2),
  ]);
}
```

- [ ] **Step 4: Run tests and inspect output dimensions**

Run: `npx jest src/agent/vision/__tests__/image-variants.test.ts --runInBand`

Expected: PASS and no Sharp pixel-limit errors.

- [ ] **Step 5: Commit**

```bash
git add src/agent/vision/image-variants.ts src/agent/vision/__tests__/image-variants.test.ts
git diff --cached --check
git commit -m "feat(vision): add multi-scale drawing variants"
```

### Task 4: Adaptive regions and splitter integration

**Files:**
- Create: `src/agent/vision/adaptive-regions.ts`
- Test: `src/agent/vision/__tests__/adaptive-regions.test.ts`
- Modify: `src/agent/vision/vision-splitter.ts`
- Modify: `src/agent/vision/__tests__/vision-splitter-crop.test.ts`

**Interfaces:**
- Produces: `planAdaptiveBounds(width, height, scale, overlap): EvidenceBounds[]` and `cropPrecisionRegions(variant, bounds): Promise<PrecisionRegion[]>`.
- Modifies: `SplitOptions` with `precision?: boolean`; precision defaults to `true` for SLD image analysis.

- [ ] **Step 1: Write failing boundary coverage tests**

```ts
import { planAdaptiveBounds } from '../adaptive-regions';

it('covers every source corner and overlaps neighboring regions', () => {
  const bounds = planAdaptiveBounds(1200, 800, 4, 0.18);
  expect(bounds).toHaveLength(4);
  expect(bounds[0]).toMatchObject({ x: 0, y: 0 });
  expect(bounds.some((item) => item.x + item.w === 1200 && item.y + item.h === 800)).toBe(true);
  expect(bounds[0].x + bounds[0].w).toBeGreaterThan(bounds[1].x);
});
```

- [ ] **Step 2: Verify the test fails**

Run: `npx jest src/agent/vision/__tests__/adaptive-regions.test.ts --runInBand`

Expected: FAIL because `planAdaptiveBounds` does not exist.

- [ ] **Step 3: Implement adaptive bounds and original-coordinate crops**

```ts
import sharp from 'sharp';
import { toOriginalPoint, type EvidenceBounds, type ImageVariant, type PrecisionRegion } from './evidence-types';

export function planAdaptiveBounds(
  width: number,
  height: number,
  gridSize: 4 | 9 | 16,
  overlap: number,
): EvidenceBounds[] {
  if (!(overlap >= 0 && overlap <= 0.25)) throw new Error('중첩 비율은 0~0.25여야 합니다.');
  const side = Math.sqrt(gridSize);
  const cellW = Math.ceil(width / side);
  const cellH = Math.ceil(height / side);
  const padX = Math.ceil(cellW * overlap);
  const padY = Math.ceil(cellH * overlap);
  const result: EvidenceBounds[] = [];
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const x = Math.max(0, col * cellW - padX);
      const y = Math.max(0, row * cellH - padY);
      const right = Math.min(width, (col + 1) * cellW + padX);
      const bottom = Math.min(height, (row + 1) * cellH + padY);
      result.push({ x, y, w: right - x, h: bottom - y });
    }
  }
  return result;
}

export async function cropPrecisionRegions(
  variant: ImageVariant,
  bounds: EvidenceBounds[],
): Promise<PrecisionRegion[]> {
  return Promise.all(bounds.map(async (item, index) => {
    const output = await sharp(Buffer.from(variant.buffer))
      .extract({ left: item.x, top: item.y, width: item.w, height: item.h })
      .png().toBuffer();
    const origin = toOriginalPoint({ x: item.x, y: item.y }, variant.transform);
    const end = toOriginalPoint({ x: item.x + item.w, y: item.y + item.h }, variant.transform);
    return {
      id: `${variant.id}:region:${index}`,
      variantId: variant.id,
      variantBounds: item,
      originalBounds: { x: origin.x, y: origin.y, w: end.x - origin.x, h: end.y - origin.y },
      buffer: Uint8Array.from(output).buffer,
    };
  }));
}
```

- [ ] **Step 4: Integrate without breaking the legacy public API**

In `vision-splitter.ts`, keep `cropImageIntoRegions()` for existing callers and add:

```ts
export async function preparePrecisionRegions(imageBuffer: ArrayBuffer) {
  const profile = await profileImage(imageBuffer);
  const variants = await createImageVariants(imageBuffer, profile);
  const gridSize: 4 | 9 | 16 = profile.recommendedScale === 4 ? 16 : profile.recommendedScale === 2 ? 9 : 4;
  const selected = variants.filter((item) =>
    item.kind === 'original' || item.kind === 'text-high-contrast' || item.kind === 'line-enhanced');
  const regions = (await Promise.all(selected.map((variant) =>
    cropPrecisionRegions(variant, planAdaptiveBounds(variant.width, variant.height, gridSize, 0.18))))).flat();
  return { profile, variants, regions };
}
```

Add imports from `image-quality`, `image-variants`, and `adaptive-regions`. Do not route VLM calls to every variant in this task; later role reviewers select the correct variant.

- [ ] **Step 5: Run the complete Vision unit slice**

Run: `npx jest src/agent/vision --runInBand`

Expected: all existing and new Vision suites PASS.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 6: Commit task-specific hunks**

```bash
git add src/agent/vision/adaptive-regions.ts src/agent/vision/__tests__/adaptive-regions.test.ts
git add -p src/agent/vision/vision-splitter.ts src/agent/vision/__tests__/vision-splitter-crop.test.ts
git diff --cached --check
git commit -m "feat(vision): prepare adaptive precision regions"
```

## Plan 1 Completion Gate

Run without output pipes:

```bash
npx jest src/agent/vision --runInBand
npx tsc --noEmit
```

Expected: both commands exit 0. This plan raises implementation coverage only; it does not claim real-drawing 95% accuracy.
