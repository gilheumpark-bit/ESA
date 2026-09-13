import { uncertaintyDocument } from '@/agent/drawing/test-support/uncertainty-document';
import type { SymbolNode } from '@/agent/drawing/types-v3';
import type { GoldenLabel } from '@/agent/drawing/sld-evaluator-v2';
import { SYMBOL_CLASSIFICATION_VERSION } from '../symbol-classification';

/** Declared synthetic fixture: A/B/C/D are expected. D is deliberately absent
 * from prediction. The label is specified separately, never copied from output. */
export function axInventoryFixture() {
  const document = uncertaintyDocument();
  document.documentHash = 'a'.repeat(64); document.updatedAt = '2026-09-13T00:00:00.000Z';
  const symbol = (id: string, x: number, confirmed: boolean): SymbolNode => ({
    id, displayId: `P01-S00${id}`, typeCandidates: confirmed ? ['breaker'] : ['unknown'],
    ...(confirmed ? { confirmedType: 'breaker' } : {}), certainty: confirmed ? 'confirmed' : 'unread',
    evidence: [{ evidenceId: `e-${id}`, pageIndex: 0, bounds: { x, y: 10, w: 10, h: 10 }, confidence: 0.9 }],
  });
  document.evidenceGraph.symbols = [symbol('1', 10, true), symbol('2', 40, false), symbol('3', 70, false)];
  document.evidenceGraph.symbols[1].classification = { version: SYMBOL_CLASSIFICATION_VERSION, status: 'classified',
    method: 'family-context', selectedType: 'breaker', candidates: [{ type: 'breaker', similarity: 0.98 }],
    reasons: ['SHAPE_MATCH', 'REPEATED_ROLE'], referenceKeys: ['approved-synthetic-reference'], independentVerification: false };
  document.verification.documentStatus = 'HOLD'; document.verification.claimsComplete = false;
  const label: GoldenLabel = { labelId: 'ax-four-devices', documentHash: 'a'.repeat(64),
    symbols: [10, 40, 70, 100].map((x) => ({ type: 'breaker', pageIndex: 0, bounds: { x, y: 10, w: 10, h: 10 } })), edges: [], texts: [] };
  const context = { datasetId: 'synthetic-four-with-one-missed', sourceRevision: 'e'.repeat(40), dictionaryHash: 'none' as const };
  return { document, label, context };
}
