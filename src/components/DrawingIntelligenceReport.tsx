'use client';

import { useMemo, useState } from 'react';
import type { DrawingDocumentV3 } from '@/agent/drawing/types-v3';

export interface DrawingIntelligenceReportProps {
  document: DrawingDocumentV3;
  onSelectDisplayId?: (id: string) => void;
  selectedDisplayId?: string;
  onCorrect?: (targetDisplayId: string, selectedValue: string, candidates: string[]) => void;
}

export default function DrawingIntelligenceReport({
  document,
  onSelectDisplayId,
  selectedDisplayId,
  onCorrect,
}: DrawingIntelligenceReportProps) {
  const [tab, setTab] = useState<'counts' | 'unresolved' | 'devices' | 'lines' | 'relations' | 'recs'>('counts');

  const title = document.title;
  const status = document.verification.documentStatus;
  const verified95 = document.verification.verified95;

  const selectedUnresolved = useMemo(
    () => document.unresolvedItems.filter((u) => u.displayId === selectedDisplayId),
    [document.unresolvedItems, selectedDisplayId],
  );

  return (
    <div className="space-y-4 text-sm text-[var(--text-primary)]">
      <header className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold">{title}</h2>
          <StatusPill status={status} />
          {verified95 ? (
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">95% 실증</span>
          ) : (
            <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[11px] text-[var(--text-tertiary)]">
              95% 배지 미활성
            </span>
          )}
        </div>
        <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
          페이지 {document.pageCount} · 근거 추적률 {(document.verification.evidenceTraceRate * 100).toFixed(0)}%
          · 스키마 v{document.schemaVersion}
        </p>
        <div className="mt-2 grid gap-1 text-[12px] sm:grid-cols-2">
          {document.pages.map((p) => (
            <div key={p.pageIndex} className="rounded-lg border border-[var(--border-default)] px-2 py-1">
              P{String(p.pageIndex + 1).padStart(2, '0')} · {p.status} · {p.drawingKind ?? '—'}
            </div>
          ))}
        </div>
      </header>

      <nav className="flex flex-wrap gap-1">
        {([
          ['counts', '수량'],
          ['unresolved', '미확정'],
          ['devices', '기기'],
          ['lines', '선로'],
          ['relations', '관계'],
          ['recs', '제안'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${
              tab === id
                ? 'bg-[var(--color-primary)] text-white'
                : 'border border-[var(--border-default)] bg-[var(--bg-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'counts' && (
        <table className="w-full border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-[var(--border-default)] text-[var(--text-tertiary)]">
              <th className="py-1 pr-2">기기</th>
              <th className="py-1 pr-2">확정</th>
              <th className="py-1 pr-2">모호</th>
              <th className="py-1 pr-2">누락의심</th>
              <th className="py-1 pr-2">고유장치</th>
              <th className="py-1 pr-2">출현</th>
              <th className="py-1">상태</th>
            </tr>
          </thead>
          <tbody>
            {document.equipmentCounts.map((row) => (
              <tr key={row.equipmentKind} className="border-b border-[var(--border-default)]/60">
                <td className="py-1 pr-2 font-medium">{row.equipmentKind}</td>
                <td className="py-1 pr-2">{row.confirmed}</td>
                <td className="py-1 pr-2">{row.ambiguous}</td>
                <td className="py-1 pr-2">{row.missingSuspected}</td>
                <td className="py-1 pr-2">{row.physicalEquipmentCount ?? '미확정'}</td>
                <td className="py-1 pr-2">{row.symbolOccurrences}</td>
                <td className="py-1">{row.countStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'unresolved' && (
        <ul className="space-y-2">
          {document.unresolvedItems.map((u) => (
            <li
              key={u.id}
              className={`rounded-lg border p-3 ${
                selectedDisplayId === u.displayId
                  ? 'border-[var(--color-primary)]'
                  : 'border-[var(--border-default)]'
              }`}
            >
              <button
                type="button"
                className="text-left font-medium text-[var(--color-primary)]"
                onClick={() => u.displayId && onSelectDisplayId?.(u.displayId)}
              >
                {u.displayId ?? u.id} · {u.code}
              </button>
              <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{u.note}</p>
              {u.candidates && u.candidates.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {u.candidates.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="rounded-md border border-[var(--border-default)] px-2 py-0.5 text-[11px]"
                      onClick={() => onCorrect?.(u.displayId ?? u.id, c, u.candidates ?? [])}
                    >
                      {c} 선택
                    </button>
                  ))}
                </div>
              )}
              {u.recommendedUpload && (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                  {u.recommendedUpload.note}
                </p>
              )}
            </li>
          ))}
          {document.unresolvedItems.length === 0 && (
            <p className="text-[var(--text-tertiary)]">미확정 항목 없음</p>
          )}
          {selectedUnresolved.length > 0 && null}
        </ul>
      )}

      {tab === 'devices' && (
        <EntityTable
          rows={document.evidenceGraph.symbols.map((s) => ({
            id: s.displayId,
            sub: `${s.equipmentId ?? '—'} · ${(s.confirmedType ?? s.typeCandidates[0] ?? '')} · ${s.certainty}`,
            label: s.rawLabel ?? s.confirmedType ?? s.typeCandidates[0] ?? '',
          }))}
          selected={selectedDisplayId}
          onSelect={onSelectDisplayId}
        />
      )}

      {tab === 'lines' && (
        <EntityTable
          rows={document.evidenceGraph.lines.map((l) => ({
            id: l.displayId,
            sub: `${l.lineKind} · ${l.certainty}`,
            label: l.holdCode ?? '—',
          }))}
          selected={selectedDisplayId}
          onSelect={onSelectDisplayId}
        />
      )}

      {tab === 'relations' && (
        <div className="space-y-3">
          <h3 className="text-[12px] font-semibold text-[var(--text-tertiary)]">페이지 내</h3>
          <ul className="space-y-1 text-[12px]">
            {document.evidenceGraph.relations.map((r) => (
              <li key={r.id}>
                <button type="button" className="text-[var(--color-primary)]" onClick={() => onSelectDisplayId?.(r.displayId)}>
                  {r.displayId}
                </button>
                {' '}{r.from} → {r.to}
              </li>
            ))}
          </ul>
          <h3 className="text-[12px] font-semibold text-[var(--text-tertiary)]">페이지 간</h3>
          <ul className="space-y-1 text-[12px]">
            {document.crossPageRelations.map((r) => (
              <li key={r.id}>
                {r.displayId} · P{r.fromPage + 1}→P{r.toPage + 1} · {r.status}
                {r.reason ? ` (${r.reason})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'recs' && (
        <ul className="space-y-2">
          {document.recommendations.map((r) => (
            <li key={r.id} className="rounded-lg border border-[var(--border-default)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px]">{r.id}</span>
                <span className="rounded bg-slate-500/15 px-1.5 text-[10px]">{r.status}</span>
                <span className="text-[10px] uppercase text-[var(--text-tertiary)]">{r.severity}</span>
              </div>
              <p className="mt-1 font-medium">{r.problem}</p>
              <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{r.recommendedAction}</p>
              {r.requiredInputs.length > 0 && (
                <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                  필요 입력: {r.requiredInputs.join(', ')}
                </p>
              )}
              <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                근거 {r.evidenceIds.length} · 계산 {r.calcReceiptIds.length} · 표준 {r.standardRefs.length}
              </p>
            </li>
          ))}
          {document.recommendations.length === 0 && (
            <p className="text-[var(--text-tertiary)]">제안 없음</p>
          )}
        </ul>
      )}

      <section className="rounded-xl border border-[var(--border-default)] p-3 text-[11px] text-[var(--text-tertiary)]">
        정격 판독 {document.ratedValues.length}건 · HOLD 사유:{' '}
        {document.verification.holdReasons.join(', ') || '없음'} · engine{' '}
        {document.verification.productionFingerprint?.engineVersion}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === 'COMPLETE' ? 'bg-emerald-600 text-white'
      : status === 'HOLD' ? 'bg-amber-600 text-white'
        : 'bg-slate-600 text-white';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${color}`}>{status}</span>;
}

function EntityTable({
  rows,
  selected,
  onSelect,
}: {
  rows: Array<{ id: string; sub: string; label: string }>;
  selected?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-[var(--border-default)] rounded-xl border border-[var(--border-default)]">
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            className={`flex w-full flex-col items-start px-3 py-2 text-left ${
              selected === r.id ? 'bg-[var(--color-primary)]/10' : ''
            }`}
            onClick={() => onSelect?.(r.id)}
          >
            <span className="font-mono text-[12px] font-semibold text-[var(--color-primary)]">{r.id}</span>
            <span className="text-[12px]">{r.label}</span>
            <span className="text-[11px] text-[var(--text-tertiary)]">{r.sub}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
