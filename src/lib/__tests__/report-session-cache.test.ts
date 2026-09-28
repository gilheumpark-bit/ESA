import { cacheReport, getCachedReport, removeCachedReport } from '@/lib/report-session-cache';
import type { ESVAVerifiedReport } from '@/agent/teams/types';

const report = (reportId: string) => ({ reportId, verdict: 'HOLD' }) as unknown as ESVAVerifiedReport;
const tokenFor = (sub: string) =>
  `header.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.signature`;

describe('report session cache ownership', () => {
  const values = new Map<string, string>();
  beforeEach(() => {
    values.clear();
    Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } });
  });
  afterAll(() => {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'sessionStorage');
  });

  test('separates anonymous and account copies and ignores ownerless legacy entries', () => {
    values.set('esva-report-item', JSON.stringify({ reportId: 'item' }));
    expect(getCachedReport('item', null)).toBeNull();
    cacheReport(report('item'), 'alice');
    expect(getCachedReport('item', 'alice')?.reportId).toBe('item');
    expect(getCachedReport('item', 'bob')).toBeNull();
    expect(getCachedReport('item', null)).toBeNull();
    cacheReport(report('public'), null);
    expect(getCachedReport('public', null)?.reportId).toBe('public');
    removeCachedReport('item', 'alice');
    expect(getCachedReport('item', 'alice')).toBeNull();
  });

  test('never files a report produced under another account token', () => {
    cacheReport(report('crossed'), 'alice', tokenFor('bob'));
    expect(getCachedReport('crossed', 'alice')).toBeNull();
    cacheReport(report('crossed'), null, tokenFor('bob'));
    expect(getCachedReport('crossed', null)).toBeNull();
    cacheReport(report('owned'), 'bob', tokenFor('bob'));
    expect(getCachedReport('owned', 'bob')?.reportId).toBe('owned');
    cacheReport(report('anonymous'), null, null);
    expect(getCachedReport('anonymous', null)?.reportId).toBe('anonymous');
    cacheReport(report('bad'), 'alice', 'malformed');
    expect(getCachedReport('bad', 'alice')).toBeNull();
  });
});
