import {
  buildSubscriptionEntitlement,
  persistSubscriptionEntitlement,
} from '@/lib/billing-webhook';

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_123',
    customer: 'cus_123',
    status: 'active',
    metadata: { esa_user_id: 'firebase-user-1' },
    items: {
      data: [{ price: { id: 'price_pro' }, current_period_end: 1_800_000_000 }],
    },
    ...overrides,
  };
}

describe('Stripe subscription entitlement normalization', () => {
  const oldPrice = process.env.STRIPE_PRICE_PRO_MONTHLY;

  beforeEach(() => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro';
  });

  afterAll(() => {
    if (oldPrice === undefined) delete process.env.STRIPE_PRICE_PRO_MONTHLY;
    else process.env.STRIPE_PRICE_PRO_MONTHLY = oldPrice;
  });

  it('grants a configured tier only for an active known-price subscription', () => {
    expect(buildSubscriptionEntitlement('evt_1', 1_700_000_000, subscription())).toMatchObject({
      eventId: 'evt_1',
      userId: 'firebase-user-1',
      customerId: 'cus_123',
      subscriptionId: 'sub_123',
      subscriptionStatus: 'active',
      priceId: 'price_pro',
      tier: 'pro',
    });

    expect(buildSubscriptionEntitlement(
      'evt_2',
      1_700_000_001,
      subscription({ status: 'past_due' }),
    ).tier).toBe('free');
  });

  it('fails closed for unknown prices, multi-price subscriptions, or missing users', () => {
    expect(() => buildSubscriptionEntitlement(
      'evt_unknown',
      1_700_000_000,
      subscription({ items: { data: [{ price: { id: 'price_attacker' }, current_period_end: 1_800_000_000 }] } }),
    )).toThrow('등록되지 않은 Stripe 가격');

    expect(() => buildSubscriptionEntitlement(
      'evt_multi',
      1_700_000_000,
      subscription({ items: { data: [
        { price: { id: 'price_pro' }, current_period_end: 1_800_000_000 },
        { price: { id: 'price_pro' }, current_period_end: 1_800_000_000 },
      ] } }),
    )).toThrow('단일 가격');

    expect(() => buildSubscriptionEntitlement(
      'evt_user',
      1_700_000_000,
      subscription({ metadata: {} }),
    )).toThrow('사용자 식별자');
  });

  it('persists through the idempotent database RPC contract', async () => {
    const rpc = jest.fn(async () => ({ data: 'applied', error: null }));
    const entitlement = buildSubscriptionEntitlement('evt_3', 1_700_000_000, subscription());

    await persistSubscriptionEntitlement(entitlement, { rpc } as never);

    expect(rpc).toHaveBeenCalledWith('apply_stripe_subscription_event', expect.objectContaining({
      p_event_id: 'evt_3',
      p_user_id: 'firebase-user-1',
      p_tier: 'pro',
    }));
  });
});
