import type { BoundaryContinuation } from './continuity-types';
import type { PrecisionRegion } from './evidence-types';

const MAX_PORTS_PER_REGION = 128;
const MAX_INPUT_PIXELS = 64_000_000;

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] ?? character);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer;
}

export async function annotatePrecisionRegion(
  region: PrecisionRegion,
  ports: readonly BoundaryContinuation[],
): Promise<PrecisionRegion> {
  if (!region.displayId || !region.logicalOriginalBounds || !region.logicalVariantBounds) {
    throw new Error('A/C 표지에는 논리 구획 메타데이터가 필요합니다.');
  }
  if (!/^P\d{2,}-A\d{2,}$/.test(region.displayId)) {
    throw new Error('A/C 표지 구획 ID 형식이 올바르지 않습니다.');
  }
  const relevant = ports.filter((port) =>
    port.observations.some((observation) => observation.regionDisplayId === region.displayId));
  if (relevant.length > MAX_PORTS_PER_REGION) {
    throw new Error('구획 연속 포트 수가 허용 상한을 초과했습니다.');
  }
  const sharp = (await import('sharp')).default;
  const source = Buffer.from(region.buffer);
  const metadata = await sharp(source, { animated: false, limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height || width * height > MAX_INPUT_PIXELS) {
    throw new Error('A/C 표지 입력 이미지 치수가 올바르지 않습니다.');
  }
  if (width !== region.variantBounds.w || height !== region.variantBounds.h) {
    throw new Error('A/C 표지 이미지와 crop 경계 치수가 일치하지 않습니다.');
  }
  const scaleX = width / region.originalBounds.w;
  const scaleY = height / region.originalBounds.h;
  const pointToPixel = (point: { x: number; y: number }) => ({
    x: (point.x - region.originalBounds.x) * scaleX,
    y: (point.y - region.originalBounds.y) * scaleY,
  });
  const coreStart = pointToPixel(region.logicalOriginalBounds);
  const coreEnd = pointToPixel({
    x: region.logicalOriginalBounds.x + region.logicalOriginalBounds.w,
    y: region.logicalOriginalBounds.y + region.logicalOriginalBounds.h,
  });
  const core = {
    x: clamp(coreStart.x, 0, width),
    y: clamp(coreStart.y, 0, height),
    w: clamp(coreEnd.x - coreStart.x, 0, width),
    h: clamp(coreEnd.y - coreStart.y, 0, height),
  };
  const portMarks = relevant.map((port) => {
    const point = pointToPixel(port.point);
    const observation = port.observations.find((item) => item.regionDisplayId === region.displayId);
    const side = observation?.side ?? 'corner';
    const preferLeft = side === 'right' || point.x > width * 0.7;
    const labelWidth = Math.min(84, 12 + port.displayId.length * 6.4);
    const labelX = clamp(preferLeft ? point.x - labelWidth - 6 : point.x + 6, 2, Math.max(2, width - labelWidth - 2));
    const labelY = clamp(point.y - 9, 2, Math.max(2, height - 18));
    return [
      `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4" fill="#ffffff" stroke="#0891b2" stroke-width="2"/>`,
      `<rect x="${labelX.toFixed(2)}" y="${labelY.toFixed(2)}" width="${labelWidth.toFixed(2)}" height="16" rx="3" fill="#ecfeff" fill-opacity="0.94" stroke="#0891b2" stroke-width="1"/>`,
      `<text x="${(labelX + 4).toFixed(2)}" y="${(labelY + 11.5).toFixed(2)}" font-family="sans-serif" font-size="9" font-weight="700" fill="#155e75">${xml(port.displayId)}</text>`,
    ].join('');
  }).join('');
  const labelX = clamp(core.x + 4, 2, Math.max(2, width - 72));
  const labelY = clamp(core.y + 4, 2, Math.max(2, height - 20));
  const overlay = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`
    + `<rect x="${core.x.toFixed(2)}" y="${core.y.toFixed(2)}" width="${core.w.toFixed(2)}" height="${core.h.toFixed(2)}" fill="none" stroke="#0e7490" stroke-opacity="0.58" stroke-width="1" stroke-dasharray="5 4"/>`
    + `<rect x="${labelX.toFixed(2)}" y="${labelY.toFixed(2)}" width="68" height="16" rx="3" fill="#f0fdfa" fill-opacity="0.92" stroke="#0f766e" stroke-width="1"/>`
    + `<text x="${(labelX + 4).toFixed(2)}" y="${(labelY + 11.5).toFixed(2)}" font-family="sans-serif" font-size="9" font-weight="700" fill="#115e59">${xml(region.displayId)}</text>`
    + portMarks
    + '</svg>',
  );
  const output = await sharp(source, { animated: false, limitInputPixels: MAX_INPUT_PIXELS })
    .composite([{ input: overlay, left: 0, top: 0 }])
    .png()
    .toBuffer();
  return { ...region, buffer: toArrayBuffer(output) };
}
