import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { getBillingStatus } from '@/lib/billing';
import { applyRateLimit } from '@/lib/rate-limit';
import { isRequestOriginAllowed } from '@/lib/request-origin';
import { createPortalSession } from '@/lib/stripe';
import { getStripeCustomerId } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const blocked = applyRateLimit(request, 'default');
    if (blocked) return blocked;

    const userId = await extractVerifiedUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-1001', message: 'Authentication required' } },
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

    const customerId = await getStripeCustomerId(userId);
    if (!customerId) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-2021', message: '관리할 구독 정보를 찾을 수 없습니다.' } },
        { status: 409 },
      );
    }

    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://esva.engineer';
    const requestOrigin = origin ?? new URL(configuredOrigin).origin;
    const session = await createPortalSession(customerId, `${new URL(requestOrigin).origin}/settings`);
    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    console.error('[ESVA /api/billing/portal]', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-2999', message: '구독 관리 페이지를 열지 못했습니다.' } },
      { status: 500 },
    );
  }
}
