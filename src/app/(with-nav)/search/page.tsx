'use client';

/**
 * Search Engine Results Page (SERP)
 *
 * PART 1: Types and skeleton components
 * PART 2: Featured calculator panel
 * PART 3: Document result item
 * PART 4: Related calculators chips
 * PART 5: Global comparison panel
 * PART 6: Empty state
 * PART 7: Main page component
 */

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Calculator,
  Clock,
  Globe,
  CheckCircle,
  Shield,
  ChevronRight,
  Search,
  Bot,
  X,
  Send,
  ArrowRightLeft,
  Youtube,
  Loader2,
} from 'lucide-react';
import SearchBar from '@/components/SearchBar';
import KnowledgePanel from '@/components/KnowledgePanel';
import InlineCalcResult from '@/components/InlineCalcResult';
import { SearchResultSkeleton } from '@/components/SkeletonLoading';
import { formatApiError } from '@/lib/error-messages';
import { analyzeCalcIntent } from '@/lib/calc-intent-bridge';
import { getCachedResponse, cacheResponse } from '@/lib/ai-cache';
import type {
  SearchResult,
  RankedResult,
  FeaturedCalculator,
  GlobalComparison,
} from '@/search/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Skeleton Components
// ═══════════════════════════════════════════════════════════════════════════════

function ResultSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="rounded-lg border border-[var(--border-default)] p-4">
          <div className="mb-2 h-4 w-3/4 rounded bg-[var(--bg-tertiary)]" />
          <div className="mb-1 h-3 w-1/2 rounded bg-[var(--bg-tertiary)]" />
          <div className="h-3 w-full rounded bg-[var(--bg-tertiary)]" />
          <div className="mt-1 h-3 w-2/3 rounded bg-[var(--bg-tertiary)]" />
        </div>
      ))}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-[var(--border-default)] p-5">
      <div className="mb-4 h-5 w-1/2 rounded bg-[var(--bg-tertiary)]" />
      <div className="mb-2 h-3 w-full rounded bg-[var(--bg-tertiary)]" />
      <div className="mb-2 h-3 w-3/4 rounded bg-[var(--bg-tertiary)]" />
      <div className="h-3 w-1/2 rounded bg-[var(--bg-tertiary)]" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Featured Calculator Panel
// ═══════════════════════════════════════════════════════════════════════════════

