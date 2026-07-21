import { createClient } from '@supabase/supabase-js';
import { getUserTier } from '@/lib/supabase';

const single = jest.fn(async () => ({ data: { tier: 'team' }, error: null }));
const eq = jest.fn(() => ({ single }));
const select = jest.fn(() => ({ eq }));
const from = jest.fn(() => ({ select }));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from })),
}));

describe('Supabase tier lookup contract', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-secret';
  });

  test('uses the Firebase-backed users table through the server role', async () => {
    await expect(getUserTier('firebase-user-a')).resolves.toBe('team');
    expect(from).toHaveBeenCalledWith('users');
    expect(jest.mocked(createClient)).toHaveBeenCalledWith(
      'https://db.example.test',
      'service-secret',
      expect.any(Object),
    );
  });
});
