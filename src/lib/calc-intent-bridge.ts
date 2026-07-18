/**
 * Calc Intent Bridge — Query Parser + Intent Parser -> Unified Calc Intent
 *
 * Bridges two independent NLP layers to produce a single actionable result:
 *   1. query-parser  (electrical NER + intent classification + calculator suggestion)
 *   2. intent-parser (NL -> tool mapping + numeric param extraction)
 *
 * PART 1: Types & constants
 * PART 2: Language detection helper
 * PART 3: Param name mapping (intent-parser names -> CALCULATOR_PARAMS names)
 * PART 4: analyzeCalcIntent() main function
 *
 * NOTE: Both parseQuery and parseIntent are pure-regex / in-memory functions
 * with no server-only imports. This module is safe for client-side use.
 */

import { parseQuery } from '@/search/query-parser';
import { parseIntent } from '@/engine/llm/intent-parser';
import { CALCULATOR_PARAMS, CALCULATOR_NAMES } from '@/lib/calculator-params';
import type { ExtendedParamDef } from '@/components/CalculatorForm';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** Unified result from analyzing a query for calculator intent */
export interface CalcIntentResult {
  /** Whether the query has a recognizable calculator intent */
  hasCalcIntent: boolean;
  /** Registry calculator ID (e.g. 'voltage-drop', 'cable-sizing') */
  calculatorId: string | undefined;
  /** Korean display name of the matched calculator */
  calculatorName: string | undefined;
  /** Parameters successfully extracted from the query text */
  extractedParams: Record<string, unknown>;
  /** Required params that have no extracted value and no default */
  missingRequired: ExtendedParamDef[];
  /** Optional params (have defaultValue) that were not extracted */
  missingOptional: ExtendedParamDef[];
  /** Full param definition list for the matched calculator */
  allParams: ExtendedParamDef[];
  /** True if all required params are satisfied (extracted or have defaults) */
  canAutoExecute: boolean;
  /** Merged confidence score from both parsers (0-1) */
  confidence: number;
}

/** Empty / no-intent result */
const NO_INTENT: CalcIntentResult = {
  hasCalcIntent: false,
  calculatorId: undefined,
  calculatorName: undefined,
  extractedParams: {},
  missingRequired: [],
  missingOptional: [],
  allParams: [],
  canAutoExecute: false,
  confidence: 0,
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Language Detection Helper
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect language from query string.
 * Korean characters (Hangul) -> 'ko', else -> 'en'.
 */
function detectLang(text: string): string {
  const hangulCount = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
  return hangulCount >= latinCount ? 'ko' : 'en';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Param Name Mapping
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps intent-parser extractNumericParams() output keys
 * to CALCULATOR_PARAMS field names.
 *
 * intent-parser key -> CALCULATOR_PARAMS name
 *
 * Keys that already match (voltage, current, length, powerFactor)
 * are passed through unchanged.
 */
const PARAM_NAME_MAP: Record<string, string> = {
  // intent-parser extracts 'cableSize' -> voltage-drop uses 'cableSize' (pass-through)
  // NOTE: other calculators still use 'crossSection' for cable area
  // intent-parser extracts 'totalLoad' -> same name in transformer-capacity, max-demand, etc.
  // (no mapping needed, but listed for documentation)
  // intent-parser extracts 'transformerKVA' -> CALCULATOR_PARAMS uses 'transformerCapacity'
  transformerKVA: 'transformerCapacity',
  // intent-parser extracts 'shortCircuitCurrent' -> same name in breaker-sizing (kA)
  // intent-parser extracts 'conductor' -> some calcs use 'conductorMaterial', others use 'conductor'
  // Do NOT remap globally — voltage-drop uses 'conductor' directly
  // intent-parser extracts 'phase' -> some calcs use 'phases', voltage-drop uses 'phase'
  // Do NOT remap globally
  // intent-parser extracts 'insulation' -> maps to 'insulationType'
  insulation: 'insulationType',
  // intent-parser extracts 'dropLimitPercent' -> maps to 'maxDropPercent' (solar-cable)
  dropLimitPercent: 'maxDropPercent',
};

/**
 * Remap intent-parser param names to CALCULATOR_PARAMS names.
 * Keys not in PARAM_NAME_MAP are passed through unchanged.
 */
function mapParamNames(
  extracted: Record<string, unknown>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extracted)) {
    const mappedKey = PARAM_NAME_MAP[key] ?? key;
    mapped[mappedKey] = value;
  }
  return mapped;
}

