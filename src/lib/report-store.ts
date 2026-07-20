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
import { verifyReportIntegrity } from '@/lib/report-integrity';

const log = createLogger('report-store');

function getServerConfig(): { url: string; serviceKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceKey ? { url, serviceKey } : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Save Report
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 보고서를 Supabase에 저장. 실패 시 false 반환.
 */
export async function saveReport(
  report: ESVAVerifiedReport,
  userId: string,
): Promise<boolean> {
  try {
    const config = getServerConfig();
    if (!config || !userId || !(await verifyReportIntegrity(report))) {
      log.warn('Secure report persistence unavailable or report integrity invalid');
      return false;
    }
    const res = await fetch(`${config.url}/rest/v1/esva_reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        report_id: report.reportId,
        user_id: userId,
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
  userId: string,
): Promise<ESVAVerifiedReport | null> {
  try {
    const config = getServerConfig();
    if (!config || !reportId || !userId) return null;

    const res = await fetch(
      `${config.url}/rest/v1/esva_reports?report_id=eq.${encodeURIComponent(reportId)}&user_id=eq.${encodeURIComponent(userId)}&select=report_json&limit=1`,
      {
        headers: {
          apikey: config.serviceKey,
          Authorization: `Bearer ${config.serviceKey}`,
        },
      },
    );

    if (!res.ok) return null;

    const rows = await res.json() as Array<{ report_json?: ESVAVerifiedReport }>;
    if (!Array.isArray(rows) || rows.length === 0 || !rows[0].report_json) return null;

    const report = rows[0].report_json;
    return await verifyReportIntegrity(report) ? report : null;
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
    const config = getServerConfig();
    if (!config || !userId) return [];

    const res = await fetch(
      `${config.url}/rest/v1/esva_reports?user_id=eq.${encodeURIComponent(userId)}&select=report_id,project_name,verdict,grade,composite_score,created_at&order=created_at.desc&limit=${Math.min(Math.max(limit, 1), 50)}`,
      {
        headers: {
          apikey: config.serviceKey,
          Authorization: `Bearer ${config.serviceKey}`,
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
