import { cacheReport, getCachedReport, removeCachedReport } from '@/lib/report-session-cache';
import type { ESVAVerifiedReport } from '@/agent/teams/types';

const report = (reportId: string) => ({ reportId, verdict: 'HOLD' }) as unknown as ESVAVerifiedReport;
const tokenFor = (sub: string) =>
  `header.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.signature`;

describe('report session cache ownership', () => {
  const values = new Map<string, string>();
  // Characters the fake tab storage can hold (a real tab holds about 5 MB).
  let capacity = Infinity;
  const used = () => [...values.entries()].reduce((sum, [key, value]) => sum + key.length + value.length, 0);
  beforeEach(() => {
    values.clear();
    capacity = Infinity;
    Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
      get length() { return values.size; },
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        const previous = values.get(key);
        const next = used() - (previous === undefined ? 0 : key.length + previous.length) + key.length + value.length;
        if (next > capacity) throw new Error('QuotaExceededError');
        values.set(key, value);
      },
      removeItem: (key: string) => values.delete(key),
    } });
  });
  afterAll(() => {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'sessionStorage');
  });

  test('keeps account copies apart and ignores ownerless legacy entries', () => {
    values.set('esva-report-item', JSON.stringify({ reportId: 'item' }));
    expect(getCachedReport('item', null)).toBeNull();
    expect(cacheReport(report('item'), 'alice')).toBe(true);
    expect(getCachedReport('item', 'alice')?.reportId).toBe('item');
    expect(getCachedReport('item', 'bob')).toBeNull();
    expect(getCachedReport('item', null)).toBeNull();
    removeCachedReport('item', 'alice');
    expect(getCachedReport('item', 'alice')).toBeNull();
  });

  test('anonymous work stays openable after signing in, as with receipts', () => {
    expect(cacheReport(report('public'), null, null)).toBe(true);
    expect(getCachedReport('public', null)?.reportId).toBe('public');
    expect(getCachedReport('public', 'alice')?.reportId).toBe('public');
    removeCachedReport('public', 'alice');
    expect(getCachedReport('public', null)).toBeNull();
  });

  test('never files a report produced under another account token', () => {
    expect(cacheReport(report('crossed'), 'alice', tokenFor('bob'))).toBe(false);
    expect(getCachedReport('crossed', 'alice')).toBeNull();
    expect(cacheReport(report('crossed'), null, tokenFor('bob'))).toBe(false);
    expect(getCachedReport('crossed', null)).toBeNull();
    expect(cacheReport(report('owned'), 'bob', tokenFor('bob'))).toBe(true);
    expect(getCachedReport('owned', 'bob')?.reportId).toBe('owned');
    expect(cacheReport(report('bad'), 'alice', 'malformed')).toBe(false);
    expect(getCachedReport('bad', 'alice')).toBeNull();
  });

  test('a full tab drops older report copies to keep the new one', () => {
    expect(cacheReport(report('older'), 'alice', tokenFor('alice'))).toBe(true);
    values.set('esva-report-legacy', JSON.stringify({ reportId: 'legacy' }));
    capacity = used() + 20;
    expect(cacheReport(report('newest'), 'alice', tokenFor('alice'))).toBe(true);
    expect(getCachedReport('newest', 'alice')?.reportId).toBe('newest');
    expect(getCachedReport('older', 'alice')).toBeNull();
    expect(values.has('esva-report-legacy')).toBe(false);
  });

  test('reports a storage failure instead of losing the report silently', () => {
    capacity = 10;
    expect(cacheReport(report('large'), 'alice', tokenFor('alice'))).toBe(false);
    expect(getCachedReport('large', 'alice')).toBeNull();
  });
});
