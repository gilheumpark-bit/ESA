/**
 * Vision Splitter — VRAM 분할 병렬 비전
 * --------------------------------------
 * 도면을 N×N 그리드로 분할하여 병렬 OCR/심볼 인식.
 * "스파크의 VRAM을 활용해 도면을 4~8분할하여 초광속으로 훑는다"
 *
 * PART 1: Image grid splitter
 * PART 2: Parallel analysis
 * PART 3: Result merger
 */

import type { ExtractedComponent, ExtractedConnection } from '../teams/types';

// ── Image dimension parsing from raw bytes ──

/** PNG 헤더에서 너비 추출 (IHDR chunk, offset 16-19) */
function parseImageWidth(buf: ArrayBuffer): number | null {
  const view = new DataView(buf);
  if (buf.byteLength < 24) return null;
  // PNG magic: 0x89 0x50 0x4E 0x47
  if (view.getUint8(0) === 0x89 && view.getUint8(1) === 0x50) {
    return view.getUint32(16, false); // big-endian
  }
  // JPEG: parse SOF0 marker for dimensions
  if (view.getUint8(0) === 0xFF && view.getUint8(1) === 0xD8) {
    return parseJpegDimension(buf, 'width');
  }
  return null;
}

function parseImageHeight(buf: ArrayBuffer): number | null {
  const view = new DataView(buf);
  if (buf.byteLength < 24) return null;
  if (view.getUint8(0) === 0x89 && view.getUint8(1) === 0x50) {
    return view.getUint32(20, false);
  }
  if (view.getUint8(0) === 0xFF && view.getUint8(1) === 0xD8) {
    return parseJpegDimension(buf, 'height');
  }
  return null;
}

/** JPEG SOF0 marker 파싱 (0xFFC0) */
function parseJpegDimension(buf: ArrayBuffer, dim: 'width' | 'height'): number | null {
  const view = new DataView(buf);
  let offset = 2;
  while (offset < buf.byteLength - 8) {
    if (view.getUint8(offset) !== 0xFF) { offset++; continue; }
    const marker = view.getUint8(offset + 1);
    if (marker === 0xC0 || marker === 0xC2) {
      // SOF0/SOF2: height at +5, width at +7
      return dim === 'height' ? view.getUint16(offset + 5, false) : view.getUint16(offset + 7, false);
    }
    const len = view.getUint16(offset + 2, false);
    offset += 2 + len;
  }
  return null;
}

/** 매직바이트로 실제 MIME 판별 (PNG 0x89 0x50 / JPEG 0xFF 0xD8) */
function detectMimeType(buf: ArrayBuffer): string {
  const v = new DataView(buf);
  if (buf.byteLength >= 2 && v.getUint8(0) === 0x89 && v.getUint8(1) === 0x50) return 'image/png';
  if (buf.byteLength >= 2 && v.getUint8(0) === 0xFF && v.getUint8(1) === 0xD8) return 'image/jpeg';
  return 'image/png';
}

// ── sharp 래스터 크롭 라이브러리 동적 로드 (미설치 시 단일 영역 degrade) ──

interface SharpInstance {
  extract(region: { left: number; top: number; width: number; height: number }): SharpInstance;
  png(): SharpInstance;
  toBuffer(): Promise<Buffer>;
}
type SharpFactory = (input: Buffer) => SharpInstance;

