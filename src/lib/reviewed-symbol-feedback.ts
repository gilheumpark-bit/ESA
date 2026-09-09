import { SLD_COMPONENT_TYPES, type SLDComponentType } from './sld-component-types';
import { parseSymbolLibrary, type SymbolLibrary } from './symbol-library-contract';
import type { DrawingDocumentV3 } from '@/agent/drawing/types-v3';

/** Only the DXF parser creates this identity; model JSON is not provenance. */
export interface DxfSourcePattern { kind: 'dxf-block-v2'; fingerprint: string; blockName: string }
export interface SymbolFeedbackCandidate {
  documentHash: string; correctionId: string; targetDisplayId: string;
  pattern: DxfSourcePattern; selectedType: SLDComponentType;
}
export interface ReviewedSymbolFeedback extends SymbolFeedbackCandidate {
  id: string; organization: string; reason: string;
  status: 'pending' | 'approved' | 'revoked';
  createdAt: string; updatedAt: string;
  /** Local reviewer acknowledgement, not an organization permission grant. */
  reviewedAt?: string;
}
export interface SymbolFeedbackCatalog {
  schemaVersion: 1; revision: number; activeOrganization: string | null;
  examples: ReviewedSymbolFeedback[];
}
export const FEEDBACK_STORAGE_KEY = 'esa-reviewed-symbol-feedback-v1';
export const emptySymbolFeedback = (): SymbolFeedbackCatalog => ({ schemaVersion: 1, revision: 0, activeOrganization: null, examples: [] });
const TYPES = new Set<string>(SLD_COMPONENT_TYPES.filter((type) => type !== 'unknown'));
const MAX_BYTES = 1024 * 1024;
const key = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase('ko-KR');
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u001f]/.test(value);
}
export function isDxfSourcePattern(value: unknown): value is DxfSourcePattern {
  return record(value) && value.kind === 'dxf-block-v2' && typeof value.fingerprint === 'string'
    && /^fp2:[a-f0-9]{16}$/.test(value.fingerprint) && text(value.blockName, 120);
}

/** Only the latest still-applied TYPE correction with a unique source pattern
 * is reusable. Unknown, text and ratings never become global rules. */
export function reusableSymbolCorrections(document: DrawingDocumentV3): SymbolFeedbackCandidate[] {
  const latest = new Map<string, DrawingDocumentV3['userCorrections'][number]>();
  for (const correction of document.userCorrections ?? []) {
    if (correction.correctionKind === 'type') latest.set(correction.targetDisplayId, correction);
  }
  if (!/^[a-f0-9]{64}$/.test(document.documentHash)) return [];
  const candidates: SymbolFeedbackCandidate[] = [];
  for (const symbol of document.evidenceGraph.symbols) {
    const correction = latest.get(symbol.displayId);
    if (!correction || symbol.certainty !== 'confirmed' || correction.selectedValue !== symbol.confirmedType
      || !TYPES.has(correction.selectedValue)) continue;
    const patterns = [...new Map((symbol.sourcePatterns ?? []).filter(isDxfSourcePattern)
      .map((pattern) => [`${pattern.fingerprint}:${key(pattern.blockName)}`, pattern])).values()];
    if (patterns.length !== 1) continue;
    candidates.push({ documentHash: document.documentHash, correctionId: correction.correctionId,
      targetDisplayId: symbol.displayId, pattern: { ...patterns[0] }, selectedType: correction.selectedValue as SLDComponentType });
  }
  return candidates;
}

/** Browser/import data are untrusted. Reconstruct known fields after validation. */
export function parseSymbolFeedback(raw: unknown): SymbolFeedbackCatalog {
  if (!record(raw) || raw.schemaVersion !== 1 || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0
    || !Array.isArray(raw.examples) || raw.examples.length > 400
    || (raw.activeOrganization !== null && !text(raw.activeOrganization, 120))) throw new Error('피드백 저장 형식이 올바르지 않습니다.');
  const ids = new Set<string>();
  const examples = raw.examples.map((value): ReviewedSymbolFeedback => {
    if (!record(value) || !text(value.id, 100) || !/^fb-[a-zA-Z0-9-]{1,96}$/.test(value.id) || ids.has(value.id)
      || !text(value.organization, 120) || !text(value.reason, 300) || !text(value.correctionId, 160) || !text(value.targetDisplayId, 160)
      || typeof value.documentHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.documentHash)
      || !isDxfSourcePattern(value.pattern) || typeof value.selectedType !== 'string' || !TYPES.has(value.selectedType)
      || !['pending', 'approved', 'revoked'].includes(String(value.status))
      || !text(value.createdAt, 40) || !Number.isFinite(Date.parse(value.createdAt))
      || !text(value.updatedAt, 40) || !Number.isFinite(Date.parse(value.updatedAt))
      || (value.reviewedAt !== undefined && (!text(value.reviewedAt, 40) || !Number.isFinite(Date.parse(value.reviewedAt))))
      || (value.status === 'approved' && value.reviewedAt === undefined)) {
      throw new Error('피드백 항목이 손상됐거나 승인 정보가 부족합니다.');
    }
    ids.add(value.id);
    return { id: value.id, organization: value.organization.trim(), reason: value.reason.trim(),
      correctionId: value.correctionId, targetDisplayId: value.targetDisplayId, documentHash: value.documentHash,
      pattern: { kind: 'dxf-block-v2', fingerprint: value.pattern.fingerprint, blockName: value.pattern.blockName.trim() },
      selectedType: value.selectedType as SLDComponentType, status: value.status as ReviewedSymbolFeedback['status'],
      createdAt: value.createdAt, updatedAt: value.updatedAt,
      ...(typeof value.reviewedAt === 'string' ? { reviewedAt: value.reviewedAt } : {}) };
  });
  return { schemaVersion: 1, revision: Number(raw.revision), activeOrganization: raw.activeOrganization as string | null, examples };
}
export function stageSymbolFeedback(catalog: SymbolFeedbackCatalog, candidate: SymbolFeedbackCandidate,
  organization: string, reason: string, now = new Date().toISOString()): SymbolFeedbackCatalog {
  if (catalog.examples.some((item) => item.documentHash === candidate.documentHash && item.correctionId === candidate.correctionId
    && key(item.organization) === key(organization))) throw new Error('이미 저장한 정정 사례입니다.');
  return parseSymbolFeedback({ ...catalog, revision: catalog.revision + 1, activeOrganization: organization.trim(),
    examples: [...catalog.examples, { ...candidate, pattern: { ...candidate.pattern }, id: `fb-${crypto.randomUUID()}`,
      organization, reason, status: 'pending', createdAt: now, updatedAt: now }] });
}
export function decideSymbolFeedback(catalog: SymbolFeedbackCatalog, id: string, status: 'approved' | 'revoked',
  now = new Date().toISOString()): SymbolFeedbackCatalog {
  const example = catalog.examples.find((item) => item.id === id);
  if (!example) throw new Error('정정 사례를 찾지 못했습니다.');
  if (status === 'approved' && example.status !== 'pending') throw new Error('승인 대기 중인 사례만 승인할 수 있습니다.');
  return parseSymbolFeedback({ ...catalog, revision: catalog.revision + 1,
    activeOrganization: status === 'approved' ? example.organization : catalog.activeOrganization,
    examples: catalog.examples.map((item) => item.id === id ? { ...item, status, updatedAt: now,
      ...(status === 'approved' ? { reviewedAt: now } : {}) } : item) });
}

