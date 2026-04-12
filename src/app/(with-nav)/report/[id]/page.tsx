'use client';

/**
 * ESVA Verification Report Page
 * -----------------------------
 * /report/[id] — 사용자에게 보이는 검증 보고서 페이지.
 * 보고서 ID로 조회하거나, 세션 스토리지에서 로드.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import VerificationReport from '@/components/VerificationReport';
import { CalcResultDashboard } from '@/components/CalcResultGauge';
import DrawingOverlay from '@/components/DrawingOverlay';
import type { ESVAVerifiedReport } from '@/agent/teams/types';

export default function ReportPage() {
  const params = useParams();
  const reportId = params.id as string;
  const [report, setReport] = useState<ESVAVerifiedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [reportId]);

  async function loadReport() {
    setLoading(true);
    setError(null);

    try {
      // 1차: 세션 스토리지에서 로드 (방금 생성된 보고서)
      const cached = sessionStorage.getItem(`esva-report-${reportId}`);
      if (cached) {
        setReport(JSON.parse(cached));
        setLoading(false);
        return;
      }

      // 2차: API에서 로드 (향후 Supabase 연동)
      // const res = await fetch(`/api/report/${reportId}`);
      // if (res.ok) { const data = await res.json(); setReport(data); }

      // 현재: 데모 보고서 생성
      setReport(generateDemoReport(reportId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '보고서를 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }

  function handleExport(format: 'pdf' | 'excel') {
    if (!report) return;
    if (format === 'pdf') {
      // report-pdf HTML 생성 → 새 창에서 인쇄
      import('@/lib/report-pdf').then(({ generatePDFResponse }) => {
        const html = generatePDFResponse(report);
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
      });
    } else {
      window.open(`/api/export?reportId=${report.reportId}&format=${format}`, '_blank');
    }
  }

  // 계산 결과 → 게이지 데이터 변환
  const gaugeResults = report?.teamResults
    .flatMap(tr => tr.calculations ?? [])
    .filter(c => c.standardRef)
    .map(c => ({
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
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <AlertTriangle size={48} className="text-amber-500" />
        <p className="text-lg font-medium text-[var(--text-primary)]">
          {error ?? '보고서를 찾을 수 없습니다.'}
        </p>
        <Link
          href="/tools/sld"
          className="flex items-center gap-2 text-sm text-[var(--color-primary)] hover:underline"
        >
          <ArrowLeft size={16} />
          SLD 분석으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-8">
      {/* 게이지 대시보드 */}
      {gaugeResults.length > 0 && (
        <div className="mx-auto mb-6 max-w-4xl">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">계산 결과 시각화</h2>
          <CalcResultDashboard results={gaugeResults} />
        </div>
      )}

      {/* 도면 오버레이 */}
      {report.markings.length > 0 && (
        <div className="mx-auto mb-6 max-w-4xl">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">도면 검증 마킹</h2>
          <DrawingOverlay markings={report.markings} width={800} height={400} />
        </div>
      )}

      {/* 상세 보고서 */}
      <VerificationReport report={report} onExport={handleExport} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Demo Report Generator
// ═══════════════════════════════════════════════════════════════════════════════

