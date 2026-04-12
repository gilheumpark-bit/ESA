'use client';

/**
 * StandardsTree Component — Expandable standards tree view
 *
 * PART 1: Types & helpers
 * PART 2: Tree node component
 * PART 3: Main tree component with search
 */

import { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  ExternalLink,
  FileText,
  Lock,
  Globe,
} from 'lucide-react';
import type { StandardRef } from '@/data/standards/standard-refs';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Helpers
// ═══════════════════════════════════════════════════════════════════════════════

interface StandardsTreeProps {
  refs: StandardRef[];
  searchQuery?: string;
  onSelectRef?: (ref: StandardRef) => void;
}

interface StandardGroup {
  standard: string;
  body: string;
  country: string;
  items: StandardRef[];
}

const LICENSE_BADGE: Record<StandardRef['licenseType'], { label: string; icon: typeof Globe; className: string }> = {
  open: { label: '공개', icon: Globe, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  summary_only: { label: '요약', icon: FileText, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  link_only: { label: '링크', icon: Lock, className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
};

function groupByStandard(refs: StandardRef[]): StandardGroup[] {
  const map = new Map<string, StandardGroup>();

  for (const ref of refs) {
    // Group key: base standard name (e.g. "KEC", "NEC", "IEC 60050")
    const key = ref.standard;
    if (!map.has(key)) {
      map.set(key, { standard: key, body: ref.body, country: ref.country, items: [] });
    }
    map.get(key)!.items.push(ref);
  }

  return Array.from(map.values());
}

function matchesSearch(ref: StandardRef, query: string): boolean {
  const q = query.toLowerCase();
  return (
    ref.title_ko.toLowerCase().includes(q) ||
    ref.title_en.toLowerCase().includes(q) ||
    ref.standard.toLowerCase().includes(q) ||
    (ref.clause?.toLowerCase().includes(q) ?? false) ||
    ref.id.toLowerCase().includes(q)
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Tree Node
// ═══════════════════════════════════════════════════════════════════════════════

function TreeGroupNode({
  group,
  searchQuery,
  defaultOpen,
  onSelectRef,
}: {
  group: StandardGroup;
  searchQuery: string;
  defaultOpen: boolean;
  onSelectRef?: (ref: StandardRef) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const filteredItems = useMemo(() => {
    if (!searchQuery) return group.items;
    return group.items.filter((r) => matchesSearch(r, searchQuery));
  }, [group.items, searchQuery]);

  if (searchQuery && filteredItems.length === 0) return null;

  return (
    <div className="border-b border-[var(--border-default)] last:border-b-0">
      {/* Group header */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-tertiary)]"
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="font-semibold text-[var(--text-primary)]">{group.standard}</span>
        <span className="text-xs text-[var(--text-tertiary)]">({group.body})</span>
        <span className="ml-auto rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs text-[var(--text-tertiary)]">
          {filteredItems.length}
        </span>
      </button>

      {/* Children */}
      {open && (
        <div className="pb-2 pl-8 pr-4">
          {filteredItems.map((ref) => (
            <TreeItemNode key={ref.id} ref_={ref} searchQuery={searchQuery} onSelect={onSelectRef} />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeItemNode({
  ref_,
  searchQuery: _searchQuery,
  onSelect,
}: {
  ref_: StandardRef;
  searchQuery: string;
  onSelect?: (ref: StandardRef) => void;
}) {
  const badge = LICENSE_BADGE[ref_.licenseType];
  const BadgeIcon = badge.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(ref_)}
      className="mb-1 flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--bg-tertiary)]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {ref_.clause && (
            <span className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]">
              {ref_.clause}
            </span>
          )}
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {ref_.title_ko}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{ref_.title_en}</p>
        {ref_.edition && (
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Edition: {ref_.edition}</p>
        )}
      </div>

      {/* License badge */}
      <span className={`mt-0.5 flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
        <BadgeIcon size={10} />
        {badge.label}
      </span>

      {/* External link */}
      {ref_.url && (
        <a
          href={ref_.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 shrink-0 text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-primary)]"
        >
          <ExternalLink size={14} />
        </a>
      )}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Main Tree
// ═══════════════════════════════════════════════════════════════════════════════

export default function StandardsTree({ refs, searchQuery = '', onSelectRef }: StandardsTreeProps) {
  const groups = useMemo(() => groupByStandard(refs), [refs]);

  const hasSearch = searchQuery.trim().length > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)]">
      {groups.map((group) => (
        <TreeGroupNode
          key={group.standard}
          group={group}
          searchQuery={searchQuery}
          defaultOpen={hasSearch}
          onSelectRef={onSelectRef}
        />
      ))}
    </div>
  );
}
