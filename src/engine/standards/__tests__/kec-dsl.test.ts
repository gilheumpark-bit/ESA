/**
 * KEC DSL Condition Tree Tests
 *
 * Tests the executable code representation of KEC standard articles.
 * Covers voltage drop (232.52), breaker sizing (212.3), grounding (142.5).
 *
 * Tolerance: exact match for judgments (PASS/FAIL/HOLD)
 */

import { describe, test, expect } from '@jest/globals';
import { evaluateVoltageDropKEC } from '../kec/kec-232';
import { evaluateBreakerKEC, findMinBreakerRating, STANDARD_BREAKER_RATINGS } from '../kec/kec-212';
import { evaluateGroundingKEC } from '../kec/kec-142';
import { evaluateCondition } from '../kec/types';

// -- Voltage Drop Tests (KEC 232.52) ----------------------------------------

describe('KEC 232.52 Voltage Drop Judgment', () => {
  test('2.99% voltage drop -- PASS for main circuit (boundary)', () => {
    const result = evaluateVoltageDropKEC(2.99, 'main');
    expect(result.judgment).toBe('PASS');
    expect(result.matchedConditions.length).toBeGreaterThan(0);
  });

  test('3.00% voltage drop -- PASS for main circuit (exact limit)', () => {
    const result = evaluateVoltageDropKEC(3.00, 'main');
    expect(result.judgment).toBe('PASS');
  });

  test('3.01% voltage drop -- FAIL for main circuit (boundary)', () => {
    const result = evaluateVoltageDropKEC(3.01, 'main');
    expect(result.judgment).toBe('FAIL');
    expect(result.failedConditions.length).toBeGreaterThan(0);
  });

  test('4.99% voltage drop -- PASS for combined (5% limit)', () => {
    const result = evaluateVoltageDropKEC(4.99, 'combined');
    expect(result.judgment).toBe('PASS');
  });

  test('5.01% voltage drop -- FAIL for combined', () => {
    const result = evaluateVoltageDropKEC(5.01, 'combined');
    expect(result.judgment).toBe('FAIL');
  });

  test('NaN input -- HOLD (missing input)', () => {
    const result = evaluateVoltageDropKEC(NaN, 'main');
    expect(result.judgment).toBe('HOLD');
  });
});

// -- Breaker Sizing Tests (KEC 212.3) ---------------------------------------

describe('KEC 212.3 Breaker Sizing Judgment', () => {
  test('100A load, 125% rule -- min breaker 125A, select 125A standard', () => {
    const minRating = findMinBreakerRating(100);
    expect(minRating).toBe(125);
  });

  test('150A breaker for 100A load, 200A wire -- PASS', () => {
    const result = evaluateBreakerKEC(150, 100, 200);
    expect(result.judgment).toBe('PASS');
    // 150 >= 100*1.25=125 (OK) and 150 <= 200 (OK)
  });

  test('100A breaker for 100A load -- FAIL (125% rule violation)', () => {
    const result = evaluateBreakerKEC(100, 100, 200);
    expect(result.judgment).toBe('FAIL');
    // 100 < 100*1.25=125 -> FAIL
  });

  test('250A breaker for 100A load, 200A wire -- FAIL (exceeds wire ampacity)', () => {
    const result = evaluateBreakerKEC(250, 100, 200);
    expect(result.judgment).toBe('FAIL');
    // 250 >= 125 (OK) but 250 > 200 (FAIL)
  });

  test('Missing parameter -- HOLD', () => {
    const result = evaluateBreakerKEC(NaN, 100, 200);
    expect(result.judgment).toBe('HOLD');
  });

  test('Standard breaker ratings are in ascending order', () => {
    for (let i = 1; i < STANDARD_BREAKER_RATINGS.length; i++) {
      expect(STANDARD_BREAKER_RATINGS[i]).toBeGreaterThan(STANDARD_BREAKER_RATINGS[i - 1]);
    }
  });
});

// -- Grounding Tests (KEC 142.5) ---------------------------------------------

describe('KEC 142.5 Grounding Judgment', () => {
  test('9.9 ohm -- PASS for type A (10 ohm limit)', () => {
    const result = evaluateGroundingKEC(9.9, 'A');
    expect(result.judgment).toBe('PASS');
  });

  test('10.0 ohm -- PASS for type A (exact limit)', () => {
    const result = evaluateGroundingKEC(10.0, 'A');
    expect(result.judgment).toBe('PASS');
  });

  test('10.1 ohm -- FAIL for type A', () => {
    const result = evaluateGroundingKEC(10.1, 'A');
    expect(result.judgment).toBe('FAIL');
  });

  test('50 ohm -- PASS for type D (100 ohm limit)', () => {
    const result = evaluateGroundingKEC(50, 'D');
    expect(result.judgment).toBe('PASS');
  });

  test('101 ohm -- FAIL for type D', () => {
    const result = evaluateGroundingKEC(101, 'D');
    expect(result.judgment).toBe('FAIL');
  });

  test('NaN resistance -- HOLD', () => {
    const result = evaluateGroundingKEC(NaN, 'A');
    expect(result.judgment).toBe('HOLD');
  });
});

// -- evaluateCondition primitive tests ---------------------------------------

describe('evaluateCondition helper', () => {
  test('<= operator', () => {
    expect(evaluateCondition({ param: 'x', operator: '<=', value: 3, unit: '%', result: 'PASS', note: '' }, 3)).toBe(true);
    expect(evaluateCondition({ param: 'x', operator: '<=', value: 3, unit: '%', result: 'PASS', note: '' }, 3.01)).toBe(false);
  });

  test('>= operator', () => {
    expect(evaluateCondition({ param: 'x', operator: '>=', value: 125, unit: 'A', result: 'PASS', note: '' }, 125)).toBe(true);
    expect(evaluateCondition({ param: 'x', operator: '>=', value: 125, unit: 'A', result: 'PASS', note: '' }, 124)).toBe(false);
  });

  test('== operator', () => {
    expect(evaluateCondition({ param: 'x', operator: '==', value: 10, unit: 'ohm', result: 'PASS', note: '' }, 10)).toBe(true);
    expect(evaluateCondition({ param: 'x', operator: '==', value: 10, unit: 'ohm', result: 'PASS', note: '' }, 10.1)).toBe(false);
  });
});
