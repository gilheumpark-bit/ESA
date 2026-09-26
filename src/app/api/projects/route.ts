/**
 * Projects API — /api/projects
 *
 * GET: List user's projects (with filter: all/owned/shared)
 * POST: Create a new project
 *
 * PART 1: Auth helper
 * PART 2: GET handler
 * PART 3: POST handler
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import {
  createProject,
  listUserProjectSummaries,
} from '@/lib/collaboration';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { classifyCollabError } from '@/lib/collaboration-error';
import { withRequestLog } from '@/lib/api/with-request-log';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Auth Helper
// ═══════════════════════════════════════════════════════════════════════════════

// Uses shared extractVerifiedUserId from @/lib/auth-helpers

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — GET: List Projects
// ═══════════════════════════════════════════════════════════════════════════════

async function GET__impl(request: NextRequest) {
  try {
    const blocked = applyRateLimit(request, 'default');
    if (blocked) return blocked;

    const userId = await extractVerifiedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const filter = (url.searchParams.get('filter') ?? 'all') as 'all' | 'owned' | 'shared';

    const limit = Number(url.searchParams.get('limit') ?? 50);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    if (!['all', 'owned', 'shared'].includes(filter) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return NextResponse.json({ error: 'Invalid pagination' }, { status: 400 });
    const page = await listUserProjectSummaries(userId, filter, limit + 1, offset);
    const projects = page.slice(0, limit);

    const summaries = projects;

    return NextResponse.json({ projects: summaries, pagination: { limit, offset, hasMore: page.length > limit, nextOffset: page.length > limit ? offset + limit : null } });
  } catch (err) {
    console.error('[ESVA Projects GET]', err);
    return NextResponse.json({ error: '프로젝트 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — POST: Create Project
// ═══════════════════════════════════════════════════════════════════════════════

async function POST__impl(request: NextRequest) {
  try {
    const userId = await extractVerifiedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid project request' }, { status: 400 });
    const { name, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 },
      );
    }

    const requestId = request.headers.get('idempotency-key') ?? undefined;
    if (name.length > 200 || (description !== undefined && (typeof description !== 'string' || description.length > 10000))
      || (requestId !== undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId))) return NextResponse.json({ error: 'Invalid project fields' }, { status: 400 });
    const project = await createProject(name.trim(), userId, description?.trim(), requestId);

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    const mapped = classifyCollabError(err);
    console.error('[ESVA Projects POST]', err instanceof Error ? err.name : 'UnknownError');
    return NextResponse.json({ error: mapped?.message ?? '프로젝트를 만들지 못했습니다.' }, { status: mapped?.status ?? 500 });
  }
}

export const GET = withRequestLog(GET__impl);
export const POST = withRequestLog(POST__impl);
