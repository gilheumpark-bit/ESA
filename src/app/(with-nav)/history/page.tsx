'use client';

/**
 * Calculation History Page — /history
 *
 * PART 1: Types & constants
 * PART 2: Filter/search controls
 * PART 3: History table
 * PART 4: CSV export
 * PART 5: Main page component
 */

import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureResource } from '@/hooks/useFeatureResource';
import { requestFeatureJson } from '@/lib/feature-request';
import { featureAuthenticatedFetch } from '@/lib/feature-auth';
import { featureCsv } from '@/lib/feature-output';
import { cachedHistory, decodeHistoryRows, type HistoryRecord as Receipt } from '@/lib/history-read-model';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  History,
  Search,
  Download,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { EmptyHistory } from '@/components/EmptyState';
import { CALCULATOR_NAMES } from '@/lib/calculator-params';
import { CALCULATOR_CATALOG, CALC_CATEGORY_LABELS, calculatorHref } from '@/lib/calculator-catalog';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Constants
// ═══════════════════════════════════════════════════════════════════════════════

interface HistoryEntry {
  id: string;
  calcId: string;
  calcName: string;
  category: string;
  date: string;
  keyInput: string;
  keyResult: string;
  judgment: 'pass' | 'fail' | 'none';
}

/** 분야 필터 — 카탈로그에 있는 분야를 그대로 쓴다. 손으로 추리면 조명·전동기처럼
    통째로 빠지는 분야가 생긴다(실측 2026-07-26: 12개 중 7개만 있었다). */
