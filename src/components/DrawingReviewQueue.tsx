'use client';

import { useMemo, useRef, useState } from 'react';
import { Search, MapPin, Check, AlertCircle } from 'lucide-react';
import type { DrawingDocumentV3, UnresolvedItem } from '@/agent/drawing/types-v3';
import { labelReadFailureCode } from './drawing-v3-labels';

type CorrectionHandler = (id: string, value: string, candidates: string[]) => Promise<void>;
type Category = 'all' | 'symbol' | 'text' | 'connection' | 'source';
const PAGE_SIZE = 40;
const fieldStyle = 'min-h-11 min-w-0 rounded-lg border border-[var(--border-hover)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]';
const actionStyle = 'min-h-11 rounded-lg border border-[var(--border-hover)] px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50';
export function reviewCategory(item: UnresolvedItem): Exclude<Category, 'all'> {
  if (item.code === 'UNREADABLE_SYMBOL') return 'symbol';
  if (['AMBIGUOUS_OCR', 'UNREADABLE_TEXT'].includes(item.code)) return 'text';
  if (/LINE|CROSS_PAGE|CONTINUITY|CONNECTION/.test(item.code)) return 'connection';
  return 'source';
}

export function DrawingReviewQueue({ document, selectedDisplayId, onSelectDisplayId, onCorrect, correctingDisplayId }: {
  document: DrawingDocumentV3; selectedDisplayId?: string;
  onSelectDisplayId?: (id: string) => void; onCorrect?: CorrectionHandler; correctingDisplayId?: string;
}) {
  const [query, setQuery] = useState(''), [category, setCategory] = useState<Category>('all');
  const [page, setPage] = useState('all'), [limit, setLimit] = useState(PAGE_SIZE);
  // Keep unsaved input when filtering or revealing more rows. Parent keys this queue by document identity.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const inFlight = useRef(false);
  const symbols = useMemo(() => new Map(document.evidenceGraph.symbols.map((s) => [s.displayId, s])), [document.evidenceGraph.symbols]);
  const texts = useMemo(() => new Map(document.evidenceGraph.texts.map((t) => [t.displayId, t])), [document.evidenceGraph.texts]);
  const indexed = useMemo(() => document.unresolvedItems.map((item) => ({ item, category: reviewCategory(item),
    search: [item.displayId, item.note, item.code, labelReadFailureCode(item.code), ...(item.candidates ?? [])].join(' ').normalize('NFKC').toLocaleLowerCase('ko-KR'),
  })), [document.unresolvedItems]);
  const pageNumbers = [...new Set(document.unresolvedItems.map((item) => item.pageIndex))].sort((a, b) => a - b);
  const normalized = query.trim().normalize('NFKC').toLocaleLowerCase('ko-KR');
  const filtered = indexed.filter((entry) => (category === 'all' || category === entry.category)
    && (page === 'all' || String(entry.item.pageIndex) === page) && (!normalized || entry.search.includes(normalized)));
  const clear = () => { setQuery(''); setCategory('all'); setPage('all'); setLimit(PAGE_SIZE); };
  const busy = Boolean(saving || correctingDisplayId);
  const submit = async (item: UnresolvedItem, value: string) => {
    if (!value.trim() || inFlight.current || correctingDisplayId || !item.displayId || !onCorrect) return;
    inFlight.current = true; setSaving(item.id); setErrors((current) => ({ ...current, [item.id]: '' }));
    try {
      await onCorrect(item.displayId, value.trim(), item.candidates ?? []);
      setDrafts((current) => ({ ...current, [item.id]: '' }));
    } catch (cause) {
      setErrors((current) => ({ ...current, [item.id]: cause instanceof Error ? cause.message : '수정값을 저장하지 못했습니다. 입력을 유지했습니다.' }));
    } finally { inFlight.current = false; setSaving(null); }
  };
  return <section aria-label="미확정 검토 작업" className="min-w-0">
    <div className="mb-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-3 sm:p-4">
      <h4 className="text-base font-semibold">검토할 항목 찾기</h4>
      <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">원본과 대조해 종류·문자를 수정하세요. 결선·원본 품질 문제는 값 수정만으로 해제되지 않습니다.</p>
      <div className="mt-3 flex min-w-0 flex-wrap gap-2">
        <label className="relative min-w-0 flex-1 basis-full"><span className="sr-only">미확정 항목 검색</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-[var(--text-secondary)]" aria-hidden="true" />
          <input type="search" value={query} maxLength={200} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE_SIZE); }}
            placeholder="기기 번호, 후보, 사유로 검색" className={`${fieldStyle} w-full pl-9`} />
        </label>
        <label className="min-w-0 flex-1"><span className="sr-only">미확정 항목 종류</span>
          <select value={category} onChange={(e) => { setCategory(e.target.value as Category); setLimit(PAGE_SIZE); }} className={`${fieldStyle} w-full`}>
            <option value="all">모든 사유</option><option value="symbol">기기 종류</option><option value="text">문자 판독</option><option value="connection">결선·연결</option><option value="source">원본·기타</option>
          </select>
        </label>
        <label className="min-w-0 flex-1"><span className="sr-only">미확정 항목 페이지</span>
          <select value={page} onChange={(e) => { setPage(e.target.value); setLimit(PAGE_SIZE); }} className={`${fieldStyle} w-full`}>
            <option value="all">모든 페이지</option>{pageNumbers.map((p) => <option key={p} value={p}>{p + 1}페이지</option>)}
          </select>
        </label>
        <button type="button" onClick={clear} className={`${actionStyle} basis-full sm:basis-auto`}>필터 초기화</button>
      </div>
      <p role="status" aria-live="polite" className="mt-3 text-xs tabular-nums text-[var(--text-secondary)]">표시 {Math.min(limit, filtered.length)} / 검색 결과 {filtered.length}건 · 전체 미확정 {document.unresolvedItems.length}건</p>
    </div>
    {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--border-hover)] px-4 py-8 text-center">
      <p className="text-sm font-medium">{document.unresolvedItems.length ? '현재 필터에 맞는 항목이 없습니다.' : 'ESA가 잠정 보류한 항목이 없습니다.'}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{document.unresolvedItems.length ? '필터를 초기화해 전체 미확정 항목을 확인하세요.' : '미확정 목록이 비어 있어도 도면 전체의 정확도를 보증하지는 않습니다.'}</p>
    </div> : <ul aria-label="검토 항목 목록" className="space-y-3">{filtered.slice(0, limit).map(({ item, category }) => {
      const symbol = item.displayId ? symbols.get(item.displayId) : undefined, text = item.displayId ? texts.get(item.displayId) : undefined;
      const editable = (category === 'symbol' && Boolean(symbol)) || (category === 'text' && Boolean(text));
      return <li key={item.id} className={`min-w-0 rounded-xl border p-3 sm:p-4 ${item.displayId && item.displayId === selectedDisplayId ? 'border-[var(--color-primary)] bg-[var(--bg-secondary)]' : 'border-[var(--border-default)] bg-[var(--bg-primary)]'}`}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <span className="max-w-full break-all rounded-md bg-[var(--bg-secondary)] px-2 py-1 text-xs font-semibold tabular-nums">{item.displayId ?? item.id}</span>
          <span className="text-xs text-[var(--text-secondary)]">{item.pageIndex + 1}페이지</span>
        </div>
        <p className="mt-3 flex items-start gap-2 text-sm font-semibold"><AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{labelReadFailureCode(item.code)}</p>
        <p className="mt-1 break-words text-sm leading-relaxed text-[var(--text-secondary)]">{item.note}</p>
        {item.recommendedUpload && <p className="mt-2 text-sm text-[var(--text-secondary)]">재업로드 기준: {item.recommendedUpload.note}</p>}
        {item.displayId && onSelectDisplayId && <button type="button" onClick={() => onSelectDisplayId(item.displayId!)} aria-label={`${item.displayId} 원본 위치 확인`}
          className={`${actionStyle} mt-3 inline-flex items-center gap-1.5 text-[var(--color-primary)]`}><MapPin size={15} aria-hidden="true" />원본 위치 확인</button>}
        {editable && onCorrect ? <div className="mt-3">
          <p className="mb-2 break-words text-xs text-[var(--text-secondary)]">현재 판독: {text?.confirmedText ?? text?.rawText ?? symbol?.confirmedType ?? symbol?.typeCandidates.join(' / ')}</p>
          {Boolean(item.candidates?.length) && <div className="mb-3 flex flex-wrap gap-2">{[...new Set(item.candidates)].map((candidate) => <button key={candidate} type="button" disabled={busy}
            onClick={() => void submit(item, candidate)} className={`${actionStyle} max-w-full break-words bg-[var(--bg-secondary)]`}>{candidate} 선택</button>)}</div>}
          <form aria-busy={busy} className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void submit(item, drafts[item.id] ?? ''); }}>
            <label htmlFor={`review-value-${item.id}`} className="sr-only">{item.displayId} 직접 수정값</label>
            <input id={`review-value-${item.id}`} value={drafts[item.id] ?? ''} maxLength={200} disabled={busy}
              onChange={(e) => setDrafts((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="원본에서 확인한 값"
              className={`${fieldStyle} flex-1 basis-40`} aria-invalid={Boolean(errors[item.id])} aria-describedby={errors[item.id] ? `review-error-${item.id}` : undefined} />
            <button type="submit" disabled={busy || !drafts[item.id]?.trim()} className={`${actionStyle} flex items-center gap-1.5 border-transparent bg-[var(--color-primary)] text-[var(--drawing-on-primary)]`}>
              <Check size={15} aria-hidden="true" />{saving === item.id ? '반영 중…' : '수정 반영'}
            </button>
          </form>
          {errors[item.id] && <p id={`review-error-${item.id}`} role="alert" className="mt-2 text-sm text-[var(--drawing-error-text)]">{errors[item.id]}</p>}
        </div> : <p className="mt-3 rounded-lg bg-[var(--bg-secondary)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]">{editable ? '이 결과는 현재 읽기 전용입니다.' : '이 항목은 직접 값 수정 대상이 아닙니다. 원본을 확인하고 필요한 근거를 보완하거나 재분석하세요.'}</p>}
      </li>;
    })}</ul>}
    {limit < filtered.length && <button type="button" onClick={() => setLimit((value) => value + PAGE_SIZE)} className={`${actionStyle} mt-4 w-full`}>다음 {Math.min(PAGE_SIZE, filtered.length - limit)}건 더 보기</button>}
  </section>;
}
