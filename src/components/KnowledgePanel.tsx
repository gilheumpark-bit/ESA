'use client';

/**
 * KnowledgePanel Component — Standard reference sidebar
 *
 * PART 1: Types
 * PART 2: Main component
 */

import { BookOpen, ExternalLink, CheckCircle, AlertTriangle } from 'lucide-react';
import type { SourceTag } from '@/engine/sjc/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface KnowledgePanelData {
  term: string;
  iecRef?: string;
  definitionKo: string;
  definitionEn: string;
  relatedTerms: string[];
  relatedStandards: SourceTag[];
}

interface KnowledgePanelProps {
  data: KnowledgePanelData;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function KnowledgePanel({ data, className = '' }: KnowledgePanelProps) {
  return (
    <aside
      className={`
        rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5
        ${className}
      `}
    >
      {/* Header */}
      <div className="mb-4 flex items-start gap-3">
        <BookOpen size={20} className="mt-0.5 shrink-0 text-[var(--color-primary)]" />
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            {data.term}
          </h3>
          {data.iecRef && (
            <span className="text-xs text-[var(--text-tertiary)]">
              IEC 60050 #{data.iecRef}
            </span>
          )}
        </div>
      </div>

      {/* Korean definition */}
      <div className="mb-3">
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          정의
        </h4>
        <p className="text-sm leading-relaxed text-[var(--text-primary)]">
          {data.definitionKo}
        </p>
      </div>

      {/* English definition */}
      <div className="mb-4">
        <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Definition
        </h4>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          {data.definitionEn}
        </p>
      </div>

      {/* Divider */}
      <hr className="mb-4 border-[var(--border-default)]" />

      {/* Related standards */}
      {data.relatedStandards.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
            관련 기준
          </h4>
          <ul className="space-y-2">
            {data.relatedStandards.map((tag, i) => (
              <li key={`${tag.standard}-${tag.clause}-${i}`}>
                <StandardRefItem tag={tag} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Related terms */}
      {data.relatedTerms.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
            관련 용어
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {data.relatedTerms.map((term) => (
              <span
                key={term}
                className="rounded-full bg-[var(--bg-tertiary)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)]"
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

// ─── Sub-component: Standard reference item ────────────────────────────────

function StandardRefItem({ tag }: { tag: SourceTag }) {
  const isCurrent = !tag.edition || isEditionCurrent(tag.edition);

  return (
    <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {tag.standard} {tag.clause}
        </span>
        {tag.edition && (
          <span className="ml-1.5 text-xs text-[var(--text-tertiary)]">
            ({tag.edition})
          </span>
        )}
      </div>

      {/* Current/outdated badge */}
      {isCurrent ? (
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          <CheckCircle size={12} />
          현행
        </span>
      ) : (
        <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <AlertTriangle size={12} />
          구판
        </span>
      )}

      {/* External link */}
      {tag.url && (
        <a
          href={tag.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--color-primary)]"
          aria-label={`${tag.standard} ${tag.clause} 원문 열기`}
        >
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

// ─── Helper ────────────────────────────────────────────────────────────────

function isEditionCurrent(edition: string): boolean {
  const year = parseInt(edition, 10);
  if (isNaN(year)) return true;
  const currentYear = new Date().getFullYear();
  // Consider standards within 5 years as current
  return currentYear - year <= 5;
}
