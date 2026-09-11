'use client';

import { useMemo, useRef, useState } from 'react';
import { SLD_COMPONENT_TYPES } from '@/lib/sld-component-types';
import { SYMBOL_CLASSIFICATION_REASONS, type SymbolClassification } from '@/lib/symbol-classification';

export interface ClassificationRow {
  id: string; label?: string; sourceType: string; classification?: SymbolClassification;
}
const TYPE_NAMES: Record<string, string> = {
  transformer: '변압기', breaker: '차단기', cable: '케이블', bus: '모선', generator: '발전기', motor: '전동기',
  capacitor: '콘덴서', reactor: '리액터', load: '부하', switch: '개폐기', relay: '계전기', meter: '계기',
  panel: '반', ups: 'UPS', mcc: '전동기 제어반', arrester: '피뢰기', ground: '접지', lamp: '램프', fuse: '퓨즈',
  grid_connection: '계통 접속', source: '전원', annotation: '주석', unknown: '미판독',
};
const methodNames: Record<SymbolClassification['method'], string> = {
  'approved-exact': '승인 심볼 일치', 'company-library': '회사 사전', 'existing-parser': '기존 파서',
  'family-context': '유사 형상·문맥', 'human-correction': '사람 수정', unresolved: '근거 확인 필요',
};
const control = 'min-h-11 rounded-lg border border-[var(--border-hover)] bg-[var(--bg-primary)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:opacity-50';

