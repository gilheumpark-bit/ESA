'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, MessageSquare, ChevronUp, Tag, Plus } from 'lucide-react';
import Link from 'next/link';
import { useFeatureResource } from '@/hooks/useFeatureResource';
import { requestFeatureJson, relativeActivityTime } from '@/lib/feature-request';
import { decodeCommunity } from '@/lib/feature-read-models';

/**
 * ESVA Community Q&A Hub
 * ──────────────────────
 * Question list with filters, search, tag chips, expert badges.
 *
 * PART 1: Types & constants
 * PART 2: Question list component
 * PART 3: Filter bar
 * PART 4: Question card
 * PART 5: Page layout
 */

// ─── PART 1: Types & Constants ────────────────────────────────

interface QuestionSummary {
  id: string;
  title: string;
  tags: string[];
  authorName?: string;
  votes: number;
  answerCount: number;
  status: 'open' | 'resolved';
  createdAt: string;
  // 질문에는 Expert 배지가 없다. `lib/community.ts` 의 `Question` 타입에도
  // 행 매퍼에도 그런 필드가 없어 서버가 만들지 못한다 — 배지는 답변 전용
  // (`Answer.isExpert`)이다. 전문가 인증 승인 경로가 생기면 질문 쪽도
  // 함께 살린다(docs/DORMANT_MANIFEST.md 참조).
}

type SortOption = 'newest' | 'votes' | 'unanswered';

const POPULAR_TAGS = [
  '전압강하', '케이블사이즈', '단락전류', '접지', 'KEC',
  'NEC', 'IEC', '변압기', '전동기', '수변전', '차단기',
  '피뢰시스템', '전력품질', '조명설계',
];

// ─── PART 2: Question List Fetching ───────────────────────────

function useQuestions(opts: {
  sort: SortOption;
  tags: string[];
  search: string;
  page: number;
}) {
  const params = new URLSearchParams({ sort: opts.sort, page: String(opts.page) });
  if (opts.tags.length) params.set('tags', [...opts.tags].sort().join(','));
  if (opts.search) params.set('search', opts.search);
  const query = params.toString();
  const load = useCallback((signal: AbortSignal) => requestFeatureJson(`/api/community?${query}`, { signal }, decodeCommunity), [query]);
  const resource = useFeatureResource(query, load);
  return { questions: resource.data?.data ?? [], totalPages: resource.data?.totalPages ?? 1,
    loading: resource.loading, error: resource.error, reload: resource.reload };
}

// ─── PART 3: Filter Bar ───────────────────────────────────────

