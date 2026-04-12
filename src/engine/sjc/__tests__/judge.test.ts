/**
 * SJC Judge Engine Tests
 *
 * Tests the 4-level verdict system: PASS / HOLD / FAIL / BLOCK
 *
 * Priority: BLOCK > FAIL > HOLD > PASS
 * (one BLOCK -> whole graph BLOCK, one FAIL -> whole FAIL)
 */

import { describe, test, expect } from '@jest/globals';
import { judge, judgeGraph, verdictSeverity } from '../judge';
import { createSource, createJudgment } from '../types';
import type { CalcResult } from '../../standards/types';
import type { JudgmentResult } from '../../standards/kec/types';

// -- Helpers -----------------------------------------------------------------

function makeCalcResult(overrides: Partial<CalcResult> = {}): CalcResult {
  return {
    value: 100,
    unit: 'A',
    source: [createSource('KEC', '232.52', { edition: '2021' })],
    ...overrides,
  };
}

// -- Single Result Judgment --------------------------------------------------

describe('SJC Judge - Single Result', () => {
  test('PASS: valid result with source tags', () => {
    const result = makeCalcResult();
    const sjc = judge(result);
    expect(sjc.verdict).toBe('PASS');
    expect(sjc.sources.length).toBeGreaterThan(0);
  });

  test('PASS: result with existing pass judgment', () => {
    const result = makeCalcResult({
      judgment: createJudgment(true, 'All conditions met', 'info', 'KEC 232.52'),
    });
    const sjc = judge(result);
    expect(sjc.verdict).toBe('PASS');
  });

  test('HOLD: null value indicates missing input', () => {
    const result = makeCalcResult({ value: null });
    const sjc = judge(result);
    expect(sjc.verdict).toBe('HOLD');
  });

  test('FAIL: standard violation via JudgmentResult', () => {
    const result = makeCalcResult();
    const articleResult: JudgmentResult = {
      judgment: 'FAIL',
      article: {
        id: 'KEC-232.52-MAIN',
        country: 'KR',
        standard: 'KEC',
        article: '232.52',
        title: 'Voltage drop',
        conditions: [],
        effectiveDate: '2021-01-01',
        version: '2021',
      },
      matchedConditions: [],
      failedConditions: [{
        param: 'voltageDropPercent',
        operator: '<=',
        value: 3,
        unit: '%',
        result: 'PASS',
        note: 'Voltage drop exceeds 3%',
      }],
      notes: ['Voltage drop 3.5% > 3% limit'],
    };

    const sjc = judge(result, articleResult);
    expect(sjc.verdict).toBe('FAIL');
    expect(sjc.failedConditions).toBeDefined();
    expect(sjc.failedConditions!.length).toBeGreaterThan(0);
  });

  test('FAIL: result with existing fail judgment', () => {
    const result = makeCalcResult({
      judgment: createJudgment(false, 'Voltage drop exceeds limit', 'error', 'KEC 232.52'),
    });
    const sjc = judge(result);
    expect(sjc.verdict).toBe('FAIL');
  });

  test('BLOCK: value without source tags', () => {
    const result: CalcResult = {
      value: 42,
      unit: 'A',
      source: [],
    };
    const sjc = judge(result);
    expect(sjc.verdict).toBe('BLOCK');
    expect(sjc.reason).toContain('소스 태그 누락');
  });
});

// -- Graph Judgment ----------------------------------------------------------

describe('SJC Judge - Graph Judgment', () => {
  test('All PASS -> graph PASS', () => {
    const graph = new Map<string, CalcResult>();
    graph.set('node1', makeCalcResult());
    graph.set('node2', makeCalcResult());

    const sjc = judgeGraph(graph);
    expect(sjc.verdict).toBe('PASS');
  });

  test('Mixed PASS + FAIL -> graph FAIL', () => {
    const graph = new Map<string, CalcResult>();
    graph.set('node1', makeCalcResult());
    graph.set('node2', makeCalcResult({
      judgment: createJudgment(false, 'Violation', 'error'),
    }));

    const sjc = judgeGraph(graph);
    expect(sjc.verdict).toBe('FAIL');
  });

  test('Any BLOCK -> graph BLOCK (highest priority)', () => {
    const graph = new Map<string, CalcResult>();
    graph.set('node1', makeCalcResult());
    graph.set('node2', { value: 42, unit: 'A', source: [] }); // No sources -> BLOCK

    const sjc = judgeGraph(graph);
    expect(sjc.verdict).toBe('BLOCK');
  });

  test('Empty graph -> HOLD', () => {
    const graph = new Map<string, CalcResult>();
    const sjc = judgeGraph(graph);
    expect(sjc.verdict).toBe('HOLD');
  });
});

// -- Severity Utility --------------------------------------------------------

describe('verdictSeverity', () => {
  test('BLOCK = 3, FAIL = 2, HOLD = 1, PASS = 0', () => {
    expect(verdictSeverity('BLOCK')).toBe(3);
    expect(verdictSeverity('FAIL')).toBe(2);
    expect(verdictSeverity('HOLD')).toBe(1);
    expect(verdictSeverity('PASS')).toBe(0);
  });
});
