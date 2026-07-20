import { createClient } from '@supabase/supabase-js';
import { saveCalculation } from '@/lib/supabase';

const single = jest.fn();
const select = jest.fn(() => ({ single }));
const insert = jest.fn(() => ({ select }));
const upsert = jest.fn(async () => ({ error: null }));
const from = jest.fn(() => ({ insert, upsert }));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from })),
}));

const mockCreateClient = jest.mocked(createClient);

describe('Supabase calculation receipt writer contract', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalService = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-secret';
  });

  afterAll(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
    if (originalService === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalService;
  });

  test('uses the server service role and preserves the generated receipt identity', async () => {
    single.mockResolvedValue({
      data: { id: 'receipt-1', user_id: 'firebase-user-a' },
      error: null,
    });

    await saveCalculation('firebase-user-a', {
      id: 'receipt-1',
      calculator_id: 'voltage-drop',
      calculator_name: '전압강하',
      inputs: { current: 10 },
      outputs: { value: 2.1, unit: '%' },
      formula_used: 'formula',
      standard_ref: 'KEC 2021',
      lang: 'ko',
      metadata: { receiptHash: 'a'.repeat(64) },
      receipt_hash: 'a'.repeat(64),
    } as never);

    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://db.example.test',
      'service-secret',
      expect.any(Object),
    );
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'receipt-1',
      user_id: 'firebase-user-a',
      calculator_id: 'voltage-drop',
      outputs: { value: 2.1, unit: '%' },
      receipt_hash: 'a'.repeat(64),
      is_standard_current: false,
    }));
  });
});
