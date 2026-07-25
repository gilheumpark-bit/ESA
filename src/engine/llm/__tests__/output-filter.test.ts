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
  // 마커는 짧아야 문장이 읽힌다. 이전 형태("[BLOCKED: Tool 호출 필요 / Tool call
  // required]")는 값을 옳게 지우고도 "…는 **[BLOCKED: …]**입니다" 같은 읽을 수
  // 없는 문장을 남겼다(실측 2026-07-25/26). 사유는 답변 끝에 한 번만 적는다.
  test('overlapping probabilistic and numeric findings produce one intact marker', () => {
    const result = filterLLMOutput('약 32A가 흐릅니다.');

    expect(result.filtered.match(/\[미확인\]/g)).toHaveLength(1);
    // 겹친 검출이 서로의 마커를 잘라 먹으면 마커 안에 마커가 박힌다.
    expect(result.filtered).not.toMatch(/\[[^\]]*\[미확인\]/);
  });
  test('Blocked probabilistic text gets replacement marker', () => {
    const output = '대략 50A의 전류가 필요합니다.';
    const result = filterLLMOutput(output);
    expect(result.filtered).toContain('[미확인]');
    // 사유는 본문이 아니라 끝의 안내 한 줄에 있다.
    expect(result.filtered).toContain('추정 표현');
    expect(result.filtered.split('[미확인]').length - 1).toBe(1);
  });

  test('Original output is preserved in result', () => {
    const output = '약 100kW 부하입니다.';
    const result = filterLLMOutput(output);
    expect(result.original).toBe(output);
    expect(result.filtered).not.toBe(output);
  });
});

// -- 감사 수리 회귀 (2026-07-25 외부 감사 보고서 검증) ------------------------
//
// 셋 다 "옳은 답을 훼손하는" 방향의 결함이었다. 통과 케이스가 전부 출처 태그를
// 수치 뒤에 두고 있어서 앞에 두는 경우가 한 번도 실행되지 않았던 것이 미검출의
// 원인이다. 그래서 여기서는 수리가 듣는지와 함께 **차단 강도가 유지되는지**를
// 같이 잠근다 — 창을 넓히는 수리는 필터를 무력화하는 방향으로 틀리기 쉽다.

describe('LLM Output Filter - 감사 수리 회귀', () => {
  test('출처 태그가 수치보다 앞에 와도 그 수치의 출처로 인정한다', () => {
    const output = '[SOURCE: KEC 232.52] 전압강하는 4.14V입니다.';
    const toolCalls = [{ name: 'calculate_voltage_drop', result: { value: 4.14 } }];

    const result = filterLLMOutput(output, toolCalls);
    expect(result.passed).toBe(true);
    expect(result.filtered).toContain('4.14V');
  });

  test('출처 태그가 수치 뒤에 오는 기존 순서도 그대로 통과한다', () => {
    const output = '전압강하는 4.14V입니다. [SOURCE: KEC 232.52]';
    const toolCalls = [{ name: 'calculate_voltage_drop', result: { value: 4.14 } }];

    expect(filterLLMOutput(output, toolCalls).passed).toBe(true);
  });

  test('창을 양방향으로 넓혀도 출처 없는 수치는 계속 차단한다', () => {
    const output = '전압강하는 4.14V입니다.';
    const toolCalls = [{ name: 'calculate_voltage_drop', result: { value: 4.14 } }];

    const result = filterLLMOutput(output, toolCalls);
    expect(result.passed).toBe(false);
    expect(result.filtered).not.toContain('4.14V');
  });

  test('서기 연도는 표준명이 앞서지 않아도 차단하지 않는다', () => {
    const output = '2021년 개정 내용을 확인하세요.';
    const toolCalls = [{ name: 'lookup_code_article', result: {} }];

    const result = filterLLMOutput(output, toolCalls);
    expect(result.passed).toBe(true);
    expect(result.filtered).toContain('2021년');
  });

  test('연도 모양이어도 "년"이 뒤따르지 않으면 예외가 아니다', () => {
    const output = '허용 전류는 2020A입니다.';
    const toolCalls = [{ name: 'calculate', result: {} }];

    const result = filterLLMOutput(output, toolCalls);
    expect(result.passed).toBe(false);
    expect(result.filtered).not.toContain('2020A');
  });

  test('isClean 도 사용자 입력 인용 수치를 filterLLMOutput 과 같게 판정한다', () => {
    const output = '입력값은 3상 380V, 50kW입니다.';
    const trusted = '부하는 3상 380V 50kW입니다.';

    expect(filterLLMOutput(output, [], trusted).passed).toBe(true);
    expect(isClean(output, [], trusted)).toBe(true);
    // 인용 근거를 주지 않으면 여전히 거부한다 — 계약을 맞춘 것이지 푼 것이 아니다.
    expect(isClean(output)).toBe(false);
  });
});

// -- Thousand separators -----------------------------------------------------

describe('LLM Output Filter - 천단위 구분자', () => {
  // "55,000 W" 가 "55"+"000" 으로 쪼개지면 앞자리만 신뢰 목록에 걸려
  // "55,[미확인]" 이라는 문장이 나간다(실측 2026-07-26).
  test('쉼표로 끊긴 수치를 한 값으로 읽는다', () => {
    const result = filterLLMOutput(
      '정격 출력은 55,000 W 입니다. [SOURCE: ESA_CALCULATOR:starting-current]',
      [],
      '55000 W',
    );
    expect(result.filtered).not.toContain('55,[미확인]');
    expect(result.filtered).toContain('55,000');
  });

  test('사용자가 쉼표로 쓴 값도 같은 값으로 인정한다', () => {
    const result = filterLLMOutput('부하는 55000 W 입니다.', [], '55,000 W');
    expect(result.filtered).toContain('55000');
    expect(result.filtered).not.toContain('[미확인]');
  });
});
