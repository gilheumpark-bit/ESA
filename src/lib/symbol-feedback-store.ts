'use client';

import type { DrawingDocumentV3 } from '@/agent/drawing/types-v3';
import { proposeSymbolFeedback, parseSymbolFeedback, type SymbolFeedback, feedbackNameKey } from './symbol-feedback';
import { parseSymbolLibrary, type SymbolLibrary } from './symbol-library-contract';
import { readSymbolLibraryCatalog, saveSymbolLibrary, type SymbolLibraryStorage } from './symbol-library-store';

export type FeedbackCommand = { action: 'propose'; feedback: SymbolFeedback }
  | { action: 'approve' | 'revoke'; id: string; reason: string; at: string };
/** A single catalog write keeps rule activation and its review history together.
 * Expected snapshot catches stale tabs; this is local storage, not a team approval service. */
export function updateSymbolFeedback(organization: string, expected: SymbolLibrary | null, command: FeedbackCommand,
  storage?: SymbolLibraryStorage, sourceDocument?: DrawingDocumentV3 | null) {
  const read = readSymbolLibraryCatalog(storage);
  if (read.warning) throw new Error(read.warning);
  const current = read.catalog.libraries.find((item) => feedbackNameKey(item.organization) === feedbackNameKey(organization)) ?? null;
  if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('사전이 변경되었습니다. 새로고침 후 다시 검토하세요.');
  const library: SymbolLibrary = current ?? { schemaVersion: 1, organization: organization.trim(), entries: [] };
  const feedback = parseSymbolFeedback(library.feedback ?? []);
  if (command.action === 'propose') {
    const proposal = parseSymbolFeedback([command.feedback])[0];
    if (proposal.status !== 'pending') throw new Error('새 피드백은 승인 대기 상태여야 합니다.');
    const duplicate = feedback.find((item) => item.id === proposal.id);
    if (duplicate) {
      if (duplicate.correctionId !== proposal.correctionId || duplicate.deviceType !== proposal.deviceType
        || JSON.stringify(duplicate.source) !== JSON.stringify(proposal.source) || duplicate.sourceDocumentHash !== proposal.sourceDocumentHash) {
        throw new Error('기존 피드백과 동일한 식별자에 다른 내용을 저장할 수 없습니다.');
      }
      return read;
    }
    feedback.push(proposal);
  } else {
    const entry = feedback.find((item) => item.id === command.id);
    if (!entry || entry.status !== (command.action === 'approve' ? 'pending' : 'approved')) throw new Error('현재 상태에서 가능한 피드백 결정이 아닙니다.');
    if (command.action === 'approve') {
      // A visible source document may have been corrected again after staging.
      // Never approve its superseded decision just because the stored proposal exists.
      if (sourceDocument?.documentHash === entry.sourceDocumentHash) {
        const effective = proposeSymbolFeedback(sourceDocument, entry.correctionId);
        if (effective.deviceType !== entry.deviceType || JSON.stringify(effective.source) !== JSON.stringify(entry.source)) {
          throw new Error('원본 정정이 변경되었습니다. 현재 수정값을 다시 검토하세요.');
        }
      }
      const sameSource = (other: SymbolFeedback) => other.source.fingerprint === entry.source.fingerprint
        && feedbackNameKey(other.source.blockName) === feedbackNameKey(entry.source.blockName);
      const conflicting = feedback.some((other) => other.status === 'approved' && sameSource(other) && other.deviceType !== entry.deviceType)
        || library.entries.some((other) => other.deviceType !== entry.deviceType && (other.fingerprint === entry.source.fingerprint
          || other.blockNames?.some((name) => feedbackNameKey(name) === feedbackNameKey(entry.source.blockName))));
      if (conflicting) throw new Error('기존 사전과 충돌합니다. 기존 규칙을 검토·취소한 뒤 승인하세요.');
    }
    entry.decisions.push({ action: command.action, at: command.at, reason: command.reason });
    entry.status = command.action === 'approve' ? 'approved' : 'revoked';
  }
  const next = { ...library, feedback, revision: (library.revision ?? 0) + 1 };
  const checked = parseSymbolLibrary(next);
  if (!checked.ok || !checked.library) throw new Error(checked.errors.join(' · '));
  return saveSymbolLibrary(checked.library, storage);
}
