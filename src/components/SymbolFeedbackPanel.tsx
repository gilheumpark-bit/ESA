'use client';

import { useMemo, useState } from 'react';
import type { DrawingDocumentV3 } from '@/agent/drawing/types-v3';
import { proposeSymbolFeedback, feedbackNameKey, type SymbolFeedback } from '@/lib/symbol-feedback';
import { updateSymbolFeedback, type FeedbackCommand } from '@/lib/symbol-feedback-store';
import type { SymbolLibraryCatalog } from '@/lib/symbol-library-store';

/** Explicit transfer from a current human correction to bounded local reuse. */
export function SymbolFeedbackPanel({ document, catalog, onSaved, blocked = false }: {
  document?: DrawingDocumentV3 | null;
  catalog: SymbolLibraryCatalog;
  onSaved: (catalog: SymbolLibraryCatalog) => void;
  blocked?: boolean;
}) {
  const [organization, setOrganization] = useState(catalog.activeOrganization ?? '');
  const [reason, setReason] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const existing = catalog.libraries.find((item) => feedbackNameKey(item.organization) === feedbackNameKey(organization)) ?? null;
  const proposals = useMemo(() => {
    const result: SymbolFeedback[] = [];
    for (const correction of document?.userCorrections ?? []) {
      try {
        const proposal = proposeSymbolFeedback(document!, correction.correctionId);
        if (!existing?.feedback?.some((entry) => entry.id === proposal.id)) result.push(proposal);
      } catch { /* Unsupported or superseded corrections stay document-only. */ }
    }
    return result;
  }, [document, existing]);
  const save = (command: FeedbackCommand) => {
    setFailed(false);
    try {
      if (blocked) throw new Error('손상된 사전을 먼저 복구하세요.');
      if (!organization.trim()) throw new Error('적용할 회사명을 입력하세요.');
      if (command.action !== 'propose' && !reviewed) throw new Error('적용 범위를 확인하세요.');
      const result = updateSymbolFeedback(organization, existing, command, undefined, document);
      onSaved(result.catalog);
      setReviewed(false);
      setMessage(command.action === 'propose' ? '후보를 저장했습니다. 승인 전에는 다음 분석에 적용하지 않습니다.'
        : command.action === 'approve' ? '승인했습니다. 이 회사 사전을 선택한 다음 DXF 분석부터 적용합니다. 현재 도면을 소급 변경하지 않습니다.'
          : '취소했습니다. 다음 분석부터 제외하며 기존 분석과 결정 이력은 보존합니다.');
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : '피드백 저장 실패');
    }
  };
  return <section aria-label="사람 수정의 다음 분석 반영" className="mt-4 min-w-0 rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-4">
    <h3 className="text-sm font-semibold text-[var(--text-primary)]">사람 수정의 다음 분석 반영</h3>
    <p className="mt-2 text-xs text-[var(--text-secondary)]">현재 도면의 기기 종류 정정을 별도로 승인해 재사용합니다. 같은 회사·DXF 블록명·기하 지문이 모두 맞아야 적용됩니다. 이미지·문자·결선 정정은 아직 재사용하지 않습니다.</p>
    <label className="mt-3 block text-xs">피드백 적용 회사
      <input value={organization} onChange={(event) => { setOrganization(event.target.value); setReviewed(false); }} maxLength={120}
        disabled={blocked} className="mt-1 min-h-11 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm" />
    </label>
    {proposals.length > 0 ? <ul className="mt-3 space-y-2">{proposals.map((entry) => <li key={entry.id} className="break-words text-xs">
      <p>{entry.targetDisplayId} · {entry.source.blockName} → {entry.deviceType}</p>
      <button type="button" disabled={blocked || !organization.trim()} onClick={() => save({ action: 'propose', feedback: entry })}
        className="mt-1 min-h-11 rounded-md border border-[var(--border-default)] px-3 disabled:opacity-50">{entry.targetDisplayId} 재사용 후보 등록</button>
    </li>)}</ul> : <p className="mt-3 text-xs text-[var(--text-secondary)]">새 재사용 후보가 없습니다. DXF 원본 지문이 있는 기기의 종류를 수정하면 후보를 등록할 수 있습니다. 이전 저장 도면에는 재분석이 필요할 수 있습니다.</p>}
    {existing?.feedback?.length ? <>
      <p className="mt-3 text-xs">사전 버전 {existing.revision ?? 0} · 대기 {existing.feedback.filter((x) => x.status === 'pending').length} · 승인 {existing.feedback.filter((x) => x.status === 'approved').length} · 취소 {existing.feedback.filter((x) => x.status === 'revoked').length}</p>
      <label className="mt-2 block text-xs">검토·취소 사유
        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} className="mt-1 min-h-11 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm" />
      </label>
      <label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />회사와 원본 지문·기기 종류 및 재사용 범위를 확인했습니다.</label>
      <ul className="mt-3 space-y-2">{existing.feedback.map((entry) => <li key={entry.id} className="min-w-0 rounded-md border border-[var(--border-default)] p-2 text-xs">
        <p className="break-words">{entry.source.blockName} → {entry.deviceType} · {entry.status === 'approved' ? '승인' : entry.status === 'revoked' ? '취소됨' : '승인 대기'}</p>
        <details className="mt-1"><summary className="cursor-pointer">원본 근거·결정 이력</summary><p className="break-all">{entry.source.fingerprint} · 원본 {entry.sourceDocumentHash} · 정정 {entry.correctionId}</p>{entry.decisions.map((d, i) => <p key={i}>{d.at} · {d.action === 'approve' ? '승인' : '취소'} · {d.reason}</p>)}</details>
        {entry.status !== 'revoked' && <button type="button" disabled={blocked || !reviewed || !reason.trim()}
          onClick={() => save({ action: entry.status === 'pending' ? 'approve' : 'revoke', id: entry.id, reason, at: new Date().toISOString() })}
          className="mt-2 min-h-11 rounded-md border border-[var(--border-default)] px-3 disabled:opacity-50">{entry.source.blockName} {entry.status === 'pending' ? '재사용 승인' : '승인 취소'}</button>}
      </li>)}</ul>
    </> : null}
    {message && <p role={failed ? 'alert' : 'status'} className="mt-3 text-xs">{message}</p>}
    <p className="mt-3 text-xs text-[var(--text-secondary)]">이 브라우저의 로컬 사전과 JSON에 저장됩니다. 회사 서버의 권한 승인·모델 재학습·독립 평가 정답으로 자동 승격하는 기능은 아닙니다.</p>
  </section>;
}
