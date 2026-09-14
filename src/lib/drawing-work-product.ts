import type { DrawingDocumentV3, EvidenceRef, SymbolNode } from '@/agent/drawing/types-v3';
import { readSymbolClassification } from './symbol-classification';
import { featureCsv } from './feature-output';

export const DRAWING_WORK_PRODUCT_VERSION = 'ax-inventory-v1' as const;
export type InventoryBasis = 'confirmed-reading' | 'automatic-classification' | 'review' | 'unread';
export const INVENTORY_BASIS_LABELS: Record<InventoryBasis, string> = {
  'confirmed-reading': '기존 판독 확정', 'automatic-classification': '자동 분류 활용', review: '종류 검토 필요', unread: '미판독',
};
export interface DrawingInventoryRow {
  symbolId: string; displayId: string; label: string; pageIndex: number | null;
  interpretedType?: string; originalType: string; originalCertainty: SymbolNode['certainty'];
  basis: InventoryBasis; method: string; reason: string; evidenceIds: string[];
  source?: { pageIndex: number; bounds: EvidenceRef['bounds'] };
  usableForInventory: boolean;
}
export interface DrawingWorkProduct {
  version: typeof DRAWING_WORK_PRODUCT_VERSION;
  documentHash: string; documentUpdatedAt: string;
  scope: 'observed-symbol-occurrences';
  rows: DrawingInventoryRow[];
  groups: Array<{ type: string; confirmedReadings: number; automaticClassifications: number; usableOccurrences: number }>;
  totals: { observed: number; usable: number; confirmedReadings: number; automaticClassifications: number; review: number; unread: number };
  sourceDocumentStatus: DrawingDocumentV3['verification']['documentStatus'];
  /** Not an approval or a physical equipment count. Never feed directly to calculations. */
  physicalCountCertified: false; engineeringInputsCertified: false;
}
const known = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 200
  && !/^(unknown|unread|unresolved|other|미판독|미확정|모름)$/i.test(value.trim());
export const normalizeInventoryType = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, '_');
const validEvidence = (entry: EvidenceRef, pages: Set<number>) => typeof entry.evidenceId === 'string' && entry.evidenceId.length > 0
  && Number.isSafeInteger(entry.pageIndex) && pages.has(entry.pageIndex)
  && [entry.bounds?.x, entry.bounds?.y, entry.bounds?.w, entry.bounds?.h].every((n) => typeof n === 'number' && Number.isFinite(n))
  && entry.bounds.x >= 0 && entry.bounds.y >= 0 && entry.bounds.w > 0 && entry.bounds.h > 0;

/** A read model, recomputed from the current document after each correction.
 * It enables draft inventory/occurrence work; it never changes raw readings,
 * physical-equipment IDs/counts, rated ownership, holds or calculation inputs. */
