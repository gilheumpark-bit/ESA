/**
 * ESVA Stripe Integration
 * -----------------------
 * Subscription checkout sessions with open-redirect prevention.
 */

// ─── PART 1: Types ────────────────────────────────────────────

export interface CheckoutSessionRequest {
  priceId: string;
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
    console.warn('[ESVA Stripe] Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
  }

  return {
    publishableKey,
    portalReturnUrl: process.env.NEXT_PUBLIC_STRIPE_PORTAL_RETURN_URL ?? '/',
  };
}

// ─── PART 3: Open-Redirect Prevention ─────────────────────────

/** Allowed return URL host patterns */
const ALLOWED_HOSTS = [
  /^localhost(:\d+)?$/,
  /^.*\.vercel\.app$/,
  /^esva\.engineer$/,
  /^.*\.esva\.engineer$/,
];

/**
 * Sanitize the return URL to prevent open-redirect attacks.
 *
 * @param base - The user-provided return URL base
 * @param hostOrigin - The actual request origin for validation
 * @returns Sanitized URL safe for Stripe redirect
 */
export function sanitizeStripeReturnBase(base: string, hostOrigin: string): string {
  // Strip any protocol/host from base, keep only path
  let sanitized = base;

  try {
    const parsed = new URL(base, 'https://placeholder.invalid');

    // If the base includes a host, validate it
    if (base.startsWith('http://') || base.startsWith('https://') || base.startsWith('//')) {
      if (!isAllowedHost(parsed.hostname)) {
        // Fall back to origin + path only
        sanitized = hostOrigin + parsed.pathname;
      } else {
        sanitized = base;
      }
    } else {
      // Relative path: prepend the host origin
      sanitized = hostOrigin + (base.startsWith('/') ? base : `/${base}`);
    }
  } catch {
    // If URL parsing fails, use a safe default
    sanitized = hostOrigin + '/';
  }

  // Prevent protocol-relative URLs (//evil.com)
  if (sanitized.startsWith('//')) {
    sanitized = hostOrigin + '/';
  }

  // Remove any embedded credentials or fragments that could be abused
  sanitized = sanitized.replace(/@/g, '').replace(/#/g, '');

  return sanitized;
}

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.some(pattern => pattern.test(hostname));
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
  priceId: string,
  clientId: string,
  returnUrl: string,
): Promise<CheckoutSessionResponse> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('[ESVA] Stripe not configured. Set STRIPE_SECRET_KEY.');
  }

  // Dynamic import to avoid bundling stripe in client
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(secretKey, {
    apiVersion: '2025-03-31.basil' as NonNullable<ConstructorParameters<typeof Stripe>[1]>['apiVersion'],
    typescript: true,
  });

  // Validate the return URL
  const origin = extractOrigin(returnUrl);
  const safeSuccessUrl = sanitizeStripeReturnBase(returnUrl, origin) + '?session_id={CHECKOUT_SESSION_ID}';
  const safeCancelUrl = sanitizeStripeReturnBase(returnUrl, origin);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    client_reference_id: clientId,
    success_url: safeSuccessUrl,
    cancel_url: safeCancelUrl,
    metadata: {
      esa_user_id: clientId,
      source: 'esa-web',
    },
    subscription_data: {
      metadata: {
        esa_user_id: clientId,
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
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('[ESVA] Stripe not configured. Set STRIPE_SECRET_KEY.');
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(secretKey, {
    apiVersion: '2025-03-31.basil' as NonNullable<ConstructorParameters<typeof Stripe>[1]>['apiVersion'],
    typescript: true,
  });

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
    throw new Error('[ESVA] Stripe publishable key not configured');
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

/** Stripe Price IDs for ESVA plans */
export const ESVA_PRICE_IDS = {
  pro_monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY ?? '',
  pro_yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY ?? '',
  team_monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY ?? '',
  team_yearly: process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM_YEARLY ?? '',
} as const;
