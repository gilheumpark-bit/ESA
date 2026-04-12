/**
 * Intent Parser — Natural Language -> Tool Mapping
 *
 * Parses user queries in Korean, English, and Japanese to identify
 * which ESVA tool should be invoked and extract parameters.
 *
 * PART 1: Pattern definitions per language
 * PART 2: Parameter extraction
 * PART 3: parseIntent() main function
 */

import type { IntentResult, IntentType } from './types';
import { getToolByName } from './tools';

// ---------------------------------------------------------------------------
// PART 1 — Intent Patterns per Language
// ---------------------------------------------------------------------------

interface IntentPattern {
  /** Regex to match against normalized query */
  pattern: RegExp;
  /** Matched tool name */
  tool: string;
  /** Intent category */
  intent: IntentType;
  /** Base confidence when this pattern matches */
  confidence: number;
}

/** Korean intent patterns */
const KO_PATTERNS: IntentPattern[] = [
  // Voltage drop
  { pattern: /전압\s*강하/, tool: 'calculate_voltage_drop', intent: 'calculate', confidence: 0.9 },
  { pattern: /[vV]D\s*계산/, tool: 'calculate_voltage_drop', intent: 'calculate', confidence: 0.85 },
  { pattern: /전압\s*드롭/, tool: 'calculate_voltage_drop', intent: 'calculate', confidence: 0.85 },

  // Cable sizing
  { pattern: /케이블\s*(?:사이즈|선정|규격)/, tool: 'calculate_cable_sizing', intent: 'calculate', confidence: 0.9 },
  { pattern: /전선\s*(?:굵기|크기|뭘로|선정)/, tool: 'calculate_cable_sizing', intent: 'calculate', confidence: 0.85 },
  { pattern: /몇\s*(?:sq|스퀘어|mm)/, tool: 'calculate_cable_sizing', intent: 'calculate', confidence: 0.8 },

  // Breaker sizing
  { pattern: /차단기\s*(?:선정|사이즈|용량)/, tool: 'calculate_breaker_sizing', intent: 'calculate', confidence: 0.9 },
  { pattern: /[Mm][Cc][Cc][Bb]\s*(?:선정|용량)/, tool: 'calculate_breaker_sizing', intent: 'calculate', confidence: 0.9 },
  { pattern: /브레이커\s*(?:선정|몇)/, tool: 'calculate_breaker_sizing', intent: 'calculate', confidence: 0.85 },

  // Short circuit
  { pattern: /단락\s*전류/, tool: 'calculate_short_circuit', intent: 'calculate', confidence: 0.9 },
  { pattern: /(?:Isc|단락|쇼트)\s*계산/, tool: 'calculate_short_circuit', intent: 'calculate', confidence: 0.85 },

  // Transformer
  { pattern: /변압기\s*(?:용량|선정|사이즈)/, tool: 'calculate_transformer', intent: 'calculate', confidence: 0.9 },
  { pattern: /(?:트랜스|[Tt][Rr])\s*용량/, tool: 'calculate_transformer', intent: 'calculate', confidence: 0.85 },
  { pattern: /수변전\s*용량/, tool: 'calculate_transformer', intent: 'calculate', confidence: 0.85 },

  // Grounding
  { pattern: /접지\s*(?:저항|계산|설계)/, tool: 'calculate_grounding', intent: 'calculate', confidence: 0.9 },
  { pattern: /어스\s*(?:저항|계산)/, tool: 'calculate_grounding', intent: 'calculate', confidence: 0.85 },

  // Illumination
  { pattern: /조[도명]\s*계산/, tool: 'calculate_illumination', intent: 'calculate', confidence: 0.9 },
  { pattern: /[Ll]ux\s*계산/, tool: 'calculate_illumination', intent: 'calculate', confidence: 0.85 },
  { pattern: /등기구\s*(?:수량|몇\s*개)/, tool: 'calculate_illumination', intent: 'calculate', confidence: 0.85 },

  // Load
  { pattern: /부하\s*(?:집계|합계|계산)/, tool: 'calculate_load', intent: 'calculate', confidence: 0.9 },
  { pattern: /최대\s*수요\s*전력/, tool: 'calculate_load', intent: 'calculate', confidence: 0.9 },

  // Power factor
  { pattern: /역률\s*(?:개선|보상|계산)/, tool: 'calculate_power_factor', intent: 'calculate', confidence: 0.9 },
  { pattern: /콘덴서\s*용량/, tool: 'calculate_power_factor', intent: 'calculate', confidence: 0.85 },

  // Code lookup
  { pattern: /기준이?\s*(?:뭐|뭔|어떻게)/, tool: 'lookup_code_article', intent: 'lookup', confidence: 0.8 },
  { pattern: /(?:KEC|NEC|IEC|규격|기준)\s*(?:조항|조문|확인|검색|찾아)/, tool: 'lookup_code_article', intent: 'lookup', confidence: 0.9 },
  { pattern: /몇\s*조/, tool: 'lookup_code_article', intent: 'lookup', confidence: 0.75 },

  // Unit conversion
  { pattern: /(?:AWG|mm2?|kcmil|HP|kW|kVA)\s*(?:변환|환산|으로)/, tool: 'convert_unit', intent: 'convert', confidence: 0.9 },
  { pattern: /단위\s*변환/, tool: 'convert_unit', intent: 'convert', confidence: 0.85 },

  // Comparison
  { pattern: /비교/, tool: 'compare_scenarios', intent: 'compare', confidence: 0.7 },
  { pattern: /(?:어떤\s*게|뭐가)\s*(?:나은|좋은|유리)/, tool: 'compare_scenarios', intent: 'compare', confidence: 0.7 },

  // Report
  { pattern: /보고서\s*(?:생성|만들|작성)/, tool: 'generate_report', intent: 'calculate', confidence: 0.85 },
  { pattern: /계산서\s*(?:출력|생성|만들)/, tool: 'generate_report', intent: 'calculate', confidence: 0.85 },
];