function FilterBar({
  sort,
  onSortChange,
  selectedTags,
  onTagToggle,
  search,
  onSearchChange,
}: {
  sort: SortOption;
  onSortChange: (s: SortOption) => void;
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
}) {
  const sortButtons: { key: SortOption; label: string }[] = [
    { key: 'newest', label: '최신순' },
    { key: 'votes', label: '추천순' },
    { key: 'unanswered', label: '미답변' },
  ];

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
        <input
          type="text"
          value={search}
          maxLength={200}
          onChange={(e) => {
            const val = e.target.value;
            onSearchChange(val);
          }}
          placeholder="질문 검색..."
          aria-label="커뮤니티 질문 검색"
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] py-2 pl-10 pr-4 text-sm
                     focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
      </div>

      {/* Sort buttons */}
      <div className="flex gap-2">
        {sortButtons.map((btn) => (
          <button
            key={btn.key}
            onClick={() => onSortChange(btn.key)}
            aria-label={`${btn.label} 정렬`}
            aria-pressed={sort === btn.key}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors
              ${sort === btn.key
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Tag chips */}
      <div className="flex flex-wrap gap-2">
        {POPULAR_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => onTagToggle(tag)}
            aria-pressed={selectedTags.includes(tag)}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs transition-colors
              ${selectedTags.includes(tag)
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)]'
              }`}
          >
            <Tag className="h-3 w-3" />
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── PART 4: Question Card ────────────────────────────────────

function QuestionCard({ q }: { q: QuestionSummary }) {
  const timeAgo = formatTimeAgo(q.createdAt);

  return (
    <Link
      href={`/community/${encodeURIComponent(q.id)}`}
      className="block rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] p-4 transition-shadow
                 hover:shadow-md"
    >
      <div className="flex gap-4">
        {/* Vote & answer counts */}
        <div className="flex flex-col items-center gap-2 text-center min-w-[60px]">
          <div className="flex flex-col items-center">
            <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" />
            <span className="text-sm font-semibold">{q.votes}</span>
            <span className="text-[10px] text-[var(--text-tertiary)]">votes</span>
          </div>
          <div className={`flex flex-col items-center rounded px-2 py-1 text-xs
            ${q.answerCount > 0
              ? q.status === 'resolved'
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : 'bg-blue-50 text-blue-600 dark:bg-blue-900 dark:text-blue-300'
              : 'text-[var(--text-tertiary)]'
            }`}
          >
            <MessageSquare className="h-3 w-3" />
            <span>{q.answerCount}</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-medium text-[var(--text-primary)] line-clamp-2">
            {q.status === 'resolved' && (
              <span className="mr-2 inline-block rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700
                             dark:bg-green-900 dark:text-green-300">
                해결
              </span>
            )}
            {q.title}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {q.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded bg-[var(--bg-secondary)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <span>{q.authorName ?? 'Anonymous'}</span>
            <span>·</span>
            <span>{timeAgo}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── PART 5: Page Layout ──────────────────────────────────────

export default function CommunityPage() {
  const [sort, setSort] = useState<SortOption>('newest');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [page, setPage] = useState(1);

  const { questions, totalPages, loading, error, reload } = useQuestions({
    sort,
    tags: selectedTags,
    search,
    page,
  });

  const handleTagToggle = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
    setPage(1);
  }, []);

  // 300ms 디바운스 — 타이핑 중 불필요한 리렌더 방지
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); }, []);
  const handleSearchChange = useCallback((value: string) => {
    setSearchDraft(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            커뮤니티 Q&A
          </h1>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            전기공학 전문가 커뮤니티에서 질문하고 답변하세요
          </p>
        </div>
        <Link
          href="/community/ask"
          className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium
                     text-white transition-colors hover:bg-[var(--color-primary-hover)]"
        >
          <Plus className="h-4 w-4" />
          질문하기
        </Link>
      </div>

      {/* Filters */}
      <FilterBar
        sort={sort}
        onSortChange={(s) => { setSort(s); setPage(1); }}
        selectedTags={selectedTags}
        onTagToggle={handleTagToggle}
        search={searchDraft}
        onSearchChange={handleSearchChange}
      />

      {(searchDraft || selectedTags.length > 0 || sort !== 'newest') && <button type="button" className="mt-3 min-h-11 rounded-lg border px-3 text-sm" onClick={() => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        setSearchDraft(''); setSearch(''); setSelectedTags([]); setSort('newest'); setPage(1);
      }}>검색·필터 초기화</button>}
      {/* Question List */}
      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-[var(--bg-secondary)]" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-[var(--color-error)] bg-red-50 p-6 text-center dark:bg-red-900/20">
            <p role="alert" className="text-sm text-[var(--color-error)]">{error}</p>
            <button
              type="button"
              onClick={reload}
              className="mt-3 text-sm text-[var(--color-primary)] hover:underline"
            >
              다시 시도
            </button>
          </div>
        ) : questions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border-default)] p-12 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-[var(--text-tertiary)]" />
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              {search ? '검색 결과가 없습니다' : '아직 질문이 없습니다. 첫 질문을 남겨보세요!'}
            </p>
          </div>
        ) : (
          questions.map((q) => <QuestionCard key={q.id} q={q} />)
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded px-3 py-1 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]
                       disabled:opacity-40"
          >
            이전
          </button>
          <span className="px-3 py-1 text-sm text-[var(--text-tertiary)]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded px-3 py-1 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]
                       disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function formatTimeAgo(value: string): string { return relativeActivityTime(value); }
