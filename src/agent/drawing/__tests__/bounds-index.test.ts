import { createBoundsIndex, type IndexedBounds } from '../bounds-index';

interface Item { id: number; bounds?: IndexedBounds }
const hits = (a: IndexedBounds, b: IndexedBounds) => a.x <= b.x + b.w && a.x + a.w >= b.x
  && a.y <= b.y + b.h && a.y + a.h >= b.y;

describe('stable-order geometry candidate index', () => {
  it('matches exhaustive queries across deterministic randomized rectangles', () => {
    let seed = 7321;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x1_0000_0000; };
    const items: Item[] = Array.from({ length: 800 }, (_, id) => ({ id, bounds: {
      x: random() * 4000 - 2000, y: random() * 4000 - 2000, w: random() * 300, h: random() * 300,
    } }));
    const index = createBoundsIndex(items, (item) => item.bounds);
    for (let i = 0; i < 300; i++) {
      const query = { x: random() * 5000 - 2500, y: random() * 5000 - 2500, w: random() * 500, h: random() * 500 };
      expect(index.query(query)).toEqual(items.filter((item) => hits(item.bounds!, query)));
    }
  });
  it('includes touching boundaries, zero-area terminals, negative coordinates and duplicates', () => {
    const items: Item[] = [
      { id: 0, bounds: { x: -4, y: -4, w: 2, h: 2 } },
      { id: 1, bounds: { x: 0, y: 0, w: 0, h: 0 } },
      { id: 1, bounds: { x: 0, y: 0, w: 0, h: 0 } },
      { id: 2, bounds: { x: 2, y: 2, w: 0, h: 0 } },
    ];
    const index = createBoundsIndex(items, (item) => item.bounds);
    expect(index.query({ x: -2, y: -2, w: 4, h: 4 })).toEqual(items);
  });
  it('retains unbounded or invalid entries instead of dropping ambiguous evidence', () => {
    const items: Item[] = [
      { id: 0 }, { id: 1, bounds: { x: NaN, y: 0, w: 1, h: 1 } },
      { id: 2, bounds: { x: 0, y: 0, w: -1, h: 1 } },
      { id: 3, bounds: { x: Number.MAX_VALUE, y: 0, w: Number.MAX_VALUE, h: 1 } },
      { id: 4, bounds: { x: 0, y: 0, w: 1, h: 1 } },
    ];
    expect(createBoundsIndex(items, (item) => item.bounds).query({ x: 100, y: 100, w: 1, h: 1 })).toEqual(items.slice(0, 4));
  });
  it.each([
    { x: NaN, y: 0, w: 1, h: 1 }, { x: 0, y: Infinity, w: 0, h: 1 },
    { x: 0, y: 0, w: -1, h: 1 }, { x: Number.MAX_VALUE, y: 0, w: Number.MAX_VALUE, h: 0 },
  ])('returns all original candidates for invalid queries %p', (query) => {
    const items = [{ id: 1, bounds: { x: 0, y: 0, w: 2, h: 2 } }];
    expect(createBoundsIndex(items, (item) => item.bounds).query(query)).toEqual(items);
  });
  it('retains original iteration order rather than tree traversal order', () => {
    const items = Array.from({ length: 100 }, (_, id) => ({ id, bounds: { x: 100 - id, y: id % 2, w: 1, h: 1 } }));
    const query = { x: 0, y: 0, w: 200, h: 10 };
    expect(createBoundsIndex(items, (item) => item.bounds).query(query)).toEqual(items);
  });
  it('captures bounds and the source list without mutating the caller', () => {
    const item = { id: 1, bounds: { x: 0, y: 0, w: 1, h: 1 } };
    const items = [item];
    const index = createBoundsIndex(items, (entry) => entry.bounds);
    item.bounds.x = 1000;
    items.push({ id: 2, bounds: { x: 0, y: 0, w: 1, h: 1 } });
    // Rebuild when geometry changes. An existing index consistently represents its original snapshot.
    expect(index.query({ x: 0, y: 0, w: 1, h: 1 })).toEqual([item]);
    expect(index.query({ x: 900, y: 0, w: 200, h: 1 })).toEqual([]);
    expect(items).toHaveLength(2);
  });
  it('narrows sparse candidates without changing the final exact predicate', () => {
    const items = Array.from({ length: 2000 }, (_, id) => ({ id, bounds: { x: id * 100, y: id % 7 * 100, w: 10, h: 10 } }));
    const target = { x: 100000, y: 500, w: 10, h: 10 };
    const candidates = createBoundsIndex(items, (item) => item.bounds).query(target);
    expect(candidates).toEqual(items.filter((item) => hits(item.bounds, target)));
    expect(candidates.length).toBeLessThanOrEqual(1);
  });
  it('handles an empty page', () => {
    expect(createBoundsIndex([], () => undefined).query({ x: 0, y: 0, w: 1, h: 1 })).toEqual([]);
  });
});
