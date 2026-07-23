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

  it('accepts bounded continuation anchors and rejects invented anchor formats', () => {
    const line = {
      id: 'line-1',
      lineKind: 'power',
      path: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
      start: { x: 10, y: 20 },
      end: { x: 30, y: 40 },
      startAnchorId: 'P01-C001',
      endAnchorId: null,
      openEndReason: 'unresolved',
      junctions: [],
      crossovers: [],
      confidence: 0.75,
    };

    expect(parseRoleReviewData('connections', { lines: [line] }).lines?.[0])
      .toMatchObject(line);
    expect(() => parseRoleReviewData('connections', {
      lines: [{ ...line, startAnchorId: 'C999' }],
    })).toThrow();
    expect(() => parseRoleReviewData('connections', {
      lines: [{ ...line, openEndReason: 'invented' }],
    })).toThrow();
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

  it('rejects provider sourceIds and duplicate local ids across a role payload', () => {
    const symbol = {
      id: 'shared-id',
      typeCandidates: ['BREAKER'],
      rawLabel: 'CB-1',
      bounds,
      ports: [],
      confidence: 0.8,
    };
    const line = {
      id: 'line-1',
      lineKind: 'power',
      path: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
      junctions: [],
      crossovers: [],
      confidence: 0.8,
    };
    const text = {
      id: 'text-1',
      raw: 'CB-1',
      candidates: ['CB-1'],
      bounds,
      confidence: 0.8,
    };
    const logic = {
      id: 'logic-1',
      topic: 'DEVICE_IDENTITY',
      subjectIds: ['shared-id'],
      statement: 'CB-1 is a breaker.',
      evidenceBounds: [bounds],
      confidence: 0.8,
    };

    expect(() =>
      parseRoleReviewData('symbols', {
        symbols: [{ ...symbol, sourceId: 'provider-owned' }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('connections', {
        lines: [{ ...line, sourceId: 'provider-owned' }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('text', {
        texts: [{ ...text, sourceId: 'provider-owned' }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('logic', {
        logic: [{ ...logic, sourceId: 'provider-owned' }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('symbols', { symbols: [symbol, { ...symbol }] }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('synthesis', {
        symbols: [symbol],
        texts: [{ ...text, id: 'shared-id' }],
      }),
    ).toThrow();
  });

  it('represents an observed unlabeled symbol without inventing OCR or type data', () => {
    const parsed = parseRoleReviewData('symbols', {
      symbols: [
        {
          id: 'symbol-without-label',
          rawLabel: null,
          typeCandidates: [],
          bounds,
          ports: [],
          confidence: 0.4,
        },
      ],
    });

    expect(parsed.symbols?.[0]).toEqual(
      expect.objectContaining({ rawLabel: null, typeCandidates: [] }),
    );
  });

  it('rejects unknown keys at every nested evidence boundary', () => {
    const symbol = {
      id: 'symbol-1',
      typeCandidates: ['BREAKER'],
      rawLabel: 'CB-1',
      bounds,
      ports: [point],
      confidence: 0.8,
    };
    const line = {
      id: 'line-1',
      lineKind: 'power',
      path: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
      junctions: [],
      crossovers: [],
      confidence: 0.8,
    };
    const text = {
      id: 'text-1',
      raw: 'CB-1',
      candidates: ['CB-1'],
      bounds,
      confidence: 0.8,
    };
    const logic = {
      id: 'logic-1',
      topic: 'DEVICE_IDENTITY',
      subjectIds: ['symbol-1'],
      statement: 'CB-1 is a breaker.',
      evidenceBounds: [bounds],
      confidence: 0.8,
    };

    expect(() =>
      parseRoleReviewData('symbols', {
        symbols: [{ ...symbol, injected: true }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('symbols', {
        symbols: [{ ...symbol, bounds: { ...bounds, injected: true } }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('symbols', {
        symbols: [{ ...symbol, ports: [{ ...point, injected: true }] }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('connections', {
        lines: [{ ...line, injected: true }],
      }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('text', { texts: [{ ...text, injected: true }] }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('logic', { logic: [{ ...logic, injected: true }] }),
    ).toThrow();
  });

  it('rejects cyclic and cumulative-budget payloads before copying nested evidence', () => {
    const createPoints = () =>
      Array.from({ length: 10_000 }, (_, index) => ({ x: index % 1000, y: 1 }));
    const path = createPoints();
    const junctions = createPoints();
    const crossovers = createPoints();
    const oversizedLine = {
      id: 'line-1',
      lineKind: 'power',
      path,
      start: { ...path[0] },
      end: { ...path[path.length - 1] },
      junctions,
      crossovers,
      confidence: 0.8,
    };
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let index = 0; index < 40; index += 1) {
      cursor.child = {};
      cursor = cursor.child as Record<string, unknown>;
    }

    expect(() =>
      parseRoleReviewData('connections', { lines: [oversizedLine] }),
    ).toThrow();
    expect(() =>
      parseRoleReviewData('overview', {
        warnings: Array.from({ length: 60 }, () => 'x'.repeat(4000)),
      }),
    ).toThrow();
    expect(() => parseRoleReviewData('overview', cyclic)).toThrow();
    expect(() => parseRoleReviewData('overview', deep)).toThrow();
  });

  it('rejects hidden own keys and hidden connection arrays before parsing them', () => {
    const symbol = {
      id: 'symbol-1',
      rawLabel: 'CB-1',
      typeCandidates: ['BREAKER'],
      bounds,
      ports: [],
      confidence: 0.8,
    };
    Object.defineProperty(symbol, 'injected', {
      value: true,
      enumerable: false,
    });
    Object.defineProperty(symbol, Symbol('injected'), {
      value: true,
      enumerable: false,
    });

    const createPoints = () =>
      Array.from({ length: 10_000 }, (_, index) => ({ x: index % 1000, y: 1 }));
    const path = createPoints();
    const line = {
      id: 'line-1',
      lineKind: 'power',
      start: { ...path[0] },
      end: { ...path[path.length - 1] },
      confidence: 0.8,
    };
    Object.defineProperties(line, {
      path: { value: path, enumerable: false },
      junctions: { value: createPoints(), enumerable: false },
      crossovers: { value: createPoints(), enumerable: false },
    });

    expect(() => parseRoleReviewData('symbols', { symbols: [symbol] })).toThrow();
    expect(() =>
      parseRoleReviewData('connections', { lines: [line] }),
    ).toThrow();
  });

  it('rejects accessors and inherited required fields without invoking a getter', () => {
    let getterCalled = false;
    const accessorLine = {
      id: 'line-accessor',
      lineKind: 'power',
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
      junctions: [],
      crossovers: [],
      confidence: 0.8,
    };
    Object.defineProperty(accessorLine, 'path', {
      enumerable: true,
      get() {
        getterCalled = true;
        return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
      },
    });
    const inheritedLine = Object.create({
      path: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    }) as Record<string, unknown>;
    Object.assign(inheritedLine, {
      id: 'line-inherited',
      lineKind: 'power',
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
      junctions: [],
      crossovers: [],
      confidence: 0.8,
    });

    expect(() =>
      parseRoleReviewData('connections', { lines: [accessorLine] }),
    ).toThrow();
    expect(getterCalled).toBe(false);
    expect(() =>
      parseRoleReviewData('connections', { lines: [inheritedLine] }),
    ).toThrow();
  });

  it('rejects array subclasses before overridden iteration can inject evidence', () => {
    const symbol = {
      id: 'symbol-1',
      rawLabel: 'CB-1',
      typeCandidates: ['BREAKER'],
      bounds,
      ports: [],
      confidence: 0.8,
    };
    class SpoofArray extends Array<typeof symbol> {
      map<U>(
        _callbackfn: (value: typeof symbol, index: number, array: typeof symbol[]) => U,
        _thisArg?: unknown,
      ): U[] {
        return [{ ...symbol, id: 'injected', sourceId: 'provider-owned', injected: true } as unknown as U];
      }
    }
    const spoofed = new SpoofArray();
    spoofed.push(symbol);

    expect(() =>
      parseRoleReviewData('symbols', { symbols: spoofed }),
    ).toThrow();
  });

  it('rejects proxies before their traps can run', () => {
    const symbol = {
      id: 'symbol-1',
      rawLabel: 'CB-1',
      typeCandidates: ['BREAKER'],
      bounds,
      ports: [],
      confidence: 0.8,
    };
    let trapCalled = false;
    const proxied = new Proxy([symbol], {
      get() {
        trapCalled = true;
        throw new Error('proxy trap must not run');
      },
      ownKeys() {
        trapCalled = true;
        throw new Error('proxy trap must not run');
      },
    });

    expect(() =>
      parseRoleReviewData('symbols', { symbols: proxied }),
    ).toThrow();
    expect(trapCalled).toBe(false);
  });
});
