import { NextRequest } from 'next/server';
import { POST } from '../route';
import { createStripeClient } from '@/lib/stripe';
import {
  buildSubscriptionEntitlement,
  persistSubscriptionEntitlement,
} from '@/lib/billing-webhook';

jest.mock('@/lib/stripe', () => ({ createStripeClient: jest.fn() }));
jest.mock('@/lib/billing-webhook', () => ({
  buildSubscriptionEntitlement: jest.fn(() => ({ eventId: 'evt_1' })),
  persistSubscriptionEntitlement: jest.fn(async () => 'applied'),
}));

const stripeMock = createStripeClient as jest.MockedFunction<typeof createStripeClient>;
const buildMock = buildSubscriptionEntitlement as jest.MockedFunction<typeof buildSubscriptionEntitlement>;
const persistMock = persistSubscriptionEntitlement as jest.MockedFunction<typeof persistSubscriptionEntitlement>;

const billingEnv = [
  'STRIPE_BILLING_ENABLED',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_PRO_MONTHLY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

function request(signature = 'test-signature') {
  return new NextRequest('https://esva.engineer/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
    body: '{"event":"raw"}',
  });
}

describe('POST /api/stripe/webhook', () => {
  const original = Object.fromEntries(billingEnv.map((key) => [key, process.env[key]]));
  const constructEvent = jest.fn();
  const retrieve = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_BILLING_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_test_example';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-example';
    stripeMock.mockResolvedValue({
      webhooks: { constructEvent },
      subscriptions: { retrieve },
    } as never);
  });

  afterAll(() => {
    for (const key of billingEnv) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('rejects a request without a valid Stripe signature', async () => {
    constructEvent.mockImplementation(() => { throw new Error('signature verification failed'); });
    expect((await POST(request())).status).toBe(400);
    expect(persistMock).not.toHaveBeenCalled();
  });

  it('retrieves current subscription state before applying checkout fulfillment', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'checkout.session.completed',
      created: 1_700_000_000,
      data: { object: { mode: 'subscription', subscription: 'sub_1', client_reference_id: 'user-1' } },
    });
    retrieve.mockResolvedValue({ id: 'sub_1' });

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(retrieve).toHaveBeenCalledWith('sub_1');
    expect(buildMock).toHaveBeenCalledWith(
      'evt_1', 1_700_000_000, { id: 'sub_1' }, 'user-1', 'checkout.session.completed',
    );
    expect(persistMock).toHaveBeenCalled();
  });

  it('acknowledges unrelated Stripe events without mutation', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_other',
      type: 'payment_method.attached',
      created: 1_700_000_000,
      data: { object: {} },
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(persistMock).not.toHaveBeenCalled();
  });
});
