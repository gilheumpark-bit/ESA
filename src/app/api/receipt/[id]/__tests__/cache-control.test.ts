import type { NextRequest } from 'next/server';

jest.mock('@/lib/supabase', () => ({ loadCalculation: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/auth-helpers', () => ({ extractVerifiedUserId: jest.fn(async () => 'alice') }));
jest.mock('@/lib/receipt-integrity', () => ({ computeReceiptIntegrity: jest.fn(async () => 'UNVERIFIABLE') }));

import { loadCalculation } from '@/lib/supabase';
import { GET as getReceipt } from '@/app/api/receipt/[id]/route';
import { GET as getCalculation } from '@/app/api/calculate/[id]/route';

// The browser HTTP cache key ignores Authorization. A private receipt that
// could be stored would be replayed to the next account on the same machine.
const row = (isPublic: boolean) => ({
  id: 'receipt-0001', user_id: 'alice', is_public: isPublic, calculator_id: 'voltage-drop',
  inputs: {}, outputs: { value: 1, unit: 'V' }, metadata: {}, created_at: '2026-09-28T00:00:00Z',
});
const context = { params: Promise.resolve({ id: 'receipt-0001' }) };
const request = {} as unknown as NextRequest;

describe.each([
  ['/api/receipt/[id]', getReceipt],
  ['/api/calculate/[id]', getCalculation],
])('%s cache policy', (_route, handler) => {
  test('a private receipt is never stored by the browser', async () => {
    jest.mocked(loadCalculation).mockResolvedValue(row(false) as never);
    const response = await handler(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  test('a public receipt stays cacheable', async () => {
    jest.mocked(loadCalculation).mockResolvedValue(row(true) as never);
    const response = await handler(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('public');
  });
});
