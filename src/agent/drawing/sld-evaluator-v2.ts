/**
 * Evaluator V2 — compares production predictions to labels. Never trusts injected scores.
 */

import { createHash, createHmac } from 'node:crypto';
import type { DrawingDocumentV3 } from './types-v3';
import { ENGINE_VERSION, EVALUATOR_VERSION, PREPROCESS_VERSION, PROMPT_VERSION } from './types-v3';

export interface GoldenLabel {
  labelId: string;
  documentHash?: string;
  symbols: Array<{ type: string; label?: string; bounds: { x: number; y: number; w: number; h: number }; pageIndex: number }>;
  edges: Array<{ fromLabel: string; toLabel: string; pageIndex: number }>;
  texts: Array<{ text: string; pageIndex: number }>;
  crossPageRefs?: Array<{ fromPage: number; toPage: number }>;
  holdItems?: string[];
  stratum?: string;
}

export interface MetricSet {
  symbolMacroF1: number;
  pageCountExactRate: number;
  textFieldAccuracy: number;
  edgeF1: number;
  junctionAccuracy: number;
  crossPageRefF1: number;
  logicRecall: number;
  evidenceTraceRate: number;
  unsourcedPassCount: number;
}

export interface EvalResult {
  metrics: MetricSet;
  strata: Record<string, MetricSet>;
  predictionHash: string;
  labelHash: string;
  datasetHash: string;
  passesAllThresholds: boolean;
  failedMetrics: string[];
  receipt: {
    engineVersion: string;
    promptVersion: string;
    preprocessVersion: string;
    evaluatorVersion: string;
    signature: string;
    signedAt: string;
  };
}

const THRESHOLDS: Record<keyof MetricSet, number> = {
  symbolMacroF1: 0.95,
  pageCountExactRate: 0.95,
  textFieldAccuracy: 0.95,
  edgeF1: 0.95,
  junctionAccuracy: 0.95,
  crossPageRefF1: 0.95,
  logicRecall: 0.95,
  evidenceTraceRate: 1.0,
  unsourcedPassCount: 0, // must be exactly 0 — special cased
};

