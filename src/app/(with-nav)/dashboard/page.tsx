'use client';

/**
 * ESVA User Dashboard with Visualizations
 * -----------------------------------------
 * a. 내 계산 통계: 최근 30일 계산 횟수 + top5 bar chart
 * b. 최근 계산: 최근 10개 영수증
 * c. 규격 업데이트: 최근 개정된 규격 알림
 * d. 글로벌 규격 비교: 국가별 비교 radar chart (프리셋 기준값)
 *
 * PART 1: Data hooks
 * PART 2: Dashboard sections
 * PART 3: Main page
 */

import { useState, useCallback } from 'react';
import { useFeatureResource } from '@/hooks/useFeatureResource';
import { requestFeatureJson, relativeActivityTime } from '@/lib/feature-request';
import { featureAuthenticatedFetch } from '@/lib/feature-auth';
import { decodeDashboard } from '@/lib/feature-read-models';
import Link from 'next/link';
import {
  Calculator,
  Clock,
  FileText,
  Globe,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import type { CalcUsageData } from '@/components/charts/CalcUsageChart';
import { PRESET_COMPARISONS, type CountryConfig } from '@/components/charts/GlobalCompareChart';

// 차트 라이브러리(recharts) 번들 분리 — 대시보드 진입 시에만 로드
const CalcUsageChart = dynamic(() => import('@/components/charts/CalcUsageChart'), { ssr: false });
const GlobalCompareChart = dynamic(() => import('@/components/charts/GlobalCompareChart'), { ssr: false });
import { useAuth } from '@/contexts/AuthContext';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Data Hooks
// ═══════════════════════════════════════════════════════════════════════════════

interface RecentCalc {
  id: string;
  calculatorName: string;
  calculatorId: string;
  createdAt: string;
  summary: string;
}

interface StandardUpdate {
  id: string;
  name: string;
  description: string;
  date: string;
  link?: string;
}

function useDashboardData(uid: string | undefined, authLoading: boolean) {
  const loader = useCallback((signal: AbortSignal) => requestFeatureJson('/api/dashboard', { signal }, decodeDashboard, featureAuthenticatedFetch), []);
  const resource = useFeatureResource(authLoading || !uid ? null : `dashboard:${uid}`, loader);
  return { calcUsage: resource.data?.calcUsage ?? [], totalCalcs: resource.data?.totalCalcs ?? 0,
    recentCalcs: resource.data?.recentCalcs ?? [], standardUpdates: resource.data?.standardUpdates ?? [],
    warnings: resource.data?.warnings ?? [], usageComplete: resource.data?.usageComplete ?? true,
    loading: authLoading || resource.loading, error: !authLoading && !uid ? '로그인이 필요합니다.' : resource.error,
    reload: resource.reload };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Dashboard Sections
// ═══════════════════════════════════════════════════════════════════════════════

function CalcStatsSection({ data, total }: { data: CalcUsageData[]; total: number }) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator size={18} className="text-[var(--color-primary)]" />
          <h2 className="text-base font-semibold text-[var(--text-primary)]">내 계산 통계</h2>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-secondary)] px-3 py-1.5">
          <TrendingUp size={14} className="text-green-500" />
          <span className="text-sm font-bold text-[var(--text-primary)]">{total}</span>
          <span className="text-xs text-[var(--text-tertiary)]">최근 30일</span>
        </div>
      </div>
      {data.length > 0 ? (
        <>
          <CalcUsageChart data={data} height={250} />
          <details className="mt-2 text-sm"><summary className="min-h-11 cursor-pointer">계산 통계 표로 보기</summary>
            <table className="w-full text-left"><caption className="sr-only">최근 30일 계산기별 사용 횟수</caption>
              <thead><tr><th scope="col">계산기</th><th scope="col">횟수</th></tr></thead>
              <tbody>{data.map((row) => <tr key={row.calculatorId}><th scope="row" className="font-normal">{row.name}</th><td>{row.count}</td></tr>)}</tbody>
            </table>
          </details>
        </>
      ) : (
        <p className="flex h-[250px] items-center justify-center text-sm text-[var(--text-tertiary)]">
          최근 30일 계산 기록이 없습니다.
        </p>
      )}
    </div>
  );
}

