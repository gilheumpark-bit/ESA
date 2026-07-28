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
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { voteQuestion, voteAnswer, type VoteDirection } from '@/lib/community';
import { classifyVoteError } from '@/lib/community-error';
import { withRequestLog } from '@/lib/api/with-request-log';

// ─── PART 1: Auth ──────────────────────────────────────────────

// 서명 검증 헬퍼로 위임 — 기존 atob-only 디코드는 서명 미검증이라 위조 토큰을 허용했음.
const extractUserId = (request: NextRequest): Promise<string | null> =>
  extractVerifiedUserId(request);

// ─── PART 2: POST — Vote ──────────────────────────────────────

interface VoteBody {
  direction?: string;
  targetType?: string;
  targetId?: string;
}

async function POST__impl(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Per-route abuse limit.
    const blocked = applyRateLimit(request, 'community');
    if (blocked) return blocked;

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
    // 호출자 잘못을 500 으로 뭉개지 않는다. 가장 흔한 경우는 경합이다 —
    // 신고 3 회면 글이 자동으로 숨겨지고 RPC 는 숨겨진 글을 투표 대상에서
    // 뺀다. 화면을 열어 둔 사이에 그렇게 되면 정상적인 상황인데 500 이
    // 나가 운영 알람이 울린다.
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[ESVA Vote POST]', message);
    const mapped = classifyVoteError(err);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: mapped ? 'ESVA-7073' : 'ESVA-7072',
          message: mapped?.message ?? '투표를 반영하지 못했습니다.',
        },
      },
      { status: mapped?.status ?? 500 },
    );
  }
}

export const POST = withRequestLog(POST__impl);
