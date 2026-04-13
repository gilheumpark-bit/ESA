/**
 * ESVA Dashboard API — /api/dashboard
 * ────────────────────────────────────
 * GET: Returns user's dashboard data.
 *
 * PART 1: Auth extraction
 * PART 2: Supabase queries
 * PART 3: GET handler
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { extractVerifiedUserId } from '@/lib/auth-helpers';

// ─── PART 1: Auth ─────────────────────────────────────────────

// Uses shared extractVerifiedUserId from @/lib/auth-helpers

// ─── PART 2: Response types ───────────────────────────────────

interface DashboardResponse {
  calcUsage: { name: string; count: number; calculatorId: string }[];
  totalCalcs: number;
  recentCalcs: {
    id: string;
    calculatorName: string;
    calculatorId: string;
    createdAt: string;
    summary: string;
  }[];
  standardUpdates: {
    id: string;
    name: string;
    description: string;
    date: string;
    link?: string;
  }[];
}

// ─── PART 3: GET Handler ──────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const blocked = applyRateLimit(request, 'default');
    if (blocked) return blocked;

    const userId = await extractVerifiedUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-1001', message: 'Authentication required' } },
        { status: 401 },
      );
    }

    const supabase = getSupabaseAdmin();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    // 4개 쿼리 병렬 실행 (순차→병렬: ~4x 속도 향상)
    const [recentResult, monthResult, countResult, notifResult] = await Promise.all([
      supabase.from('calculation_receipts')
        .select('id, calculator_id, calculator_name, created_at, inputs, outputs')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('calculation_receipts')
        .select('calculator_id, calculator_name')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgoISO),
      supabase.from('calculation_receipts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      supabase.from('notifications')
        .select('id, title, body, created_at, metadata')
        .eq('type', 'standard_update')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const { data: recentRows, error: recentErr } = recentResult;
    const { data: monthRows, error: monthErr } = monthResult;
    const { count: totalCount, error: countErr } = countResult;
    const { data: notifRows, error: _notifErr } = notifResult;

    if (recentErr || monthErr || countErr) {
      console.warn('[ESVA Dashboard] Supabase query error:', recentErr ?? monthErr ?? countErr);
    }

    // Aggregate calc count by category (last 30 days, top 5)
    const calcCountMap = new Map<string, { name: string; count: number; calculatorId: string }>();
    if (monthRows) {
      for (const row of monthRows) {
        const existing = calcCountMap.get(row.calculator_id);
        if (existing) {
          existing.count++;
        } else {
          calcCountMap.set(row.calculator_id, {
            name: row.calculator_name ?? row.calculator_id,
            count: 1,
            calculatorId: row.calculator_id,
          });
        }
      }
    }
    const calcUsage = [...calcCountMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Build recent calcs
    const recentCalcs = (recentRows ?? []).map((row) => {
      // 결과 요약 생성
      const outputs = row.outputs as Record<string, unknown> | null;
      const summary = outputs
        ? Object.entries(outputs)
            .slice(0, 3)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
        : '';
      return {
        id: row.id ?? '',
        calculatorName: row.calculator_name ?? row.calculator_id,
        calculatorId: row.calculator_id,
        createdAt: row.created_at ?? new Date().toISOString(),
        summary,
      };
    });

    // Build standard updates from notifications
    const standardUpdates = (notifRows ?? []).map((n) => {
      const meta = n.metadata as Record<string, string> | null;
      return {
        id: n.id ?? '',
        name: n.title ?? '',
        description: n.body ?? '',
        date: n.created_at ? n.created_at.split('T')[0] : '',
        link: meta?.link,
      };
    });

    const response: DashboardResponse = {
      calcUsage,
      totalCalcs: totalCount ?? 0,
      recentCalcs,
      standardUpdates,
    };

    return NextResponse.json(
      { success: true, data: response },
      { status: 200, headers: { 'Cache-Control': 'private, max-age=30' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[ESVA Dashboard]', message);

    // Return empty data instead of error so dashboard still renders
    return NextResponse.json({
      success: true,
      data: {
        calcUsage: [],
        totalCalcs: 0,
        recentCalcs: [],
        standardUpdates: [],
      },
    });
  }
}
