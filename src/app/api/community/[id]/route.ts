/**
 * ESVA Community API — /api/community/[id]
 * ─────────────────────────────────────────
 * GET:  Load question + answers
 * POST: Add answer to question (auth required)
 *
 * PART 1: Auth extraction
 * PART 2: GET handler (question + answers)
 * PART 3: POST handler (create answer)
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { getQuestion, getAnswersForQuestion, createAnswer } from '@/lib/community';
import { getExpertBadge } from '@/lib/expert-verification';
import { checkContent, checkAnswerQuality } from '@/lib/abuse-prevention';

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

// ─── PART 2: GET — Question + Answers ──────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const question = await getQuestion(id);
    if (!question) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-7060', message: 'Question not found' } },
        { status: 404 },
      );
    }

    const answers = await getAnswersForQuestion(id);

    return NextResponse.json({
      success: true,
      data: { question, answers },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[ESVA Community GET /id]', message);
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-7061', message } },
      { status: 500 },
    );
  }
}

// ─── PART 3: POST — Add Answer ─────────────────────────────────

interface CreateAnswerBody {
  body?: string;
  standardRefs?: string[];
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

    // Verify question exists
    const question = await getQuestion(questionId);
    if (!question) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-7062', message: 'Question not found' } },
        { status: 404 },
      );
    }

    const body: CreateAnswerBody = await request.json();

    if (!body.body || typeof body.body !== 'string' || body.body.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-7063', message: 'Answer body is required (minimum 10 characters)' } },
        { status: 400 },
      );
    }

    // Content safety check
    const contentCheck = checkContent(body.body);
    if (!contentCheck.safe) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-7064', message: `Answer: ${contentCheck.reason}` } },
        { status: 400 },
      );
    }

    // Quality check (근거 조항 명시 권장)
    const quality = checkAnswerQuality(body.body);

    // Check if user is a verified expert
    const badge = await getExpertBadge(userId);
    const isExpert = badge !== null;

    const answer = await createAnswer({
      questionId,
      body: body.body.trim(),
      authorId: userId,
      isExpert,
      standardRefs: Array.isArray(body.standardRefs) ? body.standardRefs : [],
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          ...answer,
          qualityWarning: quality.warning ?? null,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[ESVA Community POST /id]', message);
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-7065', message } },
      { status: 500 },
    );
  }
}
