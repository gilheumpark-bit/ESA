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

import { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  History,
  Search,
  Download,
  CheckCircle2,
  XCircle,
  FileText,
} from 'lucide-react';
import type { Receipt } from '@/engine/receipt/types';
import { EmptyHistory } from '@/components/EmptyState';

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

const CALC_DISPLAY_NAMES: Record<string, { name: string; category: string }> = {
  'single-phase-power': { name: '단상 전력', category: 'power' },
  'three-phase-power': { name: '3상 전력', category: 'power' },
  'voltage-drop': { name: '전압 강하', category: 'voltage-drop' },
  'transformer-capacity': { name: '변압기 용량', category: 'transformer' },
  'cable-sizing': { name: '케이블 사이징', category: 'cable' },
  'short-circuit': { name: '단락 전류', category: 'protection' },
  'breaker-sizing': { name: '차단기 선정', category: 'protection' },
  'ground-resistance': { name: '접지 저항', category: 'grounding' },
  'solar-generation': { name: '태양광 발전량', category: 'renewable' },
  'battery-capacity': { name: '배터리 용량', category: 'renewable' },
};

const CATEGORIES = [
  { value: '', label: '전체 카테고리' },
  { value: 'power', label: '전력' },
  { value: 'voltage-drop', label: '전압강하' },
  { value: 'transformer', label: '변압기' },
  { value: 'cable', label: '케이블' },
  { value: 'protection', label: '보호' },
  { value: 'grounding', label: '접지' },
  { value: 'renewable', label: '신재생' },
];

const STORAGE_PREFIX = 'esa-receipt-';
const INDEX_KEY = 'esa-receipt-index';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function receiptToEntry(receipt: Receipt): HistoryEntry {
  const meta = CALC_DISPLAY_NAMES[receipt.calcId];
  const firstInputKey = Object.keys(receipt.inputs)[0] ?? '';
  const firstInputVal = receipt.inputs[firstInputKey];

  return {
    id: receipt.id,
    calcId: receipt.calcId,
    calcName: meta?.name ?? receipt.calcId,
    category: meta?.category ?? 'other',
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

function loadCachedReceipts(): Receipt[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(INDEX_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    const receipts: Receipt[] = [];
    for (const id of ids) {
      const data = sessionStorage.getItem(STORAGE_PREFIX + id);
      if (data) {
        receipts.push(JSON.parse(data) as Receipt);
      }
    }
    return receipts;
  } catch {
    return [];
  }
}

/** Supabase에서 영구 저장된 이력 로드 (로그인 유저) */
async function loadSupabaseReceipts(userId: string): Promise<Receipt[]> {
  try {
    const { listUserCalculations } = await import('@/lib/supabase');
    const result = await listUserCalculations(userId, { pageSize: 100 });
    return result.data.map(r => ({
      id: r.id ?? '',
      calcId: r.calculator_id,
      inputs: r.inputs as Record<string, unknown>,
      result: r.outputs as Receipt['result'],
      calculatedAt: r.created_at ?? new Date().toISOString(),
    })) as Receipt[];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — CSV Export
// ═══════════════════════════════════════════════════════════════════════════════

function exportCsv(entries: HistoryEntry[]): void {
  const header = '날짜,계산기,주요입력,결과,판정';
  const rows = entries.map((e) =>
    [
      new Date(e.date).toLocaleDateString('ko-KR'),
      e.calcName,
      `"${e.keyInput}"`,
      `"${e.keyResult}"`,
      e.judgment === 'pass' ? 'PASS' : e.judgment === 'fail' ? 'FAIL' : '-',
    ].join(','),
  );
  const csv = '\uFEFF' + [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ESVA_history_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function HistoryPage() {
  // Load receipts from sessionStorage on mount
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [judgmentFilter, setJudgmentFilter] = useState<'' | 'pass' | 'fail'>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    async function load() {
      // 1) sessionStorage 캐시 (즉시)
      const cached = loadCachedReceipts();
      const mapped = cached.map(receiptToEntry).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
      setEntries(mapped);

      // 2) Supabase 영구 이력 (로그인 유저)
      try {
        const { useAuth } = await import('@/contexts/AuthContext');
        // AuthContext는 hook이라 여기서 직접 사용 불가 — userId를 다른 방법으로 가져옴
        const { getCurrentUser } = await import('@/lib/firebase');
        const user = await getCurrentUser();
        if (user) {
          const supaReceipts = await loadSupabaseReceipts(user.uid);
          if (supaReceipts.length > 0) {
            const supaEntries = supaReceipts.map(receiptToEntry);
            // 병합 + 중복 제거 (id 기준)
            const existing = new Set(mapped.map(e => e.id));
            const merged = [...mapped, ...supaEntries.filter(e => !existing.has(e.id))];
            merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setEntries(merged);
          }
        }
      } catch (err) {
        // Firebase/Supabase 미설정 시 sessionStorage만 사용
        console.warn('[ESVA] History Supabase load failed:', err instanceof Error ? err.message : err);
      }
    }
    load();
  }, []);

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
    exportCsv(filtered);
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
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-end gap-3">
          {/* Search */}
          <div className="relative min-w-[240px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="검색..."
              className="h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-10 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)]"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          {/* Judgment filter */}
          <select
            value={judgmentFilter}
            onChange={(e) => setJudgmentFilter(e.target.value as '' | 'pass' | 'fail')}
            className="h-10 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)]"
          >
            <option value="">전체 판정</option>
            <option value="pass">PASS</option>
            <option value="fail">FAIL</option>
          </select>

          {/* Date range */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-10 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)]"
          />
          <span className="text-sm text-[var(--text-tertiary)]">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-10 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)]"
          />

          {/* Export button */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-4 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
          >
            <Download size={16} />
            CSV 내보내기
          </button>
        </div>

        {/* Table or empty state */}
        {filtered.length === 0 ? (
          <EmptyHistory onExample={(calcId) => window.location.href = `/calc/power/${calcId}`} />
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
                        href={`/receipt/${entry.id}`}
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
      </main>
    </div>
  );
}