/** English intent patterns */
const EN_PATTERNS: IntentPattern[] = [
  // Voltage drop
  { pattern: /voltage\s*drop/i, tool: 'calculate_voltage_drop', intent: 'calculate', confidence: 0.9 },
  { pattern: /v\.?d\.?\s*calc/i, tool: 'calculate_voltage_drop', intent: 'calculate', confidence: 0.85 },

  // Cable sizing
  { pattern: /cable\s*siz/i, tool: 'calculate_cable_sizing', intent: 'calculate', confidence: 0.9 },
  { pattern: /(?:what|which)\s*(?:size|gauge)\s*(?:wire|cable)/i, tool: 'calculate_cable_sizing', intent: 'calculate', confidence: 0.85 },
  { pattern: /wire\s*(?:size|selection)/i, tool: 'calculate_cable_sizing', intent: 'calculate', confidence: 0.85 },

  // Breaker sizing
  { pattern: /breaker\s*(?:size|sizing|selection|rating)/i, tool: 'calculate_breaker_sizing', intent: 'calculate', confidence: 0.9 },
  { pattern: /(?:MCCB|MCB)\s*(?:size|select)/i, tool: 'calculate_breaker_sizing', intent: 'calculate', confidence: 0.9 },
  { pattern: /circuit\s*(?:breaker|protection)/i, tool: 'calculate_breaker_sizing', intent: 'calculate', confidence: 0.8 },

  // Short circuit
  { pattern: /short\s*circuit/i, tool: 'calculate_short_circuit', intent: 'calculate', confidence: 0.9 },
  { pattern: /fault\s*(?:current|level)/i, tool: 'calculate_short_circuit', intent: 'calculate', confidence: 0.85 },

  // Transformer
  { pattern: /transformer\s*(?:size|sizing|capacity|selection)/i, tool: 'calculate_transformer', intent: 'calculate', confidence: 0.9 },
  { pattern: /(?:xfmr|trafo)\s*(?:size|capacity)/i, tool: 'calculate_transformer', intent: 'calculate', confidence: 0.85 },

  // Grounding
  { pattern: /ground(?:ing)?\s*(?:resistance|calculation|design)/i, tool: 'calculate_grounding', intent: 'calculate', confidence: 0.9 },
  { pattern: /earth(?:ing)?\s*(?:resistance|electrode)/i, tool: 'calculate_grounding', intent: 'calculate', confidence: 0.85 },

  // Illumination
  { pattern: /illumina(?:tion|nce)\s*calc/i, tool: 'calculate_illumination', intent: 'calculate', confidence: 0.9 },
  { pattern: /lux\s*(?:calc|level)/i, tool: 'calculate_illumination', intent: 'calculate', confidence: 0.85 },
  { pattern: /(?:how\s*many|number\s*of)\s*(?:luminaire|light|fixture)/i, tool: 'calculate_illumination', intent: 'calculate', confidence: 0.85 },

  // Load
  { pattern: /load\s*(?:summary|schedule|calculation|aggregate)/i, tool: 'calculate_load', intent: 'calculate', confidence: 0.9 },
  { pattern: /maximum?\s*demand/i, tool: 'calculate_load', intent: 'calculate', confidence: 0.9 },

  // Power factor
  { pattern: /power\s*factor\s*(?:correction|improvement|compensation)/i, tool: 'calculate_power_factor', intent: 'calculate', confidence: 0.9 },
  { pattern: /capacitor\s*(?:bank|size|sizing)/i, tool: 'calculate_power_factor', intent: 'calculate', confidence: 0.85 },

  // Code lookup
  { pattern: /(?:what|which)\s*(?:code|standard|article|clause)/i, tool: 'lookup_code_article', intent: 'lookup', confidence: 0.8 },
  { pattern: /(?:NEC|KEC|IEC)\s*(?:article|section|clause|requirement)/i, tool: 'lookup_code_article', intent: 'lookup', confidence: 0.9 },

  // Unit conversion
  { pattern: /convert\s*(?:AWG|mm|kcmil|HP|kW|kVA)/i, tool: 'convert_unit', intent: 'convert', confidence: 0.9 },
  { pattern: /(?:AWG|mm2?)\s*to\s*(?:AWG|mm2?)/i, tool: 'convert_unit', intent: 'convert', confidence: 0.9 },

  // Comparison
  { pattern: /compare\s*(?:scenario|option|design)/i, tool: 'compare_scenarios', intent: 'compare', confidence: 0.85 },
  { pattern: /(?:which|what)\s*is\s*(?:better|more\s*efficient)/i, tool: 'compare_scenarios', intent: 'compare', confidence: 0.7 },

  // Report
  { pattern: /(?:generate|create)\s*report/i, tool: 'generate_report', intent: 'calculate', confidence: 0.85 },
];

