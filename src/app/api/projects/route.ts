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
  listUserProjects,
} from '@/lib/collaboration';
import { extractVerifiedUserId } from '@/lib/auth-helpers';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Auth Helper
// ═══════════════════════════════════════════════════════════════════════════════

// Uses shared extractVerifiedUserId from @/lib/auth-helpers

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — GET: List Projects
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const blocked = applyRateLimit(request, 'default');
    if (blocked) return blocked;

    const userId = await extractVerifiedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const filter = (url.searchParams.get('filter') ?? 'all') as 'all' | 'owned' | 'shared';

    const projects = await listUserProjects(userId, filter);

    // Map to summary format for the list view
    const summaries = projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      memberCount: p.members.length,
      calculationCount: p.calculations.length,
      userRole: p.members.find((m) => m.userId === userId)?.role ?? 'viewer',
      updatedAt: p.updatedAt,
    }));

    return NextResponse.json({ projects: summaries });
  } catch (err) {
    console.error('[ESVA Projects GET]', err);
    return NextResponse.json({ error: '프로젝트 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — POST: Create Project
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const userId = await extractVerifiedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 },
      );
    }

    const project = await createProject(name.trim(), userId, description?.trim());

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    console.error('[ESVA Projects POST]', err);
    return NextResponse.json({ error: '프로젝트를 만들지 못했습니다.' }, { status: 500 });
  }
}
