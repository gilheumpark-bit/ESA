import {
  getBillingStatus,
  resolveBillingPlan,
  tierForStripePrice,
} from '@/lib/billing';
import { sanitizeStripeReturnBase } from '@/lib/stripe';

const BILLING_ENV_KEYS = [
  'STRIPE_BILLING_ENABLED',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_PRO_MONTHLY',
  'STRIPE_PRICE_PRO_YEARLY',
  'STRIPE_PRICE_TEAM_MONTHLY',
  'STRIPE_PRICE_TEAM_YEARLY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

describe('billing configuration', () => {
  const original = Object.fromEntries(BILLING_ENV_KEYS.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    for (const key of BILLING_ENV_KEYS) delete process.env[key];
  });

  afterAll(() => {
    for (const key of BILLING_ENV_KEYS) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('stays unavailable unless checkout and signed fulfillment are both configured', () => {
    process.env.STRIPE_BILLING_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_test_example';
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro';

    expect(getBillingStatus()).toMatchObject({ enabled: false });

    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-example';
    expect(getBillingStatus()).toMatchObject({ enabled: true, plans: ['pro_monthly'] });
  });

  it('maps only server-configured plan handles and price IDs', () => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro';
    process.env.STRIPE_PRICE_TEAM_MONTHLY = 'price_team';

    expect(resolveBillingPlan('pro_monthly')).toEqual({
      key: 'pro_monthly',
      priceId: 'price_pro',
      tier: 'pro',
    });
    expect(tierForStripePrice('price_team')).toBe('team');
    expect(() => resolveBillingPlan('price_attacker')).toThrow('지원하지 않는 결제 상품');
    expect(tierForStripePrice('price_attacker')).toBeNull();
  });

  it('forces checkout redirects back to the exact serving origin', () => {
    expect(sanitizeStripeReturnBase('https://evil.vercel.app/capture', 'https://esva.engineer'))
      .toBe('https://esva.engineer/settings');
    expect(sanitizeStripeReturnBase('/settings#fragment', 'https://esva.engineer'))
      .toBe('https://esva.engineer/settings');
  });
});
