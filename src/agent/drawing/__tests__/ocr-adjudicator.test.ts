import { adjudicateOcr } from '../ocr-adjudicator';

describe('ocr-adjudicator', () => {
  it('does not confirm PT/PPT on majority alone without context', () => {
    const result = adjudicateOcr({
      displayId: 'P03-T017',
      pageIndex: 2,
      bounds: { x: 10, y: 10, w: 40, h: 16 },
      readings: [
        { variantId: 'original', text: 'PT', confidence: 0.8, callId: 'a' },
        { variantId: 'upscale-4x', text: 'PPT', confidence: 0.8, callId: 'b' },
        { variantId: 'text-high-contrast', text: 'PT', confidence: 0.8, callId: 'c' },
      ],
      adjacentSymbolTypes: [],
      legendTerms: [],
      standardTerms: [],
    });
    // majority PT but confusable without context → AMBIGUOUS
    expect(result.status).toBe('AMBIGUOUS');
  });

  it('confirms PT with majority + VT adjacency + legend', () => {
    const result = adjudicateOcr({
      displayId: 'P03-T017',
      pageIndex: 2,
      bounds: { x: 10, y: 10, w: 40, h: 16 },
      readings: [
        { variantId: 'original', text: 'PT', confidence: 0.9, callId: 'a' },
        { variantId: 'upscale-4x', text: 'PPT', confidence: 0.7, callId: 'b' },
        { variantId: 'text-high-contrast', text: 'PT', confidence: 0.9, callId: 'c' },
      ],
      adjacentSymbolTypes: ['voltage_transformer'],
      legendTerms: ['PT'],
      standardTerms: ['PT', 'PPT'],
    });
    expect(result.status).toBe('CONFIRMED_BY_MAJORITY_AND_CONTEXT');
    expect(result.confirmedText).toBe('PT');
  });

  it('does not treat repeated copies of one call as triple-read evidence', () => {
    const result = adjudicateOcr({
      displayId: 'P03-T017',
      pageIndex: 2,
      bounds: { x: 10, y: 10, w: 40, h: 16 },
      readings: [
        { variantId: 'original', text: 'PT', confidence: 0.9, callId: 'same-call' },
        { variantId: 'original', text: 'PT', confidence: 0.9, callId: 'same-call' },
        { variantId: 'original', text: 'PT', confidence: 0.9, callId: 'same-call' },
      ],
      adjacentSymbolTypes: ['voltage_transformer'],
      legendTerms: ['PT'],
      standardTerms: ['PT'],
    });

    expect(result.status).toBe('AMBIGUOUS');
  });

  it('returns UNREADABLE when all empty', () => {
    const result = adjudicateOcr({
      displayId: 'P01-T001',
      pageIndex: 0,
      bounds: { x: 0, y: 0, w: 10, h: 10 },
      readings: [],
    });
    expect(result.status).toBe('UNREADABLE_TEXT');
  });
});