function generateDemoReport(reportId: string): ESVAVerifiedReport {
  return {
    reportId,
    createdAt: new Date().toISOString(),
    version: 'ESVA Report v1.0',
    projectName: '샘플 수변전 설비',
    projectType: '22.9kV 수전 설비',
    verdict: 'CONDITIONAL',
    grade: 'B+',
    compositeScore: 82,
    teamResults: [
      {
        teamId: 'TEAM-SLD',
        success: true,
        components: [
          { id: 'c1', type: 'transformer', label: 'TR-001 500kVA', confidence: 0.95 },
          { id: 'c2', type: 'breaker_vcb', label: 'VCB-001', confidence: 0.92 },
          { id: 'c3', type: 'breaker_acb', label: 'ACB-001 800A', confidence: 0.90 },
        ],
        calculations: [
          { id: 'calc-1', calculatorId: 'voltage-drop', label: 'TR → SWGR 전압강하', value: 1.8, unit: '%', compliant: true, standardRef: 'KEC 232.52' },
          { id: 'calc-2', calculatorId: 'voltage-drop', label: 'SWGR → MCC 전압강하', value: 3.5, unit: '%', compliant: false, standardRef: 'KEC 232.52' },
        ],
        standards: [
          { standard: 'KEC', clause: '232.52', title: '전압강하', judgment: 'FAIL', note: '3.5% > 3%' },
          { standard: 'KEC', clause: '212.3', title: '차단기 선정', judgment: 'PASS' },
        ],
        violations: [
          {
            id: 'v1', severity: 'critical', title: '전압강하 기준 초과',
            description: 'SWGR → MCC 구간 3.5% > 허용 3%',
            location: 'SWGR-001 → MCC-001',
            standardRef: 'KEC 232.52',
            suggestedFix: '케이블 35sq → 50sq 증가 검토',
          },
        ],
        confidence: 0.90,
        durationMs: 1250,
      },
      {
        teamId: 'TEAM-STD',
        success: true,
        calculations: [
          { id: 'calc-3', calculatorId: 'breaker-sizing', label: 'ACB 정격', value: 800, unit: 'A', compliant: true, standardRef: 'KEC 212.3' },
        ],
        standards: [
          { standard: 'KEC', clause: '311.1', title: '수전 설비', judgment: 'PASS' },
          { standard: 'KEC', clause: '142.5', title: '접지', judgment: 'PASS' },
        ],
        violations: [],
        confidence: 0.95,
        durationMs: 320,
      },
    ],
    debateResults: [
      {
        topic: 'SWGR → MCC 전압강하 판정',
        rounds: [{
          roundNumber: 1,
          topic: 'SWGR → MCC 전압강하',
          arguments: [
            { teamId: 'TEAM-SLD', topic: '전압강하', position: '3.5%', evidence: ['VD = 1.732 × 400 × 50 × 0.018/35 / 380 × 100'], verdict: 'disagree', confidence: 0.90 },
            { teamId: 'TEAM-STD', topic: '전압강하', position: 'KEC 232.52 분기 3% 초과', evidence: ['KEC 232.52: 분기회로 ≤ 3%'], verdict: 'disagree', confidence: 0.95 },
          ],
          consensus: true,
          consensusPosition: '부적합 — 케이블 증가 필요',
        }],
        finalConsensus: true,
        finalPosition: '부적합 — 35sq → 50sq 증가 시 2.4%로 적합',
        totalRounds: 1,
        maxRoundsReached: false,
        participatingTeams: ['TEAM-SLD', 'TEAM-STD'],
      },
    ],
    markings: [
      { id: 'm1', severity: 'success', location: 'TR → SWGR', message: 'TR → SWGR 전압강하: 적합', calculatedValue: '1.8%', limitValue: '3%', standardRef: 'KEC 232.52' },
      { id: 'm2', severity: 'error', location: 'SWGR → MCC', message: 'SWGR → MCC 전압강하: 기준 초과', detail: '3.5% > 허용 3%', calculatedValue: '3.5%', limitValue: '3%', standardRef: 'KEC 232.52', suggestedFix: '케이블 35sq → 50sq 증가' },
      { id: 'm3', severity: 'success', location: 'ACB-001', message: 'ACB 800A 차단기: 적합', calculatedValue: '800A', standardRef: 'KEC 212.3' },
      { id: 'm4', severity: 'success', location: '접지 시스템', message: '접지: 적합', standardRef: 'KEC 142.5' },
      { id: 'm5', severity: 'warning', location: 'SPD', message: '서지보호기 미확인', detail: '수전설비에 SPD 설치 권장', standardRef: 'KEC 534.1', suggestedFix: 'SPD Type 1+2 설치 검토' },
    ],
    summary: {
      totalComponents: 8,
      totalConnections: 7,
      totalCalculations: 3,
      passedChecks: 4,
      failedChecks: 1,
      warningChecks: 1,
      criticalViolations: [{
        id: 'v1', severity: 'critical', title: '전압강하 기준 초과',
        description: 'SWGR → MCC 구간 3.5% > 허용 3%',
        location: 'SWGR-001 → MCC-001', standardRef: 'KEC 232.52',
        suggestedFix: '케이블 35sq → 50sq 증가 검토',
      }],
      topRecommendations: [{
        id: 'rec1', category: 'safety', title: 'SPD 설치 권장',
        description: '수전설비 22.9kV에 SPD Type 1+2 설치로 뇌서지 보호 강화',
        impact: 'high',
      }],
      appliedStandards: ['KEC 2021'],
      textKo: '전체 5개 검증 항목 중 4개 적합, 1개 부적합. 종합 82점 (B+등급). SWGR→MCC 구간 전압강하 초과 수정 필요.',
      textEn: '4 of 5 checks passed. Score: 82 (Grade B+). SWGR→MCC voltage drop exceeds limit.',
    },
    receiptIds: [],
    hash: '',
  };
}
