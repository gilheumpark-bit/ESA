/**
 * Search Query Parser Tests
 *
 * Tests electrical NER, intent classification, and synonym expansion.
 * The parser transforms raw search queries into structured ParsedQuery objects.
 */

import { describe, test, expect } from '@jest/globals';
import { parseQuery, IEC_60050_SYNONYMS } from '../query-parser';

// -- Entity Extraction Tests -------------------------------------------------

describe('Query Parser - Entity Extraction', () => {
  test('"22.9kV 변압기" extracts voltage entity 22.9kV', () => {
    const result = parseQuery('22.9kV 변압기');
    const voltageEntity = result.entities.find(e => e.type === 'voltage');
    expect(voltageEntity).toBeDefined();
    expect(voltageEntity!.value).toBe(22.9);
    expect(voltageEntity!.unit).toBe('kV');
  });

  test('"380V 100A 50m" extracts voltage, current, cable_size', () => {
    const result = parseQuery('380V 100A 50m');
    expect(result.entities.some(e => e.type === 'voltage' && e.value === 380)).toBe(true);
    expect(result.entities.some(e => e.type === 'current' && e.value === 100)).toBe(true);
  });

  test('"500kW 부하" extracts power entity', () => {
    const result = parseQuery('500kW 부하');
    const powerEntity = result.entities.find(e => e.type === 'power');
    expect(powerEntity).toBeDefined();
    expect(powerEntity!.value).toBe(500);
    expect(powerEntity!.unit).toBe('kW');
  });

  test('"KEC 232.52" extracts standard reference entity', () => {
    const result = parseQuery('KEC 232.52 전압강하 기준');
    const stdRef = result.entities.find(e => e.type === 'standard_ref');
    expect(stdRef).toBeDefined();
    expect(stdRef!.clause).toContain('KEC');
    expect(stdRef!.clause).toContain('232.52');
  });

  test('"25mm2 XLPE" extracts cable size entity', () => {
    const result = parseQuery('25mm2 XLPE 케이블');
    const cableEntity = result.entities.find(e => e.type === 'cable_size');
    expect(cableEntity).toBeDefined();
    expect(cableEntity!.value).toBe(25);
  });
});

// -- Intent Classification Tests ---------------------------------------------

describe('Query Parser - Intent Classification', () => {
  test('"전압강하 3% 이내" -> search or standard_lookup', () => {
    const result = parseQuery('전압강하 3% 이내');
    // Has a numeric entity, should classify as calculate or search
    expect(['search', 'calculate', 'standard_lookup']).toContain(result.intent);
  });

  test('"전압강하 계산" -> calculate', () => {
    const result = parseQuery('전압강하 계산');
    expect(result.intent).toBe('calculate');
  });

  test('"MCCB이란?" -> definition', () => {
    const result = parseQuery('MCCB이란?');
    expect(result.intent).toBe('definition');
  });

  test('"25mm2 vs 35mm2" -> compare', () => {
    const result = parseQuery('25mm2 vs 35mm2');
    expect(result.intent).toBe('compare');
  });

  test('"cable sizing for 100A" -> calculate', () => {
    const result = parseQuery('cable sizing for 100A');
    expect(result.intent).toBe('calculate');
  });
});

// -- Synonym Expansion Tests -------------------------------------------------

describe('Query Parser - Synonym Expansion', () => {
  test('"MCCB" expands to include "배선용차단기"', () => {
    const result = parseQuery('MCCB 선정');
    expect(result.expandedTokens).toContain('배선용차단기');
  });

  test('"VCB" expands to include "진공차단기"', () => {
    const result = parseQuery('VCB 교체');
    expect(result.expandedTokens.some(t => t === '진공차단기')).toBe(true);
  });

  test('IEC_60050_SYNONYMS map contains expected entries', () => {
    expect(IEC_60050_SYNONYMS.get('mccb')).toBe('배선용차단기');
    expect(IEC_60050_SYNONYMS.get('elcb')).toBe('누전차단기');
    expect(IEC_60050_SYNONYMS.get('transformer')).toBe('변압기');
  });
});

// -- Language Detection Tests ------------------------------------------------

describe('Query Parser - Language Detection', () => {
  test('Korean-dominant text detected as "ko"', () => {
    const result = parseQuery('전압강하 계산해주세요');
    expect(result.language).toBe('ko');
  });

  test('English-dominant text detected as "en"', () => {
    const result = parseQuery('cable sizing for 100A load');
    expect(result.language).toBe('en');
  });

  test('Empty query returns default', () => {
    const result = parseQuery('');
    expect(result.intent).toBe('search');
    expect(result.entities.length).toBe(0);
  });
});

// -- Calculator Suggestion Tests ---------------------------------------------

describe('Query Parser - Calculator Suggestion', () => {
  test('"전압강하" suggests voltage-drop calculator', () => {
    const result = parseQuery('전압강하 계산');
    expect(result.suggestedCalculator).toBe('voltage-drop');
  });

  test('"케이블 선정" suggests cable-sizing calculator', () => {
    const result = parseQuery('케이블 선정 100A');
    expect(result.suggestedCalculator).toBe('cable-sizing');
  });

  test('"변압기 용량" suggests transformer-capacity calculator', () => {
    const result = parseQuery('변압기 용량 계산');
    expect(result.suggestedCalculator).toBe('transformer-capacity');
  });

  test('"short circuit" suggests short-circuit calculator', () => {
    const result = parseQuery('short circuit calculation');
    expect(result.suggestedCalculator).toBe('short-circuit');
  });

  test('"접지저항" suggests ground-resistance calculator', () => {
    const result = parseQuery('접지저항 측정');
    expect(result.suggestedCalculator).toBe('ground-resistance');
  });
});

// -- Standard Reference Suggestion Tests ------------------------------------

describe('Query Parser - Standard Suggestion', () => {
  test('"KEC 232.52" suggests standard reference', () => {
    const result = parseQuery('KEC 232.52');
    expect(result.suggestedStandard).toBeDefined();
    expect(result.suggestedStandard).toContain('KEC');
  });
});