function RecentCalcsSection({ calcs }: { calcs: RecentCalc[] }) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-[var(--color-primary)]" />
          <h2 className="text-base font-semibold text-[var(--text-primary)]">최근 계산</h2>
        </div>
        <Link
          href="/receipt"
          className="flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:underline"
        >
          전체 보기 <ArrowRight size={12} />
        </Link>
      </div>
      <div className="space-y-2">
        {calcs.length === 0 && <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">최근 계산이 없습니다.</p>}
        {calcs.map(calc => (
          <Link
            key={calc.id}
            href={`/receipt/${encodeURIComponent(calc.id)}`}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--bg-secondary)]"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-xs font-bold text-[var(--color-primary)]">
              {calc.calculatorName.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                {calc.calculatorName}
              </p>
              <p className="truncate text-xs text-[var(--text-tertiary)]">{calc.summary}</p>
            </div>
            <span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">
              {formatDate(calc.createdAt)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StandardUpdatesSection({ updates }: { updates: StandardUpdate[] }) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
      <div className="mb-4 flex items-center gap-2">
        <FileText size={18} className="text-[var(--color-primary)]" />
        <h2 className="text-base font-semibold text-[var(--text-primary)]">규격 업데이트</h2>
      </div>
      <div className="space-y-3">
        {updates.length === 0 && <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">도착한 규격 업데이트 알림이 없습니다.</p>}
        {updates.map(update => (
          <div
            key={update.id}
            className="rounded-lg border border-[var(--border-default)] px-4 py-3"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{update.name}</p>
              <span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">{update.date}</span>
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{update.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function GlobalCompareSection() {
  type PresetKey = keyof typeof PRESET_COMPARISONS;
  const [selectedPreset, setSelectedPreset] = useState<PresetKey>('voltageDrop');
  const preset = PRESET_COMPARISONS[selectedPreset];

  const countries: CountryConfig[] = [
    { key: 'KR', name: '한국 (KEC)', color: '#1e3a5f' },
    { key: 'US', name: '미국 (NEC)', color: '#ef4444' },
    { key: 'IEC', name: 'IEC', color: '#10b981' },
    { key: 'JP', name: '일본 (JEAC)', color: '#f59e0b' },
  ];

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={18} className="text-[var(--color-primary)]" />
          <h2 className="text-base font-semibold text-[var(--text-primary)]">글로벌 규격 비교</h2>
          <span className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
            프리셋 예시
          </span>
        </div>
        <select
          aria-label="비교할 규격 예시"
          value={selectedPreset}
          onChange={e => setSelectedPreset(e.target.value as PresetKey)}
          className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs"
        >
          {Object.entries(PRESET_COMPARISONS).map(([key, val]) => (
            <option key={key} value={key}>{val.title}</option>
          ))}
        </select>
      </div>
      <GlobalCompareChart
        data={preset.data}
        countries={countries}
        height={300}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function formatDate(value: string): string { return relativeActivityTime(value); }

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { calcUsage, totalCalcs, recentCalcs, standardUpdates, loading, error, reload, warnings, usageComplete } = useDashboardData(user?.uid, authLoading);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="대시보드 불러오는 중">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" aria-hidden="true" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">대시보드를 열 수 없습니다</h1>
        <p className="mt-2 text-sm text-[var(--color-error)]" role="alert">{error}</p>
        {/* '다시 시도' 는 같은 라우트 Link 라 재조회가 안 됐다 — 실제 재조회를
            위해 reload 버튼으로 교체 (bug L2). 비로그인은 /login 이동 유지. */}
        {user ? (
          <button
            type="button"
            onClick={reload}
            className="mt-5 inline-flex text-sm text-[var(--color-primary)] hover:underline"
          >
            다시 시도
          </button>
        ) : (
          <Link href="/login" className="mt-5 inline-flex text-sm text-[var(--color-primary)] hover:underline">
            로그인하기
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          {user?.displayName ? `${user.displayName}님의 대시보드` : '대시보드'}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          최근 30일 계산 현황과 규격 업데이트를 한눈에 확인하세요.
        </p>
      </div>

      <nav aria-label="업무 바로가기" className="mb-6 flex flex-wrap gap-3">
        <Link href="/tools/sld" className="min-h-11 rounded-lg border px-4 py-3 text-sm">새 도면 분석</Link>
        <Link href="/projects" className="min-h-11 rounded-lg border px-4 py-3 text-sm">프로젝트 관리</Link>
        <Link href="/history" className="min-h-11 rounded-lg border px-4 py-3 text-sm">계산 이력</Link>
      </nav>
      {!usageComplete && <p role="status" className="mb-4 text-sm">사용량 분포는 일부 기록 기준입니다. 총계와 상위 계산기 비율을 같은 모집단으로 해석하지 마세요.</p>}
      {/* Grid layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* a. 계산 통계 */}
        <CalcStatsSection data={calcUsage} total={totalCalcs} />

        {/* b. 최근 계산 */}
        <RecentCalcsSection calcs={recentCalcs} />

        {/* d. 글로벌 비교 */}
        <GlobalCompareSection />

        {/* c. 규격 업데이트 */}
        {warnings.includes('standard_updates_unavailable')
          ? <section className="rounded-xl border p-5"><h2 className="font-semibold">규격 업데이트</h2><p role="status" className="mt-2 text-sm">업데이트 알림 조회에 실패했습니다. 업데이트가 없다는 뜻이 아닙니다.</p><button type="button" onClick={reload} className="mt-3 min-h-11 rounded-lg border px-3">다시 시도</button></section>
          : <StandardUpdatesSection updates={standardUpdates} />}
      </div>
    </div>
  );
}
