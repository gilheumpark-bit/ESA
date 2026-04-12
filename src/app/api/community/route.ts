/**
 * ESVA Community API — /api/community
 * ────────────────────────────────────
 * GET:  List questions with pagination, filters, search
 * POST: Create a new question (auth required)
 *
 * PART 1: Auth extraction
 * PART 2: GET handler (list questions)
 * PART 3: POST handler (create question)
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { getQuestions, createQuestion, type QuestionListOptions, type QuestionStatus } from '@/lib/community';
import { checkContent } from '@/lib/abuse-prevention';
import { extractVerifiedUserId } from '@/lib/auth-helpers';

// ─── PART 1: Auth ──────────────────────────────────────────────
// Uses shared extractVerifiedUserId from @/lib/auth-helpers

// ─── PART 2: GET — List Questions ──────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const blocked = applyRateLimit(request, 'community');
    if (blocked) return blocked;

    const { searchParams } = new URL(request.url);

    const opts: QuestionListOptions = {
      page: parseInt(searchParams.get('page') ?? '1', 10) || 1,
      pageSize: Math.min(parseInt(searchParams.get('pageSize') ?? '20', 10) || 20, 50),
      sort: (searchParams.get('sort') as QuestionListOptions['sort']) ?? 'newest',
      search: searchParams.get('search') ?? undefined,
      status: searchParams.get('status') as QuestionStatus | undefined,
    };

    const tagsParam = searchParams.get('tags');
    if (tagsParam) {
      opts.tags = tagsParam.split(',').map((t) => t.trim()).filter(Boolean);
    }

    const result = await getQuestions(opts);

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[ESVA Community GET]', message);
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-7050', message } },
      { status: 500 },
    );
  }
}

// ─── PART 3: POST — Create Question ────────────────────────────

interface CreateQuestionBody {
  title?: string;
  body?: string;
  tags?: string[];
  standardRefs?: string[];
  calcRefs?: string[];
}

export async function POST(request: NextRequest) {
  try {
    // Auth required
    const userId = await extractVerifiedUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-1001', message: 'Authentication required' } },
        { status: 401 },
      );
    }

    const body: CreateQuestionBody = await request.json();

    // Validate
    if (!body.title || typeof body.title !== 'string' || body.title.trim().length < 5) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-7051', message: 'Title is required (minimum 5 characters)' } },
        { status: 400 },
      );
    }

    if (!body.body || typeof body.body !== 'string' || body.body.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-7052', message: 'Body is required (minimum 10 characters)' } },
        { status: 400 },
      );
    }

    // Content safety check
    const titleCheck = checkContent(body.title);
    if (!titleCheck.safe) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-7053', message: `Title: ${titleCheck.reason}` } },
        { status: 400 },
      );
    }

    const bodyCheck = checkContent(body.body);
    if (!bodyCheck.safe) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-7054', message: `Body: ${bodyCheck.reason}` } },
        { status: 400 },
      );
    }

    const question = await createQuestion({
      title: body.title.trim(),
      body: body.body.trim(),
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 5) : [],
      authorId: userId,
      standardRefs: Array.isArray(body.standardRefs) ? body.standardRefs : [],
      calcRefs: Array.isArray(body.calcRefs) ? body.calcRefs : [],
    });

    return NextResponse.json({ success: true, data: question }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[ESVA Community POST]', message);
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-7055', message } },
      { status: 500 },
    );
  }
}
