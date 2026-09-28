import { cacheReceipt, getCachedReceipt, removeCachedReceipt } from '@/lib/receipt-cache';
import type { Receipt } from '@/engine/receipt/types';

// The tab cache is an offline fallback, never an authority: another account's
// receipt must not be shown, while anonymous work stays usable in the same tab
// (the same owner rule as history-read-model).
describe('receipt cache ownership', () => {
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

  test('anonymous work is readable signed out and after signing in', () => {
    cacheReceipt({ id: 'anonymous' } as Receipt, null);
    expect(getCachedReceipt('anonymous', null)?.id).toBe('anonymous');
    expect(getCachedReceipt('anonymous', 'alice')?.id).toBe('anonymous');
  });

  test('an account receipt is readable only by that account', () => {
    cacheReceipt({ id: 'owned', userId: 'alice' } as Receipt, 'alice');
    expect(getCachedReceipt('owned', 'alice')?.id).toBe('owned');
    expect(getCachedReceipt('owned', 'bob')).toBeNull();
    expect(getCachedReceipt('owned', null)).toBeNull();
  });

  test('a receipt is not cached for a scope that does not own it', () => {
    cacheReceipt({ id: 'crossed', userId: 'alice' } as Receipt, 'bob');
    cacheReceipt({ id: 'anonymous-for-alice' } as Receipt, 'alice');
    expect(values.size).toBe(0);
  });

  test('an entry whose stored id differs from the requested id is ignored', () => {
    values.set('esa-receipt-swapped', JSON.stringify({ id: 'other' }));
    expect(getCachedReceipt('swapped', null)).toBeNull();
  });

  test('removal drops the entry and its index membership', () => {
    cacheReceipt({ id: 'denied' } as Receipt, null);
    removeCachedReceipt('denied');
    expect(getCachedReceipt('denied', null)).toBeNull();
    expect(JSON.parse(values.get('esa-receipt-index') ?? '[]')).not.toContain('denied');
  });
});
