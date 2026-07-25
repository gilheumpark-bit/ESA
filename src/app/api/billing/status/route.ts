import { NextResponse } from 'next/server';
import { getBillingStatus } from '@/lib/billing';
import { withRequestLog } from '@/lib/api/with-request-log';

export const dynamic = 'force-dynamic';

async function GET__impl() {
  const status = getBillingStatus();
  return NextResponse.json(
    {
      success: true,
      data: {
        enabled: status.enabled,
        plans: status.plans,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = withRequestLog(GET__impl);
