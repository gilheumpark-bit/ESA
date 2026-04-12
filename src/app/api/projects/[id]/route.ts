/**
 * Single Project API — /api/projects/[id]
 *
 * GET: Project detail with calculations
 * PATCH: Update project / invoke actions (invite, remove, share)
 * DELETE: Delete project (owner only)
 *
 * PART 1: Auth helper
 * PART 2: GET handler
 * PART 3: PATCH handler
 * PART 4: DELETE handler
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import {
  getProject,
  updateProject,
  deleteProject,
  inviteMember,
  removeMember,
  addCalculationToProject,
  generateShareLink,
} from '@/lib/collaboration';
import { loadCalculation } from '@/lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Auth Helper
// ═══════════════════════════════════════════════════════════════════════════════

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

function getProjectId(request: NextRequest): string {
  const url = new URL(request.url);
  const segments = url.pathname.split('/');
  // /api/projects/[id] -> last segment is id
  return segments[segments.length - 1];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — GET: Project Detail
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const projectId = getProjectId(request);
    const project = await getProject(projectId);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify user is a member
    const isMember = project.members.some((m) => m.userId === userId);
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Resolve calculation receipts
    const calculationDetails = await Promise.all(
      project.calculations.map(async (receiptId) => {
        try {
          const receipt = await loadCalculation(receiptId);
          if (!receipt) return null;
          return {
            id: receipt.id,
            calculatorName: receipt.calculator_name,
            calculatorId: receipt.calculator_id,
            createdAt: receipt.created_at,
            value: typeof receipt.outputs?.value === 'number' ? receipt.outputs.value : undefined,
            unit: typeof receipt.outputs?.unit === 'string' ? receipt.outputs.unit : undefined,
          };
        } catch {
          return null;
        }
      }),
    );

    return NextResponse.json({
      ...project,
      calculations: calculationDetails.filter(Boolean),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — PATCH: Update Project / Actions
// ═══════════════════════════════════════════════════════════════════════════════

export async function PATCH(request: NextRequest) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const projectId = getProjectId(request);
    const body = await request.json();
    const { action } = body;

    // Action-based dispatch
    switch (action) {
      case 'inviteMember': {
        const { email, role } = body;
        if (!email) {
          return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }
        const member = await inviteMember(projectId, userId, email, role ?? 'viewer');
        return NextResponse.json({ member });
      }

      case 'removeMember': {
        const { userId: targetUserId } = body;
        if (!targetUserId) {
          return NextResponse.json({ error: 'Target userId is required' }, { status: 400 });
        }
        await removeMember(projectId, userId, targetUserId);
        return NextResponse.json({ success: true });
      }

      case 'addCalculation': {
        const { receiptId } = body;
        if (!receiptId) {
          return NextResponse.json({ error: 'Receipt ID is required' }, { status: 400 });
        }
        await addCalculationToProject(projectId, userId, receiptId);
        return NextResponse.json({ success: true });
      }

      case 'generateShareLink': {
        const { expireHours, password } = body;
        const link = await generateShareLink(projectId, userId, expireHours, password);
        return NextResponse.json(link);
      }

      default: {
        // Standard project update (name, description, status)
        const updates: Record<string, unknown> = {};
        if (body.name !== undefined) updates.name = body.name;
        if (body.description !== undefined) updates.description = body.description;
        if (body.status !== undefined) updates.status = body.status;

        if (Object.keys(updates).length === 0) {
          return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
        }

        const updated = await updateProject(projectId, userId, updates as Parameters<typeof updateProject>[2]);
        return NextResponse.json(updated);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message.includes('Insufficient permissions') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — DELETE: Delete Project
// ═══════════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  try {
    const userId = await extractUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const projectId = getProjectId(request);
    await deleteProject(projectId, userId);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message.includes('not a member') || message.includes('Insufficient') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
