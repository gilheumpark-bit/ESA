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

  // 그리드 계산
  const cols = gridSize <= 4 ? 2 : Math.min(4, Math.ceil(Math.sqrt(gridSize)));
  const rows = Math.ceil(gridSize / cols);

  // 이미지 크기: 옵션 → PNG/JPEG 헤더 파싱 → 폴백
  const imgWidth = options.imageWidth ?? parseImageWidth(imageBuffer) ?? 4000;
  const imgHeight = options.imageHeight ?? parseImageHeight(imageBuffer) ?? 3000;

  const regionWidth = Math.ceil(imgWidth / cols);
  const regionHeight = Math.ceil(imgHeight / rows);
  const overlapPx = Math.ceil(Math.max(regionWidth, regionHeight) * overlap);

  // 영역 생성
  const regions: ImageRegion[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.max(0, c * regionWidth - overlapPx);
      const y = Math.max(0, r * regionHeight - overlapPx);
      const w = Math.min(regionWidth + 2 * overlapPx, imgWidth - x);
      const h = Math.min(regionHeight + 2 * overlapPx, imgHeight - y);

      regions.push({
        index: r * cols + c,
        buffer: imageBuffer, // 실제: crop된 버퍼
        bounds: { x, y, w, h },
      });
    }
  }

  // 병렬 분석 (Promise.all)
  const results = await Promise.all(
    regions.map(region => analyzeRegion(region, options))
  );

  return results;
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
      const result = await analyzeDrawingWithVLM(region.buffer, 'image/png', {
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
