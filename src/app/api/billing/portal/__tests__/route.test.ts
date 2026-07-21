import { NextRequest } from 'next/server';
import { POST } from '../route';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { getStripeCustomerId } from '@/lib/supabase';
import { createPortalSession } from '@/lib/stripe';

jest.mock('@/lib/auth-helpers', () => ({ extractVerifiedUserId: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ getStripeCustomerId: jest.fn() }));
jest.mock('@/lib/stripe', () => ({ createPortalSession: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));

const authMock = extractVerifiedUserId as jest.MockedFunction<typeof extractVerifiedUserId>;
const customerMock = getStripeCustomerId as jest.MockedFunction<typeof getStripeCustomerId>;
const portalMock = createPortalSession as jest.MockedFunction<typeof createPortalSession>;

const billingEnv = [
  'STRIPE_BILLING_ENABLED',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_PRO_MONTHLY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

function request(origin = 'https://esva.engineer') {
  return new NextRequest('https://esva.engineer/api/billing/portal', {
    method: 'POST',
    headers: { origin },
  });
}

describe('POST /api/billing/portal', () => {
  const original = Object.fromEntries(billingEnv.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_BILLING_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_test_example';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-example';
    authMock.mockResolvedValue('user-1');
    customerMock.mockResolvedValue('cus_1');
    portalMock.mockResolvedValue({ url: 'https://billing.stripe.test/session_1' });
  });

  afterAll(() => {
    for (const key of billingEnv) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('requires a verified user and an owned Stripe customer record', async () => {
    authMock.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(portalMock).not.toHaveBeenCalled();

    authMock.mockResolvedValue('user-1');
    customerMock.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(409);
    expect(portalMock).not.toHaveBeenCalled();
  });

  it('rejects cross-origin portal creation', async () => {
    expect((await POST(request('https://evil.example'))).status).toBe(403);
    expect(portalMock).not.toHaveBeenCalled();
  });

  it('creates a portal session for the server-owned customer ID', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(portalMock).toHaveBeenCalledWith('cus_1', 'https://esva.engineer/settings');
  });
});
