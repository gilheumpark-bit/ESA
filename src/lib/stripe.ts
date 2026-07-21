/**
 * ESVA Stripe Integration
 * -----------------------
 * Subscription checkout sessions with open-redirect prevention.
 */

import { resolveBillingPlan, type BillingPlanKey } from '@/lib/billing';

// ─── PART 1: Types ────────────────────────────────────────────

export interface CheckoutSessionRequest {
  plan: BillingPlanKey;
  clientId: string;
  returnUrl: string;
}

export interface CheckoutSessionResponse {
  sessionId: string;
  url: string;
}

export interface ESAStripeConfig {
  publishableKey: string;
  portalReturnUrl: string;
}

// ─── PART 2: Configuration ────────────────────────────────────

/**
 * Get Stripe publishable key for client-side use.
 */
export function getStripeConfig(): ESAStripeConfig {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

  if (!publishableKey) {
    console.warn('[ESVA Stripe] 결제 클라이언트 구성이 없습니다.');
  }

  return {
    publishableKey,
    portalReturnUrl: process.env.NEXT_PUBLIC_STRIPE_PORTAL_RETURN_URL ?? '/',
  };
}

// ─── PART 3: Open-Redirect Prevention ─────────────────────────

/**
 * Sanitize the return URL to prevent open-redirect attacks.
 *
 * @param base - The user-provided return URL base
 * @param hostOrigin - The actual request origin for validation
 * @returns Sanitized URL safe for Stripe redirect
 */
export function sanitizeStripeReturnBase(base: string, hostOrigin: string): string {
  try {
    const serving = new URL(hostOrigin);
    if (!['http:', 'https:'].includes(serving.protocol)) throw new Error('invalid protocol');
    const requested = new URL(base, serving.origin);
    if (requested.origin !== serving.origin || requested.username || requested.password) {
      return `${serving.origin}/settings`;
    }
    return `${serving.origin}${requested.pathname.startsWith('/') ? requested.pathname : '/settings'}`;
  } catch {
    return 'https://esva.engineer/settings';
  }
}

// ─── PART 4: Checkout Session (Server-Side) ───────────────────

/**
 * Create a Stripe checkout session for a subscription.
 * This function is intended for server-side use (API routes).
 *
 * @param priceId - Stripe Price ID for the subscription
 * @param clientId - ESVA user ID (stored as client_reference_id)
 * @param returnUrl - URL to redirect to after checkout
 * @returns Session ID and checkout URL
 */
export async function getStripeSession(
  planKey: BillingPlanKey,
  clientId: string,
  returnUrl: string,
): Promise<CheckoutSessionResponse> {
  const stripe = await createStripeClient();
  const plan = resolveBillingPlan(planKey);

  // Validate the return URL
  const origin = extractOrigin(returnUrl);
  const safeBase = sanitizeStripeReturnBase(returnUrl, origin);
  const safeSuccessUrl = `${safeBase}?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const safeCancelUrl = `${safeBase}?checkout=cancelled`;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: plan.priceId,
        quantity: 1,
      },
    ],
    client_reference_id: clientId,
    success_url: safeSuccessUrl,
    cancel_url: safeCancelUrl,
    metadata: {
      esa_user_id: clientId,
      esa_plan: plan.key,
      source: 'esa-web',
    },
    subscription_data: {
      metadata: {
        esa_user_id: clientId,
        esa_plan: plan.key,
      },
    },
  });

  if (!session.url) {
    throw new Error('[ESVA] Stripe session created but no URL returned');
  }

  return {
    sessionId: session.id,
    url: session.url,
  };
}

// ─── PART 5: Customer Portal ──────────────────────────────────

/**
 * Create a Stripe customer portal session.
 * Allows users to manage their subscription.
 */
export async function createPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<{ url: string }> {
  const stripe = await createStripeClient();

  const origin = extractOrigin(returnUrl);
  const safeReturnUrl = sanitizeStripeReturnBase(returnUrl, origin);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: safeReturnUrl,
  });

  return { url: session.url };
}

// ─── PART 6: Client-Side Stripe.js ───────────────────────────

/**
 * Load Stripe.js on the client side (lazy).
 */
export async function getStripeJs() {
  const { loadStripe } = await import('@stripe/stripe-js');
  const config = getStripeConfig();

  if (!config.publishableKey) {
    throw new Error('결제 서비스를 사용할 수 없습니다.');
  }

  return loadStripe(config.publishableKey);
}

// ─── PART 7: Helpers ──────────────────────────────────────────

function extractOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return 'https://esva.engineer';
  }
}

/** Server-only Stripe client. Billing code must never expose secret price IDs to the browser. */
export async function createStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('[ESVA] Stripe not configured. Set STRIPE_SECRET_KEY.');
  }
  const Stripe = (await import('stripe')).default;
  return new Stripe(secretKey, { typescript: true });
}
