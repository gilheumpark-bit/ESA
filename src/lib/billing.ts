import type { UserTier } from '@/lib/supabase';

export const BILLING_PLAN_KEYS = [
  'pro_monthly',
  'pro_yearly',
  'team_monthly',
  'team_yearly',
] as const;

export type BillingPlanKey = (typeof BILLING_PLAN_KEYS)[number];

export interface BillingPlan {
  key: BillingPlanKey;
  priceId: string;
  tier: Extract<UserTier, 'pro' | 'team'>;
}

const PLAN_ENV: Record<BillingPlanKey, string> = {
  pro_monthly: 'STRIPE_PRICE_PRO_MONTHLY',
  pro_yearly: 'STRIPE_PRICE_PRO_YEARLY',
  team_monthly: 'STRIPE_PRICE_TEAM_MONTHLY',
  team_yearly: 'STRIPE_PRICE_TEAM_YEARLY',
};

const PLAN_TIER: Record<BillingPlanKey, BillingPlan['tier']> = {
  pro_monthly: 'pro',
  pro_yearly: 'pro',
  team_monthly: 'team',
  team_yearly: 'team',
};

export interface BillingStatus {
  enabled: boolean;
  plans: BillingPlanKey[];
  reason: 'disabled' | 'incomplete' | 'ready';
}

export function isBillingPlanKey(value: unknown): value is BillingPlanKey {
  return typeof value === 'string' && BILLING_PLAN_KEYS.includes(value as BillingPlanKey);
}

export function resolveBillingPlan(value: unknown): BillingPlan {
  if (!isBillingPlanKey(value)) {
    throw new Error('지원하지 않는 결제 상품입니다.');
  }
  const priceId = process.env[PLAN_ENV[value]]?.trim() ?? '';
  if (!priceId) {
    throw new Error('결제 상품이 서버에 설정되지 않았습니다.');
  }
  return { key: value, priceId, tier: PLAN_TIER[value] };
}

export function tierForStripePrice(priceId: string): BillingPlan['tier'] | null {
  for (const key of BILLING_PLAN_KEYS) {
    const configured = process.env[PLAN_ENV[key]]?.trim();
    if (configured && configured === priceId) return PLAN_TIER[key];
  }
  return null;
}

export function getBillingStatus(): BillingStatus {
  const plans = BILLING_PLAN_KEYS.filter((key) => Boolean(process.env[PLAN_ENV[key]]?.trim()));
  if (process.env.STRIPE_BILLING_ENABLED !== 'true') {
    return { enabled: false, plans: [], reason: 'disabled' };
  }

  const infrastructureReady = Boolean(
    process.env.STRIPE_SECRET_KEY?.trim()
    && process.env.STRIPE_WEBHOOK_SECRET?.trim()
    && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    && plans.length > 0,
  );

  return infrastructureReady
    ? { enabled: true, plans, reason: 'ready' }
    : { enabled: false, plans: [], reason: 'incomplete' };
}
