'use client';

import { useState } from 'react';

import type { DrawingDocumentV3 } from '@/agent/drawing/types-v3';
import {
  labelCertainty,
  labelCountStatus,
  labelCrossPageStatus,
  labelDocumentReadStatus,
  labelLineKind,
  labelReadFailureCode,
  labelRecommendationStatus,
} from '@/components/drawing-v3-labels';

interface DrawingDocumentV3ReportProps {
  document: DrawingDocumentV3;
  selectedDisplayId?: string;
  onSelectDisplayId?: (id: string) => void;
  onCorrect?: (targetDisplayId: string, selectedValue: string, candidates: string[]) => Promise<void>;
  correctingDisplayId?: string;
}

type Tab = 'counts' | 'devices' | 'relations' | 'continuity' | 'values' | 'unresolved' | 'recommendations';

export function DrawingDocumentV3Report({ document, selectedDisplayId, onSelectDisplayId, onCorrect, correctingDisplayId }: DrawingDocumentV3ReportProps) {
  const [tab, setTab] = useState<Tab>('counts');
  const [draftCorrections, setDraftCorrections] = useState<Record<string, string>>({});
  const symbolNumbers = new Map(document.evidenceGraph.symbols.map((node) => [node.id, node.displayId]));
  const lineNumbers = new Map(document.evidenceGraph.lines.map((node) => [node.id, node.displayId]));
  const tabs: Array<[Tab, string]> = [
    ['counts', '수량'], ['devices', '기기·선로'], ['relations', '관계'], ['continuity', '경계 연결'], ['values', '정격·계산'], ['unresolved', `미확정 ${document.unresolvedItems.length}`], ['recommendations', '제안'],
  ];

  return (
    <section className="min-w-0 overflow-hidden rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-primary)] text-sm shadow-[var(--shadow-card)]">
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-secondary)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-[var(--text-primary)]">{document.title}</h3>
          <span className="text-[11px] font-bold text-[var(--text-secondary)]">● {labelDocumentReadStatus(document.verification.documentStatus)}</span>
          <span className="text-[11px] text-[var(--text-tertiary)]" title="고정 홀드아웃·현장 라벨·3회 반복·외부 서명 게이트">95% {document.verification.verified95 ? '외부 실증 완료' : '외부 실증 전'}</span>
        </div>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">전체 {document.pageCount}페이지 · 요청 {document.pages.length}페이지 · 구획 {document.coverageLedger.regionsComplete}/{document.coverageLedger.plannedRegionCount}</p>
      </header>
      <nav className="flex flex-wrap gap-1 border-b border-[var(--border-default)] p-3" aria-label="도면 분석 결과 범주">
        {tabs.map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={`min-h-11 rounded-lg px-3 text-xs font-semibold ${tab === id ? 'bg-[var(--color-primary)] text-white' : 'border border-[var(--border-default)]'}`}>{label}</button>)}
      </nav>
      <div className="max-h-[520px] overflow-auto p-4">
        {tab === 'counts' && (document.equipmentCounts.length > 0 ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs tabular-nums"><thead><tr className="border-b border-[var(--border-default)]"><th className="py-2">기기</th><th>확정</th><th>모호</th><th>누락 의심</th><th>고유/출현</th><th>판정</th></tr></thead><tbody>{document.equipmentCounts.map((row) => <tr key={row.equipmentKind} className="border-b border-[var(--border-default)]"><th className="py-2">{row.equipmentKind}</th><td>{row.confirmed}</td><td>{row.ambiguous}</td><td>{row.missingSuspected}</td><td>{row.physicalEquipmentCount ?? '—'}/{row.symbolOccurrences}</td><td>{labelCountStatus(row.countStatus)}</td></tr>)}</tbody></table></div> : <p className="py-8 text-center text-xs text-[var(--text-secondary)]">확정하거나 검토할 기기 수량이 없습니다.</p>)}
        {tab === 'devices' && <ul className="divide-y divide-[var(--border-default)]">{document.evidenceGraph.symbols.map((node) => <li key={node.id}><button type="button" onClick={() => onSelectDisplayId?.(node.displayId)} className={`min-h-11 w-full py-2 text-left ${selectedDisplayId === node.displayId ? 'font-bold text-[var(--color-primary)]' : ''}`}>{node.displayId} · {node.confirmedType ?? node.typeCandidates.join('/')}{node.rawLabel ? ` · ${node.rawLabel}` : ''} · {labelCertainty(node.certainty)}</button></li>)}{document.evidenceGraph.lines.map((node) => <li key={node.id}><button type="button" onClick={() => onSelectDisplayId?.(node.displayId)} className={`min-h-11 w-full py-2 text-left ${selectedDisplayId === node.displayId ? 'font-bold text-[var(--color-primary)]' : ''}`}>{node.displayId} · {labelLineKind(node.lineKind)} · {labelCertainty(node.certainty)}</button></li>)}</ul>}
        {tab === 'relations' && (document.evidenceGraph.relations.length + document.crossPageRelations.length > 0 ? <ul className="divide-y divide-[var(--border-default)] text-xs">{document.evidenceGraph.relations.map((relation) => <li key={relation.id}><button type="button" className="min-h-11 w-full py-2 text-left text-[var(--color-primary)]" onClick={() => onSelectDisplayId?.(relation.displayId)}>{relation.displayId} · {symbolNumbers.get(relation.from) ?? relation.from} ↔ {symbolNumbers.get(relation.to) ?? relation.to} · 선로 {relation.lineId ? (lineNumbers.get(relation.lineId) ?? relation.lineId) : '미확정'} · {labelCertainty(relation.certainty)}</button></li>)}{document.crossPageRelations.map((relation) => <li key={relation.id}><button type="button" onClick={() => onSelectDisplayId?.(relation.displayId)} className="min-h-11 w-full py-2 text-left">{relation.displayId} · P{relation.fromPage + 1} ↔ P{relation.toPage + 1} · {labelCrossPageStatus(relation.status)}</button></li>)}</ul> : <p className="py-8 text-center text-xs text-[var(--text-secondary)]">표시할 연결 관계가 없습니다. 미확정 탭에서 선로 종단을 확인하세요.</p>)}
        {tab === 'continuity' && <div className="space-y-4 text-xs">
          <p className="rounded-lg bg-[var(--bg-secondary)] p-3 text-[var(--text-secondary)]">A는 분석 구획, C는 구획 경계 연결점, U는 합치지 못한 선 끝입니다. 구획 번호는 기기 수량에 포함되지 않습니다.</p>
          <p className="tabular-nums">구획 {(document.continuity?.regions ?? []).length} · 경계점 {(document.continuity?.continuations ?? []).length} · 미해결 {(document.continuity?.unresolvedEndpoints ?? []).length}</p>
          {(document.continuity?.continuations ?? []).length > 0 ? <ul className="divide-y divide-[var(--border-default)]">{document.continuity?.continuations.map((port) => <li key={port.id}><button type="button" onClick={() => onSelectDisplayId?.(port.displayId)} className={`min-h-11 w-full py-2 text-left ${selectedDisplayId === port.displayId ? 'font-bold text-[var(--color-primary)]' : ''}`}>{port.displayId} · P{port.pageIndex + 1} · {labelLineKind(port.lineKind)} · {port.observations.map((item) => item.regionDisplayId).join(' ↔ ')} · {port.status === 'merged' ? '합치기 완료' : port.status === 'hold' ? '보류' : '검토 예정'}</button></li>)}</ul> : <p className="py-6 text-center text-[var(--text-secondary)]">구획 경계를 통과하는 선이 검출되지 않았습니다.</p>}
        </div>}
        {tab === 'values' && <div className="space-y-5">
          <section aria-labelledby="rated-values-heading"><h4 id="rated-values-heading" className="font-semibold">판독 정격</h4>{document.ratedValues.length > 0 ? <ul className="mt-2 divide-y divide-[var(--border-default)] text-xs tabular-nums">{document.ratedValues.map((item) => <li key={item.id}><button type="button" onClick={() => onSelectDisplayId?.(item.displayId)} className="min-h-11 w-full py-2 text-left"><strong>{item.displayId}</strong> · {item.field} · {item.normalized ? `${item.normalized.value} ${item.normalized.unit}` : item.raw} · {labelCertainty(item.certainty)}</button></li>)}</ul> : <p className="mt-2 text-xs text-[var(--text-secondary)]">판독된 정격값이 없습니다.</p>}</section>
          <section aria-labelledby="calculations-heading"><h4 id="calculations-heading" className="font-semibold">계산 연결</h4>{document.calculations.length > 0 ? <ul className="mt-2 divide-y divide-[var(--border-default)] text-xs tabular-nums">{document.calculations.map((item) => <li key={item.id} className="py-2"><p><strong>{item.label}</strong> · {item.value === undefined ? '재계산 필요' : `${item.value} ${item.unit ?? ''}`} · {item.compliant === null ? '판정 보류' : item.compliant ? '적합' : '부적합'}</p><p className="mt-1 text-[var(--text-tertiary)]">근거 {item.evidenceIds.length}건 · 영수증 {item.receiptHash ? item.receiptHash.slice(0, 12) : '무효/없음'}</p></li>)}</ul> : <p className="mt-2 text-xs text-[var(--text-secondary)]">실행된 계산이 없습니다.</p>}</section>
        </div>}
        {tab === 'unresolved' && (document.unresolvedItems.length > 0 ? <ul className="space-y-3">{document.unresolvedItems.map((item) => <li key={item.id} className="rounded-[10px] border border-[var(--border-default)] p-3"><button type="button" className="min-h-11 font-semibold text-[var(--color-primary)]" onClick={() => item.displayId && onSelectDisplayId?.(item.displayId)}>{item.displayId ?? item.id} · {labelReadFailureCode(item.code)}</button><p className="text-xs text-[var(--text-secondary)]">{item.note}</p>{item.recommendedUpload && <p className="mt-2 text-xs font-medium text-[var(--color-warning)]">재업로드 기준: {item.recommendedUpload.note}</p>}{item.displayId && item.candidates && item.candidates.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{item.candidates.map((candidate) => <button key={candidate} type="button" disabled={correctingDisplayId === item.displayId} className="min-h-11 rounded-md border border-[var(--border-default)] px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void onCorrect?.(item.displayId!, candidate, item.candidates ?? [])}>{candidate} 선택</button>)}</div>}{item.displayId && onCorrect && <form className="mt-3 flex gap-2" aria-busy={correctingDisplayId === item.displayId} onSubmit={(event) => {
          event.preventDefault();
          const value = draftCorrections[item.id]?.trim();
          if (value && correctingDisplayId !== item.displayId) void onCorrect(item.displayId!, value, item.candidates ?? []);
        }}><label htmlFor={`correction-${item.id}`} className="sr-only">{item.displayId} 직접 수정값</label><input id={`correction-${item.id}`} name={`correction-${item.id}`} value={draftCorrections[item.id] ?? ''} disabled={correctingDisplayId === item.displayId} onChange={(event) => setDraftCorrections((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="직접 수정값 입력" className="min-h-11 min-w-0 flex-1 rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50" /><button type="submit" disabled={!draftCorrections[item.id]?.trim() || correctingDisplayId === item.displayId} className="min-h-11 rounded-md bg-[var(--color-primary)] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{correctingDisplayId === item.displayId ? '반영 중…' : '수정 반영'}</button></form>}</li>)}</ul> : <p className="py-8 text-center text-xs text-[var(--text-secondary)]">사용자 확인이 필요한 항목이 없습니다.</p>)}
        {tab === 'recommendations' && (document.recommendations.length > 0 ? <ol className="space-y-3">{document.recommendations.map((item) => <li key={item.id} className="rounded-[10px] border border-[var(--border-default)] p-3"><button type="button" disabled={item.relatedDisplayIds.length === 0} onClick={() => item.relatedDisplayIds[0] && onSelectDisplayId?.(item.relatedDisplayIds[0])} className="min-h-11 w-full text-left font-semibold disabled:cursor-default">{item.id} · {item.problem}</button><p className="text-xs text-[var(--text-secondary)]">{item.recommendedAction}</p><p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{labelRecommendationStatus(item.status)} · 원본 근거 {item.evidenceIds.length}건 · 계산 영수증 {item.calcReceiptIds.length}건 · 규칙 {item.standardRefs.length}건</p></li>)}</ol> : <p className="py-8 text-center text-xs text-[var(--text-secondary)]">현재 근거로 생성된 제안이 없습니다.</p>)}
      </div>
    </section>
  );
}
