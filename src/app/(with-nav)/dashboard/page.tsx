'use client';

/**
 * ESVA User Dashboard with Visualizations
 * -----------------------------------------
 * a. 내 계산 통계: 이번 달 계산 횟수 + top5 bar chart
 * b. 최근 계산: 최근 10개 영수증
 * c. 규격 업데이트: 최근 개정된 규격 알림
 * d. 글로벌 규격 비교: 국가별 비교 radar chart (프리셋 기준값)
 *
 * PART 1: Data hooks
 * PART 2: Dashboard sections
 * PART 3: Main page
 */

import { useState, useEffect } from 'react';
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

function useDashboardData(authenticated: boolean, authLoading: boolean) {
  const [calcUsage, setCalcUsage] = useState<CalcUsageData[]>([]);
  const [totalCalcs, setTotalCalcs] = useState(0);
  const [recentCalcs, setRecentCalcs] = useState<RecentCalc[]>([]);
  const [standardUpdates, setStandardUpdates] = useState<StandardUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    async function fetchDashboard() {
      if (!authenticated) {
        setError('로그인이 필요합니다.');
        setLoading(false);
        return;
      }

      try {
        // Get auth token for API call
        const { getIdToken } = await import('@/lib/firebase');
        const token = await getIdToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch('/api/dashboard', { headers });
        if (!res.ok) {
          throw new Error(res.status === 401 ? '로그인이 필요합니다.' : '대시보드 데이터를 불러올 수 없습니다.');
        }

        const json = await res.json();
        if (cancelled) return;

        if (json.success && json.data) {
          const d = json.data;
          setCalcUsage(d.calcUsage ?? []);
          setTotalCalcs(d.totalCalcs ?? 0);
          setRecentCalcs(d.recentCalcs ?? []);
          setStandardUpdates(d.standardUpdates ?? []);
        }
      } catch (err) {
        console.warn('[ESVA Dashboard] Fetch failed:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '대시보드 데이터를 불러올 수 없습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDashboard();
    return () => { cancelled = true; };
  }, [authenticated, authLoading]);

  return { calcUsage, totalCalcs, recentCalcs, standardUpdates, loading, error };
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
          <span className="text-xs text-[var(--text-tertiary)]">이번 달</span>
        </div>
      </div>
      {data.length > 0 ? (
        <CalcUsageChart data={data} height={250} />
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
            href={`/receipt/${calc.id}`}
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) return `${Math.floor(diffMs / 60000)}분 전`;
  if (diffHours < 24) return `${Math.floor(diffHours)}시간 전`;
  if (diffHours < 48) return '어제';
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { calcUsage, totalCalcs, recentCalcs, standardUpdates, loading, error } = useDashboardData(Boolean(user), authLoading);

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
            onClick={() => window.location.reload()}
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
          이번 달 계산 현황과 규격 업데이트를 한눈에 확인하세요.
        </p>
      </div>

      {/* Grid layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* a. 계산 통계 */}
        <CalcStatsSection data={calcUsage} total={totalCalcs} />

        {/* b. 최근 계산 */}
        <RecentCalcsSection calcs={recentCalcs} />

        {/* d. 글로벌 비교 */}
        <GlobalCompareSection />

        {/* c. 규격 업데이트 */}
        <StandardUpdatesSection updates={standardUpdates} />
      </div>
    </div>
  );
}