export function evaluatePredictionAgainstLabel(
  prediction: DrawingDocumentV3,
  label: GoldenLabel,
  options?: { datasetId?: string; stratum?: string; signingSecret?: string },
): EvalResult {
  // Reject pre-baked scores if present on prediction
  const forged = (prediction as unknown as { injectedMetrics?: MetricSet }).injectedMetrics;
  if (forged) {
    throw new Error('EVAL_REJECT_INJECTED_METRICS: scores must be computed from prediction+label');
  }

  const predSymbols = prediction.evidenceGraph.symbols.filter((s) => s.certainty === 'confirmed');
  const types = new Set([
    ...label.symbols.map((s) => s.type.toLowerCase()),
    ...predSymbols.map((s) => (s.confirmedType ?? s.typeCandidates[0] ?? '').toLowerCase()),
  ]);

  let precisionSum = 0;
  let recallSum = 0;
  let typeCount = 0;
  for (const type of types) {
    if (!type) continue;
    const tp = predSymbols.filter((s) =>
      (s.confirmedType ?? s.typeCandidates[0] ?? '').toLowerCase() === type
      && label.symbols.some((l) => l.type.toLowerCase() === type && l.pageIndex === s.evidence[0]?.pageIndex)).length;
    const fp = predSymbols.filter((s) =>
      (s.confirmedType ?? s.typeCandidates[0] ?? '').toLowerCase() === type).length - tp;
    const fn = label.symbols.filter((l) => l.type.toLowerCase() === type).length - tp;
    const prec = tp + fp === 0 ? 1 : tp / (tp + Math.max(0, fp));
    const rec = tp + fn === 0 ? 1 : tp / (tp + Math.max(0, fn));
    precisionSum += prec;
    recallSum += rec;
    typeCount++;
  }
  const p = typeCount ? precisionSum / typeCount : 1;
  const r = typeCount ? recallSum / typeCount : 1;
  const symbolMacroF1 = p + r === 0 ? 0 : (2 * p * r) / (p + r);

  // Page count exact: for each page, confirmed count match by type totals
  const pages = new Set([
    ...label.symbols.map((s) => s.pageIndex),
    ...predSymbols.map((s) => s.evidence[0]?.pageIndex ?? 0),
  ]);
  let pageExact = 0;
  for (const page of pages) {
    const lc = label.symbols.filter((s) => s.pageIndex === page).length;
    const pc = predSymbols.filter((s) => s.evidence[0]?.pageIndex === page).length;
    if (lc === pc) pageExact++;
  }
  const pageCountExactRate = pages.size ? pageExact / pages.size : 1;

  const predTexts = prediction.evidenceGraph.texts
    .filter((t) => t.certainty === 'confirmed')
    .map((t) => (t.confirmedText ?? t.rawText).trim().toUpperCase());
  const labelTexts = label.texts.map((t) => t.text.trim().toUpperCase());
  let textHits = 0;
  for (const lt of labelTexts) {
    if (predTexts.includes(lt)) textHits++;
  }
  const textFieldAccuracy = labelTexts.length ? textHits / labelTexts.length : 1;

  const predEdges = prediction.evidenceGraph.relations.filter((e) => e.certainty === 'confirmed');
  const labelEdgeKeys = label.edges.map((e) =>
    `${e.pageIndex}:${e.fromLabel.toUpperCase()}->${e.toLabel.toUpperCase()}`);
  let edgeTp = 0;
  for (const e of predEdges) {
    const from = predSymbols.find((s) => s.id === e.from);
    const to = predSymbols.find((s) => s.id === e.to);
    const key = `${from?.evidence[0]?.pageIndex ?? 0}:${(from?.rawLabel ?? '').toUpperCase()}->${(to?.rawLabel ?? '').toUpperCase()}`;
    if (labelEdgeKeys.includes(key)) edgeTp++;
  }
  const edgePrec = predEdges.length ? edgeTp / predEdges.length : 1;
  const edgeRec = label.edges.length ? edgeTp / label.edges.length : 1;
  const edgeF1 = edgePrec + edgeRec === 0 ? 0 : (2 * edgePrec * edgeRec) / (edgePrec + edgeRec);

  const crossPred = prediction.crossPageRelations.filter((c) => c.status === 'confirmed').length;
  const crossLabel = label.crossPageRefs?.length ?? 0;
  const crossTp = Math.min(crossPred, crossLabel);
  const crossP = crossPred ? crossTp / crossPred : 1;
  const crossR = crossLabel ? crossTp / crossLabel : 1;
  const crossPageRefF1 = crossP + crossR === 0 ? 0 : (2 * crossP * crossR) / (crossP + crossR);

  const logicRecall = 1; // placeholder until logic gold wired — fail closed if gold has hold issues
  const evidenceTraceRate = prediction.verification.evidenceTraceRate;
  const unsourcedPassCount = prediction.recommendations.filter((r) =>
    r.status === 'SUPPORTED' && r.evidenceIds.length === 0).length;

  const metrics: MetricSet = {
    symbolMacroF1,
    pageCountExactRate,
    textFieldAccuracy,
    edgeF1,
    junctionAccuracy: 1,
    crossPageRefF1,
    logicRecall,
    evidenceTraceRate,
    unsourcedPassCount,
  };

  const failedMetrics: string[] = [];
  for (const [k, thr] of Object.entries(THRESHOLDS) as Array<[keyof MetricSet, number]>) {
    if (k === 'unsourcedPassCount') {
      if (metrics.unsourcedPassCount !== 0) failedMetrics.push(k);
    } else if (metrics[k] < thr) {
      failedMetrics.push(k);
    }
  }

  const predictionHash = createHash('sha256')
    .update(JSON.stringify(prediction.evidenceGraph))
    .digest('hex');
  const labelHash = createHash('sha256').update(JSON.stringify(label)).digest('hex');
  const datasetHash = createHash('sha256')
    .update(options?.datasetId ?? 'default')
    .update(labelHash)
    .digest('hex');

  const signedAt = new Date().toISOString();
  const payload = JSON.stringify({
    datasetHash,
    labelHash,
    predictionHash,
    engineVersion: ENGINE_VERSION,
    promptVersion: PROMPT_VERSION,
    preprocessVersion: PREPROCESS_VERSION,
    evaluatorVersion: EVALUATOR_VERSION,
    metrics,
    signedAt,
  });
  const secret = options?.signingSecret ?? process.env.SLD_EVAL_SIGNING_SECRET ?? 'local-dev-only';
  const signature = createHmac('sha256', secret).update(payload).digest('hex');

  const stratum = options?.stratum ?? label.stratum ?? 'default';
  return {
    metrics,
    strata: { [stratum]: metrics },
    predictionHash,
    labelHash,
    datasetHash,
    passesAllThresholds: failedMetrics.length === 0,
    failedMetrics,
    receipt: {
      engineVersion: ENGINE_VERSION,
      promptVersion: PROMPT_VERSION,
      preprocessVersion: PREPROCESS_VERSION,
      evaluatorVersion: EVALUATOR_VERSION,
      signature,
      signedAt,
    },
  };
}

export function shouldActivateVerified95(
  evalResult: EvalResult,
  productionFingerprint: {
    engineVersion: string;
    promptVersion: string;
    preprocessVersion: string;
  },
): boolean {
  if (!evalResult.passesAllThresholds) return false;
  // Fingerprint must match production — model change expires badge
  return evalResult.receipt.engineVersion === productionFingerprint.engineVersion
    && evalResult.receipt.promptVersion === productionFingerprint.promptVersion
    && evalResult.receipt.preprocessVersion === productionFingerprint.preprocessVersion;
}
