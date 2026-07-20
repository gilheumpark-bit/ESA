'use client';

/**
 * ESVA Verification Report Page
 * -----------------------------
 * /report/[id] — 세션에 저장된 실검증 보고서만 표시.
 * 데모 폴백 제거: 없으면 404 상태 (거짓 점수 노출 금지).
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import VerificationReport from '@/components/VerificationReport';
import { CalcResultDashboard } from '@/components/CalcResultGauge';
import type { ESVAVerifiedReport } from '@/agent/teams/types';
import { useAuth } from '@/contexts/AuthContext';
import { verifyReportIntegrity } from '@/lib/report-integrity';

export default function ReportPage() {
  const params = useParams();
  const reportId = params.id as string;
  const { user, loading: authLoading } = useAuth();
  const [report, setReport] = useState<ESVAVerifiedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    async function loadReport() {
      setLoading(true);
      setError(null);
      setReport(null);

      try {
        // 1) 방금 생성한 세션 캐시도 해시를 재계산한 뒤 표시한다.
        const storageKey = `esva-report-${reportId}`;
        const cached = sessionStorage.getItem(storageKey);
        if (cached) {
          const parsed = JSON.parse(cached) as ESVAVerifiedReport;
          if (await verifyReportIntegrity(parsed)) {
            if (!cancelled) setReport(parsed);
            return;
          }
          sessionStorage.removeItem(storageKey);
        }

        // 2) 로그인 사용자는 소유자 필터가 적용된 영속 API에서 다시 읽는다.
        if (user) {
          const { getIdToken } = await import('@/lib/firebase');
          const token = await getIdToken();
          if (token) {
            const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: 'no-store',
            });
            if (response.ok) {
              const body = await response.json() as { data?: ESVAVerifiedReport };
              if (body.data && await verifyReportIntegrity(body.data)) {
                sessionStorage.setItem(storageKey, JSON.stringify(body.data));
                if (!cancelled) setReport(body.data);
                return;
              }
            }
          }
        }

        if (!cancelled) {
          setError(user
            ? '소유한 보고서를 찾을 수 없거나 무결성 검증에 실패했습니다.'
            : '이 세션에서 생성한 보고서를 찾을 수 없습니다. 로그인 후 생성한 보고서는 다른 세션에서도 다시 열 수 있습니다.');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '보고서를 불러올 수 없습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReport();
    return () => { cancelled = true; };
  }, [authLoading, reportId, user]);

  async function handleExport(format: 'pdf' | 'excel') {
    if (!report) return;
    if (format === 'pdf') {
      const { generatePDFResponse } = await import('@/lib/report-pdf');
      const html = generatePDFResponse(report);
      const w = window.open('', '_blank');
      if (w) {
        w.opener = null;
        w.document.write(html);
        w.document.close();
      }
      return;
    }

    // Excel: POST /api/export (GET은 405)
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'excel',
          receipt: {
            id: report.reportId,
            calculatorId: 'team-review',
            inputs: { reportId: report.reportId },
            outputs: {
              verdict: report.verdict,
              grade: report.grade,
              score: report.compositeScore,
              summary: report.summary,
            },
            createdAt: report.createdAt,
          },
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          (errBody as { error?: string }).error ?? `Export failed (${res.status})`,
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `esva-report-${report.reportId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Excel 내보내기 실패');
    }
  }

  const gaugeResults =
    report?.teamResults
      .flatMap((tr) => tr.calculations ?? [])
      .filter((c) => c.standardRef && Number.isFinite(c.value))
      .map((c) => ({
        value: c.value,
        unit: c.unit,
        limit: c.unit === '%' ? 3.0 : c.unit === 'A' ? c.value * 1.25 : c.value,
        label: c.label,
        standardRef: c.standardRef,
        direction: (c.unit === '%' ? 'below' : 'above') as 'below' | 'above',
      })) ?? [];

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <AlertTriangle size={48} className="text-amber-500" />
        <p className="max-w-md text-lg font-medium text-[var(--text-primary)]">
          {error ?? '보고서를 찾을 수 없습니다.'}
        </p>
        <p className="max-w-md text-sm text-[var(--text-secondary)]">
          데모 점수는 더 이상 표시하지 않습니다. 실제 검증 파이프라인을 실행한 뒤에만 보고서를 볼 수 있습니다.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/tools/sld"
            className="flex items-center gap-2 text-sm text-[var(--color-primary)] hover:underline"
          >
            <ArrowLeft size={16} />
            SLD 분석
          </Link>
          <Link
            href="/calc"
            className="text-sm text-[var(--color-primary)] hover:underline"
          >
            계산기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-8">
      {gaugeResults.length > 0 && (
        <div className="mx-auto mb-6 max-w-4xl">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            계산 결과 시각화
          </h2>
          <CalcResultDashboard results={gaugeResults} />
        </div>
      )}

      <VerificationReport report={report} onExport={handleExport} />
    </div>
  );
}