/** Japanese intent patterns */
const JA_PATTERNS: IntentPattern[] = [
  { pattern: /電圧降下/, tool: 'calculate_voltage_drop', intent: 'calculate', confidence: 0.9 },
  { pattern: /ケーブル\s*(?:選定|サイズ)/, tool: 'calculate_cable_sizing', intent: 'calculate', confidence: 0.9 },
  { pattern: /遮断[器機]\s*(?:選定|容量)/, tool: 'calculate_breaker_sizing', intent: 'calculate', confidence: 0.9 },
  { pattern: /短絡電流/, tool: 'calculate_short_circuit', intent: 'calculate', confidence: 0.9 },
  { pattern: /変圧器\s*容量/, tool: 'calculate_transformer', intent: 'calculate', confidence: 0.9 },
  { pattern: /接地\s*(?:抵抗|計算)/, tool: 'calculate_grounding', intent: 'calculate', confidence: 0.9 },
  { pattern: /照[度明]\s*計算/, tool: 'calculate_illumination', intent: 'calculate', confidence: 0.9 },
  { pattern: /負荷\s*(?:集計|計算)/, tool: 'calculate_load', intent: 'calculate', confidence: 0.9 },
  { pattern: /力率\s*(?:改善|補償)/, tool: 'calculate_power_factor', intent: 'calculate', confidence: 0.9 },
  { pattern: /(?:基準|規格)\s*(?:検索|確認)/, tool: 'lookup_code_article', intent: 'lookup', confidence: 0.85 },
  { pattern: /単位\s*変換/, tool: 'convert_unit', intent: 'convert', confidence: 0.9 },
];

