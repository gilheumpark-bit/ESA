/**
 * LLM Output Filter Tests
 *
 * "Tool 없이 수치를 말하면 시스템이 차단합니다."
 *
 * Tests that unsourced numbers and probabilistic expressions are blocked.
 * Tests that tool-backed outputs pass through cleanly.
 */

import { describe, test, expect } from '@jest/globals';
import { filterLLMOutput, isClean } from '../output-filter';

// -- Clean Output Tests (should PASS) ----------------------------------------

describe('LLM Output Filter - Clean Output', () => {
  test('probability wording followed by a numbered checklist is not mistaken for a numeric estimate', () => {
    const output = '일반적으로 OCR 오인 가능성을 먼저 확인합니다.\n1. 원본 확인\n2. 범례 대조';
    const result = filterLLMOutput(output);

    expect(result.passed).toBe(true);
    expect(result.filtered).toBe(output);
  });

  test('numbers copied from the user question are treated as input evidence', () => {
    const output = '입력값은 3상 380V, 50kW입니다.';
    const result = filterLLMOutput(output, [], '부하는 3상 380V 50kW입니다.');

    expect(result.passed).toBe(true);
  });

  test('a derived number is still blocked when only inputs are trusted', () => {
    const output = '입력은 380V, 50kW이고 계산 전류는 75A입니다.';
    const result = filterLLMOutput(output, [], '부하는 380V 50kW입니다.');

    expect(result.passed).toBe(false);
    expect(result.filtered).toContain('380V');
    expect(result.filtered).toContain('50kW');
    expect(result.filtered).not.toContain('75A');
  });
  test('Clean output with tool calls -- passes', () => {
    const output = 'The voltage drop is 2.8%. [SOURCE: KEC 232.52]';
    const toolCalls = [{ name: 'calculate_voltage_drop', result: { value: 2.8 } }];

    const result = filterLLMOutput(output, toolCalls);
    expect(result.passed).toBe(true);
    expect(result.blocked.length).toBe(0);
  });

  test('KEC 232.52 citation with tool call and source tag -- PASS', () => {
    const output = 'KEC 232.52 기준, 전압강하는 2.8%입니다. [SOURCE: KEC 232.52]';
    const toolCalls = [{ name: 'lookup_code_article', result: {} }];

    const result = filterLLMOutput(output, toolCalls);
    expect(result.passed).toBe(true);
  });

  test('Text with only small ordinals (Step 1, Step 2) -- passes', () => {
    const output = 'Step 1: Check the input. Step 2: Calculate.';
    const toolCalls = [{ name: 'calculate_voltage_drop' }];

    const result = filterLLMOutput(output, toolCalls);
    expect(result.passed).toBe(true);
  });

  test('isClean returns true for clean output with tool calls', () => {
    const output = 'The result is shown above. [SOURCE: KEC 232.52]';
    const toolCalls = [{ name: 'calculate_voltage_drop' }];
    expect(isClean(output, toolCalls)).toBe(true);
  });
});

// -- Blocked Output Tests (should FAIL) --------------------------------------

describe('LLM Output Filter - Blocked Output', () => {
  test('"약 32A" -- BLOCK (probabilistic Korean)', () => {
    const output = '이 경우 약 32A 정도의 전류가 흐릅니다.';
    const result = filterLLMOutput(output);
    expect(result.passed).toBe(false);
    expect(result.blocked.some(b => b.reason === 'probabilistic')).toBe(true);
  });

  test('"일반적으로 25mm2" -- BLOCK (probabilistic Korean)', () => {
    const output = '일반적으로 25mm2 케이블을 사용합니다.';
    const result = filterLLMOutput(output);
    expect(result.passed).toBe(false);
    expect(result.blocked.some(b => b.reason === 'probabilistic')).toBe(true);
  });

  test('"roughly 100A" -- BLOCK (probabilistic English)', () => {
    const output = 'The load is roughly 100A for this configuration.';
    const result = filterLLMOutput(output);
    expect(result.passed).toBe(false);
    expect(result.blocked.some(b => b.reason === 'probabilistic')).toBe(true);
  });

  test('"approximately 50kW" -- BLOCK (probabilistic English)', () => {
    const output = 'The power consumption is approximately 50kW.';
    const result = filterLLMOutput(output);
    expect(result.passed).toBe(false);
  });

  test('Number without any tool calls -- BLOCK (no_tool_call)', () => {
    const output = 'You need a 35mm2 cable for this application.';
    const result = filterLLMOutput(output, []);
    expect(result.passed).toBe(false);
    expect(result.blocked.some(b => b.reason === 'no_tool_call')).toBe(true);
  });

  test('isClean returns false for probabilistic output', () => {
    const output = '보통 100A 정도면 충분합니다.';
    expect(isClean(output)).toBe(false);
  });

  test('Standard citation without lookup tool call -- BLOCK', () => {
    const output = 'KEC 232.52에 따르면 3% 이하여야 합니다.';
    const result = filterLLMOutput(output, []);
    expect(result.passed).toBe(false);
  });
});

// -- Filter Replacement Tests ------------------------------------------------

describe('LLM Output Filter - Replacement Markers', () => {
  test('overlapping probabilistic and numeric findings produce one intact marker', () => {
    const result = filterLLMOutput('약 32A가 흐릅니다.');

    expect(result.filtered.match(/\[BLOCKED:/g)).toHaveLength(1);
    expect(result.filtered).not.toContain(']LOCKED');
  });
  test('Blocked probabilistic text gets replacement marker', () => {
    const output = '대략 50A의 전류가 필요합니다.';
    const result = filterLLMOutput(output);
    expect(result.filtered).toContain('[BLOCKED:');
  });

  test('Original output is preserved in result', () => {
    const output = '약 100kW 부하입니다.';
    const result = filterLLMOutput(output);
    expect(result.original).toBe(output);
    expect(result.filtered).not.toBe(output);
  });
});
