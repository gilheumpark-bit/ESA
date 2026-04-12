'use client';

/**
 * ESVA User Dashboard with Visualizations
 * -----------------------------------------
 * a. 내 계산 통계: 이번 달 계산 횟수 + top5 bar chart
 * b. 최근 계산: 최근 10개 영수증
 * c. 규격 업데이트: 최근 개정된 규격 알림
 * d. 글로벌 규격 비교: 국가별 비교 radar chart
 * e. 뉴스 브리핑: 카테고리별 TOP 3
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
  Newspaper,
  ArrowRight,
  TrendingUp,
  ExternalLink,
} from 'lucide-react';
import CalcUsageChart, { type CalcUsageData } from '@/components/charts/CalcUsageChart';
import GlobalCompareChart, { PRESET_COMPARISONS, type CountryConfig } from '@/components/charts/GlobalCompareChart';
import { useAuth } from '@/contexts/AuthContext';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Data Hooks (Mock data for MVP, production → Supabase)
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

interface NewsItem {
  id: string;
  title: string;
  category: string;
  link: string;
  date: string;
}

function useDashboardData() {
  const [calcUsage, setCalcUsage] = useState<CalcUsageData[]>([]);
  const [totalCalcs, setTotalCalcs] = useState(0);
  const [recentCalcs, setRecentCalcs] = useState<RecentCalc[]>([]);
  const [standardUpdates, setStandardUpdates] = useState<StandardUpdate[]>([]);
  const [news, _setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchDashboard() {
      try {
        // Get auth token for API call
        const { getIdToken } = await import('@/lib/firebase');
        const token = await getIdToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch('/api/dashboard', { headers });
        if (!res.ok) throw new Error(`Dashboard API returned ${res.status}`);

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
        console.warn('[ESVA Dashboard] Fetch failed, using empty state:', err);
        // On error: leave empty arrays (graceful degradation)
        if (!cancelled) {
          setCalcUsage([]);
          setTotalCalcs(0);
          setRecentCalcs([]);
          setStandardUpdates([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDashboard();
    return () => { cancelled = true; };
  }, []);

  return { calcUsage, totalCalcs, recentCalcs, standardUpdates, news, loading };
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
      <CalcUsageChart data={data} height={250} />
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
    { key: 'KR', name: '한국 (KEC)', color: '#3b82f6' },
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

function NewsBriefingSection({ news }: { news: NewsItem[] }) {
  // Group by category, take top 3
  const categories = [...new Set(news.map(n => n.category))];

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
      <div className="mb-4 flex items-center gap-2">
        <Newspaper size={18} className="text-[var(--color-primary)]" />
        <h2 className="text-base font-semibold text-[var(--text-primary)]">뉴스 브리핑</h2>
      </div>
      <div className="space-y-4">
        {categories.slice(0, 3).map(category => {
          const items = news.filter(n => n.category === category).slice(0, 3);
          return (
            <div key={category}>
              <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--text-tertiary)]">
                {category}
              </h3>
              <div className="space-y-1.5">
                {items.map(item => (
                  <a
                    key={item.id}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <span className="flex-1 truncate">{item.title}</span>
                    <ExternalLink size={12} className="shrink-0 opacity-50" />
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
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
  const { user } = useAuth();
  const { calcUsage, totalCalcs, recentCalcs, standardUpdates, news, loading } = useDashboardData();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
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

        {/* e. 뉴스 브리핑 (full width) */}
        <div className="lg:col-span-2">
          <NewsBriefingSection news={news} />
        </div>
      </div>
    </div>
  );
}
