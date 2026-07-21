import { NextRequest } from 'next/server';
import { POST } from '../route';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { getStripeSession } from '@/lib/stripe';

jest.mock('@/lib/auth-helpers', () => ({ extractVerifiedUserId: jest.fn() }));
jest.mock('@/lib/stripe', () => ({ getStripeSession: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({ applyRateLimit: jest.fn(() => null) }));

const authMock = extractVerifiedUserId as jest.MockedFunction<typeof extractVerifiedUserId>;
const sessionMock = getStripeSession as jest.MockedFunction<typeof getStripeSession>;

const billingEnv = [
  'STRIPE_BILLING_ENABLED',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_PRO_MONTHLY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

function request(body: unknown) {
  return new NextRequest('https://esva.engineer/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://esva.engineer' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/checkout', () => {
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
    sessionMock.mockResolvedValue({ sessionId: 'cs_1', url: 'https://checkout.stripe.test/cs_1' });
  });

  afterAll(() => {
    for (const key of billingEnv) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('requires authentication before creating a payment session', async () => {
    authMock.mockResolvedValue(null);
    expect((await POST(request({ plan: 'pro_monthly' }))).status).toBe(401);
    expect(sessionMock).not.toHaveBeenCalled();
  });

  it('rejects browser-supplied Stripe price IDs', async () => {
    const response = await POST(request({ priceId: 'price_attacker' }));
    expect(response.status).toBe(400);
    expect(sessionMock).not.toHaveBeenCalled();
  });

  it('uses a server plan handle and exact same-origin return path', async () => {
    const response = await POST(request({ plan: 'pro_monthly' }));
    expect(response.status).toBe(200);
    expect(sessionMock).toHaveBeenCalledWith('pro_monthly', 'user-1', 'https://esva.engineer/settings');
  });

  it('fails closed when signed fulfillment is not enabled', async () => {
    process.env.STRIPE_BILLING_ENABLED = 'false';
    const response = await POST(request({ plan: 'pro_monthly' }));
    expect(response.status).toBe(503);
    expect(sessionMock).not.toHaveBeenCalled();
  });
});