function FeaturedCalculatorPanel({ calc }: { calc: FeaturedCalculator }) {
  return (
    <Link
      href={`/calc/${calc.category}/${calc.id}`}
      className="
        mb-4 flex items-center gap-4 rounded-xl border border-blue-200
        bg-blue-50 p-4 transition-shadow hover:shadow-md
        dark:border-blue-800 dark:bg-blue-900/20
      "
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white">
        <Calculator size={24} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-[var(--text-primary)]">{calc.name}</h3>
        <p className="text-sm text-[var(--text-secondary)]">{calc.nameEn}</p>
      </div>
      <ChevronRight size={20} className="shrink-0 text-[var(--color-primary)]" />
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Document Result Item
// ═══════════════════════════════════════════════════════════════════════════════

function DocumentResultItem({ ranked }: { ranked: RankedResult }) {
  const doc = ranked.document;

  return (
    <article className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] p-4 transition-shadow hover:shadow-sm">
      {/* URL / Source */}
      {doc.url && (
        <div className="mb-1 flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
          <Globe size={12} />
          <span className="truncate">{doc.url}</span>
        </div>
      )}

      {/* Title */}
      <h3 className="mb-1">
        {doc.url ? (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-base font-semibold text-[var(--color-primary)] hover:underline"
          >
            {doc.title}
          </a>
        ) : (
          <span className="text-base font-semibold text-[var(--color-primary)]">
            {doc.title}
          </span>
        )}
      </h3>

      {/* Excerpt / highlights */}
      <p className="mb-2 text-sm leading-relaxed text-[var(--text-secondary)]">
        {ranked.highlights && ranked.highlights.length > 0
          ? ranked.highlights.join(' ... ')
          : doc.excerpt ?? doc.body.slice(0, 200)}
      </p>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-tertiary)]">
        {/* Standards cited */}
        {doc.standardsCited.length > 0 && (
          <span className="flex items-center gap-1">
            <Shield size={12} />
            {doc.standardsCited.map((s) => `${s.standard} ${s.clause}`).join(', ')}
          </span>
        )}
        {/* Verification */}
        {doc.verification === 'expert_verified' && (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle size={12} />
            전문가 검증
          </span>
        )}
        {/* Date */}
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {new Date(doc.updatedAt).toLocaleDateString('ko-KR')}
        </span>
        {/* Related calculators */}
        {doc.relatedCalculators.length > 0 && (
          <span className="flex items-center gap-1">
            <Calculator size={12} />
            계산기 {doc.relatedCalculators.length}개
          </span>
        )}
      </div>

      {/* YouTube summary button */}
      {doc.url && isYouTubeUrl(doc.url) && (
        <YouTubeSummaryCard url={doc.url} />
      )}
    </article>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Related Calculator Chips
// ═══════════════════════════════════════════════════════════════════════════════

function RelatedCalcChips({ calcs }: { calcs: FeaturedCalculator[] }) {
  if (calcs.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="mb-3 text-sm font-medium text-[var(--text-tertiary)]">
        관련 계산기
      </h3>
      <div className="flex flex-wrap gap-2">
        {calcs.map((c) => (
          <Link
            key={c.id}
            href={`/calc/${c.category}/${c.id}`}
            className="
              flex items-center gap-1.5 rounded-full border border-[var(--border-default)]
              bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-secondary)]
              transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]
            "
          >
            <Calculator size={14} />
            {c.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Global Comparison Panel
// ═══════════════════════════════════════════════════════════════════════════════

function GlobalComparisonPanel({ comparison }: { comparison: GlobalComparison }) {
  return (
    <div className="mt-6 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
        <Globe size={18} className="text-[var(--color-primary)]" />
        글로벌 비교
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-default)]">
              <th className="pb-2 text-left font-medium text-[var(--text-tertiary)]">항목</th>
              {comparison.items.map((item) => (
                <th key={item} className="pb-2 text-center font-medium text-[var(--text-primary)]">
                  {item}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.dimensions.map((dim) => (
              <tr key={dim.name} className="border-b border-[var(--border-default)]">
                <td className="py-2 text-[var(--text-secondary)]">{dim.name}</td>
                {comparison.items.map((item) => (
                  <td key={item} className="py-2 text-center font-mono text-[var(--text-primary)]">
                    {dim.values[item] ?? '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-[var(--text-tertiary)]">
        출처: {comparison.source.standard} {comparison.source.clause}
        {comparison.source.edition && ` (${comparison.source.edition})`}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5.5 — Unit Conversion Card (calls /api/convert)
// ═══════════════════════════════════════════════════════════════════════════════

/** Detect patterns like "10 AWG to mm2", "100 kW to HP" */
const UNIT_CONVERT_REGEX = /^([\d.]+)\s*(AWG|mm2|kcmil|kW|HP|kVA|V|kV|C|F|ohm|pu)\s+(?:to|→|->)\s*(AWG|mm2|kcmil|kW|HP|kVA|V|kV|C|F|ohm|pu)$/i;

function UnitConversionCard({ query }: { query: string }) {
  const match = query.match(UNIT_CONVERT_REGEX);
  const [result, setResult] = useState<{ result: number; formula: string; from: { value: number; unit: string }; to: { value: number; unit: string } } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!match) return;
    const [, valueStr, fromUnit, toUnit] = match;
    const value = parseFloat(valueStr);
    if (!isFinite(value)) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, fromUnit, toUnit }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) setResult(json.data);
        else setError(json.error?.message ?? 'Conversion failed');
      })
      .catch(() => { if (!cancelled) setError('Network error'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [query]);

  if (!match) return null;

  return (
    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
      <div className="flex items-center gap-2 mb-2">
        <ArrowRightLeft size={18} className="text-emerald-600" />
        <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">단위 변환</h3>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <Loader2 size={14} className="animate-spin" /> 변환 중...
        </div>
      ) : error ? (
        <p className="text-sm text-[var(--color-error)]">{error}</p>
      ) : result ? (
        <div>
          <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
            {result.from.value} {result.from.unit} = {result.to.value} {result.to.unit}
          </p>
          {result.formula && (
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">{result.formula}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5.6 — AI Chat Panel (calls /api/chat with streaming)
// ═══════════════════════════════════════════════════════════════════════════════

function AIChatPanel({ query, onClose }: { query: string; onClose: () => void }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;

    const userMsg = { role: 'user' as const, content: text.trim() };
    const allMessages = [...messages, userMsg];
    setMessages([...allMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          provider: 'openai',
          model: process.env.NEXT_PUBLIC_DEFAULT_CHAT_MODEL || 'gpt-4.1-mini',
          systemPrompt: `You are an electrical engineering assistant for ESVA (전기 검색 AI). Answer in Korean. Be concise. Reference KEC/NEC/IEC standards when relevant. Current query context: "${query}"`,
          temperature: 0.7,
          maxTokens: 1024,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        const errMsg = errData?.error?.message ?? `Error (${res.status})`;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: `오류: ${errMsg}` };
          return updated;
        });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let assistantText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.text) {
              assistantText += parsed.text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantText };
                return updated;
              });
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: '네트워크 오류가 발생했습니다.' };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }, [messages, streaming, query]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Auto-send initial query
  useEffect(() => {
    if (query.trim() && messages.length === 0) {
      sendMessage(query);
    }
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-96 flex-col rounded-2xl border border-[var(--border-default)] bg-[var(--bg-primary)] shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-[var(--color-primary)]" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">AI에게 물어보기</span>
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-tertiary)]">
          <X size={16} className="text-[var(--text-tertiary)]" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ maxHeight: 320 }}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
            }`}>
              {m.content || (streaming && i === messages.length - 1 ? '...' : '')}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border-default)] px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="추가 질문..."
            disabled={streaming}
            className="flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={streaming || !input.trim()}
            className="rounded-lg bg-[var(--color-primary)] p-2 text-white disabled:opacity-40"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5.7 — YouTube Summary Button (calls /api/youtube)
// ═══════════════════════════════════════════════════════════════════════════════

function YouTubeSummaryCard({ url }: { url: string }) {
  const [summary, setSummary] = useState<{ title?: string; keyPoints?: string[]; relatedClauses?: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSummary(json);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'YouTube 요약 실패');
    } finally {
      setLoading(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={handleFetch}
        disabled={loading}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Youtube size={12} />}
        YouTube 요약
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm dark:border-red-800 dark:bg-red-900/20">
      <div className="flex items-center gap-2 mb-2">
        <Youtube size={14} className="text-red-600" />
        <span className="font-semibold text-red-800 dark:text-red-300">YouTube 요약</span>
      </div>
      {error ? (
        <p className="text-xs text-[var(--color-error)]">{error}</p>
      ) : summary ? (
        <div className="space-y-2">
          {summary.title && <p className="font-medium text-red-900 dark:text-red-200">{summary.title}</p>}
          {summary.keyPoints && summary.keyPoints.length > 0 && (
            <ul className="list-disc pl-4 space-y-1 text-xs text-red-800 dark:text-red-300">
              {summary.keyPoints.map((point, i) => <li key={i}>{point}</li>)}
            </ul>
          )}
          {summary.relatedClauses && summary.relatedClauses.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {summary.relatedClauses.map((clause) => (
                <span key={clause} className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700 dark:bg-red-800 dark:text-red-300">
                  {clause}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Check if a URL looks like a YouTube link */
function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/.test(url);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6 — Empty State
// ═══════════════════════════════════════════════════════════════════════════════

function EmptyState({ query }: { query: string }) {
  return (
    <div className="py-16 text-center">
      <Search size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
      <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
        검색 결과 없음
      </h2>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">
        &ldquo;{query}&rdquo;에 대한 결과를 찾을 수 없습니다.
      </p>
      <div className="mx-auto max-w-md text-left text-sm text-[var(--text-secondary)]">
        <p className="mb-2 font-medium">검색 팁:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>다른 키워드나 약어를 사용해 보세요 (예: MCCB, VD, PF)</li>
          <li>영어 또는 한국어로 검색해 보세요</li>
          <li>기준 번호로 직접 검색하세요 (예: KEC 140, NEC 250)</li>
          <li>계산기를 직접 찾아보세요: <Link href="/calc" className="text-[var(--color-primary)] hover:underline">/calc</Link></li>
        </ul>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 7 — Main Page (inner component reading searchParams)
// ═══════════════════════════════════════════════════════════════════════════════

function SearchPageInner() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';

  const calcIntent = query ? analyzeCalcIntent(query) : null;

  const [result, setResult] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResult(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setSearchError(null);

    async function doSearch() {
      try {
        // AI 캐시 확인 — 동일 쿼리 재요청 시 API 비용 0
        const cached = await getCachedResponse('esva', 'search', [{ role: 'user', content: query.trim() }], 0);
        if (cached && !cancelled) {
          const data: SearchResult = JSON.parse(cached);
          setResult(data);
          return;
        }

        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query.trim() }),
        });
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const json = await res.json();
        const data: SearchResult = json.data ?? json;
        if (!cancelled) {
          setResult(data);
          // 캐시 저장 (temperature 0 = 결정론적 검색)
          await cacheResponse('esva', 'search', [{ role: 'user', content: query.trim() }], 0, JSON.stringify(data));
        }
      } catch (err) {
        if (!cancelled) {
          setSearchError(
            err instanceof Error ? err.message : 'Search failed',
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    doSearch();
    return () => { cancelled = true; };
  }, [query]);

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/" className="shrink-0 text-xl font-bold text-[var(--color-primary)]">
            ESVA
          </Link>
          <SearchBar defaultValue={query} size="sm" className="flex-1" />
          {query.trim() && (
            <button
              onClick={() => setShowChat((v) => !v)}
              className="shrink-0 flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
            >
              <Bot size={16} />
              AI에게 물어보기
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {isLoading ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <ResultSkeleton />
            <PanelSkeleton />
          </div>
        ) : searchError ? (
          <div className="rounded-lg border border-[var(--color-error)] bg-red-50 p-4 text-sm text-[var(--color-error)] dark:bg-red-900/20">
            {searchError}
          </div>
        ) : !query.trim() ? (
          <div className="py-16 text-center text-[var(--text-tertiary)]">
            검색어를 입력하세요
          </div>
        ) : result && result.documents.length === 0 && !result.featuredCalculator && !result.knowledgePanel ? (
          <EmptyState query={query} />
        ) : result ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            {/* Main column */}
            <div>
              {/* Search meta */}
              <p className="mb-4 text-xs text-[var(--text-tertiary)]">
                약 {result.totalCount}개 결과 ({result.latencyMs}ms)
                {' · '}
                <button
                  onClick={() => setShowChat(true)}
                  className="text-[var(--color-primary)] hover:underline"
                >
                  AI에게 물어보기
                </button>
              </p>

              {/* Unit conversion card (if query matches pattern) */}
              <UnitConversionCard query={query} />

              {/* Featured calculator — inline result if calc intent detected, otherwise link panel */}
              {calcIntent?.hasCalcIntent && calcIntent.calculatorId ? (
                <InlineCalcResult
                  calculatorId={calcIntent.calculatorId}
                  calculatorName={calcIntent.calculatorName || '계산기'}
                  extractedParams={calcIntent.extractedParams}
                  missingRequired={calcIntent.missingRequired}
                  missingOptional={calcIntent.missingOptional}
                  allParams={calcIntent.allParams}
                  canAutoExecute={calcIntent.canAutoExecute}
                />
              ) : result.featuredCalculator ? (
                <FeaturedCalculatorPanel calc={result.featuredCalculator} />
              ) : null}

              {/* Document results */}
              <div className="space-y-3">
                {result.documents.map((ranked) => (
                  <DocumentResultItem key={ranked.document.id} ranked={ranked} />
                ))}
              </div>

              {/* Global comparison */}
              {result.globalComparison && (
                <GlobalComparisonPanel comparison={result.globalComparison} />
              )}

              {/* Related calculator chips */}
              <RelatedCalcChips calcs={result.relatedCalcs} />
            </div>

            {/* Right column — Knowledge panel */}
            <div className="hidden lg:block">
              {result.knowledgePanel && (
                <KnowledgePanel
                  data={result.knowledgePanel}
                  className="sticky top-20"
                />
              )}
            </div>
          </div>
        ) : null}
        {/* AI Chat Panel */}
        {showChat && query.trim() && (
          <AIChatPanel query={query} onClose={() => setShowChat(false)} />
        )}
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)]">
          <ResultSkeleton />
        </div>
      }
    >
      <SearchPageInner />
    </Suspense>
  );
}