function getPatternsForLang(lang: string): IntentPattern[] {
  switch (lang) {
    case 'ko': return KO_PATTERNS;
    case 'ja': return JA_PATTERNS;
    case 'en': return EN_PATTERNS;
    default: return [...EN_PATTERNS, ...KO_PATTERNS];
  }
}

// ---------------------------------------------------------------------------
// PART 2 — Parameter Extraction
// ---------------------------------------------------------------------------

/** Extract numeric values with units from a query string */
function extractNumericParams(query: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  // Voltage: "380V", "220V", "380 V"
  const voltageMatch = query.match(/(\d+(?:\.\d+)?)\s*[Vv](?:\s|$|,|,)/);
  if (voltageMatch) params.voltage = parseFloat(voltageMatch[1]);

  // Current: "100A", "50 A"
  const currentMatch = query.match(/(\d+(?:\.\d+)?)\s*[Aa](?:mp)?(?:\s|$|,|,)/);
  if (currentMatch) params.current = parseFloat(currentMatch[1]);

  // Length: "50m", "100 m", "50미터"
  const lengthMatch = query.match(/(\d+(?:\.\d+)?)\s*(?:m(?:eter)?|미터)(?:\s|$|,|,)/i);
  if (lengthMatch) params.length = parseFloat(lengthMatch[1]);

  // Cable size: "25mm2", "25 sq", "25sq"
  const cableSizeMatch = query.match(/(\d+(?:\.\d+)?)\s*(?:mm2?|sq|스퀘어)/i);
  if (cableSizeMatch) params.cableSize = parseFloat(cableSizeMatch[1]);

  // Power factor: "pf 0.85", "역률 0.85"
  const pfMatch = query.match(/(?:pf|역률|力率|power\s*factor)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  if (pfMatch) params.powerFactor = parseFloat(pfMatch[1]);

  // kW: "100kW", "100 kW"
  const kwMatch = query.match(/(\d+(?:\.\d+)?)\s*[kK][Ww]/);
  if (kwMatch) params.totalLoad = parseFloat(kwMatch[1]);

  // kVA: "500kVA"
  const kvaMatch = query.match(/(\d+(?:\.\d+)?)\s*[kK][Vv][Aa]/);
  if (kvaMatch) params.transformerKVA = parseFloat(kvaMatch[1]);

  // kA: "25kA"
  const kaMatch = query.match(/(\d+(?:\.\d+)?)\s*[kK][Aa](?:\s|$)/);
  if (kaMatch) params.shortCircuitCurrent = parseFloat(kaMatch[1]);

  // Conductor: "Cu", "Al", "구리", "알루미늄"
  if (/(?:Cu|구리|동선)/i.test(query)) params.conductor = 'Cu';
  if (/(?:Al|알루미늄)/i.test(query)) params.conductor = 'Al';

  // Phase: "3상", "단상", "3-phase", "single phase"
  if (/(?:3상|3\s*phase|삼상|三相)/i.test(query)) params.phase = '3';
  if (/(?:단상|1상|single\s*phase|単相)/i.test(query)) params.phase = '1';

  // Insulation: "XLPE", "PVC"
  if (/XLPE/i.test(query)) params.insulation = 'XLPE';
  if (/PVC/i.test(query)) params.insulation = 'PVC';

  // Percentage: "3%", "5 %"
  const pctMatch = query.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) params.dropLimitPercent = parseFloat(pctMatch[1]);

  return params;
}

