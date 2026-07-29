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

/**
 * 휴면 선언을 게이트로 고정한다.
 *
 * 목록에 적어 두기만 하면 배선이 생겨도 아무도 주석을 안 고친다. 초록 테스트가
 * 얹힌 휴면 코드는 "다 있음"으로 읽히는데 실제로는 아무것도 안 돈다(§2.2).
 * 그래서 **호출처 0** 자체를 검사한다 — 누가 배선하면 이 검사가 깨지고,
 * 그때 metrics.ts 의 휴면 주석과 macro-F1 함정을 함께 처리하게 된다.
 */
describe('휴면 선언', () => {
  const { readdirSync, readFileSync, statSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== '__tests__' && entry !== 'node_modules') walk(full, out);
      } else if (/\.(ts|tsx|mjs)$/.test(entry)) out.push(full);
    }
    return out;
  }

  const files = [...walk(join(process.cwd(), 'src')), ...walk(join(process.cwd(), 'scripts'))]
    .filter((f) => !f.endsWith(join('agent', 'report', 'metrics.ts')));

  it('훑을 파일이 실제로 있다 — 공회전 반증', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('운영 코드가 채점 절반을 부르지 않는다 (배선되면 이 검사를 지우고 주석을 고칠 것)', () => {
    const callers = files.filter((f) =>
      /\b(evaluateGoldenPrediction|precisionRecallF1)\b/.test(readFileSync(f, 'utf8')));
    expect(callers.map((f) => f.replace(process.cwd(), ''))).toEqual([]);
  });

  it('살아 있는 절반은 실제로 배선돼 있다', () => {
    const callers = files.filter((f) =>
      /\bverifyGoldenGateReceiptSignature\b/.test(readFileSync(f, 'utf8')));
    expect(callers.length).toBeGreaterThan(0);
  });
});
