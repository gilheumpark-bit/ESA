/**
 * ESVA Checkout API — /api/checkout
 * ──────────────────────────────────
 * POST: Create a Stripe checkout session for subscription upgrade.
 *
 * PART 1: Request validation
 * PART 2: Auth verification
 * PART 3: Stripe session creation
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { getStripeSession, sanitizeStripeReturnBase, ESVA_PRICE_IDS } from '@/lib/stripe';
import { extractVerifiedUserId } from '@/lib/auth-helpers';

// ─── PART 1: Request Types ──────────────────────────────────────

interface CheckoutRequestBody {
  priceId: string;
  returnUrl: string;
}

// ─── PART 2: Auth Extraction ────────────────────────────────────

// Uses shared extractVerifiedUserId from @/lib/auth-helpers

// ─── PART 3: Allowed Price IDs ──────────────────────────────────

function isValidPriceId(priceId: string): boolean {
  const validIds = Object.values(ESVA_PRICE_IDS).filter((id) => id.length > 0);
  // Accept any Stripe price ID format (price_xxxxx or prod-env IDs)
  if (validIds.length > 0 && validIds.includes(priceId)) return true;
  // Fallback: accept standard Stripe price ID format during dev
  return /^price_[a-zA-Z0-9]{10,}$/.test(priceId);
}

// ─── PART 4: POST Handler ───────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const blocked = applyRateLimit(request, 'default');
    if (blocked) return blocked;

    // Auth required for checkout
    const userId = await extractVerifiedUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-1001', message: 'Authentication required for checkout' } },
        { status: 401 },
      );
    }

    // Parse body
    const body: CheckoutRequestBody = await request.json();

    if (!body.priceId || typeof body.priceId !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-2010', message: 'Missing priceId' } },
        { status: 400 },
      );
    }

    if (!isValidPriceId(body.priceId)) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-2011', message: 'Invalid price ID' } },
        { status: 400 },
      );
    }

    if (!body.returnUrl || typeof body.returnUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-2012', message: 'Missing returnUrl' } },
        { status: 400 },
      );
    }

    // Sanitize return URL to prevent open-redirect
    const hostOrigin = request.headers.get('origin') ?? 'https://esva.engineer';
    const safeReturnUrl = sanitizeStripeReturnBase(body.returnUrl, hostOrigin);

    // Create Stripe checkout session
    const session = await getStripeSession(body.priceId, userId, safeReturnUrl);

    return NextResponse.json(
      {
        success: true,
        data: {
          sessionId: session.sessionId,
          url: session.url,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ESVA /api/checkout] Error:', message);

    // Distinguish Stripe configuration errors
    if (message.includes('Stripe not configured')) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-2020', message: 'Payment system not configured' } },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { success: false, error: { code: 'ESVA-2999', message: 'Checkout session creation failed' } },
      { status: 500 },
    );
  }
}
