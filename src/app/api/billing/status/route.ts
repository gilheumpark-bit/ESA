import { NextResponse } from 'next/server';
import { getBillingStatus } from '@/lib/billing';

export const dynamic = 'force-dynamic';

export async function GET() {
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
