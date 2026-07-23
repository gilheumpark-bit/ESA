import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { claimProjectInvitations, validateShareLink } from '../collaboration';
import { getSupabaseAdmin } from '../supabase';

jest.mock('../supabase', () => ({
  getSupabaseAdmin: jest.fn(),
}));

describe('collaboration invitation matching', () => {
  test('treats wildcard characters in a verified email as literal characters', async () => {
    const eq = jest.fn();
    const ilike = jest.fn();
    const query: Record<string, jest.Mock> = {
      select: jest.fn(() => query),
      is: jest.fn(() => query),
      eq: jest.fn((...args: unknown[]) => {
        eq(...args);
        return query;
      }),
      ilike: jest.fn((...args: unknown[]) => {
        ilike(...args);
        return query;
      }),
      then: jest.fn((resolve: (value: unknown) => void) => (
        Promise.resolve({ data: [], error: null }).then(resolve)
      )),
    };
    jest.mocked(getSupabaseAdmin).mockReturnValue({
      from: jest.fn(() => query),
    } as never);

    await claimProjectInvitations('user-a', 'Owner%40Example.com');

    expect(eq).toHaveBeenCalledWith('email', 'owner%40example.com');
    expect(ilike).not.toHaveBeenCalled();
  });

  test('fails closed before password hashing when the shared per-link budget is exhausted', async () => {
    const single = jest.fn(async () => ({
      data: {
        token: 'a'.repeat(64),
        project_id: 'project-a',
        password_hash: 'scrypt$c2FsdA$aGFzaA',
        expires_at: null,
      },
      error: null,
    }));
    const query = {
      select: jest.fn(),
      eq: jest.fn(),
      single,
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const rpc = jest.fn(async () => ({
      data: [{ allowed: false, retry_after: 840 }],
      error: null,
    }));
    jest.mocked(getSupabaseAdmin).mockReturnValue({
      from: jest.fn(() => query),
      rpc,
    } as never);

    await expect(validateShareLink('a'.repeat(64), 'guess')).resolves.toEqual({
      valid: false,
      error: 'Too many password attempts',
      retryAfter: 840,
    });
    expect(rpc).toHaveBeenCalledWith('consume_share_password_attempt', {
      p_link_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  test('migration exposes the attempt consumer only to service_role', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/005_share_password_attempts.sql'),
      'utf8',
    );

    expect(migration).toMatch(/SECURITY DEFINER/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION consume_share_password_attempt\(text\) FROM PUBLIC/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION consume_share_password_attempt\(text\) TO service_role/i);
  });
});
