import { createHash } from 'node:crypto';
import type { DrawingDocumentV3 } from './types-v3';
import { GRAPH_ASSEMBLY_VERSION } from './types-v3';
import type { GoldenLabel } from './sld-evaluator-v2';
import { SYMBOL_CLASSIFIER_POLICY } from '@/engine/topology/symbol-classifier';
import { SYMBOL_GEOMETRY_POLICY } from '@/lib/symbol-line-normalization';
import { buildDrawingWorkProduct, normalizeInventoryType, DRAWING_WORK_PRODUCT_VERSION } from '@/lib/drawing-work-product';

export const AX_INVENTORY_EVALUATOR_VERSION = 'ax-inventory-eval-v1' as const;
export interface AxRate { numerator: number; denominator: number; value: number | null }
const rate = (numerator: number, denominator: number): AxRate => ({ numerator, denominator, value: denominator ? numerator / denominator : null });
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Bounds = { x: number; y: number; w: number; h: number };
const validBox = (box: Bounds) => box && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.x >= 0 && box.y >= 0 && box.w > 0 && box.h > 0;
function iou(a: Bounds, b: Bounds): number {
  const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return overlap / (a.w * a.h + b.w * b.h - overlap);
}

/** AX draft-inventory evaluator; deliberately does not activate verified95.
 * Labels are independent inputs. Matching is type-blind and one-to-one, so a
 * wrong class cannot disappear by refusing to match it to the correct class.
 * Maximum-cardinality matching uses deterministic overlap preference. */
export function evaluateAxInventory(document: DrawingDocumentV3, label: GoldenLabel, context: {
  datasetId: string; sourceRevision: string; dictionaryHash: string | 'none';
}) {
  if (!/^[a-f0-9]{40}$/.test(context.sourceRevision) || !/^(none|[a-f0-9]{64})$/.test(context.dictionaryHash)
    || !context.datasetId.trim() || context.datasetId.length > 200) throw new Error('AX_EVAL_CONTEXT_INVALID');
  if (!label.documentHash || label.documentHash !== document.documentHash) throw new Error('AX_EVAL_DOCUMENT_MISMATCH');
  if (!Array.isArray(label.symbols) || label.symbols.length > 1000 || document.evidenceGraph.symbols.length > 1000) throw new Error('AX_EVAL_CASE_LIMIT');
  if (label.symbols.some((item) => !validBox(item.bounds) || !Number.isSafeInteger(item.pageIndex) || item.pageIndex < 0
    || typeof item.type !== 'string' || !item.type.trim() || item.type.length > 200)) throw new Error('AX_EVAL_LABEL_INVALID');
  const product = buildDrawingWorkProduct(document);
  if (new Set(product.rows.map((row) => row.symbolId)).size !== product.rows.length) throw new Error('AX_EVAL_DUPLICATE_ID');
  const order = product.rows.map((row, index) => ({ row, index })).sort((a, b) => a.row.symbolId.localeCompare(b.row.symbolId));
  const edges = order.map(({ row }) => row.source ? label.symbols.map((truth, index) => ({ index,
    overlap: row.source!.pageIndex === truth.pageIndex ? iou(row.source!.bounds, truth.bounds) : 0 }))
    .filter((pair) => pair.overlap >= 0.5).sort((a, b) => b.overlap - a.overlap || a.index - b.index).map((pair) => pair.index) : []);
  if (edges.reduce((sum, links) => sum + links.length, 0) > 50_000) throw new Error('AX_EVAL_MATCH_LIMIT');
  const owner = new Map<number, number>();
  function assign(prediction: number, visited: Set<number>): boolean {
    for (const target of edges[prediction]) {
      if (visited.has(target)) continue;
      visited.add(target);
      const previous = owner.get(target);
      if (previous === undefined || assign(previous, visited)) { owner.set(target, prediction); return true; }
    }
    return false;
  }
  for (let index = 0; index < order.length; index++) assign(index, new Set());
  const matches = new Map([...owner].map(([truth, prediction]) => [order[prediction].row.symbolId, truth]));
  let correctUsable = 0, correctAutomatic = 0, wrongUsable = 0;
  const errors: Array<{ symbolId: string; kind: 'wrong-type' | 'unmatched-usable'; expectedType?: string; actualType?: string }> = [];
  for (const row of product.rows) {
    if (!row.usableForInventory) continue;
    const target = matches.get(row.symbolId), truth = target === undefined ? undefined : label.symbols[target];
    const correct = truth && row.interpretedType === normalizeInventoryType(truth.type);
    if (correct) { correctUsable++; if (row.basis === 'automatic-classification') correctAutomatic++; }
    else { wrongUsable++; errors.push({ symbolId: row.symbolId, kind: truth ? 'wrong-type' : 'unmatched-usable',
      expectedType: truth?.type, actualType: row.interpretedType }); }
  }
  const binding = { sourceRevision: context.sourceRevision, dictionaryHash: context.dictionaryHash,
    graphVersion: GRAPH_ASSEMBLY_VERSION, classifierPolicy: SYMBOL_CLASSIFIER_POLICY,
    geometryPolicy: SYMBOL_GEOMETRY_POLICY, workProductVersion: DRAWING_WORK_PRODUCT_VERSION,
    evaluatorVersion: AX_INVENTORY_EVALUATOR_VERSION, productionFingerprint: document.verification.productionFingerprint ?? null };
  const labelHash = digest(label), predictionHash = digest(product), policyHash = digest(binding);
  return { version: AX_INVENTORY_EVALUATOR_VERSION, scope: 'draft-inventory-only' as const,
    documentHash: document.documentHash, datasetId: context.datasetId, binding, policyHash, labelHash, predictionHash,
    evaluationHash: digest({ policyHash, labelHash, predictionHash, datasetId: context.datasetId }),
    counts: { expected: label.symbols.length, detected: product.rows.length, spatiallyMatched: matches.size,
      missed: label.symbols.length - matches.size, extraDetections: product.rows.length - matches.size,
      usable: product.totals.usable, correctUsable, wrongUsable, automatic: product.totals.automaticClassifications, correctAutomatic },
    metrics: { inventoryPrecision: rate(correctUsable, product.totals.usable),
      usefulInventoryCoverage: rate(correctUsable, label.symbols.length),
      automaticPrecision: rate(correctAutomatic, product.totals.automaticClassifications),
      usefulAutomaticCoverage: rate(correctAutomatic, label.symbols.length),
      detectedReviewRate: rate(product.totals.review + product.totals.unread, product.rows.length),
      detectionRecall: rate(matches.size, label.symbols.length) }, errors,
    independentAccuracyCertified: false as const, engineeringSafetyCertified: false as const };
}
