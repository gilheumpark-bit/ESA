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
import { getStripeSession } from '@/lib/stripe';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { getBillingStatus, isBillingPlanKey, type BillingPlanKey } from '@/lib/billing';
import { isRequestOriginAllowed } from '@/lib/request-origin';

// ─── PART 1: Request Types ──────────────────────────────────────

interface CheckoutRequestBody {
  plan: BillingPlanKey;
}

// ─── PART 2: Auth Extraction ────────────────────────────────────

// Uses shared extractVerifiedUserId from @/lib/auth-helpers

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

    const origin = request.headers.get('origin');
    if (!isRequestOriginAllowed(
      origin,
      request.url,
      process.env.NEXT_PUBLIC_ALLOWED_ORIGINS,
      request.headers.get('host'),
      request.headers.get('x-forwarded-proto'),
    )) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-1014', message: '허용되지 않은 요청 출처입니다.' } },
        { status: 403 },
      );
    }

    if (!getBillingStatus().enabled) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-2020', message: '결제 기능이 현재 비활성화되어 있습니다.' } },
        { status: 503 },
      );
    }

    const body = await request.json() as Partial<CheckoutRequestBody>;
    if (!isBillingPlanKey(body.plan)) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-2011', message: '지원하지 않는 결제 상품입니다.' } },
        { status: 400 },
      );
    }

    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://esva.engineer';
    const requestOrigin = origin ?? new URL(configuredOrigin).origin;
    const safeReturnUrl = `${new URL(requestOrigin).origin}/settings`;

    // Create Stripe checkout session
    const session = await getStripeSession(body.plan, userId, safeReturnUrl);

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
