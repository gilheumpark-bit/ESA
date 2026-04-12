/**
 * ESVA Search Engine — Query Parser
 *
 * Electrical NER + intent classification for engineering search queries.
 *
 * PART 1: Constants (regex patterns, synonym maps, calculator keywords)
 * PART 2: Language detection
 * PART 3: Electrical NER (entity extraction)
 * PART 4: Intent classification
 * PART 5: Calculator & standard suggestion
 * PART 6: Synonym expansion
 * PART 7: Public API — parseQuery()
 */

import type {
  ParsedQuery,
  ElectricalEntity,
  QueryIntent,
  SupportedLanguage,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Constants
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Regex patterns for extracting electrical quantities from text.
 * Each pattern captures a numeric value and its unit.
 */
export const ELECTRICAL_PATTERNS: Record<string, RegExp> = {
  /** Voltage: 220V, 22.9kV, 3.3KV, 380 V */
  voltage: /(\d+(?:\.\d+)?)\s*(kV|KV|kv|V|v)\b/g,
  /** Current: 100A, 25.5A, 12.5kA, 630 A */
  current: /(\d+(?:\.\d+)?)\s*(kA|ka|A|a)\b/g,
  /** Power: 500kW, 1.5MW, 100kVA, 2000 W, 750 VA */
  power: /(\d+(?:\.\d+)?)\s*(MW|mw|kW|kw|W|w|kVA|kva|KVA|VA|va|MVA|mva)\b/g,
  /** Frequency: 60Hz, 50 Hz */
  frequency: /(\d+(?:\.\d+)?)\s*(Hz|hz|HZ)\b/g,
  /** Cable size: 35mm², 2.5 sq mm, 10 AWG, #12 */
  cable_size: /(\d+(?:\.\d+)?)\s*(mm²|mm2|sq\s*mm|SQ|AWG|awg)\b|#(\d+)\b/g,
  /** Resistance: 10Ω, 5.5 ohm, 100 mohm */
  resistance: /(\d+(?:\.\d+)?)\s*(MΩ|kΩ|Ω|ohm|mohm)\b/gi,
  /** Temperature: 75°C, 90 deg C */
  temperature: /(\d+(?:\.\d+)?)\s*(°C|°F|degC|degF)\b/g,
};

/**
 * Standard reference patterns: KEC 232.3, NEC 310.16, IEC 60364-5-52
 */
const STANDARD_REF_PATTERN =
  /\b(KEC|NEC|IEC|IEEE|NFPA|NESC|KS\s*C)\s*(\d[\d.\-]*(?:\s*(?:Table|표)\s*[\w.\-]+)?)\b/gi;

/**
 * IEC 60050 synonym mapping: abbreviation/English -> Korean standard term.
 * Used for both query expansion and NER equipment detection.
 */
export const IEC_60050_SYNONYMS: ReadonlyMap<string, string> = new Map([
  // Circuit breakers
  ['mccb', '배선용차단기'],
  ['molded case circuit breaker', '배선용차단기'],
  ['elcb', '누전차단기'],
  ['earth leakage circuit breaker', '누전차단기'],
  ['eocr', '전자식과전류계전기'],
  ['vcb', '진공차단기'],
  ['vacuum circuit breaker', '진공차단기'],
  ['acb', '기중차단기'],
  ['air circuit breaker', '기중차단기'],
  ['gcb', '가스차단기'],
  ['gas circuit breaker', '가스차단기'],
  ['ocb', '유입차단기'],
  // Transformers
  ['tr', '변압기'],
  ['transformer', '변압기'],
  ['pt', '계기용변압기'],
  ['vt', '계기용변압기'],
  ['potential transformer', '계기용변압기'],
  ['ct', '변류기'],
  ['current transformer', '변류기'],
  ['mof', '계기용변성기'],
  // Switchgear & panels
  ['swgr', '스위치기어'],
  ['switchgear', '스위치기어'],
  ['mcc', '전동기제어반'],
  ['motor control center', '전동기제어반'],
  ['pdb', '분전반'],
  ['power distribution board', '분전반'],
  ['ats', '자동절체스위치'],
  ['automatic transfer switch', '자동절체스위치'],
  ['ups', '무정전전원장치'],
  ['uninterruptible power supply', '무정전전원장치'],
  ['vfd', '가변주파수드라이브'],
  ['inverter', '인버터'],
  // Protection
  ['ocr', '과전류계전기'],
  ['ovr', '과전압계전기'],
  ['uvr', '부족전압계전기'],
  ['dgr', '지락방향계전기'],
  ['relay', '계전기'],
  ['protective relay', '보호계전기'],
  ['spd', '서지보호장치'],
  ['surge protective device', '서지보호장치'],
  ['la', '피뢰기'],
  ['lightning arrester', '피뢰기'],
  // Cable & wiring
  ['cv cable', 'CV케이블'],
  ['xlpe', '가교폴리에틸렌'],
  ['pvc', 'PVC절연전선'],
  ['bus duct', '버스덕트'],
  ['busbar', '부스바'],
  ['cable tray', '케이블트레이'],
  // Grounding & earthing
  ['ground', '접지'],
  ['grounding', '접지'],
  ['earthing', '접지'],
  ['earth rod', '접지봉'],
  ['ground rod', '접지봉'],
  // Renewable
  ['pv', '태양광'],
  ['photovoltaic', '태양광'],
  ['solar', '태양광'],
  ['ess', '에너지저장장치'],
  ['energy storage', '에너지저장장치'],
  ['bess', '배터리에너지저장장치'],
  ['wind turbine', '풍력발전기'],
  // General
  ['power factor', '역률'],
  ['pf', '역률'],
  ['demand factor', '수용률'],
  ['diversity factor', '부등률'],
  ['load factor', '부하율'],
  ['short circuit', '단락전류'],
  ['fault current', '고장전류'],
  ['voltage drop', '전압강하'],
  ['vd', '전압강하'],
  ['impedance', '임피던스'],
  ['reactance', '리액턴스'],
  ['capacitor', '콘덴서'],
  ['harmonic', '고조파'],
  ['thd', '고조파왜곡률'],
]);

/** Equipment keywords for NER detection */
const EQUIPMENT_KEYWORDS: ReadonlySet<string> = new Set([
  '변압기', '차단기', '인버터', '콘덴서', '계전기', '접지봉',
  '케이블', '전선', '분전반', '수배전반', '스위치기어', '부스바',
  '피뢰기', '서지보호장치', '무정전전원장치', '자동절체스위치',
  '전동기', '발전기', '배터리', '태양광모듈', '풍력발전기',
  'transformer', 'breaker', 'inverter', 'capacitor', 'relay',
  'cable', 'switchgear', 'busbar', 'arrester', 'motor', 'generator',
]);

/** Maps query keywords to calculator IDs */
const CALCULATOR_KEYWORD_MAP: ReadonlyMap<string, string> = new Map([
  ['단상', 'single-phase-power'],
  ['single phase', 'single-phase-power'],
  ['3상', 'three-phase-power'],
  ['삼상', 'three-phase-power'],
  ['three phase', 'three-phase-power'],
  ['전압강하', 'voltage-drop'],
  ['전압 강하', 'voltage-drop'],
  ['voltage drop', 'voltage-drop'],
  ['변압기 용량', 'transformer-capacity'],
  ['변압기 선정', 'transformer-capacity'],
  ['transformer capacity', 'transformer-capacity'],
  ['transformer sizing', 'transformer-capacity'],
  ['케이블 사이징', 'cable-sizing'],
  ['케이블 선정', 'cable-sizing'],
  ['전선 선정', 'cable-sizing'],
  ['cable sizing', 'cable-sizing'],
  ['cable selection', 'cable-sizing'],
  ['단락전류', 'short-circuit'],
  ['단락 전류', 'short-circuit'],
  ['short circuit', 'short-circuit'],
  ['fault current', 'short-circuit'],
  ['차단기 선정', 'breaker-sizing'],
  ['차단기 용량', 'breaker-sizing'],
  ['breaker sizing', 'breaker-sizing'],
  ['breaker selection', 'breaker-sizing'],
  ['접지 저항', 'ground-resistance'],
  ['접지저항', 'ground-resistance'],
  ['ground resistance', 'ground-resistance'],
  ['earthing resistance', 'ground-resistance'],
  ['태양광 발전량', 'solar-generation'],
  ['태양광 발전', 'solar-generation'],
  ['solar generation', 'solar-generation'],
  ['solar pv', 'solar-generation'],
  ['배터리 용량', 'battery-capacity'],
  ['ess 용량', 'battery-capacity'],
  ['battery capacity', 'battery-capacity'],
]);

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Language Detection
// ═══════════════════════════════════════════════════════════════════════════════

function detectLanguage(text: string): SupportedLanguage {
  const hangulCount = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
  return hangulCount >= latinCount ? 'ko' : 'en';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Electrical NER (Entity Extraction)
// ═══════════════════════════════════════════════════════════════════════════════

function extractEntities(text: string): ElectricalEntity[] {
  const entities: ElectricalEntity[] = [];

  // Extract electrical quantities
  for (const [type, pattern] of Object.entries(ELECTRICAL_PATTERNS)) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const raw = match[0];
      const numericStr = match[1] || match[3]; // match[3] for # cable notation
      const unit = match[2] || 'AWG';
      const value = numericStr ? parseFloat(numericStr) : undefined;
      entities.push({
        type: type as ElectricalEntity['type'],
        raw,
        value,
        unit,
      });
    }
  }

  // Extract standard references
  const stdRegex = new RegExp(STANDARD_REF_PATTERN.source, STANDARD_REF_PATTERN.flags);
  let stdMatch: RegExpExecArray | null;
  while ((stdMatch = stdRegex.exec(text)) !== null) {
    entities.push({
      type: 'standard_ref',
      raw: stdMatch[0],
      clause: `${stdMatch[1].toUpperCase()} ${stdMatch[2]}`,
    });
  }

  // Extract equipment mentions
  const normalizedLower = text.toLowerCase();
  for (const keyword of EQUIPMENT_KEYWORDS) {
    const keyLower = keyword.toLowerCase();
    if (normalizedLower.includes(keyLower)) {
      const alreadyMatched = entities.some(
        (e) => e.raw.toLowerCase().includes(keyLower) || keyLower.includes(e.raw.toLowerCase()),
      );
      if (!alreadyMatched) {
        entities.push({
          type: 'equipment',
          raw: keyword,
        });
      }
    }
  }

  return entities;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Intent Classification
// ═══════════════════════════════════════════════════════════════════════════════

/** Patterns that indicate comparison intent */
const COMPARE_PATTERNS = [
  /\bvs\.?\b/i,
  /비교/,
  /차이/,
  /\bcompare\b/i,
  /\bdifference\b/i,
  /\bversus\b/i,
];

/** Patterns that indicate calculation intent */
const CALCULATE_PATTERNS = [
  /계산/,
  /구하/,
  /산출/,
  /산정/,
  /선정/,
  /\bcalculat/i,
  /\bcompute\b/i,
  /\bhow\s+much\b/i,
  /\bhow\s+many\b/i,
  /얼마/,
  /몇\s/,
];

/** Patterns that indicate definition lookup */
const DEFINITION_PATTERNS = [
  /\b(what\s+is|define|definition|meaning)\b/i,
  /이란\??$/,
  /뜻/,
  /정의/,
  /의미/,
  /(이|가)\s*뭐/,
];

function classifyIntent(
  text: string,
  entities: ElectricalEntity[],
): QueryIntent {
  // Standard lookup: explicit standard reference detected
  const hasStandardRef = entities.some((e) => e.type === 'standard_ref');
  if (hasStandardRef && entities.length <= 2) {
    return 'standard_lookup';
  }

  // Compare intent
  if (COMPARE_PATTERNS.some((p) => p.test(text))) {
    return 'compare';
  }

  // Calculate intent: numeric entities + calculation keywords
  const hasNumericEntity = entities.some((e) => e.value !== undefined);
  if (CALCULATE_PATTERNS.some((p) => p.test(text))) {
    return 'calculate';
  }
  if (hasNumericEntity && entities.length >= 2) {
    return 'calculate';
  }

  // Definition intent
  if (DEFINITION_PATTERNS.some((p) => p.test(text))) {
    return 'definition';
  }

  return 'search';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Calculator & Standard Suggestion
// ═══════════════════════════════════════════════════════════════════════════════

function suggestCalculator(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [keyword, calcId] of CALCULATOR_KEYWORD_MAP) {
    if (lower.includes(keyword.toLowerCase())) {
      return calcId;
    }
  }
  return undefined;
}

function suggestStandard(entities: ElectricalEntity[]): string | undefined {
  const stdEntity = entities.find((e) => e.type === 'standard_ref');
  return stdEntity?.clause;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6 — Synonym Expansion
// ═══════════════════════════════════════════════════════════════════════════════

function expandSynonyms(tokens: string[]): string[] {
  const expanded = new Set<string>(tokens);

  for (const token of tokens) {
    const lower = token.toLowerCase();

    // Forward lookup: abbreviation -> Korean term
    const koreanTerm = IEC_60050_SYNONYMS.get(lower);
    if (koreanTerm) {
      expanded.add(koreanTerm);
    }

    // Reverse lookup: Korean term -> find all abbreviations
    for (const [abbr, term] of IEC_60050_SYNONYMS) {
      if (term === token || term.toLowerCase() === lower) {
        expanded.add(abbr);
      }
    }
  }

  return Array.from(expanded);
}

function tokenize(text: string): string[] {
  // Split on whitespace and common punctuation, filter empty
  return text
    .split(/[\s,;:()[\]{}]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 7 — Public API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a raw search query into a structured ParsedQuery object.
 *
 * Performs:
 * 1. Language detection
 * 2. Electrical NER (entity extraction)
 * 3. Intent classification
 * 4. Calculator / standard suggestion
 * 5. Synonym expansion
 */
export function parseQuery(raw: string): ParsedQuery {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {
      original: raw,
      normalized: '',
      intent: 'search',
      entities: [],
      language: 'ko',
      expandedTokens: [],
    };
  }

  const language = detectLanguage(trimmed);
  const entities = extractEntities(trimmed);
  const intent = classifyIntent(trimmed, entities);
  const tokens = tokenize(trimmed);
  const expandedTokens = expandSynonyms(tokens);
  const normalized = expandedTokens.join(' ').toLowerCase();
  const suggestedCalc = suggestCalculator(trimmed);
  const suggestedStd = suggestStandard(entities);

  return {
    original: raw,
    normalized,
    intent,
    entities,
    language,
    suggestedCalculator: suggestedCalc,
    suggestedStandard: suggestedStd,
    expandedTokens,
  };
}
