import type { SupabaseClient } from '@supabase/supabase-js';
import { tierForStripePrice } from '@/lib/billing';
import { getSupabaseAdmin, type UserTier } from '@/lib/supabase';

interface StripeSubscriptionSnapshot {
  id: string;
  customer: string | { id: string };
  status: string;
  metadata: Record<string, string>;
  items: {
    data: Array<{
      price: { id: string };
      current_period_end: number;
    }>;
  };
}

export interface SubscriptionEntitlement {
  eventId: string;
  eventType: string;
  eventCreatedAt: string;
  userId: string;
  customerId: string;
  subscriptionId: string;
  subscriptionStatus: string;
  priceId: string;
  tier: UserTier;
  currentPeriodEnd: string | null;
}

const KNOWN_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
]);

function assertSafeIdentifier(value: string, label: string): string {
  if (!value || value.length > 255 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label}가 없거나 올바르지 않습니다.`);
  }
  return value;
}

export function buildSubscriptionEntitlement(
  eventId: string,
  eventCreatedAtSeconds: number,
  subscription: StripeSubscriptionSnapshot,
  fallbackUserId?: string | null,
  eventType = 'subscription.entitlement',
): SubscriptionEntitlement {
  if (!Number.isSafeInteger(eventCreatedAtSeconds) || eventCreatedAtSeconds <= 0) {
    throw new Error('Stripe 이벤트 시간이 올바르지 않습니다.');
  }
  if (!KNOWN_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    throw new Error('알 수 없는 Stripe 구독 상태입니다.');
  }
  if (subscription.items.data.length !== 1) {
    throw new Error('ESVA 구독은 단일 가격 항목이어야 합니다.');
  }

  const item = subscription.items.data[0];
  const mappedTier = tierForStripePrice(item.price.id);
  if (!mappedTier) {
    throw new Error('등록되지 않은 Stripe 가격입니다.');
  }

  const userId = assertSafeIdentifier(
    subscription.metadata.esa_user_id || fallbackUserId || '',
    'Stripe 사용자 식별자',
  );
  const customerId = assertSafeIdentifier(
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    'Stripe 고객 식별자',
  );

  const hasEntitlement = subscription.status === 'active' || subscription.status === 'trialing';
  const periodEnd = Number.isSafeInteger(item.current_period_end) && item.current_period_end > 0
    ? new Date(item.current_period_end * 1000).toISOString()
    : null;

  return {
    eventId: assertSafeIdentifier(eventId, 'Stripe 이벤트 식별자'),
    eventType: assertSafeIdentifier(eventType, 'Stripe 이벤트 유형'),
    eventCreatedAt: new Date(eventCreatedAtSeconds * 1000).toISOString(),
    userId,
    customerId,
    subscriptionId: assertSafeIdentifier(subscription.id, 'Stripe 구독 식별자'),
    subscriptionStatus: subscription.status,
    priceId: item.price.id,
    tier: hasEntitlement ? mappedTier : 'free',
    currentPeriodEnd: periodEnd,
  };
}

export async function persistSubscriptionEntitlement(
  entitlement: SubscriptionEntitlement,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<'applied' | 'duplicate' | 'stale'> {
  const { data, error } = await client.rpc('apply_stripe_subscription_event', {
    p_event_id: entitlement.eventId,
    p_event_created_at: entitlement.eventCreatedAt,
    p_event_type: entitlement.eventType,
    p_user_id: entitlement.userId,
    p_customer_id: entitlement.customerId,
    p_subscription_id: entitlement.subscriptionId,
    p_subscription_status: entitlement.subscriptionStatus,
    p_price_id: entitlement.priceId,
    p_tier: entitlement.tier,
    p_current_period_end: entitlement.currentPeriodEnd,
  });
  if (error) {
    throw new Error(`Stripe 구독 상태 저장 실패: ${error.message}`);
  }
  if (data !== 'applied' && data !== 'duplicate' && data !== 'stale') {
    throw new Error('Stripe 구독 상태 저장 결과가 올바르지 않습니다.');
  }
  return data;
}
