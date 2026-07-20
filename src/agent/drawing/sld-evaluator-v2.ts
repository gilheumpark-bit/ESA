/**
 * Evaluator V2 — deterministic label/prediction comparison.
 *
 * It never reads scores from a prediction. A single local evaluation cannot
 * activate the 95% badge: activation additionally requires an externally
 * signed, production-fingerprint-bound receipt with at least three runs.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from 'node:crypto';

import type { DrawingDocumentV3, ReadFailureCode } from './types-v3';
import { ENGINE_VERSION, EVALUATOR_VERSION, PREPROCESS_VERSION, PROMPT_VERSION } from './types-v3';

type Bounds = { x: number; y: number; w: number; h: number };
type JunctionKind = 'junction' | 'crossover';

export interface GoldenLabel {
  labelId: string;
  documentHash?: string;
  symbols: Array<{ type: string; label?: string; bounds: Bounds; pageIndex: number }>;
  edges: Array<{ fromLabel: string; toLabel: string; pageIndex: number }>;
  texts: Array<{ text: string; pageIndex: number }>;
  junctions?: Array<{ pageIndex: number; x: number; y: number; kind: JunctionKind; tolerancePx?: number }>;
  crossPageRefs?: Array<{ fromPage: number; toPage: number; fromRef?: string; toRef?: string }>;
  logicFindings?: Array<{
    pageIndex?: number;
    expected: 'recommendation' | 'hold';
    contains?: string;
    code?: ReadFailureCode;
  }>;
  /** Backward-compatible logic labels. Prefer logicFindings. */
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

export interface EvaluationReceipt {
  engineVersion: string;
  promptVersion: string;
  preprocessVersion: string;
  evaluatorVersion: string;
  provider: string;
  model: string;
  datasetKind: 'synthetic' | 'public' | 'real-adjudicated';
  runCount: number;
  signatureAlgorithm: 'none' | 'ed25519';
  keyFingerprint: string;
  signature: string;
  signedAt: string;
}

export interface EvalResult {
  metrics: MetricSet;
  strata: Record<string, MetricSet>;
  predictionHash: string;
  labelHash: string;
  datasetHash: string;
  passesAllThresholds: boolean;
  failedMetrics: string[];
  receipt: EvaluationReceipt;
}

export const SLD_95_THRESHOLDS: Readonly<Record<keyof MetricSet, number>> = {
  symbolMacroF1: 0.95,
  pageCountExactRate: 0.95,
  textFieldAccuracy: 0.95,
  edgeF1: 0.95,
  junctionAccuracy: 0.95,
  crossPageRefF1: 0.95,
  logicRecall: 0.95,
  evidenceTraceRate: 1,
  unsourcedPassCount: 0,
};

function canonicalize(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, '').toUpperCase();
}

function iou(left: Bounds, right: Bounds): number {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.w, right.x + right.w);
  const y2 = Math.min(left.y + left.h, right.y + right.h);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = Math.max(0, left.w * left.h) + Math.max(0, right.w * right.h) - intersection;
  return union > 0 ? intersection / union : 0;
}

