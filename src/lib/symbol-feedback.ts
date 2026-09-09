/** Explicit, local company knowledge. Not model training or a signed approval. */
import { SLD_COMPONENT_TYPES, type SLDComponentType } from './sld-component-types';
import type { DrawingDocumentV3 } from '@/agent/drawing/types-v3';

export interface DxfSymbolIdentity {
  blockName: string;
  fingerprint: string;
}
export interface SymbolFeedback {
  id: string;
  sourceDocumentHash: string;
  correctionId: string;
  targetDisplayId: string;
  source: DxfSymbolIdentity;
  deviceType: SLDComponentType;
  originalCandidates: string[];
  createdAt: string;
  status: 'pending' | 'approved' | 'revoked';
  decisions: Array<{ action: 'approve' | 'revoke'; at: string; reason: string }>;
}
const types = new Set<string>(SLD_COMPONENT_TYPES.filter((type) => type !== 'unknown'));
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 160): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && v.length <= 40 && Number.isFinite(Date.parse(v));
export const feedbackNameKey = (value: string) => value.trim().toLowerCase();
export function readDxfSymbolIdentity(value: unknown): DxfSymbolIdentity | undefined {
  if (!record(value) || !text(value.blockName, 120) || typeof value.fingerprint !== 'string'
    || !/^fp2:[a-f0-9]{16}$/.test(value.fingerprint)) return undefined;
  return { blockName: value.blockName.trim(), fingerprint: value.fingerprint };
}
/** Revalidate every import/storage/API boundary; never accept arbitrary prompt text. */
export function parseSymbolFeedback(value: unknown): SymbolFeedback[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error('피드백 기록은 최대 500건의 배열이어야 합니다.');
  const ids = new Set<string>();
  return value.map((item) => {
    if (!record(item)) throw new Error('피드백 기록 형식 오류');
    const source = readDxfSymbolIdentity(item.source);
    if (!text(item.id) || ids.has(item.id) || !text(item.correctionId) || !text(item.targetDisplayId)
      || typeof item.sourceDocumentHash !== 'string' || !/^[a-f0-9]{64}$/.test(item.sourceDocumentHash)
      || !source || !text(item.deviceType, 64) || !types.has(item.deviceType) || !date(item.createdAt)
      || !Array.isArray(item.originalCandidates) || item.originalCandidates.length > 30
      || !item.originalCandidates.every((c) => text(c, 120)) || !Array.isArray(item.decisions) || item.decisions.length > 2) {
      throw new Error('피드백 식별자·원본 근거·기기 종류·이력이 유효하지 않습니다.');
    }
    ids.add(item.id);
    const rawDecisions = item.decisions;
    const decisions = rawDecisions.map((d, i) => {
      if (!record(d) || d.action !== (i === 0 ? 'approve' : 'revoke') || !date(d.at) || !text(d.reason, 300)
        || Date.parse(d.at) < Date.parse(i === 0 ? item.createdAt as string : rawDecisions[0].at)) {
        throw new Error('피드백 승인/취소 이력이 유효하지 않습니다.');
      }
      return { action: d.action as 'approve' | 'revoke', at: d.at, reason: d.reason.trim() };
    });
    const expected = decisions.length === 2 ? 'revoked' : decisions.length === 1 ? 'approved' : 'pending';
    if (item.status !== expected) throw new Error('피드백 상태와 결정 이력이 일치하지 않습니다.');
    return { id: item.id, sourceDocumentHash: item.sourceDocumentHash, correctionId: item.correctionId,
      targetDisplayId: item.targetDisplayId, source, deviceType: item.deviceType as SLDComponentType,
      originalCandidates: [...item.originalCandidates] as string[], createdAt: item.createdAt,
      status: expected, decisions };
  });
}
/** Only the currently effective type correction with an exact vector anchor is reusable. */
export function proposeSymbolFeedback(document: DrawingDocumentV3, correctionId: string): SymbolFeedback {
  const correction = document.userCorrections.find((item) => item.correctionId === correctionId);
  if (!correction || correction.correctionKind !== 'type') throw new Error('현재 기기 종류 정정만 재사용 후보로 등록할 수 있습니다.');
  const latest = [...document.userCorrections].reverse().find((item) => item.targetDisplayId === correction.targetDisplayId && item.correctionKind === 'type');
  const symbol = document.evidenceGraph.symbols.find((item) => item.displayId === correction.targetDisplayId);
  const source = readDxfSymbolIdentity(symbol?.sourceSymbol);
  if (latest !== correction || symbol?.certainty !== 'confirmed' || symbol.confirmedType !== correction.selectedValue
    || !types.has(correction.selectedValue) || !source) {
    throw new Error('현재 확정 종류와 DXF 원본 지문이 필요합니다. 과거 정정·미판독·이미지 추정은 자동 재사용하지 않습니다.');
  }
  return parseSymbolFeedback([{ id: `${document.documentHash.slice(0, 16)}:${correctionId}`, sourceDocumentHash: document.documentHash,
    correctionId, targetDisplayId: correction.targetDisplayId, source, deviceType: correction.selectedValue,
    originalCandidates: correction.originalCandidates, createdAt: correction.correctedAt, status: 'pending', decisions: [] }])[0];
}