/** sharp 동적 로드 — 미설치/로드 실패 시 null. (간접 specifier로 모듈 미해결 회피) */
async function loadSharp(): Promise<SharpFactory | null> {
  try {
    const spec = 'sharp';
    const mod: unknown = await import(spec);
    const fn = (mod as { default?: SharpFactory }).default;
    return typeof fn === 'function' ? fn : null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Image Grid Splitter
// ═══════════════════════════════════════════════════════════════════════════════

export interface SplitOptions {
  gridSize: number;     // 4 = 2×2, 8 = 2×4, 16 = 4×4
  overlap: number;      // 오버랩 비율 (0.1 = 10%)
  model: 'gemini' | 'openai' | 'local';
  /** 이미지 너비 (px) — 미지정 시 MIME 헤더에서 추출 시도 */
  imageWidth?: number;
  /** 이미지 높이 (px) */
  imageHeight?: number;
  /** 중복제거 위치 허용오차 (px, 기본 10) */
  deduplicateTolerance?: number;
}

export interface VisionSplitResult {
  regionIndex: number;
  regionBounds: { x: number; y: number; w: number; h: number };
  components: ExtractedComponent[];
  connections: ExtractedConnection[];
  texts: { text: string; position: { x: number; y: number }; confidence: number }[];
  regionConfidence: number;
}

interface ImageRegion {
  index: number;
  buffer: ArrayBuffer;
  bounds: { x: number; y: number; w: number; h: number };
  /** buffer의 실제 MIME — crop 후 재인코딩 포맷과 일치 */
  mimeType: string;
}

/**
 * 이미지를 N등분하여 영역별 분석 → 병합.
 * 실제 VLM 호출 대신 구조화된 분석 결과 반환.
 */
export async function splitAndAnalyze(
  imageBuffer: ArrayBuffer,
  options: SplitOptions,
): Promise<VisionSplitResult[]> {
  const { gridSize, overlap } = options;

  // 그리드 계산 — SplitOptions.gridSize 문서값(4=2×2, 8=2×4, 16=4×4)에 맞춘 명시적 레이아웃.
  // sqrt 폐형식은 gridSize=8에서 3×3=9로 어긋나므로 lookup 사용.
  const { cols, rows } = gridSize <= 4
    ? { cols: 2, rows: 2 }
    : gridSize <= 8
      ? { cols: 2, rows: 4 }
      : { cols: 4, rows: 4 };

  // 이미지 크기: 옵션 → PNG/JPEG 헤더 파싱 → 폴백
  const imgWidth = options.imageWidth ?? parseImageWidth(imageBuffer) ?? 4000;
  const imgHeight = options.imageHeight ?? parseImageHeight(imageBuffer) ?? 3000;

  // 크롭 라이브러리 로드 — 실패 시 단일 전체 이미지 영역으로 정직하게 degrade.
  // (N개 동일 전체 이미지 중복 호출 대신 1회 정확한 호출)
  const sharpFn = await loadSharp();
  if (!sharpFn) {
    const region: ImageRegion = {
      index: 0,
      buffer: imageBuffer,
      bounds: { x: 0, y: 0, w: imgWidth, h: imgHeight },
      mimeType: detectMimeType(imageBuffer),
    };
    return [await analyzeRegion(region, options)];
  }

  const regionWidth = Math.ceil(imgWidth / cols);
  const regionHeight = Math.ceil(imgHeight / rows);
  const overlapPx = Math.ceil(Math.max(regionWidth, regionHeight) * overlap);

  // 영역 생성 + 실제 crop (bounds 픽셀 추출, 병렬)
  const regionPromises: Promise<ImageRegion>[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.max(0, c * regionWidth - overlapPx);
      const y = Math.max(0, r * regionHeight - overlapPx);
      const w = Math.min(regionWidth + 2 * overlapPx, imgWidth - x);
      const h = Math.min(regionHeight + 2 * overlapPx, imgHeight - y);

      regionPromises.push(
        cropRegion(sharpFn, imageBuffer, r * cols + c, { x, y, w, h }),
      );
    }
  }
  const regions = await Promise.all(regionPromises);

  // 병렬 분석 (Promise.all)
  const results = await Promise.all(
    regions.map(region => analyzeRegion(region, options))
  );

  return results;
}

/**
 * region.bounds 영역을 imageBuffer에서 실제로 crop → PNG로 재인코딩.
 * crop 실패 시 전체 이미지로 폴백(해당 영역만 degrade).
 */
async function cropRegion(
  sharpFn: SharpFactory,
  imageBuffer: ArrayBuffer,
  index: number,
  bounds: { x: number; y: number; w: number; h: number },
): Promise<ImageRegion> {
  try {
    const cropped = await sharpFn(Buffer.from(imageBuffer))
      .extract({ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h })
      .png()
      .toBuffer();
    // sharp는 Node Buffer 반환 → ArrayBuffer로 변환 (arrayBufferToBase64의 double-wrap 방지)
    const ab = cropped.buffer.slice(
      cropped.byteOffset,
      cropped.byteOffset + cropped.byteLength,
    ) as ArrayBuffer;
    return { index, buffer: ab, bounds, mimeType: 'image/png' };
  } catch (err) {
    console.warn(`[ESVA] region ${index} crop failed, using full image:`, err);
    return { index, buffer: imageBuffer, bounds, mimeType: detectMimeType(imageBuffer) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Parallel Analysis
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 개별 영역 분석.
 * BYOK API 키가 있으면 실제 VLM 호출, 없으면 빈 결과 반환.
 */
async function analyzeRegion(
  region: ImageRegion,
  options: SplitOptions,
): Promise<VisionSplitResult> {
  // BYOK API 키 확인 — 없으면 빈 결과 (DXF/PDF 벡터 파서 사용 권장)
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    ?? process.env.OPENAI_API_KEY;

  if (apiKey && region.buffer.byteLength > 0) {
    try {
      const { analyzeDrawingWithVLM } = await import('./vlm-client');
      const provider = options.model === 'openai' ? 'openai' : 'gemini';
      const result = await analyzeDrawingWithVLM(region.buffer, region.mimeType, {
        provider,
        apiKey,
      });

      return {
        regionIndex: region.index,
        regionBounds: region.bounds,
        components: result.components,
        connections: result.connections,
        texts: [],
        regionConfidence: result.confidence,
      };
    } catch (err) {
      console.warn(`[ESVA] VLM region ${region.index} failed:`, err);
      // 폴백: 빈 결과
    }
  }

  // API 키 없거나 VLM 실패 시 빈 결과 반환
  return {
    regionIndex: region.index,
    regionBounds: region.bounds,
    components: [],
    connections: [],
    texts: [],
    regionConfidence: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Result Merger
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 오버랩 영역 중복 제거.
 * 같은 위치(±10px)에 같은 타입 → 하나로 병합.
 */
export function deduplicateComponents(
  allComponents: ExtractedComponent[],
  positionTolerance: number = 10,
): ExtractedComponent[] {
  const merged: ExtractedComponent[] = [];
  const used = new Set<number>();

  for (let i = 0; i < allComponents.length; i++) {
    if (used.has(i)) continue;
    const a = allComponents[i];
    let best = a;

    for (let j = i + 1; j < allComponents.length; j++) {
      if (used.has(j)) continue;
      const b = allComponents[j];

      if (a.type === b.type && a.position && b.position) {
        const dx = Math.abs(a.position.x - b.position.x);
        const dy = Math.abs(a.position.y - b.position.y);
        if (dx <= positionTolerance && dy <= positionTolerance) {
          // confidence 높은 쪽 채택
          if (b.confidence > best.confidence) best = b;
          used.add(j);
        }
      }
    }

    merged.push(best);
    used.add(i);
  }

  return merged;
}
