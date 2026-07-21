import { parseNameplateVisionResponse } from '../ocr-nameplate';

describe('nameplate vision response validation', () => {
  it('keeps only bounded typed fields and clamps confidence', () => {
    const parsed = parseNameplateVisionResponse(JSON.stringify({
      manufacturer: 'ESA Motor',
      voltage: '380V',
      phase: '3',
      language: 'ko',
      confidence: 4,
      metadata: { injected: true },
      model: { nested: 'invalid' },
    }));

    expect(parsed).toEqual(expect.objectContaining({
      manufacturer: 'ESA Motor',
      voltage: '380V',
      phase: '3',
      language: 'ko',
      confidence: 1,
    }));
    expect(parsed.model).toBeUndefined();
    expect(parsed).not.toHaveProperty('metadata');
  });

  it('fails closed on malformed output and does not grant inferred confidence', () => {
    expect(parseNameplateVisionResponse('not json')).toEqual(expect.objectContaining({
      rawText: 'not json',
      confidence: 0,
      language: 'unknown',
    }));
    expect(parseNameplateVisionResponse('[]').confidence).toBe(0);
  });
});
