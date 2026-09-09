'use client';

import { useMemo, useState } from 'react';
import type { DrawingDocumentV3 } from '@/agent/drawing/types-v3';
import { decideSymbolFeedback, importSymbolFeedback, reusableSymbolCorrections,
  stageSymbolFeedback, type SymbolFeedbackCatalog } from '@/lib/reviewed-symbol-feedback';

export function ReviewedSymbolFeedbackPanel({ document, catalog, baseOrganization, onCommit, onSelect }: {
  document: DrawingDocumentV3 | null;
  catalog: SymbolFeedbackCatalog;
  baseOrganization?: string;
  onCommit: (next: SymbolFeedbackCatalog) => void;
  onSelect: (id: string) => void;
}) {
  const [company, setCompany] = useState(''), [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const organization = baseOrganization ?? (company || catalog.activeOrganization || '');
  const normalize = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase('ko-KR');
  const candidates = useMemo(() => document ? reusableSymbolCorrections(document) : [], [document]);
  const visible = catalog.examples.filter((item) => !organization || normalize(item.organization) === normalize(organization));
  const commit = (operation: () => SymbolFeedbackCatalog) => {
    try { onCommit(operation()); setError(null); } catch (cause) { setError(cause instanceof Error ? cause.message : '피드백을 저장하지 못했습니다.'); }
  };
  const exportCatalog = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(catalog, null, 2)], { type: 'application/json' }));
    const link = window.document.createElement('a'); link.href = url; link.download = 'esa-reviewed-symbol-feedback.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section aria-label="사람 정정 재사용" className="my-4 min-w-0 rounded-xl border border-[var(--border-default)] p-4">
    <h2 className="text-sm font-semibold">사람 정정 재사용</h2>
    <p className="mt-1 text-xs text-[var(--text-secondary)]">기기 종류를 수정한 DXF 사례만 재사용합니다. 원본을 확인한 뒤 승인해야 다음 DXF에 적용됩니다. 회사·블록명·형상이 모두 같아야 하며 이미지 OCR·정격·결선의 정답을 학습하는 기능은 아닙니다.</p>
    <p className="mt-1 text-xs text-[var(--text-secondary)]">이 브라우저의 검토자 승인입니다. 조직 권한 승인·AI 모델 재학습과 구분합니다. 저장 버전 {catalog.revision}</p>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
      <label className="min-w-0 text-xs">피드백 적용 회사
        <input aria-label="피드백 적용 회사" value={organization} disabled={Boolean(baseOrganization)} maxLength={120}
          onChange={(event) => setCompany(event.target.value)} className="mt-1 w-full min-w-0 rounded border p-2" />
      </label>
      <label className="min-w-0 text-xs">정정 근거
        <input aria-label="정정 근거" value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)}
          placeholder="원본에서 확인한 종류와 반복 사용 조건" className="mt-1 w-full min-w-0 rounded border p-2" />
      </label>
    </div>
    <div className="mt-2 flex flex-wrap gap-2 text-xs">
      <button type="button" disabled={!organization.trim()} onClick={() => commit(() => ({ ...catalog, revision: catalog.revision + 1, activeOrganization: organization.trim() }))}
        className="rounded border px-2 py-1 disabled:opacity-40">이 회사 피드백 적용</button>
      {!baseOrganization && <button type="button" onClick={() => commit(() => ({ ...catalog, revision: catalog.revision + 1, activeOrganization: null }))}
        className="rounded border px-2 py-1">피드백 적용 해제</button>}
      <button type="button" onClick={exportCatalog} className="rounded border px-2 py-1">피드백 JSON 내보내기</button>
      <label className="cursor-pointer rounded border px-2 py-1">피드백 JSON 가져오기
        <input type="file" accept=".json,application/json" aria-label="피드백 JSON 가져오기" className="sr-only" onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          if (file.size > 1024 * 1024) { setError('피드백 파일은 최대 1MB입니다.'); return; }
          try { const raw = await file.text(); commit(() => importSymbolFeedback(raw, catalog)); }
          catch { setError('피드백 파일을 읽지 못했습니다.'); }
        }} />
      </label>
    </div>
    <p className="mt-2 text-xs">적용 중: {baseOrganization ?? catalog.activeOrganization ?? '없음'} · 가져온 사례는 다시 승인해야 합니다.</p>
    {candidates.length === 0 && <p className="mt-2 text-xs text-[var(--text-secondary)]">재사용 가능한 정정이 없습니다. DXF 정밀 결과에서 원본 형상이 남은 기기의 종류를 먼저 수정하세요.</p>}
    <ul className="mt-3 space-y-2 text-xs">{candidates.slice(0, 30).map((candidate) => {
      const stored = catalog.examples.some((item) => item.documentHash === candidate.documentHash && item.correctionId === candidate.correctionId
        && normalize(item.organization) === normalize(organization));
      return <li key={candidate.correctionId} className="min-w-0 break-words rounded border p-2">
        <button type="button" className="underline" onClick={() => onSelect(candidate.targetDisplayId)}>{candidate.targetDisplayId} 원본 위치</button>
        <p>{candidate.pattern.blockName} → {candidate.selectedType}</p>
        <button type="button" disabled={stored || !organization.trim() || !reason.trim()}
          aria-label={`${candidate.targetDisplayId} 재사용 후보 저장`}
          onClick={() => commit(() => stageSymbolFeedback(catalog, candidate, organization, reason))}
          className="mt-1 rounded border px-2 py-1 disabled:opacity-40">{stored ? '저장된 정정' : '재사용 후보 저장'}</button>
      </li>;
    })}</ul>
    <ul className="mt-3 space-y-2 text-xs">{visible.map((item) => <li key={item.id} className="min-w-0 break-words rounded border p-2">
      <p>{item.pattern.blockName} → {item.selectedType} · {item.status === 'approved' ? '적용 승인' : item.status === 'pending' ? '승인 대기' : '철회됨'}</p>
      <p className="mt-1 text-[var(--text-secondary)]">{item.reason}</p>
      {item.status === 'pending' && <button type="button" aria-label={`${item.pattern.blockName} 다음 DXF 적용 승인`}
        onClick={() => commit(() => decideSymbolFeedback(catalog, item.id, 'approved'))}
        className="mt-2 rounded border px-2 py-1">원본 확인 완료 · 다음 DXF 적용 승인</button>}
      {item.status !== 'revoked' && <button type="button" aria-label={`${item.pattern.blockName} 승인 철회`}
        onClick={() => commit(() => decideSymbolFeedback(catalog, item.id, 'revoked'))}
        className="ml-2 mt-2 rounded border px-2 py-1">승인 철회</button>}
    </li>)}</ul>
  </section>;
}
