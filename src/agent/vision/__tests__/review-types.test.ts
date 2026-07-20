import { parseRoleReviewData } from '../review-types';

const bounds = { x: 1, y: 2, w: 3, h: 4 };
const point = { x: 10, y: 20 };

describe('role review contracts', () => {
  it('rejects an invalid connection path and preserves uncertain text candidates', () => {
    expect(() =>
      parseRoleReviewData('connections', { lines: [{ id: 'x', path: [] }] }),
    ).toThrow();

    const text = parseRoleReviewData('text', {
      texts: [
        {
          id: 't1',
          raw: 'PPT',
          candidates: ['PT', 'PPT'],
          bounds,
          confidence: 0.6,
        },
      ],
    });

    expect(text.texts?.[0].candidates).toEqual(['PT', 'PPT']);
    expect(text.texts?.[0].bounds.page).toBe(1);
  });

  it('keeps role collections isolated while allowing empty detections and defaults', () => {
    expect(parseRoleReviewData('symbols', { symbols: [] })).toEqual({
      symbols: [],
      warnings: [],
      confidence: 0,
    });
    expect(() =>
      parseRoleReviewData('symbols', { lines: [] }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('connections', { texts: [] }),
    ).toThrow();
  });

  it('rejects malformed ids, strings, normalized geometry, pages, enums, and confidence', () => {
    const validSymbol = {
      id: 'symbol-1',
      typeCandidates: ['BREAKER'],
      rawLabel: 'CB-1',
      bounds,
      ports: [point],
      confidence: 0.8,
    };

    expect(() =>
      parseRoleReviewData('symbols', {
        symbols: [{ ...validSymbol, id: '   ' }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('symbols', {
        symbols: [{ ...validSymbol, bounds: { ...bounds, w: 0 } }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('symbols', {
        symbols: [{ ...validSymbol, bounds: { ...bounds, page: 0 } }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('symbols', {
        symbols: [{ ...validSymbol, ports: [{ x: Infinity, y: 2 }] }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('symbols', {
        symbols: [{ ...validSymbol, confidence: 1.1 }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('symbols', { warnings: ['ok', 1] }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('symbols', { confidence: Number.NaN }),
    ).toThrow();
  });

  it('requires complete line topology including start, end, junctions, and crossovers', () => {
    const line = {
      id: 'line-1',
      lineKind: 'power',
      path: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
      start: { x: 10, y: 20 },
      end: { x: 30, y: 40 },
      junctions: [],
      crossovers: [],
      confidence: 0.75,
    };

    expect(parseRoleReviewData('connections', { lines: [line] }).lines).toEqual([
      line,
    ]);
    expect(() =>
      parseRoleReviewData('connections', {
        lines: [{ ...line, lineKind: 'diagonal' }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('connections', {
        lines: [{ ...line, end: { x: 31, y: 40 } }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('connections', {
        lines: [{ ...line, junctions: [{ x: -1, y: 0 }] }],
      }),
    ).toThrow();
  });

  it('validates logic topics, attributes, evidence bounds, and evidence links', () => {
    const logic = {
      id: 'logic-1',
      topic: 'PROTECTION_CHAIN',
      subjectIds: ['breaker-1', 'relay-1'],
      attributes: {
        fromId: 'breaker-1',
        toId: 'relay-1',
        protectedById: null,
        voltageV: 220,
        deviceType: 'breaker',
      },
      statement: 'Breaker protects the feeder.',
      evidenceBounds: [bounds],
      confidence: 0.9,
    };

    expect(parseRoleReviewData('logic', { logic: [logic] }).logic).toEqual([
      expect.objectContaining({
        ...logic,
        evidenceBounds: [{ ...bounds, page: 1 }],
      }),
    ]);
    expect(() =>
      parseRoleReviewData('logic', {
        logic: [{ ...logic, topic: 'UNSUPPORTED' }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('logic', {
        logic: [{ ...logic, attributes: { voltageV: Infinity } }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('logic', {
        logic: [{ ...logic, evidenceBounds: [] }],
      }),
    ).toThrow();
  });
});
