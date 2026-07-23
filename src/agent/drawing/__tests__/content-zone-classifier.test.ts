import {
  classifyTextContent,
  detectScheduleBounds,
  detectTitleBlockBounds,
  isScheduleDocument,
  pathInsideBounds,
} from '../content-zone-classifier';

describe('drawing content-zone safeguards', () => {
  it('classifies note sentences separately from device labels', () => {
    expect(classifyTextContent('IF YOU DO NOT HAVE VCB, USE LBS INSTEAD')).toBe('note');
    expect(classifyTextContent('VCB-11')).toBe('device-label');
  });

  it('requires repeated schedule headings before classifying a table document', () => {
    expect(isScheduleDocument(['CABLE SCHEDULE', 'CABLE SCHEDULE', 'FROM', 'TO'])).toBe(true);
    expect(isScheduleDocument(['CABLE SCHEDULE', 'VCB-1'])).toBe(false);
  });

  it('limits title-block exclusion to a tight box around multiple lower-right markers', () => {
    const bounds = detectTitleBlockBounds([
      { text: 'DRAWING NO.', bounds: { x: 820, y: 850, w: 100, h: 20 } },
      { text: 'SCALE', bounds: { x: 820, y: 900, w: 60, h: 20 } },
    ], 1_000, 1_000);
    expect(bounds).toEqual({ x: 800, y: 830, w: 140, h: 110 });
    expect(pathInsideBounds([{ x: 820, y: 850 }, { x: 900, y: 900 }], bounds!)).toBe(true);
    expect(pathInsideBounds([{ x: 700, y: 800 }, { x: 950, y: 800 }], bounds!)).toBe(false);
    expect(detectTitleBlockBounds([
      { text: 'DRAWING NO.', bounds: { x: 820, y: 850, w: 100, h: 20 } },
    ], 1_000, 1_000)).toBeNull();
  });

  it('returns local schedule zones instead of classifying the whole page as a table', () => {
    const zones = detectScheduleBounds([
      { text: 'CABLE SCHEDULE', bounds: { x: 10, y: 75, w: 35, h: 10 } },
      { text: 'CABLE SCHEDULE', bounds: { x: 60, y: 75, w: 35, h: 10 } },
      { text: 'TR-1', bounds: { x: 80, y: 5, w: 15, h: 10 } },
    ], 100, 100);

    expect(zones).toHaveLength(2);
    expect(zones.some((zone) => pathInsideBounds([{ x: 15, y: 70 }, { x: 35, y: 70 }], zone))).toBe(true);
    expect(zones.some((zone) => pathInsideBounds([{ x: 80, y: 5 }, { x: 95, y: 5 }], zone))).toBe(false);
  });
});