/** Compile active-company approved exact patterns into the existing parser
 * contract. No separately mutable published library or trained model exists. */
export function feedbackSymbolLibrary(base: SymbolLibrary | null, catalog: SymbolFeedbackCatalog): SymbolLibrary | null {
  const organization = base?.organization ?? catalog.activeOrganization;
  if (!organization) return base;
  const approved = catalog.examples.filter((item) => item.status === 'approved' && key(item.organization) === key(organization));
  const withdrawn = new Set(catalog.examples.filter((item) => item.status !== 'approved').map((item) => item.id));
  const entries = [...(base?.entries ?? []).filter((entry) => !entry.feedbackId || !withdrawn.has(entry.feedbackId)),
    ...approved.map((item) => ({ fingerprint: item.pattern.fingerprint, blockNames: [item.pattern.blockName],
      deviceType: item.selectedType, matchPolicy: 'fingerprint-and-name' as const, feedbackId: item.id,
      confirmedAt: item.reviewedAt, note: `사용자 승인 정정 사례: ${item.reason}`.slice(0, 300) }))];
  if (!entries.length) return null;
  const parsed = parseSymbolLibrary({ schemaVersion: 1, organization, entries });
  if (!parsed.ok || !parsed.library) throw new Error('승인 사전을 구성하지 못했습니다. 사례 수와 기존 사전을 확인하세요.');
  return parsed.library;
}
export interface FeedbackStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function readSymbolFeedback(storage: FeedbackStorage): SymbolFeedbackCatalog {
  const raw = storage.getItem(FEEDBACK_STORAGE_KEY);
  if (raw === null) return emptySymbolFeedback();
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) throw new Error('피드백 저장 한도를 초과했습니다.');
  return parseSymbolFeedback(JSON.parse(raw));
}
/** Detect known stale-tab overwrites. localStorage is not a multi-user DB. */
export function saveSymbolFeedback(storage: FeedbackStorage, next: SymbolFeedbackCatalog, expectedRevision: number): SymbolFeedbackCatalog {
  const current = readSymbolFeedback(storage);
  if (current.revision !== expectedRevision || next.revision !== expectedRevision + 1) throw new Error('다른 변경이 먼저 저장됐습니다. 화면을 새로고침하세요.');
  const valid = parseSymbolFeedback(next), raw = JSON.stringify(valid);
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) throw new Error('피드백 저장 한도를 초과했습니다.');
  storage.setItem(FEEDBACK_STORAGE_KEY, raw);
  return valid;
}
/** A file cannot import another reviewer's approval authority. */
export function importSymbolFeedback(raw: string, current: SymbolFeedbackCatalog): SymbolFeedbackCatalog {
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) throw new Error('피드백 파일이 너무 큽니다.');
  const imported = parseSymbolFeedback(JSON.parse(raw)), examples = [...current.examples];
  for (const item of imported.examples) {
    if (examples.some((existing) => existing.id === item.id)) continue;
    const { reviewedAt: ignored, ...rest } = item;
    void ignored;
    examples.push({ ...rest, status: 'pending' });
  }
  return parseSymbolFeedback({ ...current, revision: current.revision + 1, examples });
}
/** A new source decision withdraws its old reusable rule, not unrelated rules. */
export function revokeSupersededFeedback(catalog: SymbolFeedbackCatalog, document: DrawingDocumentV3,
  changedTarget?: string): SymbolFeedbackCatalog {
  const current = new Set(reusableSymbolCorrections(document).map((item) => item.correctionId));
  const stale = catalog.examples.filter((item) => item.documentHash === document.documentHash
    && (!changedTarget || item.targetDisplayId === changedTarget) && item.status !== 'revoked' && !current.has(item.correctionId));
  if (!stale.length) return catalog;
  return parseSymbolFeedback({ ...catalog, revision: catalog.revision + 1,
    examples: catalog.examples.map((item) => stale.includes(item) ? { ...item, status: 'revoked', updatedAt: document.updatedAt } : item) });
}
