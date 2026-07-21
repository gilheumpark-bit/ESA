import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getBillingStatus } from '@/lib/billing';
import {
  buildSubscriptionEntitlement,
  persistSubscriptionEntitlement,
} from '@/lib/billing-webhook';
import { createStripeClient } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

function subscriptionIdFromSession(session: Stripe.Checkout.Session): string | null {
  if (typeof session.subscription === 'string') return session.subscription;
  return session.subscription?.id ?? null;
}

export async function POST(request: NextRequest) {
  if (!getBillingStatus().enabled) {
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-2020', message: 'Billing webhook is disabled' } },
      { status: 503 },
    );
  }

  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-2021', message: 'Missing Stripe signature' } },
      { status: 400 },
    );
  }

  try {
    const stripe = await createStripeClient();
    const event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);

    let subscription: Stripe.Subscription;
    let fallbackUserId: string | null = null;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = subscriptionIdFromSession(session);
      if (session.mode !== 'subscription' || !subscriptionId) {
        return NextResponse.json({ success: true, data: { status: 'ignored' } });
      }
      fallbackUserId = session.client_reference_id;
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
    } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
      const snapshot = event.data.object as Stripe.Subscription;
      subscription = event.type === 'customer.subscription.deleted'
        ? snapshot
        : await stripe.subscriptions.retrieve(snapshot.id);
    } else {
      return NextResponse.json({ success: true, data: { status: 'ignored' } });
    }

    const entitlement = buildSubscriptionEntitlement(
      event.id,
      event.created,
      subscription,
      fallbackUserId,
      event.type,
    );
    const status = await persistSubscriptionEntitlement(entitlement);
    return NextResponse.json({ success: true, data: { status } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const isSignatureError = /signature|payload/i.test(message);
    console.error('[ESVA Stripe webhook] Rejected event:', isSignatureError ? 'invalid signature' : 'processing failure');
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isSignatureError ? 'ESVA-2022' : 'ESVA-2023',
          message: isSignatureError ? 'Invalid Stripe signature' : 'Stripe webhook processing failed',
        },
      },
      { status: isSignatureError ? 400 : 500 },
    );
  }
}
