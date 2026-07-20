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
import { DrawingEvidenceOverlay } from '@/components/DrawingEvidenceOverlay';
import { DrawingIntelligenceReport } from '@/components/DrawingIntelligenceReport';

type SourceState = 'idle' | 'loading' | 'ready' | 'missing' | 'unsupported' | 'invalid';

export default function ReportPage() {
  const params = useParams();
  const reportId = params.id as string;
  const { user, loading: authLoading } = useAuth();
  const [report, setReport] = useState<ESVAVerifiedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceState, setSourceState] = useState<SourceState>('idle');
  const [activeEvidenceIds, setActiveEvidenceIds] = useState<string[]>([]);

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

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const intelligence = report?.drawingIntelligence;

    async function loadSource() {
      // Defer state synchronization so the effect body itself only coordinates
      // the external IndexedDB/object-URL lifecycle.
      await Promise.resolve();
      if (cancelled) return;
      setSourceUrl(null);
      setActiveEvidenceIds([]);
      if (!intelligence) {
        setSourceState('idle');
        return;
      }
      if (
        intelligence.source.assetKey !== intelligence.drawingHash
        || intelligence.drawingHash !== report?.drawingSynthesis?.drawingHash
      ) {
        setSourceState('invalid');
        return;
      }
      if (!intelligence.source.mimeType.startsWith('image/')) {
        setSourceState('unsupported');
        return;
      }

      setSourceState('loading');
      try {
        const { loadDrawingAsset } = await import('@/lib/drawing-asset-store');
        const asset = await loadDrawingAsset(intelligence.source.assetKey);
        if (cancelled) return;
        if (!asset || asset.mimeType !== intelligence.source.mimeType) {
          setSourceState('missing');
          return;
        }
        objectUrl = URL.createObjectURL(asset.blob);
        setSourceUrl(objectUrl);
        setSourceState('ready');
      } catch {
        if (!cancelled) setSourceState('missing');
      }
    }

    void loadSource();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [report]);

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

  const drawingIntelligence = report.drawingIntelligence;
  const selectEvidence = (ids: string[]) => {
    const next = [...new Set(ids)];
    setActiveEvidenceIds((current) => (
      current.length === next.length && current.every((id, index) => id === next[index]) ? [] : next
    ));
  };

  return (
    <div className="px-4 py-8">
      {drawingIntelligence && (
        <section aria-labelledby="drawing-intelligence-heading" className="mx-auto mb-10 max-w-[92rem]">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border-default)] pb-4">
            <div>
              <p className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[var(--color-accent)]">SOURCE-LINKED REVIEW</p>
              <h1 id="drawing-intelligence-heading" className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">도면 전체 판독 및 관계 검증</h1>
            </div>
            <p className="font-mono text-[10px] text-[var(--text-tertiary)]">
              SHA-256 {drawingIntelligence.drawingHash.slice(0, 12)}…
            </p>
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(520px,0.85fr)]">
            <div className="min-w-0 xl:sticky xl:top-20">
              {sourceState === 'ready' && sourceUrl ? (
                <DrawingEvidenceOverlay
                  src={sourceUrl}
                  report={drawingIntelligence}
                  activeIds={activeEvidenceIds}
                  onSelect={(id) => selectEvidence([id])}
                />
              ) : sourceState === 'loading' ? (
                <div className="flex min-h-80 items-center justify-center border border-[var(--border-default)] bg-[var(--bg-secondary)]">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                    해시가 일치하는 원본 도면을 불러오는 중…
                  </div>
                </div>
              ) : (
                <div className="border border-amber-300 bg-amber-50 px-5 py-5 dark:border-amber-900 dark:bg-amber-950/20">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="mt-0.5 shrink-0 text-[var(--color-warning)]" aria-hidden="true" />
                    <div>
                      <h2 className="font-semibold text-[var(--text-primary)]">원본 위치 오버레이 HOLD</h2>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {sourceState === 'unsupported'
                          ? '이 파일 형식은 브라우저 이미지 오버레이를 지원하지 않습니다. 아래 판독표와 근거 ID는 계속 확인할 수 있습니다.'
                          : sourceState === 'invalid'
                            ? '보고서와 원본 도면의 해시가 일치하지 않아 위치 오버레이를 차단했습니다.'
                            : '원본 도면은 보안을 위해 업로드한 브라우저에만 보관됩니다. 다른 기기·브라우저에서는 아래 판독표만 표시됩니다.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <dl className="grid grid-cols-2 gap-px border-x border-b border-[var(--border-default)] bg-[var(--border-default)] text-xs">
                <div className="bg-[var(--bg-primary)] px-3 py-2.5"><dt className="text-[var(--text-tertiary)]">원본 크기</dt><dd className="mt-0.5 font-mono font-semibold">{drawingIntelligence.source.width} × {drawingIntelligence.source.height}</dd></div>
                <div className="bg-[var(--bg-primary)] px-3 py-2.5"><dt className="text-[var(--text-tertiary)]">분석 페이지</dt><dd className="mt-0.5 font-mono font-semibold">{drawingIntelligence.source.page}</dd></div>
              </dl>
            </div>

            <DrawingIntelligenceReport
              report={drawingIntelligence}
              activeIds={activeEvidenceIds}
              onSelect={selectEvidence}
            />
          </div>
        </section>
      )}

      {gaugeResults.length > 0 && (
        <div className="mx-auto mb-6 max-w-4xl">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            계산 결과 시각화
          </h2>
          <CalcResultDashboard results={gaugeResults} />
        </div>
      )}

      <div className="mx-auto max-w-5xl">
        <VerificationReport report={report} onExport={handleExport} />
      </div>
    </div>
  );
}
