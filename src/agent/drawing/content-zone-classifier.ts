import type { EvidenceBounds } from '../vision/evidence-types';

export type TextContentKind = 'device-label' | 'note' | 'schedule' | 'title-block' | 'other';

const DEVICE_TOKEN = /\b(?:ACB|VCB|MCCB|MCB|ELB|ELCB|LBS|TR|TRANSFORMER|MOTOR|GEN|GENERATOR|MCC|DB|PANEL|BUS|CT|PT|WHM|RELAY|UPS)\b/i;
const PROSE_WORDS = /\b(?:if|you|do|does|not|but|have|has|the|an?|shall|should|will|must|for|with|are|is|to|of|in|instead)\b/gi;
const KOREAN_PROSE = /(하여|하십시오|할 것|해야|합니다|바랍니다|참조)/;
const SCHEDULE_HEADING = /(?:CABLE|PANEL|LOAD)\s*(?:SCHEDULE|TABLE)|일람표|부하집계표/i;
const TITLE_MARKER = /DRAWING\s*(?:NO|NUMBER)|도면번호|TITLE|표제|SCALE|축척|REV(?:ISION)?/i;

export function classifyTextContent(text: string): TextContentKind {
  const value = text.normalize('NFKC').trim();
  if (!value) return 'other';
  if (SCHEDULE_HEADING.test(value)) return 'schedule';
  if (TITLE_MARKER.test(value)) return 'title-block';
  const words = value.split(/\s+/);
  const proseHits = value.match(PROSE_WORDS)?.length ?? 0;
  if (words.length >= 5 && (proseHits >= 2 || KOREAN_PROSE.test(value))) return 'note';
  if (DEVICE_TOKEN.test(value) && words.length <= 4) return 'device-label';
  return 'other';
}

export function isScheduleDocument(texts: readonly string[]): boolean {
  return texts.filter((text) => SCHEDULE_HEADING.test(text.normalize('NFKC'))).length >= 2;
}

export function detectScheduleBounds(
  texts: ReadonlyArray<{ text: string; bounds: EvidenceBounds }>,
  pageWidth: number,
  pageHeight: number,
): EvidenceBounds[] {
  if (pageWidth <= 0 || pageHeight <= 0) return [];
  const markers = texts.filter((item) => SCHEDULE_HEADING.test(item.text.normalize('NFKC')));
  if (markers.length < 2) return [];
  const padX = pageWidth * 0.05;
  const padY = pageHeight * 0.2;
  return markers.map(({ bounds }) => {
    const x = Math.max(0, bounds.x - padX);
    const y = Math.max(0, bounds.y - padY);
    const right = Math.min(pageWidth, bounds.x + bounds.w + padX);
    const bottom = Math.min(pageHeight, bounds.y + bounds.h + padY);
    return { x, y, w: right - x, h: bottom - y };
  });
}

export function detectTitleBlockBounds(
  texts: ReadonlyArray<{ text: string; bounds: EvidenceBounds }>,
  pageWidth: number,
  pageHeight: number,
): EvidenceBounds | null {
  if (pageWidth <= 0 || pageHeight <= 0) return null;
  const candidateZone = { x: pageWidth * 0.65, y: pageHeight * 0.75, w: pageWidth * 0.35, h: pageHeight * 0.25 };
  const markers = texts.filter((item) => TITLE_MARKER.test(item.text)
    && boundsCenterInside(item.bounds, candidateZone));
  if (markers.length < 2) return null;
  const padX = pageWidth * 0.02;
  const padY = pageHeight * 0.02;
  const minX = Math.max(0, Math.min(...markers.map((item) => item.bounds.x)) - padX);
  const minY = Math.max(0, Math.min(...markers.map((item) => item.bounds.y)) - padY);
  const maxX = Math.min(pageWidth, Math.max(...markers.map((item) => item.bounds.x + item.bounds.w)) + padX);
  const maxY = Math.min(pageHeight, Math.max(...markers.map((item) => item.bounds.y + item.bounds.h)) + padY);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function pathInsideBounds(
  path: ReadonlyArray<{ x: number; y: number }>,
  bounds: EvidenceBounds,
): boolean {
  return path.length >= 2 && path.every((point) =>
    point.x >= bounds.x
    && point.x <= bounds.x + bounds.w
    && point.y >= bounds.y
    && point.y <= bounds.y + bounds.h);
}

export function boundsCenterInside(inner: EvidenceBounds, outer: EvidenceBounds): boolean {
  const x = inner.x + inner.w / 2;
  const y = inner.y + inner.h / 2;
  return x >= outer.x && x <= outer.x + outer.w && y >= outer.y && y <= outer.y + outer.h;
}
