/**
 * ESVA Saved Calculation API — /api/calculate/[id]
 * ─────────────────────────────────────────────────
 * GET: Load a calculation receipt by ID.
 * Public receipts: no auth required.
 * Private: requires Firebase ID token.
 *
 * PART 1: Token verification
 * PART 2: GET handler
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { loadCalculation } from '@/lib/supabase';

// ─── PART 1: Token Extraction ───────────────────────────────────

async function extractUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  if (!token || token.length < 10) return null;

  try {

    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(atob(payloadB64));
    return payload.user_id ?? payload.sub ?? null;
  } catch {
    return null;
  }
}

// ─── PART 2: GET Handler ────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
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

    // If the receipt has a user_id, verify the requester owns it
    if (receipt.user_id) {
      const requesterId = await extractUserId(request);

      if (!requesterId) {
        return NextResponse.json(
          { success: false, error: { code: 'ESVA-1001', message: 'Authentication required' } },
          { status: 401 },
        );
      }

      if (requesterId !== receipt.user_id) {
        return NextResponse.json(
          { success: false, error: { code: 'ESVA-1002', message: 'Access denied' } },
          { status: 403 },
        );
      }
    }

    return NextResponse.json(
      { success: true, data: receipt },
      {
        status: 200,
        headers: {
          'Cache-Control': receipt.user_id
            ? 'private, max-age=300'
            : 'public, max-age=3600, s-maxage=86400',
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ESVA /api/calculate/[id]] Error:', message);

    return NextResponse.json(
      { success: false, error: { code: 'ESVA-4999', message: 'Failed to load receipt' } },
      { status: 500 },
    );
  }
}
