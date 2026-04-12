'use client';

/**
 * Receipt List Page — /receipt
 *
 * PART 1: Types & localStorage loader
 * PART 2: Receipt list item
 * PART 3: Page component
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FileText, Clock, ArrowRight, Inbox } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & localStorage Loader
// ═══════════════════════════════════════════════════════════════════════════════

interface RecentCalc {
  id: string;
  calcName: string;
  category: string;
  date: string;
  keyResult: string;
}

function loadRecentCalcs(): RecentCalc[] {
  try {
    const raw = localStorage.getItem('esa-recent-calcs');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Receipt List Item
// ═══════════════════════════════════════════════════════════════════════════════

function ReceiptItem({ calc }: { calc: RecentCalc }) {
  const dateStr = new Date(calc.date).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Link
      href={`/receipt/${calc.id}`}
      className="flex items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] p-4 transition-all hover:border-[var(--color-primary)] hover:shadow-sm"
    >
      <div className="flex items-start gap-3">
        <FileText size={20} className="mt-0.5 shrink-0 text-[var(--color-primary)]" />
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            {calc.calcName}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <span className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5">
              {calc.category}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {dateStr}
            </span>
          </div>
          {calc.keyResult && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {calc.keyResult}
            </p>
          )}
        </div>
      </div>
      <ArrowRight size={16} className="shrink-0 text-[var(--text-tertiary)]" />
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Page Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function ReceiptListPage() {
  const [calcs, setCalcs] = useState<RecentCalc[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setCalcs(loadRecentCalcs());
    setLoaded(true);
    document.title = '계산 이력 | ESA';
  }, []);

  if (!loaded) {
    return (
      <div className="min-h-screen bg-[var(--bg-secondary)]">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-[var(--bg-primary)]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <FileText size={28} className="text-[var(--color-primary)]" />
            계산 이력
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            최근 수행한 계산의 영수증 목록
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {calcs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-primary)] py-20">
            <Inbox size={48} className="mb-3 text-[var(--text-tertiary)]" />
            <p className="text-lg font-medium text-[var(--text-secondary)]">
              계산 이력이 없습니다
            </p>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              계산기를 사용하면 이력이 자동으로 저장됩니다
            </p>
            <Link
              href="/calc"
              className="mt-4 rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
            >
              계산기로 이동
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {calcs.map((calc) => (
              <ReceiptItem key={calc.id} calc={calc} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