const CATEGORIES = [
  { value: '', label: '전체 카테고리' },
  ...Object.entries(CALC_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
];


// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function receiptToEntry(receipt: Receipt): HistoryEntry {
  const firstInputKey = Object.keys(receipt.inputs)[0] ?? '';
  const firstInputVal = receipt.inputs[firstInputKey];

  return {
    id: receipt.id,
    calcId: receipt.calcId,
    calcName: CALCULATOR_NAMES[receipt.calcId]?.name ?? receipt.calcId,
    category: CALCULATOR_CATALOG[receipt.calcId]?.category ?? 'other',
    date: receipt.calculatedAt,
    keyInput: firstInputVal != null ? `${firstInputKey}: ${String(firstInputVal)}` : '-',
    keyResult: receipt.result
      ? `${receipt.result.value} ${receipt.result.unit}`
      : '-',
    judgment: receipt.result?.judgment?.pass === true
      ? 'pass'
      : receipt.result?.judgment?.pass === false
        ? 'fail'
        : 'none',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — CSV Export
// ═══════════════════════════════════════════════════════════════════════════════

function exportCsv(entries: HistoryEntry[]): void {
  const csv = featureCsv(['날짜', '계산기', '주요입력', '결과', '판정'], entries.map((entry) => [
    Number.isFinite(Date.parse(entry.date)) ? new Date(entry.date).toLocaleDateString('ko-KR') : '기록 시각 미확인',
    entry.calcName, entry.keyInput, entry.keyResult, entry.judgment === 'pass' ? 'PASS' : entry.judgment === 'fail' ? 'FAIL' : '-',
  ]));
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ESVA_history_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function HistoryPage() {
  const router = useRouter();
  // Load receipts from sessionStorage on mount
  const { user, loading: authLoading } = useAuth();
  const [exportError, setExportError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [judgmentFilter, setJudgmentFilter] = useState<'' | 'pass' | 'fail'>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  /**
   * 비로그인이면 이 목록은 sessionStorage 뿐이다 — 탭을 닫으면 사라진다.
   * 화면은 "계산 기록" 이라 부르고 CSV 내보내기까지 주면서 그 사실을 말하지
   * 않았다(실측 2026-07-26). 사라질 기록을 영구 기록처럼 보여주면 안 된다.
   */
  const signedIn = authLoading ? null : Boolean(user);
  const uid = user?.uid;
  const load = useCallback(async (signal: AbortSignal) => {
    const warnings: string[] = [];
    let local: Receipt[] = [], account: Receipt[] = [];
    try {
      const cached = cachedHistory(sessionStorage, uid); local = cached.records;
      if (cached.skipped) warnings.push(`손상 또는 누락된 탭 기록 ${cached.skipped}건을 표시하지 않았습니다. 원본 저장값은 보존했습니다.`);
    } catch (error) { warnings.push(error instanceof Error ? error.message : '탭 기록을 읽지 못했습니다.'); }
    if (uid) {
      try { account = await requestFeatureJson('/api/calculate?page=1&pageSize=100', { signal }, decodeHistoryRows, featureAuthenticatedFetch); }
      catch (error) { if (signal.aborted) throw error; warnings.push(error instanceof Error ? error.message : '계정 이력 동기화 실패'); }
    }
    const records = [...new Map([...local, ...account].map((record) => [record.id, record])).values()];
    const entries = records.map(receiptToEntry).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
    return { entries, warnings };
  }, [uid]);
  const resource = useFeatureResource(authLoading ? null : `history:${uid ?? 'anonymous'}`, load);
  const entries = useMemo(() => resource.data?.entries ?? [], [resource.data]);

  const filtered = useMemo(() => {
    let result = entries;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.calcName.toLowerCase().includes(q) ||
          e.keyInput.toLowerCase().includes(q) ||
          e.keyResult.toLowerCase().includes(q),
      );
    }

    if (categoryFilter) {
      result = result.filter((e) => e.category === categoryFilter);
    }

    if (judgmentFilter) {
      result = result.filter((e) => e.judgment === judgmentFilter);
    }

    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      result = result.filter((e) => new Date(e.date).getTime() >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000; // include end day
      result = result.filter((e) => new Date(e.date).getTime() < to);
    }

    return result;
  }, [entries, search, categoryFilter, judgmentFilter, dateFrom, dateTo]);

  const handleExportCsv = useCallback(() => {
    try { exportCsv(filtered); setExportError(null); } catch { setExportError('이력을 내보내지 못했습니다. 다시 시도해 주세요.'); }
  }, [filtered]);

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      {/* Header */}
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <History size={28} className="text-[var(--color-primary)]" />
            계산 기록
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Calculation History
          </p>
          {signedIn === false && (
            <p className="mt-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
              지금 이 기록은 <strong>브라우저 탭을 닫으면 사라집니다</strong>.{' '}
              <Link href="/login" className="text-[var(--color-primary)] hover:underline">
                로그인
              </Link>
              후 계정 저장소가 정상 연결되면 저장된 이력을 조회합니다. 남겨야 할 기록은 CSV 로 먼저 내려받으세요.
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[var(--text-secondary)]">현재 탭 기록{user ? ' + 계정의 최근 최대 100건' : ''} · 필터 결과만 CSV로 내보냅니다.</p>
          <button type="button" onClick={resource.reload} disabled={resource.loading} className="min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50">이력 새로 불러오기</button>
        </div>
        {resource.data?.warnings.map((warning) => <p key={warning} role="status" className="mb-3 rounded-lg border p-3 text-sm">{warning}</p>)}
        {(resource.error || exportError) && <p role="alert" className="mb-3 text-sm text-[var(--drawing-error-text)]">{resource.error ?? exportError}</p>}
        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-end gap-3">
          {/* Search */}
          <div className="relative min-w-0 basis-56 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              aria-label="계산 기록 검색"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="검색..."
              className="min-h-11 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          {/* Category filter */}
          <select
            aria-label="계산기 카테고리"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="min-h-11 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)]"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          {/* Judgment filter */}
          <select
            aria-label="판정 결과"
            value={judgmentFilter}
            onChange={(e) => setJudgmentFilter(e.target.value as '' | 'pass' | 'fail')}
            className="min-h-11 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)]"
          >
            <option value="">전체 판정</option>
            <option value="pass">PASS</option>
            <option value="fail">FAIL</option>
          </select>

          {/* Date range */}
          <input
            aria-label="조회 시작일"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="min-h-11 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)]"
          />
          <span className="text-sm text-[var(--text-tertiary)]">~</span>
          <input
            aria-label="조회 종료일"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="min-h-11 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)]"
          />

          {/* Export button */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-4 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
          >
            <Download size={16} />
            CSV 내보내기
          </button>
        </div>

        {/* Table or empty state */}
        {authLoading || resource.loading ? <p role="status" className="p-6 text-sm">계산 이력을 확인하고 있습니다.</p>
          : !entries.length && Boolean(resource.error || resource.data?.warnings.length) ? <p className="p-6 text-sm">현재 조회를 완료하지 못한 기록이 있습니다. 이력이 없는 것으로 판단하지 않습니다.</p>
          : filtered.length === 0 && entries.length > 0 ? <div className="p-6 text-center"><p>선택한 필터에 맞는 이력이 없습니다.</p><button type="button" className="mt-3 min-h-11 rounded-lg border px-3" onClick={() => { setSearch(''); setCategoryFilter(''); setJudgmentFilter(''); setDateFrom(''); setDateTo(''); }}>이력 필터 초기화</button></div>
          : filtered.length === 0 ? (
          <EmptyHistory onExample={(calcId) => router.push(calculatorHref(calcId))} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border-default)]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--bg-tertiary)]">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                    날짜
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                    계산기
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                    주요 입력
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                    결과
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                    판정
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[var(--bg-primary)]">
                {filtered.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-[var(--border-default)] transition-colors last:border-b-0 hover:bg-[var(--bg-tertiary)]"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-[var(--text-secondary)]">
                      {new Date(entry.date).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/receipt/${encodeURIComponent(entry.id)}`}
                        className="text-sm font-medium text-[var(--color-primary)] hover:underline"
                      >
                        {entry.calcName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                      {entry.keyInput}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-[var(--text-primary)]">
                      {entry.keyResult}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {entry.judgment === 'pass' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle2 size={12} />
                          PASS
                        </span>
                      )}
                      {entry.judgment === 'fail' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          <XCircle size={12} />
                          FAIL
                        </span>
                      )}
                      {entry.judgment === 'none' && (
                        <span className="text-xs text-[var(--text-tertiary)]">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        {filtered.length > 0 && (
          <p className="mt-3 text-right text-xs text-[var(--text-tertiary)]">
            {filtered.length}건의 기록
          </p>
        )}
      </div>
    </div>
  );
}