/** Determine which required params are missing for a given tool */
function findMissingParams(
  toolName: string,
  extractedParams: Record<string, unknown>,
): string[] {
  const tool = getToolByName(toolName);
  if (!tool) return [];

  const missing: string[] = [];
  for (const [key, param] of Object.entries(tool.parameters)) {
    if (param.required && !(key in extractedParams) && param.default === undefined) {
      missing.push(key);
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// PART 3 — Main Intent Parser
// ---------------------------------------------------------------------------

/**
 * Parse a natural language query into a structured intent.
 *
 * @param query - User's natural language query
 * @param lang - Detected or preferred language ('ko', 'en', 'ja')
 * @returns IntentResult with matched tool, extracted params, and missing params
 */
export function parseIntent(query: string, lang: string = 'en'): IntentResult {
  const patterns = getPatternsForLang(lang);

  // Try all patterns, collect matches sorted by confidence
  const matches: Array<IntentPattern & { matchIndex: number }> = [];

  for (const p of patterns) {
    const m = p.pattern.exec(query); // Case-sensitive patterns use original query
    if (m) {
      matches.push({ ...p, matchIndex: m.index });
    }
  }

  // Also try cross-language patterns for multilingual input
  if (lang !== 'en') {
    for (const p of EN_PATTERNS) {
      const m = p.pattern.exec(query);
      if (m && !matches.some(x => x.tool === p.tool)) {
        matches.push({ ...p, matchIndex: m.index, confidence: p.confidence * 0.9 });
      }
    }
  }

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence);

  // Extract numeric parameters from query
  const extractedParams = extractNumericParams(query);

  // No matches → ambiguous
  if (matches.length === 0) {
    // Check if it's a general explanation question
    const isExplain = /(?:뭐|뭔가요|설명|explain|what\s*is|어떤|무엇|何|説明)/i.test(query);

    return {
      intent: isExplain ? 'explain' : 'ambiguous',
      extractedParams,
      confidence: isExplain ? 0.5 : 0.2,
      missingParams: [],
      clarifyingQuestions: generateClarifyingQuestions(query, lang),
    };
  }

  // Best match
  const best = matches[0];
  const missingParams = findMissingParams(best.tool, extractedParams);

  // Build alternatives from remaining matches
  const alternatives = matches.slice(1, 4).map(m => ({
    tool: m.tool,
    confidence: m.confidence,
  }));

  return {
    intent: best.intent,
    tool: best.tool,
    extractedParams,
    confidence: best.confidence,
    missingParams,
    alternatives: alternatives.length > 0 ? alternatives : undefined,
  };
}

// ---------------------------------------------------------------------------
// Helper — Clarifying Questions
// ---------------------------------------------------------------------------

function generateClarifyingQuestions(query: string, lang: string): string[] {
  if (lang === 'ko') {
    return [
      '어떤 종류의 계산이 필요하신가요? (전압강하, 케이블 선정, 차단기 선정 등)',
      '적용하실 기준은 무엇인가요? (KEC, NEC, IEC 등)',
      '구체적인 수치가 있으시면 알려주세요 (전압, 전류, 길이 등)',
    ];
  }
  if (lang === 'ja') {
    return [
      'どのような計算が必要ですか？（電圧降下、ケーブル選定、遮断器選定など）',
      '適用する規格は何ですか？（KEC、NEC、IEC等）',
    ];
  }
  return [
    'What type of calculation do you need? (voltage drop, cable sizing, breaker sizing, etc.)',
    'Which standard should be applied? (KEC, NEC, IEC, etc.)',
    'Please provide specific values if available (voltage, current, length, etc.)',
  ];
}
