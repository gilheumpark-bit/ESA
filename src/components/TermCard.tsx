'use client';

/**
 * TermCard Component — IEC 60050 glossary term card
 *
 * PART 1: Types
 * PART 2: Card component (compact + full modes)
 */

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import type { ElectricalTerm, ElectricalTermCategory } from '@/data/iec-60050/electrical-terms';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Helpers
// ═══════════════════════════════════════════════════════════════════════════════

interface TermCardProps {
  term: ElectricalTerm;
  mode?: 'compact' | 'full';
}

const CATEGORY_LABELS: Record<ElectricalTermCategory, string> = {
  'power-system': '전력계통',
  protection: '보호',
  'cable-wire': '전선/케이블',
  grounding: '접지',
  renewable: '신재생',
  motor: '전동기',
  measurement: '계측',
  standard: '규격',
};

const CATEGORY_COLORS: Record<ElectricalTermCategory, string> = {
  'power-system': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  protection: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'cable-wire': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  grounding: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  renewable: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  motor: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  measurement: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  standard: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Card Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function TermCard({ term, mode = 'compact' }: TermCardProps) {
  const catLabel = CATEGORY_LABELS[term.category];
  const catColor = CATEGORY_COLORS[term.category];

  if (mode === 'compact') {
    return (
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4 transition-colors hover:border-[var(--color-primary)]">
        {/* Header */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">{term.ko}</h3>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${catColor}`}>
            {catLabel}
          </span>
        </div>

        {/* English */}
        <p className="mb-1 text-sm text-[var(--text-secondary)]">{term.en}</p>

        {/* Synonyms */}
        {term.synonyms.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {term.synonyms.map((s) => (
              <span
                key={s}
                className="rounded-md bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs text-[var(--text-tertiary)]"
              >
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Related calc link */}
        {term.relatedCalc && (
          <Link
            href={`/calc/${term.category}/${term.relatedCalc}`}
            className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
          >
            <BookOpen size={12} />
            관련 계산기
          </Link>
        )}
      </div>
    );
  }

  // Full mode
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
      {/* Category badge */}
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${catColor}`}>
        {catLabel}
      </span>

      {/* Korean name (prominent) */}
      <h3 className="mt-3 text-xl font-bold text-[var(--text-primary)]">{term.ko}</h3>

      {/* Multilingual names */}
      <div className="mt-2 space-y-0.5 text-sm">
        <p className="text-[var(--text-secondary)]">
          <span className="mr-2 font-medium text-[var(--text-tertiary)]">EN</span>
          {term.en}
        </p>
        {term.ja && (
          <p className="text-[var(--text-secondary)]">
            <span className="mr-2 font-medium text-[var(--text-tertiary)]">JP</span>
            {term.ja}
          </p>
        )}
        {term.zh && (
          <p className="text-[var(--text-secondary)]">
            <span className="mr-2 font-medium text-[var(--text-tertiary)]">ZH</span>
            {term.zh}
          </p>
        )}
      </div>

      {/* Synonyms */}
      {term.synonyms.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-[var(--text-tertiary)]">동의어/약어</p>
          <div className="flex flex-wrap gap-1.5">
            {term.synonyms.map((s) => (
              <span
                key={s}
                className="rounded-md bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* IEC Reference */}
      {term.iecRef && (
        <p className="mt-3 text-xs text-[var(--text-tertiary)]">
          IEC 60050 Ref: <span className="font-mono">{term.iecRef}</span>
        </p>
      )}

      {/* Related calculator */}
      {term.relatedCalc && (
        <Link
          href={`/calc/${term.category}/${term.relatedCalc}`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs text-[var(--color-primary)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--bg-tertiary)]"
        >
          <BookOpen size={14} />
          관련 계산기
        </Link>
      )}
    </div>
  );
}