function f1(tp: number, predicted: number, expected: number): number {
  if (predicted === 0 && expected === 0) return 1;
  const precision = predicted === 0 ? 0 : tp / predicted;
  const recall = expected === 0 ? 1 : tp / expected;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function confirmedType(symbol: DrawingDocumentV3['evidenceGraph']['symbols'][number]): string {
  return normalize(symbol.confirmedType ?? symbol.typeCandidates[0]);
}

function matchSymbols(prediction: DrawingDocumentV3, label: GoldenLabel): Map<string, number> {
  const candidates: Array<{ predictionId: string; labelIndex: number; overlap: number }> = [];
  for (const symbol of prediction.evidenceGraph.symbols.filter((item) => item.certainty === 'confirmed')) {
    const evidence = symbol.evidence[0];
    if (!evidence) continue;
    for (let labelIndex = 0; labelIndex < label.symbols.length; labelIndex += 1) {
      const expected = label.symbols[labelIndex];
      if (expected.pageIndex !== evidence.pageIndex || normalize(expected.type) !== confirmedType(symbol)) continue;
      if (expected.label && normalize(expected.label) !== normalize(symbol.rawLabel)) continue;
      const overlap = iou(evidence.bounds, expected.bounds);
      if (overlap >= 0.5) candidates.push({ predictionId: symbol.id, labelIndex, overlap });
    }
  }
  candidates.sort((left, right) => right.overlap - left.overlap
    || left.predictionId.localeCompare(right.predictionId)
    || left.labelIndex - right.labelIndex);
  const usedPredictions = new Set<string>();
  const usedLabels = new Set<number>();
  const matches = new Map<string, number>();
  for (const candidate of candidates) {
    if (usedPredictions.has(candidate.predictionId) || usedLabels.has(candidate.labelIndex)) continue;
    usedPredictions.add(candidate.predictionId);
    usedLabels.add(candidate.labelIndex);
    matches.set(candidate.predictionId, candidate.labelIndex);
  }
  return matches;
}

function symbolMacroF1(prediction: DrawingDocumentV3, label: GoldenLabel, matches: Map<string, number>): number {
  const predicted = prediction.evidenceGraph.symbols.filter((item) => item.certainty === 'confirmed');
  const types = new Set([...predicted.map(confirmedType), ...label.symbols.map((item) => normalize(item.type))].filter(Boolean));
  if (types.size === 0) return 1;
  let total = 0;
  for (const type of types) {
    const predictedCount = predicted.filter((item) => confirmedType(item) === type).length;
    const expectedCount = label.symbols.filter((item) => normalize(item.type) === type).length;
    const tp = [...matches.entries()].filter(([predictionId, labelIndex]) => {
      const symbol = predicted.find((item) => item.id === predictionId);
      return symbol && confirmedType(symbol) === type && normalize(label.symbols[labelIndex]?.type) === type;
    }).length;
    total += f1(tp, predictedCount, expectedCount);
  }
  return total / types.size;
}

function pageCountExactRate(prediction: DrawingDocumentV3, label: GoldenLabel): number {
  const predicted = prediction.evidenceGraph.symbols.filter((item) => item.certainty === 'confirmed');
  const pages = new Set([
    ...prediction.pages.map((item) => item.pageIndex),
    ...predicted.map((item) => item.evidence[0]?.pageIndex ?? -1),
    ...label.symbols.map((item) => item.pageIndex),
  ]);
  pages.delete(-1);
  if (pages.size === 0) return 1;
  let exact = 0;
  for (const pageIndex of pages) {
    const predictedCounts = new Map<string, number>();
    const expectedCounts = new Map<string, number>();
    for (const item of predicted.filter((symbol) => symbol.evidence[0]?.pageIndex === pageIndex)) {
      const type = confirmedType(item);
      predictedCounts.set(type, (predictedCounts.get(type) ?? 0) + 1);
    }
    for (const item of label.symbols.filter((symbol) => symbol.pageIndex === pageIndex)) {
      const type = normalize(item.type);
      expectedCounts.set(type, (expectedCounts.get(type) ?? 0) + 1);
    }
    const keys = new Set([...predictedCounts.keys(), ...expectedCounts.keys()]);
    if ([...keys].every((key) => predictedCounts.get(key) === expectedCounts.get(key))) exact += 1;
  }
  return exact / pages.size;
}

function textFieldAccuracy(prediction: DrawingDocumentV3, label: GoldenLabel): number {
  const predicted = prediction.evidenceGraph.texts.filter((item) => item.certainty === 'confirmed');
  const used = new Set<number>();
  let matches = 0;
  for (const expected of label.texts) {
    const index = predicted.findIndex((item, candidateIndex) => !used.has(candidateIndex)
      && item.evidence[0]?.pageIndex === expected.pageIndex
      && normalize(item.confirmedText ?? item.rawText) === normalize(expected.text));
    if (index >= 0) {
      used.add(index);
      matches += 1;
    }
  }
  return Math.max(predicted.length, label.texts.length) === 0
    ? 1
    : matches / Math.max(predicted.length, label.texts.length);
}

function undirectedKey(pageIndex: number, left: string, right: string): string {
  const ends = [normalize(left), normalize(right)].sort();
  return `${pageIndex}:${ends[0]}<->${ends[1]}`;
}

function edgeF1(prediction: DrawingDocumentV3, label: GoldenLabel, matches: Map<string, number>): number {
  const expected = new Set(label.edges.map((edge) => undirectedKey(edge.pageIndex, edge.fromLabel, edge.toLabel)));
  const predictedKeys: string[] = [];
  for (const edge of prediction.evidenceGraph.relations.filter((item) => item.certainty === 'confirmed')) {
    const fromLabelIndex = matches.get(edge.from);
    const toLabelIndex = matches.get(edge.to);
    if (fromLabelIndex === undefined || toLabelIndex === undefined) {
      predictedKeys.push(`UNMATCHED:${edge.id}`);
      continue;
    }
    const from = label.symbols[fromLabelIndex];
    const to = label.symbols[toLabelIndex];
    if (!from || !to) continue;
    predictedKeys.push(undirectedKey(from.pageIndex, from.label ?? `@${fromLabelIndex}`, to.label ?? `@${toLabelIndex}`));
  }
  const uniquePredicted = new Set(predictedKeys);
  const tp = [...uniquePredicted].filter((key) => expected.has(key)).length;
  return f1(tp, uniquePredicted.size, expected.size);
}

function junctionAccuracy(prediction: DrawingDocumentV3, label: GoldenLabel): number {
  const expected = label.junctions ?? [];
  const predicted = prediction.evidenceGraph.lines
    .filter((line) => line.certainty === 'confirmed')
    .flatMap((line) => {
      const pageIndex = line.evidence[0]?.pageIndex;
      if (pageIndex === undefined) return [];
      return [
        ...line.junctions.map((point) => ({ ...point, pageIndex, kind: 'junction' as const })),
        ...line.crossovers.map((point) => ({ ...point, pageIndex, kind: 'crossover' as const })),
      ];
    });
  const used = new Set<number>();
  let tp = 0;
  for (const item of expected) {
    const tolerance = item.tolerancePx ?? 12;
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    predicted.forEach((candidate, index) => {
      if (used.has(index) || candidate.pageIndex !== item.pageIndex || candidate.kind !== item.kind) return;
      const distance = Math.hypot(candidate.x - item.x, candidate.y - item.y);
      if (distance <= tolerance && distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    });
    if (bestIndex >= 0) {
      used.add(bestIndex);
      tp += 1;
    }
  }
  return f1(tp, predicted.length, expected.length);
}

function crossPageRefF1(prediction: DrawingDocumentV3, label: GoldenLabel): number {
  const key = (item: { fromPage: number; toPage: number; fromRef?: string; toRef?: string }) => {
    const pages = [item.fromPage, item.toPage].sort((left, right) => left - right);
    const refs = [normalize(item.fromRef), normalize(item.toRef)].sort();
    return `${pages.join('->')}:${refs.join('<->')}`;
  };
  const expected = new Set((label.crossPageRefs ?? []).map(key));
  const predicted = new Set(prediction.crossPageRelations
    .filter((item) => item.status === 'confirmed')
    .map((item) => key(item)));
  const tp = [...predicted].filter((item) => expected.has(item)).length;
  return f1(tp, predicted.size, expected.size);
}

function logicRecall(prediction: DrawingDocumentV3, label: GoldenLabel): number {
  const expected: NonNullable<GoldenLabel['logicFindings']> = label.logicFindings ?? (label.holdItems ?? []).map((contains) => ({
    expected: 'hold' as const,
    contains,
  }));
  if (expected.length === 0) return 1;
  let hits = 0;
  for (const item of expected) {
    if (item.expected === 'hold') {
      const matched = prediction.unresolvedItems.some((unresolved) =>
        (item.pageIndex === undefined || unresolved.pageIndex === item.pageIndex)
        && (!item.code || unresolved.code === item.code)
        && (!item.contains || normalize(unresolved.note).includes(normalize(item.contains))));
      if (matched) hits += 1;
    } else {
      const expectedPage = item.pageIndex;
      const matched = prediction.recommendations.some((recommendation) =>
        recommendation.status !== 'REJECTED'
        && (!item.contains || normalize(recommendation.problem).includes(normalize(item.contains)))
        && (expectedPage === undefined || recommendation.relatedDisplayIds.some((id) => id.startsWith(`P${String(expectedPage + 1).padStart(2, '0')}-`))));
      if (matched) hits += 1;
    }
  }
  return hits / expected.length;
}

function claimEvidenceMetrics(prediction: DrawingDocumentV3): { evidenceTraceRate: number; unsourcedPassCount: number } {
  const claims: boolean[] = [];
  prediction.evidenceGraph.symbols.filter((item) => item.certainty === 'confirmed').forEach((item) => claims.push(item.evidence.length > 0));
  prediction.evidenceGraph.lines.filter((item) => item.certainty === 'confirmed').forEach((item) => claims.push(item.evidence.length > 0));
  prediction.evidenceGraph.texts.filter((item) => item.certainty === 'confirmed').forEach((item) => claims.push(item.evidence.length > 0));
  prediction.evidenceGraph.relations.filter((item) => item.certainty === 'confirmed').forEach((item) => claims.push(item.evidence.length > 0));
  prediction.crossPageRelations.filter((item) => item.status === 'confirmed').forEach((item) => claims.push(item.evidence.length > 0));
  prediction.calculations.filter((item) => item.value !== undefined).forEach((item) => claims.push(item.evidenceIds.length > 0 && Boolean(item.receiptHash)));
  prediction.recommendations.filter((item) => item.status === 'SUPPORTED').forEach((item) => claims.push(item.evidenceIds.length > 0));
  const unsourcedRecommendations = prediction.recommendations.filter((item) => item.status === 'SUPPORTED' && item.evidenceIds.length === 0).length;
  const unsourcedCalculations = prediction.calculations.filter((item) => item.compliant === true && (item.evidenceIds.length === 0 || !item.receiptHash)).length;
  return {
    evidenceTraceRate: claims.length === 0 ? 1 : claims.filter(Boolean).length / claims.length,
    unsourcedPassCount: unsourcedRecommendations + unsourcedCalculations,
  };
}

function failedMetricNames(metrics: MetricSet): string[] {
  return (Object.entries(SLD_95_THRESHOLDS) as Array<[keyof MetricSet, number]>).flatMap(([key, threshold]) => {
    if (key === 'unsourcedPassCount') return metrics[key] === threshold ? [] : [key];
    return metrics[key] >= threshold ? [] : [key];
  });
}

function signaturePayload(result: Omit<EvalResult, 'passesAllThresholds' | 'failedMetrics' | 'receipt'>, receipt: Omit<EvaluationReceipt, 'signature'>): string {
  return canonicalize({
    datasetHash: result.datasetHash,
    labelHash: result.labelHash,
    predictionHash: result.predictionHash,
    metrics: result.metrics,
    strata: result.strata,
    ...receipt,
  });
}

function minimumMetrics(rows: MetricSet[]): MetricSet {
  if (rows.length === 0) throw new Error('EVAL_SUITE_EMPTY');
  const lowerBoundKeys: Array<Exclude<keyof MetricSet, 'unsourcedPassCount'>> = [
    'symbolMacroF1', 'pageCountExactRate', 'textFieldAccuracy', 'edgeF1',
    'junctionAccuracy', 'crossPageRefF1', 'logicRecall', 'evidenceTraceRate',
  ];
  return {
    ...Object.fromEntries(lowerBoundKeys.map((key) => [key, Math.min(...rows.map((row) => row[key]))])),
    unsourcedPassCount: rows.reduce((sum, row) => sum + row.unsourcedPassCount, 0),
  } as MetricSet;
}

function attachReceipt(
  unsignedResult: Omit<EvalResult, 'passesAllThresholds' | 'failedMetrics' | 'receipt'>,
  metadata: Pick<EvaluationReceipt, 'provider' | 'model' | 'datasetKind' | 'runCount'>,
  signingPrivateKeyPem?: string,
): EvalResult {
  const receiptWithoutSignature: Omit<EvaluationReceipt, 'signature'> = {
    engineVersion: ENGINE_VERSION,
    promptVersion: PROMPT_VERSION,
    preprocessVersion: PREPROCESS_VERSION,
    evaluatorVersion: EVALUATOR_VERSION,
    ...metadata,
    signatureAlgorithm: signingPrivateKeyPem ? 'ed25519' : 'none',
    keyFingerprint: '',
    signedAt: new Date().toISOString(),
  };
  let signature = '';
  if (signingPrivateKeyPem) {
    const privateKey = createPrivateKey(signingPrivateKeyPem);
    const publicKey = createPublicKey(signingPrivateKeyPem);
    receiptWithoutSignature.keyFingerprint = createHash('sha256')
      .update(publicKey.export({ type: 'spki', format: 'der' }))
      .digest('hex');
    signature = sign(null, Buffer.from(signaturePayload(unsignedResult, receiptWithoutSignature)), privateKey).toString('base64');
  }
  const failedMetrics = failedMetricNames(unsignedResult.metrics);
  return {
    ...unsignedResult,
    passesAllThresholds: failedMetrics.length === 0,
    failedMetrics,
    receipt: { ...receiptWithoutSignature, signature },
  };
}

/** Aggregate case/run results fail-closed: every metric uses the worst stratum/case/run. */
export function buildEvaluationSuiteResult(
  results: EvalResult[],
  options: {
    provider: string;
    model: string;
    datasetKind: EvaluationReceipt['datasetKind'];
    runsPerCase: number;
    signingPrivateKeyPem?: string;
  },
): EvalResult {
  if (results.length === 0) throw new Error('EVAL_SUITE_EMPTY');
  if (!options.provider.trim() || !options.model.trim()) throw new Error('EVAL_SUITE_FINGERPRINT_REQUIRED');
  if (!Number.isSafeInteger(options.runsPerCase) || options.runsPerCase < 1) throw new Error('EVAL_SUITE_RUN_COUNT_INVALID');
  const strataRows = new Map<string, MetricSet[]>();
  for (const result of results) {
    for (const [stratum, metrics] of Object.entries(result.strata)) {
      strataRows.set(stratum, [...(strataRows.get(stratum) ?? []), metrics]);
    }
  }
  const strata = Object.fromEntries([...strataRows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([stratum, rows]) => [stratum, minimumMetrics(rows)]));
  const metrics = minimumMetrics(Object.values(strata));
  return attachReceipt({
    metrics,
    strata,
    predictionHash: digest(results.map((result) => result.predictionHash)),
    labelHash: digest(results.map((result) => result.labelHash)),
    datasetHash: digest(results.map((result) => result.datasetHash)),
  }, {
    provider: options.provider,
    model: options.model,
    datasetKind: options.datasetKind,
    runCount: options.runsPerCase,
  }, options.signingPrivateKeyPem);
}

export function evaluatePredictionAgainstLabel(
  prediction: DrawingDocumentV3,
  label: GoldenLabel,
  options: {
    datasetId?: string;
    stratum?: string;
    datasetKind?: EvaluationReceipt['datasetKind'];
    provider?: string;
    model?: string;
    runCount?: number;
    signingPrivateKeyPem?: string;
  } = {},
): EvalResult {
  if ((prediction as unknown as { injectedMetrics?: unknown }).injectedMetrics) {
    throw new Error('EVAL_REJECT_INJECTED_METRICS: scores must be computed from prediction+label');
  }
  if (label.documentHash && label.documentHash !== prediction.documentHash) {
    throw new Error('EVAL_DOCUMENT_HASH_MISMATCH');
  }
  const matches = matchSymbols(prediction, label);
  const claimMetrics = claimEvidenceMetrics(prediction);
  const metrics: MetricSet = {
    symbolMacroF1: symbolMacroF1(prediction, label, matches),
    pageCountExactRate: pageCountExactRate(prediction, label),
    textFieldAccuracy: textFieldAccuracy(prediction, label),
    edgeF1: edgeF1(prediction, label, matches),
    junctionAccuracy: junctionAccuracy(prediction, label),
    crossPageRefF1: crossPageRefF1(prediction, label),
    logicRecall: logicRecall(prediction, label),
    ...claimMetrics,
  };
  const stratum = options.stratum ?? label.stratum ?? 'unspecified';
  const unsignedResult = {
    metrics,
    strata: { [stratum]: metrics },
    predictionHash: digest({
      evidenceGraph: prediction.evidenceGraph,
      crossPageRelations: prediction.crossPageRelations,
      calculations: prediction.calculations,
      recommendations: prediction.recommendations,
      unresolvedItems: prediction.unresolvedItems,
    }),
    labelHash: digest(label),
    datasetHash: '',
  };
  unsignedResult.datasetHash = digest({ datasetId: options.datasetId ?? 'unspecified', labelHash: unsignedResult.labelHash });
  const runCount = Number.isSafeInteger(options.runCount) && (options.runCount ?? 0) > 0 ? options.runCount! : 1;
  return attachReceipt(unsignedResult, {
    provider: options.provider ?? '',
    model: options.model ?? '',
    datasetKind: options.datasetKind ?? 'synthetic',
    runCount,
  }, options.signingPrivateKeyPem);
}

export function shouldActivateVerified95(
  evalResult: EvalResult,
  productionFingerprint: NonNullable<DrawingDocumentV3['verification']['productionFingerprint']>,
  options?: {
    publicKeyPem: string;
    requiredStrata: string[];
    realAdjudicated: boolean;
    now?: number;
    maxAgeMs?: number;
  },
): boolean {
  if (!evalResult.passesAllThresholds || !options?.publicKeyPem || !options.realAdjudicated) return false;
  if (evalResult.receipt.signatureAlgorithm !== 'ed25519' || !evalResult.receipt.signature || evalResult.receipt.runCount < 3) return false;
  if (evalResult.receipt.datasetKind !== 'real-adjudicated' || !evalResult.receipt.provider || !evalResult.receipt.model) return false;
  if (!productionFingerprint.provider || !productionFingerprint.model) return false;
  if (evalResult.receipt.engineVersion !== productionFingerprint.engineVersion
    || evalResult.receipt.promptVersion !== productionFingerprint.promptVersion
    || evalResult.receipt.preprocessVersion !== productionFingerprint.preprocessVersion
    || evalResult.receipt.provider !== productionFingerprint.provider
    || evalResult.receipt.model !== productionFingerprint.model) return false;
  if (options.requiredStrata.length === 0 || options.requiredStrata.some((stratum) => !evalResult.strata[stratum]
    || failedMetricNames(evalResult.strata[stratum]).length > 0)) return false;
  const signedAt = Date.parse(evalResult.receipt.signedAt);
  const age = (options.now ?? Date.now()) - signedAt;
  if (!Number.isFinite(signedAt) || age < 0 || age > (options.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000)) return false;
  try {
    const publicKey = createPublicKey(options.publicKeyPem);
    const fingerprint = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
    if (fingerprint !== evalResult.receipt.keyFingerprint) return false;
    const { signature, ...receiptWithoutSignature } = evalResult.receipt;
    const unsignedResult = {
      metrics: evalResult.metrics,
      strata: evalResult.strata,
      predictionHash: evalResult.predictionHash,
      labelHash: evalResult.labelHash,
      datasetHash: evalResult.datasetHash,
    };
    return verify(
      null,
      Buffer.from(signaturePayload(unsignedResult, receiptWithoutSignature)),
      publicKey,
      Buffer.from(signature, 'base64'),
    );
  } catch {
    return false;
  }
}
