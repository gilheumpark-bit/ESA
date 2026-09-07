import { deduplicateSymbols, type RawSymbolHit } from '../evidence-deduplicator';

function hit(overrides: Partial<RawSymbolHit> = {}): RawSymbolHit {
  return {
    localId: 'a', type: 'switch', bounds: { x: 50, y: 50, w: 25, h: 25 },
    confidence: 0.9, pageIndex: 0, regionId: 'full', ...overrides,
  };
}

describe('AX confirmation provenance regressions', () => {
  it('keeps conflicting confidence-only containment ambiguous (CI regression)', () => {
    const result = deduplicateSymbols([
      hit(),
      hit({ localId: 'b', type: 'fuse', bounds: { x: 55, y: 55, w: 10, h: 10 }, regionId: 'crop' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ certainty: 'ambiguous', confirmedType: undefined });
    expect(result[0].typeCandidates).toEqual(['switch', 'fuse']);
  });

  it('preserves an explicitly confirmed body against a conflicting fragment', () => {
    const result = deduplicateSymbols([
      hit({ certainty: 'confirmed' }),
      hit({ localId: 'b', type: 'fuse', confidence: 0.999, bounds: { x: 55, y: 55, w: 10, h: 10 } }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ certainty: 'confirmed', confirmedType: 'switch' });
    expect(result[0].typeCandidates).toEqual(['switch', 'fuse']);
  });

  it.each([undefined, 'confirmed'] as const)('recovers an explicit body after a high-confidence %s fragment', (certainty) => {
    const result = deduplicateSymbols([
      hit({ bounds: { x: 10, y: 0, w: 10, h: 5 }, confidence: 0.999, certainty }),
      hit({ localId: 'b', type: 'fuse', bounds: { x: 5, y: 1, w: 30, h: 40 }, certainty: 'confirmed' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ certainty: 'confirmed', confirmedType: 'fuse' });
    expect(result[0].evidence).toHaveLength(2);
  });

  it('does not let a confidence-only larger body decide a type conflict', () => {
    const result = deduplicateSymbols([
      hit({ bounds: { x: 10, y: 0, w: 10, h: 5 }, confidence: 0.99 }),
      hit({ localId: 'b', type: 'fuse', bounds: { x: 5, y: 1, w: 30, h: 40 }, confidence: 0.999 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ certainty: 'ambiguous', confirmedType: undefined });
  });

  it('cannot borrow a large unconfirmed crop area for a small explicit observation', () => {
    const result = deduplicateSymbols([
      hit({ bounds: { x: 20, y: 0, w: 10, h: 10 }, certainty: 'confirmed' }),
      hit({ localId: 'b', bounds: { x: 0, y: 1, w: 80, h: 80 }, confidence: 0.99 }),
      hit({ localId: 'c', type: 'fuse', bounds: { x: 20, y: 3, w: 10, h: 10 } }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ certainty: 'ambiguous', confirmedType: undefined });
  });

  it('remembers explicit confirmation even when its score is lower than a prior score-only read', () => {
    const result = deduplicateSymbols([
      hit({ confidence: 0.99 }),
      hit({ localId: 'b', certainty: 'confirmed', confidence: 0.88 }),
      hit({ localId: 'c', type: 'fuse', bounds: { x: 55, y: 55, w: 10, h: 10 } }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ certainty: 'confirmed', confirmedType: 'switch' });
  });

  it('clears body authority after a genuine equal-sized conflict', () => {
    const result = deduplicateSymbols([
      hit({ bounds: { x: 0, y: 0, w: 40, h: 40 }, certainty: 'confirmed' }),
      hit({ localId: 'b', type: 'fuse', bounds: { x: 1, y: 1, w: 40, h: 40 }, certainty: 'confirmed' }),
      hit({ localId: 'c', bounds: { x: 10, y: 2, w: 5, h: 5 }, certainty: 'confirmed' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ certainty: 'ambiguous', confirmedType: undefined });
  });

  it.each(['transformer', 'voltage_transformer', 'current_transformer', 'motor', 'custom_device'])('does not turn %s into a breaker from QF1 alone', (type) => {
    const result = deduplicateSymbols([hit({ type, label: 'QF1', certainty: 'confirmed' })]);
    expect(result).toHaveLength(1);
    expect(result[0].confirmedType).not.toBe('breaker');
    expect(result[0].typeCandidates).not.toContain('breaker');
    expect(result[0].rawLabel).toBe('QF1');
  });

  it('preserves the transformer observations that failed in the full CI suite', () => {
    const result = deduplicateSymbols([
      hit({ type: 'transformer', label: 'QF1', bounds: { x: 100, y: 100, w: 30, h: 70 } }),
      hit({ localId: 'b', type: 'voltage_transformer', bounds: { x: 101, y: 102, w: 30, h: 70 }, regionId: 'crop' }),
    ]);
    expect(result.every((symbol) => symbol.confirmedType !== 'breaker')).toBe(true);
    expect(result.flatMap((symbol) => symbol.typeCandidates)).toEqual(expect.arrayContaining(['transformer', 'voltage_transformer']));
  });

  it('does not erase a non-switchgear alternative in a single reviewed hit', () => {
    const result = deduplicateSymbols([hit({
      type: 'fuse', label: 'QF1', typeCandidates: ['fuse', 'transformer'], certainty: 'confirmed',
    })]);
    expect(result[0]).toMatchObject({ certainty: 'ambiguous', confirmedType: undefined });
    expect(result[0].typeCandidates).toEqual(['breaker', 'transformer']);
  });

  it('does not resolve a cross-family merge from a shared designator', () => {
    const result = deduplicateSymbols([
      hit({ type: 'fuse', label: 'QF1' }),
      hit({ localId: 'b', type: 'transformer', label: 'QF1' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ certainty: 'ambiguous', confirmedType: undefined });
    expect(result[0].typeCandidates).toEqual(['breaker', 'transformer']);
  });

  it('still resolves supported switchgear misreads using their designator', () => {
    const result = deduplicateSymbols([hit({ type: 'fuse', label: 'QF1', certainty: 'confirmed' })]);
    expect(result[0]).toMatchObject({ certainty: 'confirmed', confirmedType: 'breaker' });
  });
});
