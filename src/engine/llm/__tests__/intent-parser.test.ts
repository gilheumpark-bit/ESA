/**
 * Intent Parser Tests
 *
 * Tests natural language -> tool mapping for Korean, English queries.
 * Validates intent classification, tool selection, and parameter extraction.
 */

import { describe, test, expect } from '@jest/globals';
import { parseIntent } from '../intent-parser';

// -- Korean Intent Tests -----------------------------------------------------

describe('Intent Parser - Korean', () => {
  test('"전압강하 계산해줘" -> calculate, voltage-drop', () => {
    const result = parseIntent('전압강하 계산해줘', 'ko');
    expect(result.intent).toBe('calculate');
    expect(result.tool).toBe('calculate_voltage_drop');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  test('"전선 뭘로 써야 해?" -> calculate, cable-sizing', () => {
    const result = parseIntent('전선 뭘로 써야 해?', 'ko');
    expect(result.intent).toBe('calculate');
    expect(result.tool).toBe('calculate_cable_sizing');
  });

  test('"KEC 기준 확인" -> lookup', () => {
    const result = parseIntent('KEC 기준 확인', 'ko');
    expect(result.intent).toBe('lookup');
    expect(result.tool).toBe('lookup_code_article');
  });

  test('"AWG 단위 변환" -> convert', () => {
    const result = parseIntent('AWG 단위 변환', 'ko');
    expect(result.intent).toBe('convert');
    expect(result.tool).toBe('convert_unit');
  });

  test('"25mm2와 35mm2 비교" -> compare', () => {
    const result = parseIntent('25mm2와 35mm2 비교', 'ko');
    expect(result.intent).toBe('compare');
    expect(result.tool).toBe('compare_scenarios');
  });

  test('"차단기 선정 100A 부하" -> calculate, breaker-sizing', () => {
    const result = parseIntent('차단기 선정 100A 부하', 'ko');
    expect(result.intent).toBe('calculate');
    expect(result.tool).toBe('calculate_breaker_sizing');
    expect(result.extractedParams.current).toBe(100);
  });

  test('"접지저항 계산" -> calculate, grounding', () => {
    const result = parseIntent('접지저항 계산', 'ko');
    expect(result.intent).toBe('calculate');
    expect(result.tool).toBe('calculate_grounding');
  });
});

// -- English Intent Tests ----------------------------------------------------

describe('Intent Parser - English', () => {
  test('"cable sizing for 100A" -> calculate, cable-sizing', () => {
    const result = parseIntent('cable sizing for 100A', 'en');
    expect(result.intent).toBe('calculate');
    expect(result.tool).toBe('calculate_cable_sizing');
    expect(result.extractedParams.current).toBe(100);
  });

  test('"voltage drop calculation 380V 50m" -> calculate, voltage-drop', () => {
    const result = parseIntent('voltage drop calculation 380V 50m', 'en');
    expect(result.intent).toBe('calculate');
    expect(result.tool).toBe('calculate_voltage_drop');
    expect(result.extractedParams.voltage).toBe(380);
  });

  test('"short circuit current" -> calculate, short-circuit', () => {
    const result = parseIntent('short circuit current', 'en');
    expect(result.intent).toBe('calculate');
    expect(result.tool).toBe('calculate_short_circuit');
  });

  test('"convert AWG to mm2" -> convert', () => {
    const result = parseIntent('convert AWG to mm2', 'en');
    expect(result.intent).toBe('convert');
    expect(result.tool).toBe('convert_unit');
  });

  test('"breaker sizing for 200A load" -> calculate, breaker-sizing', () => {
    const result = parseIntent('breaker sizing for 200A load', 'en');
    expect(result.intent).toBe('calculate');
    expect(result.tool).toBe('calculate_breaker_sizing');
  });
});

// -- Parameter Extraction Tests ----------------------------------------------

describe('Intent Parser - Parameter Extraction', () => {
  test('Extracts voltage from "380V"', () => {
    const result = parseIntent('전압강하 계산 380V 100A 50m 25mm2 Cu', 'ko');
    expect(result.extractedParams.voltage).toBe(380);
    expect(result.extractedParams.current).toBe(100);
    expect(result.extractedParams.cableSize).toBe(25);
  });

  test('Extracts conductor type "Cu"', () => {
    const result = parseIntent('구리 케이블 선정 100A', 'ko');
    expect(result.extractedParams.conductor).toBe('Cu');
  });

  test('Extracts phase from "3상"', () => {
    const result = parseIntent('3상 전압강하 계산', 'ko');
    expect(result.extractedParams.phase).toBe('3');
  });

  test('Extracts kW load', () => {
    const result = parseIntent('변압기 용량 계산 500kW', 'ko');
    expect(result.extractedParams.totalLoad).toBe(500);
  });
});

// -- Ambiguous / Edge Cases --------------------------------------------------

describe('Intent Parser - Edge Cases', () => {
  test('Empty query -> ambiguous', () => {
    const result = parseIntent('', 'ko');
    expect(result.intent).toBe('ambiguous');
    expect(result.confidence).toBeLessThan(0.5);
  });

  test('Ambiguous query generates clarifying questions', () => {
    const result = parseIntent('전기 관련 질문', 'ko');
    if (result.intent === 'ambiguous') {
      expect(result.clarifyingQuestions).toBeDefined();
      expect(result.clarifyingQuestions!.length).toBeGreaterThan(0);
    }
  });
});
