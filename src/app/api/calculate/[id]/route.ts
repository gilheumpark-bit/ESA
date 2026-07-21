/**
 * ESVA Saved Calculation API — GET /api/calculate/[id]
 * Public receipts need no auth; private receipts require their owner token.
 */

import { NextRequest, NextResponse } from 'next/server';

import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { applyRateLimit } from '@/lib/rate-limit';
import { computeReceiptIntegrity } from '@/lib/receipt-integrity';
import { loadCalculation } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const blocked = applyRateLimit(request, 'default');
    if (blocked) return blocked;

    const { id } = await params;
    if (!id || typeof id !== 'string' || id.length < 10) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4020', message: 'Invalid receipt ID' } },
        { status: 400 },
      );
    }

    const receipt = await loadCalculation(id);
    if (!receipt) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4021', message: 'Receipt not found' } },
        { status: 404 },
      );
    }

    if (!receipt.is_public) {
      const requesterId = await extractVerifiedUserId(request);
      if (!requesterId) {
        return NextResponse.json(
          { success: false, error: { code: 'ESVA-1001', message: 'Authentication required' } },
          { status: 401 },
        );
      }
      if (!receipt.user_id || requesterId !== receipt.user_id) {
        return NextResponse.json(
          { success: false, error: { code: 'ESVA-1002', message: 'Access denied' } },
          { status: 403 },
        );
      }
    }

    const integrity = await computeReceiptIntegrity(receipt);
    return NextResponse.json(
      { success: true, data: receipt, integrity },
      {
        status: 200,
        headers: {
          'Cache-Control': receipt.is_public
            ? 'public, max-age=3600, s-maxage=86400'
            : 'private, max-age=300',
        },
      },
    );
  } catch (error) {
    console.error('[ESVA /api/calculate/[id]] Error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-4999', message: 'Failed to load receipt' } },
      { status: 500 },
    );
  }
}
