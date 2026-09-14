'use client';

import { useMemo, useState } from 'react';
import type { DrawingDocumentV3 } from '@/agent/drawing/types-v3';
import { buildDrawingWorkProduct, drawingWorkProductCsv, INVENTORY_BASIS_LABELS } from '@/lib/drawing-work-product';

const control = 'min-h-11 rounded-lg border border-[var(--border-hover)] bg-[var(--bg-primary)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:opacity-50';
export function DrawingWorkProductPanel({ document, onSelect, onReview }: {
  document: DrawingDocumentV3; onSelect?: (id: string) => void; onReview?: (id: string) => void;
}) {
  const product = useMemo(() => buildDrawingWorkProduct(document), [document]);
  // A mixed or legacy document may not have a classification card for every
  // symbol. Do not offer a shortcut to a card that does not exist.
  const classificationIds = useMemo(() => new Set(document.evidenceGraph.symbols
    .filter((symbol) => symbol.classification).map((symbol) => symbol.id)), [document.evidenceGraph.symbols]);
  const [usableOnly, setUsableOnly] = useState(false), [limit, setLimit] = useState(40);
  const [exportError, setExportError] = useState<string | null>(null);
  const rows = product.rows.filter((row) => !usableOnly || row.usableForInventory);
  const download = (onlyUsable: boolean) => {
    let url: string | undefined;
    try {
      url = URL.createObjectURL(new Blob([drawingWorkProductCsv(product, onlyUsable)], { type: 'text/csv;charset=utf-8' }));
      const link = window.document.createElement('a');
      link.href = url; link.download = `esa-inventory-${onlyUsable ? 'usable' : 'all'}.csv`;
      window.document.body.appendChild(link); link.click(); link.remove(); setExportError(null);
    } catch { setExportError('기기표를 내보내지 못했습니다. 현재 결과를 유지했습니다.'); }
    finally { if (url) { const release = url; setTimeout(() => URL.revokeObjectURL(release), 1000); } }
  };
  return <section aria-label="AX 기기표" className="min-w-0 space-y-4">
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-4">
      <h4 className="text-base font-semibold">재입력 없는 기기표 초안</h4>
      <p role="status" className="mt-2 text-sm tabular-nums">기기표 사용 가능 {product.totals.usable} / 검출 {product.totals.observed}건 · 기존 판독 {product.totals.confirmedReadings}건 · 자동 분류 활용 {product.totals.automaticClassifications}건</p>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">기기 종류를 정리한 초안입니다. 검출 기호 출현 건수이며 물리 장비 대수나 정확도가 아닙니다. 정격·결선·계산의 미확정 상태와 원본은 그대로 보존합니다.</p>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">원본 문서 상태: {product.sourceDocumentStatus} · 미검출 항목은 이 화면의 분모에 포함되지 않습니다. 전체 검토 완료를 의미하지 않습니다.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={control} disabled={!product.rows.length} onClick={() => download(false)}>전체 기기표 CSV</button>
      <button type="button" className={control} disabled={!product.totals.usable} onClick={() => download(true)}>사용 가능 기기표 CSV</button>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={usableOnly} onChange={(event) => { setUsableOnly(event.target.checked); setLimit(40); }} />기기표 사용 가능 항목만</label>
    </div>
    {exportError && <p role="alert" className="text-sm text-[var(--drawing-error-text)]">{exportError}</p>}
    <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[360px] text-left text-xs tabular-nums">
      <caption className="mb-2 text-left text-sm font-semibold">분류별 검출 기호 집계 · 물리 대수 아님</caption>
      <thead><tr className="border-b border-[var(--border-default)]"><th scope="col" className="p-2">종류</th><th scope="col">기존 판독</th><th scope="col">자동 분류</th><th scope="col">초안 합계</th></tr></thead>
      <tbody>{product.groups.map((group) => <tr key={group.type} className="border-b border-[var(--border-default)]"><th scope="row" className="p-2 font-medium">{group.type}</th><td>{group.confirmedReadings}</td><td>{group.automaticClassifications}</td><td>{group.usableOccurrences}</td></tr>)}</tbody>
    </table></div>
    {!rows.length && <p className="py-4 text-sm">{product.rows.length ? '현재 사용 조건을 충족하는 기호가 없습니다. 필터를 해제해 검토 대상을 확인하세요.' : '검출된 기호가 없습니다. 도면이 비어 있거나 분석이 정확하다는 뜻은 아닙니다.'}</p>}
    <ul aria-label="기기표 항목" className="space-y-3">{rows.slice(0, limit).map((row, index) => <li key={`${row.symbolId}:${index}`} className="min-w-0 rounded-xl border border-[var(--border-default)] p-3">
      <p className="break-words text-sm font-semibold">{row.displayId} · {row.interpretedType ?? '종류 미확정'}{row.label ? ` · ${row.label}` : ''}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{row.pageIndex === null ? '페이지 미확인' : `${row.pageIndex + 1}페이지`} · {INVENTORY_BASIS_LABELS[row.basis]} · 원본 {row.originalType} / {row.originalCertainty}</p>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{row.reason}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onSelect && <button type="button" className={control} disabled={!row.source} onClick={() => onSelect(row.displayId)}>{row.displayId} 기기표 원본</button>}
        {onReview && classificationIds.has(row.symbolId) && <button type="button" className={control} onClick={() => onReview(row.displayId)}>{row.displayId} 분류·수정 열기</button>}
      </div>
    </li>)}</ul>
    {rows.length > limit && <button type="button" className={`${control} w-full`} onClick={() => setLimit((value) => value + 40)}>기기표 {Math.min(40, rows.length - limit)}건 더 보기</button>}
    <p className="text-xs text-[var(--text-secondary)]">표시 {Math.min(rows.length, limit)} / 필터 결과 {rows.length}건 · 정책 {product.version}</p>
  </section>;
}
