import { evaluateGoldenPrediction, precisionRecallF1 } from '../metrics';

describe('SLD golden metrics', () => {
  it('computes exact precision, recall, and F1', () => {
    expect(precisionRecallF1(95, 5, 5)).toEqual({ precision: 0.95, recall: 0.95, f1: 0.95 });
    expect(precisionRecallF1(0, 0, 0)).toEqual({ precision: 1, recall: 1, f1: 1 });
  });

  it('uses a macro average instead of allowing common symbols to hide a weak type', () => {
    const metrics = evaluateGoldenPrediction({
      symbolsByType: {
        VCB: { tp: 100, fp: 0, fn: 0 },
        CT: { tp: 0, fp: 1, fn: 1 },
      },
      textFields: { correct: 4, total: 5 },
      edges: { tp: 8, fp: 1, fn: 1 },
      junctionsAndCrossovers: { correct: 9, total: 10 },
      criticalLogicIssues: { found: 2, total: 4 },
      unsupportedPassCount: 0,
      claims: { traced: 5, total: 5 },
    });

    expect(metrics.symbolMacroF1).toBe(0.5);
    expect(metrics.textFieldAccuracy).toBe(0.8);
    expect(metrics.edgeF1).toBeCloseTo(8 / 9);
    expect(metrics.junctionAccuracy).toBe(0.9);
    expect(metrics.criticalLogicRecall).toBe(0.5);
    expect(metrics.claimTraceability).toBe(1);
  });

  it('handles empty adjudication buckets without NaN', () => {
    const metrics = evaluateGoldenPrediction({
      symbolsByType: {},
      textFields: { correct: 0, total: 0 },
      edges: { tp: 0, fp: 0, fn: 0 },
      junctionsAndCrossovers: { correct: 0, total: 0 },
      criticalLogicIssues: { found: 0, total: 0 },
      unsupportedPassCount: 0,
      claims: { traced: 0, total: 0 },
    });

    expect(metrics).toEqual({
      symbolMacroF1: 1,
      textFieldAccuracy: 1,
      edgeF1: 1,
      junctionAccuracy: 1,
      criticalLogicRecall: 1,
      unsupportedPassCount: 0,
      claimTraceability: 1,
    });
    expect(Object.values(metrics).every(Number.isFinite)).toBe(true);
  });

  it.each([
    [-1, 0, 0],
    [Number.NaN, 0, 0],
    [1.5, 0, 0],
  ])('rejects invalid adjudication counts (%p, %p, %p)', (tp, fp, fn) => {
    expect(() => precisionRecallF1(tp, fp, fn)).toThrow('non-negative integer');
  });

  it('rejects a ratio whose correct count exceeds the total', () => {
    expect(() => evaluateGoldenPrediction({
      symbolsByType: {},
      textFields: { correct: 2, total: 1 },
      edges: { tp: 0, fp: 0, fn: 0 },
      junctionsAndCrossovers: { correct: 0, total: 0 },
      criticalLogicIssues: { found: 0, total: 0 },
      unsupportedPassCount: 0,
      claims: { traced: 0, total: 0 },
    })).toThrow('must not exceed total');
  });
});
