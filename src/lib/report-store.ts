/**
 * Report Store — Supabase 보고서 영구 저장/조회
 * -----------------------------------------------
 * esva_reports 테이블에 검증 보고서를 저장하고 조회한다.
 * Supabase 미연결 시 → sessionStorage 폴백.
 *
 * PART 1: Save report
 * PART 2: Load report
 * PART 3: List reports
 */

import { createLogger } from './logger';
import type { ESVAVerifiedReport } from '@/agent/teams/types';

const log = createLogger('report-store');

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Save Report
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 보고서를 Supabase에 저장. 실패 시 false 반환.
 */
export async function saveReport(
  report: ESVAVerifiedReport,
  userId?: string,
): Promise<boolean> {
  // Supabase 시도
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      log.warn('Supabase not configured — report not persisted');
      return false;
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/esva_reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        report_id: report.reportId,
        user_id: userId ?? null,
        project_name: report.projectName,
        project_type: report.projectType,
        verdict: report.verdict,
        grade: report.grade,
        composite_score: report.compositeScore,
        report_json: report,
        hash: report.hash || null,
      }),
    });

    if (res.ok) {
      log.info('Report saved to Supabase', { reportId: report.reportId });
      return true;
    }

    log.warn('Supabase save failed', { status: res.status });
    return false;
  } catch (err) {
    log.error('Report save error', { error: String(err) });
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Load Report
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 보고서 ID로 조회. Supabase → 반환, 미연결 시 null.
 */
export async function loadReport(
  reportId: string,
): Promise<ESVAVerifiedReport | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) return null;

    const res = await fetch(
      `${supabaseUrl}/rest/v1/esva_reports?report_id=eq.${encodeURIComponent(reportId)}&select=report_json&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      },
    );

    if (!res.ok) return null;

    const rows = await res.json();
    if (rows.length === 0) return null;

    return rows[0].report_json as ESVAVerifiedReport;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — List Reports
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReportListItem {
  reportId: string;
  projectName: string;
  verdict: string;
  grade: string;
  compositeScore: number;
  createdAt: string;
}

/**
 * 사용자 보고서 목록 조회 (최신 순, 최대 50건).
 */
export async function listReports(
  userId: string,
  limit: number = 50,
): Promise<ReportListItem[]> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) return [];

    const res = await fetch(
      `${supabaseUrl}/rest/v1/esva_reports?user_id=eq.${userId}&select=report_id,project_name,verdict,grade,composite_score,created_at&order=created_at.desc&limit=${limit}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      },
    );

    if (!res.ok) return [];

    const rows = await res.json();
    return rows.map((r: Record<string, unknown>) => ({
      reportId: r.report_id as string,
      projectName: r.project_name as string,
      verdict: r.verdict as string,
      grade: r.grade as string,
      compositeScore: r.composite_score as number,
      createdAt: r.created_at as string,
    }));
  } catch {
    return [];
  }
}
