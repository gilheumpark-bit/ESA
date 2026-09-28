import { cacheReport, getCachedReport, removeCachedReport } from '@/lib/report-session-cache';
import type { ESVAVerifiedReport } from '@/agent/teams/types';

const report = (reportId: string) => ({ reportId, verdict: 'HOLD' }) as unknown as ESVAVerifiedReport;
const tokenFor = (sub: string) =>
  `header.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.signature`;

describe('report session cache ownership', () => {
  const values = new Map<string, string>();
  let full = false;
  beforeEach(() => {
    values.clear();
    full = false;
    Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (full) throw new Error('QuotaExceededError');
        values.set(key, value);
      },
      removeItem: (key: string) => values.delete(key),
    } });
  });
  afterAll(() => {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'sessionStorage');
  });

  test("keeps account copies apart and ignores ownerless legacy entries", () => {
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

  test('reports a storage failure instead of losing the report silently', () => {
    full = true;
    expect(cacheReport(report('large'), 'alice', tokenFor('alice'))).toBe(false);
    expect(getCachedReport('large', 'alice')).toBeNull();
  });
});