/**
 * Map conductor value from intent-parser format to CALCULATOR_PARAMS option value.
 * intent-parser: 'Cu' / 'Al'  ->  CALCULATOR_PARAMS: 'copper' / 'aluminum'
 */
function normalizeConductorValue(params: Record<string, unknown>): void {
  if (params.conductorMaterial === 'Cu') {
    params.conductorMaterial = 'copper';
  } else if (params.conductorMaterial === 'Al') {
    params.conductorMaterial = 'aluminum';
  }
}

/**
 * Map insulation value from intent-parser format to CALCULATOR_PARAMS option value.
 * intent-parser: 'XLPE' / 'PVC'  ->  already matches CALCULATOR_PARAMS option values.
 */
function normalizeInsulationValue(params: Record<string, unknown>): void {
  // intent-parser already returns 'XLPE' or 'PVC', which match
  // CALCULATOR_PARAMS options — no conversion needed.
  // This function exists as a documented extension point.
  const val = params.insulationType;
  if (typeof val === 'string') {
    params.insulationType = val.toUpperCase();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Main Analysis Function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze a natural language query for calculator intent.
 *
 * Combines query-parser (calculator suggestion from keyword matching)
 * and intent-parser (numeric param extraction from NL text) into a
 * unified result indicating which calculator to run and with what params.
 *
 * Priority: parseQuery's `suggestedCalculator` (registry ID) takes precedence
 * over parseIntent's `tool` field, since the registry IDs directly map to
 * CALCULATOR_PARAMS keys.
 *
 * @param query - Raw user input string (Korean or English)
 * @returns CalcIntentResult with extracted params and missing param analysis
 */
export function analyzeCalcIntent(query: string): CalcIntentResult {
  // 1. Use parseQuery to detect calculator intent and get suggestedCalculator
  const parsed = parseQuery(query);

  // 2. Check if intent is 'calculate' and we have a suggested calculator
  if (parsed.intent !== 'calculate' || !parsed.suggestedCalculator) {
    return { ...NO_INTENT };
  }

  const calculatorId = parsed.suggestedCalculator;

  // 3. Get the calculator's param definitions from CALCULATOR_PARAMS
  const paramDefs = CALCULATOR_PARAMS[calculatorId];
  if (!paramDefs || paramDefs.length === 0) {
    // Calculator ID exists in keyword map but has no param definitions
    return { ...NO_INTENT };
  }

  // 4. Use parseIntent to extract numeric params from the query
  const lang = detectLang(query);
  const intentResult = parseIntent(query, lang);

  // 5. Map extracted params to the correct param names
  const mappedParams = mapParamNames(intentResult.extractedParams);

  // Normalize conductor and insulation values
  normalizeConductorValue(mappedParams);
  normalizeInsulationValue(mappedParams);

  // 6. Determine which required params are missing
  //    "required" = no defaultValue AND not extracted
  const missingRequired: ExtendedParamDef[] = [];
  const missingOptional: ExtendedParamDef[] = [];

  for (const param of paramDefs) {
    const hasExtractedValue = param.name in mappedParams;
    const hasDefault = param.defaultValue !== undefined;

    if (!hasExtractedValue && !hasDefault) {
      // Truly missing — user must provide this
      missingRequired.push(param);
    } else if (!hasExtractedValue && hasDefault) {
      // Has a default, so it's optional / auto-filled
      missingOptional.push(param);
    }
  }

  // 7. canAutoExecute = all required params are satisfied
  const canAutoExecute = missingRequired.length === 0;

  // 8. Merge confidence from both parsers
  //    parseQuery doesn't return confidence, so use intent-parser's
  //    confidence boosted if parseQuery also agreed on the intent.
  const baseConfidence = intentResult.confidence;
  const confidence = Math.min(
    1.0,
    baseConfidence + (parsed.intent === 'calculate' ? 0.05 : 0),
  );

  // 9. Get calculator display name
  const nameEntry = CALCULATOR_NAMES[calculatorId];

  return {
    hasCalcIntent: true,
    calculatorId,
    calculatorName: nameEntry?.name,
    extractedParams: mappedParams,
    missingRequired,
    missingOptional,
    allParams: paramDefs,
    canAutoExecute,
    confidence,
  };
}
