/**
 * ESVA Feedback API — /api/feedback
 * ──────────────────────────────────
 * POST: Save user feedback (thumbs up/down + optional comment).
 * No auth required — anonymous feedback is OK.
 *
 * PART 1: Request types
 * PART 2: POST handler
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// ─── PART 1: Request Types ─────────────────────────────────────

interface FeedbackRequestBody {
  type: 'calculation' | 'search';
  targetId: string;
  rating: 'up' | 'down';
  comment?: string;
}

const VALID_TYPES = new Set(['calculation', 'search']);
const VALID_RATINGS = new Set(['up', 'down']);
const MAX_COMMENT_LENGTH = 500;

// ─── PART 2: POST Handler ──────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Rate limit (use default profile)
    const ip = getClientIp(request.headers);
    const rl = checkRateLimit(ip, 'default');
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4002', message: 'Rate limit exceeded' } },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
      );
    }

    const body: FeedbackRequestBody = await request.json();

    // Validate type
    if (!body.type || !VALID_TYPES.has(body.type)) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4003', message: 'Invalid feedback type. Must be "calculation" or "search".' } },
        { status: 400 },
      );
    }

    // Validate targetId
    if (!body.targetId || typeof body.targetId !== 'string' || body.targetId.length > 200) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4003', message: 'Missing or invalid targetId' } },
        { status: 400 },
      );
    }

    // Validate rating
    if (!body.rating || !VALID_RATINGS.has(body.rating)) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4003', message: 'Invalid rating. Must be "up" or "down".' } },
        { status: 400 },
      );
    }

    // Sanitize comment
    const comment = body.comment
      ? body.comment.trim().slice(0, MAX_COMMENT_LENGTH)
      : undefined;

    // Save to Supabase
    const saved = await saveFeedbackToSupabase({
      type: body.type,
      targetId: body.targetId,
      rating: body.rating,
      comment,
      ip,
      timestamp: new Date().toISOString(),
    });

    if (!saved) {
      // Non-fatal: log but still return success (feedback is best-effort)
      console.warn('[ESVA /api/feedback] Failed to save to Supabase — logged locally');
    }

    return NextResponse.json(
      { success: true, data: { message: 'Feedback received' } },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ESVA /api/feedback] Error:', message);

    return NextResponse.json(
      { success: false, error: { code: 'ESVA-4999', message: 'Internal error processing feedback' } },
      { status: 500 },
    );
  }
}

// ─── PART 3: Supabase Persistence ──────────────────────────────

interface FeedbackRecord {
  type: string;
  targetId: string;
  rating: string;
  comment?: string;
  ip: string;
  timestamp: string;
}

async function saveFeedbackToSupabase(record: FeedbackRecord): Promise<boolean> {
  try {
    // Dynamic import to avoid bundling Supabase client in edge cases
    const { createClient } = await import('@supabase/supabase-js');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('[ESVA /api/feedback] Supabase not configured');
      return false;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error } = await supabase.from('feedback').insert({
      type: record.type,
      target_id: record.targetId,
      rating: record.rating,
      comment: record.comment ?? null,
      ip_hash: hashIp(record.ip),
      created_at: record.timestamp,
    });

    if (error) {
      console.warn('[ESVA /api/feedback] Supabase insert error:', error.message);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/** Hash IP for privacy — store hash, not raw IP */
function hashIp(ip: string): string {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `ip_${Math.abs(hash).toString(36)}`;
}