export function buildDrawingWorkProduct(document: DrawingDocumentV3): DrawingWorkProduct {
  const pages = new Set(document.pages.map((page) => page.pageIndex));
  const idCounts = new Map<string, number>();
  for (const symbol of document.evidenceGraph.symbols) idCounts.set(symbol.id, (idCounts.get(symbol.id) ?? 0) + 1);
  const rows = document.evidenceGraph.symbols.map((symbol): DrawingInventoryRow => {
    const evidence = symbol.evidence.filter((entry) => validEvidence(entry, pages));
    const classification = readSymbolClassification(symbol.classification);
    const originalType = symbol.confirmedType ?? symbol.typeCandidates[0] ?? 'unknown';
    const row: DrawingInventoryRow = { symbolId: symbol.id, displayId: symbol.displayId, label: symbol.rawLabel ?? '',
      pageIndex: evidence[0]?.pageIndex ?? null, originalType, originalCertainty: symbol.certainty,
      basis: symbol.certainty === 'unread' ? 'unread' : 'review', method: classification?.method ?? 'original-reading',
      reason: '기기 종류를 사용할 근거가 부족합니다.', evidenceIds: [...new Set(evidence.map((entry) => entry.evidenceId))],
      ...(evidence[0] ? { source: { pageIndex: evidence[0].pageIndex, bounds: { ...evidence[0].bounds } } } : {}), usableForInventory: false };
    if (!evidence.length || idCounts.get(symbol.id) !== 1) {
      return { ...row, basis: 'review', reason: '원본 위치 또는 고유 식별자를 확인할 수 없습니다.' };
    }
    if (symbol.classification && !classification) return { ...row, basis: 'review', reason: '분류 메타데이터 형식을 확인할 수 없습니다.' };
    if (classification && classification.status !== 'classified') {
      return { ...row, basis: classification.status === 'unread' ? 'unread' : 'review', reason: '분류 예외 또는 근거 변경으로 종류 확인이 필요합니다.' };
    }
    if (classification?.selectedType && symbol.certainty === 'confirmed' && known(originalType)
      && normalizeInventoryType(classification.selectedType) !== normalizeInventoryType(originalType)) {
      return { ...row, basis: 'review', reason: '기존 판독과 자동 분류가 서로 다른 종류입니다.' };
    }
    if (symbol.certainty === 'confirmed' && known(originalType)) {
      return { ...row, basis: 'confirmed-reading', interpretedType: normalizeInventoryType(originalType),
        usableForInventory: true, reason: '기존 확정 판독을 기기표에 사용합니다. 정격·결선 검증과는 별개입니다.' };
    }
    if (classification?.status === 'classified' && classification.selectedType) {
      return { ...row, basis: 'automatic-classification', interpretedType: classification.selectedType,
        usableForInventory: true, reason: '근거가 있는 자동 분류를 기기표 초안에 사용합니다. 원본 미확정 상태는 보존합니다.' };
    }
    return row;
  });
  const groups = new Map<string, DrawingWorkProduct['groups'][number]>();
  const totals = { observed: rows.length, usable: 0, confirmedReadings: 0, automaticClassifications: 0, review: 0, unread: 0 };
  for (const row of rows) {
    if (!row.usableForInventory || !row.interpretedType) { totals[row.basis === 'unread' ? 'unread' : 'review']++; continue; }
    totals.usable++;
    const group = groups.get(row.interpretedType) ?? { type: row.interpretedType, confirmedReadings: 0, automaticClassifications: 0, usableOccurrences: 0 };
    group.usableOccurrences++;
    const key = row.basis === 'confirmed-reading' ? 'confirmedReadings' : 'automaticClassifications';
    group[key]++; totals[key]++; groups.set(row.interpretedType, group);
  }
  return { version: DRAWING_WORK_PRODUCT_VERSION, documentHash: document.documentHash, documentUpdatedAt: document.updatedAt,
    scope: 'observed-symbol-occurrences', rows, groups: [...groups.values()].sort((a, b) => a.type.localeCompare(b.type)), totals,
    sourceDocumentStatus: document.verification.documentStatus, physicalCountCertified: false, engineeringInputsCertified: false };
}

/** Export scope is explicit. Unusable rows keep type blank, never zero/guessed. */
export function drawingWorkProductCsv(product: DrawingWorkProduct, usableOnly = false): string {
  return featureCsv(['문서 해시','문서 버전','기기표 정책','범위','식별자','페이지','표기','기기표 분류','기존 판독','원본 판독 상태','기기표 사용','분류 방법','원본 근거','확인 사항'],
    product.rows.filter((row) => !usableOnly || row.usableForInventory).map((row) => [product.documentHash, product.documentUpdatedAt, product.version,
      '검출 기호 출현 · 물리 대수 아님', row.displayId, row.pageIndex === null ? '' : row.pageIndex + 1, row.label,
      row.interpretedType ?? '', row.originalType, row.originalCertainty, INVENTORY_BASIS_LABELS[row.basis], row.method,
      row.evidenceIds.join(' / '), row.reason]));
}
