'use client';

/**
 * IEC 60050 Terminology Browser — /glossary
 *
 * PART 1: Constants & helpers
 * PART 2: View toggle & sort controls
 * PART 3: Main page component
 */

import { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  LayoutGrid,
  List,
  ArrowUpDown,
} from 'lucide-react';
import { ELECTRICAL_TERMS, type ElectricalTermCategory } from '@/data/iec-60050/electrical-terms';
import TermCard from '@/components/TermCard';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Constants & Helpers
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORY_OPTIONS: { value: '' | ElectricalTermCategory; label: string }[] = [
  { value: '', label: '전체 카테고리' },
  { value: 'power-system', label: '전력계통' },
  { value: 'protection', label: '보호' },
  { value: 'cable-wire', label: '전선/케이블' },
  { value: 'grounding', label: '접지' },
  { value: 'renewable', label: '신재생' },
  { value: 'motor', label: '전동기' },
  { value: 'measurement', label: '계측' },
  { value: 'standard', label: '규격' },
];

type SortMode = 'korean' | 'english';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function GlossaryPage() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'' | ElectricalTermCategory>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortMode, setSortMode] = useState<SortMode>('korean');

  const filtered = useMemo(() => {
    let terms = ELECTRICAL_TERMS;

    // Filter by category
    if (categoryFilter) {
      terms = terms.filter((t) => t.category === categoryFilter);
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      terms = terms.filter(
        (t) =>
          t.ko.toLowerCase().includes(q) ||
          t.en.toLowerCase().includes(q) ||
          (t.ja?.toLowerCase().includes(q) ?? false) ||
          (t.zh?.toLowerCase().includes(q) ?? false) ||
          t.synonyms.some((s) => s.toLowerCase().includes(q)),
      );
    }

    // Sort
    const sorted = [...terms];
    if (sortMode === 'korean') {
      sorted.sort((a, b) => a.ko.localeCompare(b.ko, 'ko'));
    } else {
      sorted.sort((a, b) => a.en.localeCompare(b.en, 'en'));
    }

    return sorted;
  }, [search, categoryFilter, sortMode]);

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      {/* Header */}
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <BookOpen size={28} className="text-[var(--color-primary)]" />
            전기공학 용어 사전
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            IEC 60050 Electrical Terminology Browser
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Controls */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative min-w-[240px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="용어 검색 (한/영/일/중/약어)"
              className="h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as '' | ElectricalTermCategory)}
            className="h-10 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)]"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          {/* Sort toggle */}
          <button
            type="button"
            onClick={() => setSortMode(sortMode === 'korean' ? 'english' : 'korean')}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)]"
          >
            <ArrowUpDown size={14} />
            {sortMode === 'korean' ? '가나다순' : 'ABC순'}
          </button>

          {/* View toggle */}
          <div className="flex overflow-hidden rounded-lg border border-[var(--border-default)]">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex h-10 items-center px-3 text-sm transition-colors ${
                viewMode === 'grid'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--bg-primary)] text-[var(--text-secondary)]'
              }`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex h-10 items-center px-3 text-sm transition-colors ${
                viewMode === 'list'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--bg-primary)] text-[var(--text-secondary)]'
              }`}
            >
              <List size={16} />
            </button>
          </div>

          {/* Count */}
          <span className="text-xs text-[var(--text-tertiary)]">
            {filtered.length}개 용어
          </span>
        </div>

        {/* Terms display */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-primary)] py-20">
            <BookOpen size={48} className="mb-3 text-[var(--text-tertiary)]" />
            <p className="text-lg font-medium text-[var(--text-secondary)]">
              검색 결과가 없습니다
            </p>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">
              다른 키워드로 검색해 보세요
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((term) => (
              <TermCard key={term.id} term={term} mode="compact" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((term) => (
              <TermCard key={term.id} term={term} mode="full" />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
