import { loadRecentCalcs, recordRecentCalc, RECENT_CALCS_KEY, type RecentCalcEntry } from '@/lib/recent-calcs';

// localStorage outlives sign-out, so the recent list is filtered by owner.
const entry = (id: string, ownerId: string | null): RecentCalcEntry => ({
  id, calcName: '전압강하', category: 'voltage-drop', date: '2026-09-28T00:00:00Z',
  keyResult: '4.14 V', value: 4.14, unit: 'V', ownerId,
});

describe('recent calculation ownership', () => {
  const values = new Map<string, string>();
  beforeEach(() => {
    values.clear();
    Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } });
  });
  afterAll(() => {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  test("shows anonymous work and the viewer's own entries, never another account's", () => {
    recordRecentCalc(entry('anonymous', null));
    recordRecentCalc(entry('alice-1', 'alice'));
    recordRecentCalc(entry('bob-1', 'bob'));
    expect(loadRecentCalcs(null).map((item) => item.id)).toEqual(['anonymous']);
    expect(loadRecentCalcs('alice').map((item) => item.id)).toEqual(['alice-1', 'anonymous']);
    expect(loadRecentCalcs('bob').map((item) => item.id)).toEqual(['bob-1', 'anonymous']);
  });

  test('a corrupt stored value is replaced by the next calculation', () => {
    values.set(RECENT_CALCS_KEY, '{truncated');
    expect(loadRecentCalcs(null)).toEqual([]);
    recordRecentCalc(entry('fresh', null));
    expect(loadRecentCalcs(null).map((item) => item.id)).toEqual(['fresh']);
  });

  test('entries written before ownership was recorded are shown to no one and pruned', () => {
    const legacy = { id: 'legacy', calcName: '전압강하', category: 'voltage-drop', date: '2026-09-01T00:00:00Z',
      keyResult: '4.14 V', value: 4.14, unit: 'V' };
    values.set(RECENT_CALCS_KEY, JSON.stringify([legacy, entry('anonymous', null)]));
    expect(loadRecentCalcs('alice').map((item) => item.id)).toEqual(['anonymous']);
    expect(JSON.parse(values.get(RECENT_CALCS_KEY) ?? '[]').map((item: { id: string }) => item.id)).toEqual(['anonymous']);
  });
});
