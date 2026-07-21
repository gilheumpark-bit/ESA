import { NextRequest } from 'next/server';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { GET } from '../route';

jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/auth-helpers', () => ({ extractVerifiedUserId: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ getSupabaseAdmin: jest.fn() }));

const mockUserId = jest.mocked(extractVerifiedUserId);
const mockAdmin = jest.mocked(getSupabaseAdmin);
const request = new NextRequest('http://localhost:3000/api/dashboard', {
  headers: { Authorization: 'Bearer valid' },
});

function chain(result: Record<string, unknown>) {
  const promise = Promise.resolve(result);
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'eq', 'gte', 'order', 'limit']) {
    builder[method] = jest.fn(() => builder);
  }
  Object.assign(builder, { then: promise.then.bind(promise), catch: promise.catch.bind(promise) });
  return builder;
}

describe('GET /api/dashboard data honesty', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId.mockResolvedValue('user-a');
  });

  test('labels the last-30-day count from the same monthly dataset', async () => {
    const recent = chain({ data: [], error: null });
    const month = chain({
      data: [
        { calculator_id: 'vd', calculator_name: '전압강하' },
        { calculator_id: 'vd', calculator_name: '전압강하' },
      ],
      error: null,
    });
    const notifications = chain({ data: [], error: null });
    const from = jest.fn()
      .mockReturnValueOnce(recent)
      .mockReturnValueOnce(month)
      .mockReturnValueOnce(notifications);
    mockAdmin.mockReturnValue({ from } as never);

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.totalCalcs).toBe(2);
    expect(from).toHaveBeenCalledTimes(3);
  });

  test('returns an unavailable response instead of a false zero dashboard', async () => {
    const failed = chain({ data: null, error: { message: 'database unavailable' } });
    const ok = chain({ data: [], error: null });
    const from = jest.fn()
      .mockReturnValueOnce(failed)
      .mockReturnValueOnce(ok)
      .mockReturnValueOnce(ok);
    mockAdmin.mockReturnValue({ from } as never);

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.success).toBe(false);
  });
});
