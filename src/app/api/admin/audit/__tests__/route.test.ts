jest.mock('@/lib/auth-helpers', () => ({ extractVerifiedUserId: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ getSupabaseAdmin: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));
jest.mock('@/lib/api/with-request-log', () => ({ withRequestLog: (handler: unknown) => handler }));
import { NextRequest } from 'next/server';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { GET } from '../route';

const role = jest.fn(), range = jest.fn();
const query = { select: jest.fn(), order: jest.fn(), eq: jest.fn(), ilike: jest.fn(), range };
const from = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); jest.mocked(extractVerifiedUserId).mockResolvedValue('user');
  role.mockResolvedValue({ data: { role: 'admin' }, error: null }); range.mockResolvedValue({ data: [], error: null, count: 0 });
  for (const method of [query.select, query.order, query.eq, query.ilike]) method.mockReturnValue(query);
  from.mockImplementation((table: string) => table === 'users' ? { select: () => ({ eq: () => ({ single: role }) }) } : query);
  jest.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);
});
const request = (query = '') => new NextRequest(`http://localhost/api/admin/audit${query}`);
it('does not query user data before verified authentication', async () => {
  jest.mocked(extractVerifiedUserId).mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401); expect(getSupabaseAdmin).not.toHaveBeenCalled();
});
it.each(['viewer','enterprise','team',undefined])('does not grant admin access from tier or role %p', async (value) => {
  role.mockResolvedValue({ data: { role: value }, error: null });
  expect((await GET(request())).status).toBe(403); expect(range).not.toHaveBeenCalled();
});
it('returns exact pagination and marks the response private/no-store', async () => {
  range.mockResolvedValue({ data: [{ id: 'a', user_id: 'u', action: 'read', resource: 'p', created_at: '2026-09-10T00:00:00Z' }], error: null, count: 45 });
  const result = await GET(request('?page=2')); const body = await result.json();
  expect(range).toHaveBeenCalledWith(20,39); expect(body.data).toMatchObject({ page: 2, totalPages: 3, totalCount: 45, scope: 'system-admin' });
  expect(result.headers.get('cache-control')).toBe('private, no-store');
});
it.each(['?page=0','?page=10001','?page=NaN','?action=a%2Cb','?search=%00'])('rejects invalid bounded query %s', async (value) => {
  expect((await GET(request(value))).status).toBe(400); expect(range).not.toHaveBeenCalled();
});
it('escapes user search wildcards rather than widening its filter', async () => {
  await GET(request('?search=abc%25_def')); expect(query.ilike).toHaveBeenCalledWith('resource', '%abc\\%\\_def%');
});
it('database failure is not an empty successful audit log', async () => {
  range.mockResolvedValue({ data: null, error: new Error('database unavailable'), count: null });
  const result = await GET(request()); expect(result.status).toBe(503); expect((await result.json()).success).toBe(false);
});
it('does not expose database exceptions or connection information', async () => {
  jest.mocked(getSupabaseAdmin).mockImplementation(() => { throw new Error('private-connection-secret'); });
  const result = await GET(request()); expect(result.status).toBe(503); expect(await result.text()).not.toContain('private-connection-secret');
});
