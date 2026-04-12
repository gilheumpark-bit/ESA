/**
 * ESVA Community Vote API — /api/community/[id]/vote
 * ───────────────────────────────────────────────────
 * POST: Vote on a question or answer
 *
 * PART 1: Auth extraction
 * PART 2: POST handler (vote)
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { voteQuestion, voteAnswer, type VoteDirection } from '@/lib/community';

// ─── PART 1: Auth ──────────────────────────────────────────────

async function extractUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

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

// ─── PART 2: POST — Vote ──────────────────────────────────────

interface VoteBody {
  direction?: string;
  targetType?: string;
  targetId?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: questionId } = await params;

    // Auth required
    const userId = await extractUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-1001', message: 'Authentication required' } },
        { status: 401 },
      );
    }

    const body: VoteBody = await request.json();

    // Validate direction
    const direction = body.direction as VoteDirection;
    if (direction !== 'up' && direction !== 'down') {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-7070', message: 'direction must be "up" or "down"' } },
        { status: 400 },
      );
    }

    // Validate target
    const targetType = body.targetType ?? 'question';
    if (targetType !== 'question' && targetType !== 'answer') {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-7071', message: 'targetType must be "question" or "answer"' } },
        { status: 400 },
      );
    }

    const targetId = body.targetId ?? questionId;

    // Execute vote
    let result: { votes: number };

    if (targetType === 'question') {
      result = await voteQuestion(targetId, userId, direction);
    } else {
      result = await voteAnswer(targetId, userId, direction);
    }

    return NextResponse.json({
      success: true,
      data: { votes: result.votes },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[ESVA Vote POST]', message);
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-7072', message } },
      { status: 500 },
    );
  }
}
