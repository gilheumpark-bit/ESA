import { SLD_COMPONENT_TYPES, type SLDComponentType } from './sld-component-types';

export const SYMBOL_CLASSIFICATION_VERSION = 'symbol-context-v1' as const;
export const SYMBOL_CLASSIFICATION_REASONS = {
  APPROVED_EXACT: '승인한 회사 심볼과 이름·형상 지문 일치',
  COMPANY_LIBRARY: '현재 회사 사전의 분류 규칙 적용',
  EXISTING_PARSER: '기존 파서의 종류 판독',
  SHAPE_MATCH: '등록 사례와 선·곡선 구성 및 형상 유사',
  REPEATED_ROLE: '같은 연결점·배치·연결 수를 가진 기등록 반복 기기와 일치',
  TEXT_SUPPORT: '가까운 원문에 같은 기기 종류 표기',
  AMBIGUOUS_FAMILY: '서로 다른 종류의 유사 형상 후보가 충돌',
  INSUFFICIENT_CONTEXT: '형상 후보는 있으나 반복 역할·종류 표기 근거 부족',
  SPECIAL_MARKING: '특수·예비·누전·절체 표기를 별도로 확인해야 함',
  TEXT_CONFLICT: '형상 후보와 원문 기기 종류가 충돌',
  LIBRARY_CONFLICT: '승인 사례 또는 회사 사전의 분류 충돌',
  UNSUPPORTED_GEOMETRY: '현재 유사도 지원 밖의 형상 또는 불완전한 기하',
  NO_REFERENCE: '대조 가능한 승인·회사 사전 사례 없음',
  BUDGET_LIMIT: '유사도 처리 한도에 도달해 추정을 중단함',
  REFERENCE_CHANGED: '사람 수정으로 분류의 원본 근거가 변경됨',
  MERGED_CONFLICT: '병합된 판독의 분류·원본 정체성이 일치하지 않음',
  HUMAN_CORRECTION: '현재 문서에서 사람이 종류를 수정함',
} as const;
export type SymbolClassificationReason = keyof typeof SYMBOL_CLASSIFICATION_REASONS;
export interface SymbolClassification {
  version: typeof SYMBOL_CLASSIFICATION_VERSION;
  status: 'classified' | 'review' | 'unread';
  method: 'approved-exact' | 'company-library' | 'existing-parser' | 'family-context' | 'human-correction' | 'unresolved';
  selectedType?: SLDComponentType;
  candidates: Array<{ type: SLDComponentType; similarity: number }>;
  reasons: SymbolClassificationReason[];
  referenceKeys: string[];
  /** Similarity/rule decisions do NOT certify ratings, connections or count completeness. */
  independentVerification: false;
}
export interface SymbolClassificationStats {
  version: typeof SYMBOL_CLASSIFICATION_VERSION;
  classified: number; inferred: number; review: number; unread: number;
  shapeComparisons: number; reusedShapeComparisons: number; uniqueBlockShapes: number;
  additionalModelCalls: 0;
  scope: 'observed-dxf-symbols';
}
const types = new Set<string>(SLD_COMPONENT_TYPES.filter((type) => type !== 'unknown'));
export const symbolReferenceKey = (name: string, fingerprint: string) => `${fingerprint}:${name.trim().toLowerCase()}`;
export function classificationRequiresReview(value: SymbolClassification | undefined): boolean {
  return !value || value.status !== 'classified';
}
export function classifiedType(value: SymbolClassification | undefined, fallback: string): string {
  return value?.status === 'classified' && value.selectedType ? value.selectedType : fallback;
}
/** Only reconstructed recognized metadata is exposed to consumers. General model
 * JSON parsers must not call this to accept model-asserted provenance. */
export function readSymbolClassification(raw: unknown): SymbolClassification | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>;
  if (v.version !== SYMBOL_CLASSIFICATION_VERSION || v.independentVerification !== false
    || typeof v.status !== 'string' || !['classified', 'review', 'unread'].includes(v.status)
    || typeof v.method !== 'string' || !['approved-exact', 'company-library', 'existing-parser', 'family-context', 'human-correction', 'unresolved'].includes(v.method)
    || (v.selectedType !== undefined && (typeof v.selectedType !== 'string' || !types.has(v.selectedType) || v.status !== 'classified'))
    || (v.status === 'classified' && !types.has(String(v.selectedType)))
    || !Array.isArray(v.candidates) || v.candidates.length > 3
    || !Array.isArray(v.reasons) || v.reasons.length > 12 || !v.reasons.every((r) => typeof r === 'string' && Object.hasOwn(SYMBOL_CLASSIFICATION_REASONS, r))
    || !Array.isArray(v.referenceKeys) || v.referenceKeys.length > 20 || !v.referenceKeys.every((key) => typeof key === 'string' && key.length <= 200)) return undefined;
  const candidates: SymbolClassification['candidates'] = [];
  for (const raw of v.candidates) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const c = raw as Record<string, unknown>;
    if (typeof c.type !== 'string' || !types.has(c.type) || typeof c.similarity !== 'number' || !Number.isFinite(c.similarity) || c.similarity < 0 || c.similarity > 1) return undefined;
    candidates.push({ type: c.type as SLDComponentType, similarity: c.similarity });
  }
  return { version: SYMBOL_CLASSIFICATION_VERSION, status: v.status as SymbolClassification['status'], method: v.method as SymbolClassification['method'],
    ...(v.selectedType ? { selectedType: v.selectedType as SLDComponentType } : {}), candidates,
    reasons: [...v.reasons] as SymbolClassificationReason[], referenceKeys: [...v.referenceKeys] as string[], independentVerification: false };
}
export function unresolvedClassification(reason: SymbolClassificationReason, previous?: SymbolClassification): SymbolClassification {
  return { version: SYMBOL_CLASSIFICATION_VERSION, status: 'review', method: 'unresolved', candidates: previous?.candidates ?? [],
    reasons: [reason], referenceKeys: previous?.referenceKeys ?? [], independentVerification: false };
}