/** Classification-first, optional correction. No per-row approval requirement. */
export function SymbolClassificationResults({ title, rows, onSelect, onCorrect, correcting }: {
  title: string; rows: ClassificationRow[]; onSelect?: (id: string) => void;
  onCorrect?: (id: string, value: string, candidates: string[]) => Promise<void>; correcting?: boolean;
}) {
  const [query, setQuery] = useState(''), [exceptionsOnly, setExceptionsOnly] = useState(false), [limit, setLimit] = useState(40);
  const [editing, setEditing] = useState<string | null>(null), [selected, setSelected] = useState('unknown');
  const [error, setError] = useState<string | null>(null), [saving, setSaving] = useState(false);
  const active = useRef(false);
  const data = useMemo(() => rows.filter((row) => row.classification).map((row) => ({ ...row, classification: row.classification! })), [rows]);
  const counts = useMemo(() => data.reduce((out, row) => {
    out[row.classification.status]++; if (row.classification.method === 'family-context' && row.classification.status === 'classified') out.inferred++;
    return out;
  }, { classified: 0, review: 0, unread: 0, inferred: 0 }), [data]);
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of data) if (row.classification.selectedType) counts.set(row.classification.selectedType, (counts.get(row.classification.selectedType) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [data]);
  const needle = query.trim().normalize('NFKC').toLocaleLowerCase('ko-KR');
  const filtered = data.filter((row) => (!exceptionsOnly || row.classification.status !== 'classified')
    && (!needle || [row.id, row.label, row.classification.selectedType, TYPE_NAMES[row.classification.selectedType ?? 'unknown']]
      .join(' ').normalize('NFKC').toLocaleLowerCase('ko-KR').includes(needle)));
  const submit = async (row: ClassificationRow) => {
    if (!onCorrect || active.current || correcting) return;
    active.current = true; setSaving(true); setError(null);
    try { await onCorrect(row.id, selected, row.classification?.candidates.map((item) => item.type) ?? []); setEditing(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '종류 수정을 반영하지 못했습니다.'); }
    finally { active.current = false; setSaving(false); }
  };
  if (!data.length) return null;
  return <section aria-label={title} className="min-w-0 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-3 sm:p-4">
    <h4 className="text-base font-semibold">{title}</h4>
    <p role="status" className="mt-2 text-sm tabular-nums">분류됨 {counts.classified}건 · 그중 유사 형상·문맥 자동 분류 {counts.inferred}건 · 예외 검토 {counts.review}건 · 미판독 {counts.unread}건</p>
    <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">ESA가 먼저 분류한 결과입니다. 항목마다 승인할 필요는 없습니다. 기기 종류 분류와 정격·결선·수량의 근거 확정은 별개이며, 형상 유사도는 정답 확률이 아닙니다.</p>
    <p className="mt-2 text-xs text-[var(--text-secondary)]">{groups.map(([type, count]) => `${TYPE_NAMES[type] ?? type} ${count}건`).join(' · ') || '자동 분류한 종류 없음'}</p>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <label className="min-w-0 flex-1"><span className="sr-only">분류 결과 검색</span><input type="search" value={query} maxLength={160}
        onChange={(event) => { setQuery(event.target.value); setLimit(40); }} placeholder="기기 번호·블록명·분류 검색" className={`${control} w-full min-w-0`} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={exceptionsOnly}
        onChange={(event) => { setExceptionsOnly(event.target.checked); setLimit(40); }} />분류 예외만 보기</label>
    </div>
    {!filtered.length && <p className="py-5 text-sm">표시 조건에 해당하는 항목이 없습니다. 정격·결선의 미확정 사유는 별도 검토 목록에 유지됩니다.</p>}
    <ul className="mt-3 divide-y divide-[var(--border-default)]">{filtered.slice(0, limit).map((row) => {
      const c = row.classification, name = c.selectedType ? TYPE_NAMES[c.selectedType] ?? c.selectedType : c.candidates.map((v) => TYPE_NAMES[v.type] ?? v.type).join(' / ') || '미판독';
      return <li key={row.id} className="min-w-0 py-3">
        <div className="flex min-w-0 flex-wrap justify-between gap-2"><p className="min-w-0 break-words text-sm"><strong>{row.id}</strong>{row.label ? ` · ${row.label}` : ''}</p>
          <span className="text-xs text-[var(--text-secondary)]">{c.status === 'classified' ? c.method === 'family-context' ? '자동 분류' : '분류됨' : c.status === 'review' ? '예외 검토' : '미판독'}</span></div>
        <p className="mt-1 text-sm font-semibold">{name} <span className="font-normal text-[var(--text-secondary)]">· {methodNames[c.method]}</span></p>
        <details className="mt-2 text-xs"><summary className="min-h-11 cursor-pointer py-3">{row.id} 분류 근거</summary>
          <ul className="space-y-1">{c.reasons.map((reason) => <li key={reason}>{SYMBOL_CLASSIFICATION_REASONS[reason]}</li>)}</ul>
          {c.candidates.map((candidate) => <p key={candidate.type} className="mt-1">{TYPE_NAMES[candidate.type] ?? candidate.type}: 형상 유사도 {candidate.similarity.toFixed(3)} (확률 아님)</p>)}
          {c.referenceKeys.length > 0 && <p className="mt-2 break-all text-[var(--text-secondary)]">대조 사례: {c.referenceKeys.join(' · ')}</p>}
          <p className="mt-2 text-[var(--text-secondary)]">기존 판독 종류: {TYPE_NAMES[row.sourceType] ?? row.sourceType}. 자동 분류는 독립 검증·사람 승인을 대신하지 않습니다.</p>
        </details>
        <div className="flex flex-wrap gap-2">{onSelect && <button type="button" className={control} onClick={() => onSelect(row.id)}>{row.id} 원본 보기</button>}
          {onCorrect && <button type="button" className={control} disabled={saving || correcting} onClick={() => {
            setEditing(row.id); setSelected(c.selectedType ?? c.candidates[0]?.type ?? 'unknown'); setError(null);
          }}>{row.id} 분류 수정</button>}</div>
        {editing === row.id && onCorrect && <form className="mt-3 rounded-lg border border-[var(--border-default)] p-3" onSubmit={(event) => { event.preventDefault(); void submit(row); }}>
          <label className="block text-xs">원본에서 확인한 기기 종류<select aria-label={`${row.id} 분류 수정값`} value={selected} disabled={saving || correcting}
            onChange={(event) => setSelected(event.target.value)} className={`${control} mt-1 w-full`}>
            {SLD_COMPONENT_TYPES.map((type) => <option key={type} value={type}>{TYPE_NAMES[type] ?? type}</option>)}
          </select></label>
          <div className="mt-2 flex gap-2"><button type="submit" disabled={saving || correcting} className={control}>{saving ? '반영 중…' : '종류 수정 반영'}</button>
            <button type="button" disabled={saving} className={control} onClick={() => setEditing(null)}>취소</button></div>
          {error && <p role="alert" className="mt-2 text-sm text-[var(--drawing-error-text)]">{error}</p>}
        </form>}
      </li>;
    })}</ul>
    {filtered.length > limit && <button type="button" className={`${control} mt-3 w-full`} onClick={() => setLimit((current) => current + 40)}>분류 결과 {Math.min(40, filtered.length - limit)}건 더 보기</button>}
    <p className="mt-3 text-xs tabular-nums text-[var(--text-secondary)]">표시 {Math.min(limit, filtered.length)} / 검색 결과 {filtered.length}건 · 검출 심볼 {data.length}건. 미검출 기기의 수는 포함하지 않습니다.</p>
  </section>;
}
