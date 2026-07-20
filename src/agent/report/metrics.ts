export interface PRF1 {
  precision: number;
  recall: number;
  f1: number;
}

export interface GoldenCounts {
  symbolsByType: Record<string, { tp: number; fp: number; fn: number }>;
  textFields: { correct: number; total: number };
  edges: { tp: number; fp: number; fn: number };
  junctionsAndCrossovers: { correct: number; total: number };
  criticalLogicIssues: { found: number; total: number };
  unsupportedPassCount: number;
  claims: { traced: number; total: number };
}

export interface GoldenMetrics {
  symbolMacroF1: number;
  textFieldAccuracy: number;
  edgeF1: number;
  junctionAccuracy: number;
  criticalLogicRecall: number;
  unsupportedPassCount: number;
  claimTraceability: number;
}

function assertCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
}

function ratio(correct: number, total: number, label: string): number {
  assertCount(correct, `${label}.correct`);
  assertCount(total, `${label}.total`);
  if (correct > total) throw new RangeError(`${label}.correct must not exceed total.`);
  return total === 0 ? 1 : correct / total;
}

export function precisionRecallF1(tp: number, fp: number, fn: number): PRF1 {
  assertCount(tp, 'tp');
  assertCount(fp, 'fp');
  assertCount(fn, 'fn');
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1Denominator = 2 * tp + fp + fn;
  const f1 = f1Denominator === 0 ? 1 : (2 * tp) / f1Denominator;
  return { precision, recall, f1 };
}

export function evaluateGoldenPrediction(input: GoldenCounts): GoldenMetrics {
  assertCount(input.unsupportedPassCount, 'unsupportedPassCount');
  const symbolScores = Object.entries(input.symbolsByType)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([, counts]) => precisionRecallF1(counts.tp, counts.fp, counts.fn).f1);
  return {
    symbolMacroF1: symbolScores.length === 0
      ? 1
      : symbolScores.reduce((sum, value) => sum + value, 0) / symbolScores.length,
    textFieldAccuracy: ratio(input.textFields.correct, input.textFields.total, 'textFields'),
    edgeF1: precisionRecallF1(input.edges.tp, input.edges.fp, input.edges.fn).f1,
    junctionAccuracy: ratio(
      input.junctionsAndCrossovers.correct,
      input.junctionsAndCrossovers.total,
      'junctionsAndCrossovers',
    ),
    criticalLogicRecall: ratio(
      input.criticalLogicIssues.found,
      input.criticalLogicIssues.total,
      'criticalLogicIssues',
    ),
    unsupportedPassCount: input.unsupportedPassCount,
    claimTraceability: ratio(input.claims.traced, input.claims.total, 'claims'),
  };
}
