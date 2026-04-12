/**
 * ESVA Engine — Main Entry Point
 *
 * Re-exports all engine modules for clean consumption.
 */

// Layer 0: Physical constants
export * from './constants/physical';

// Layer 0: Source-Judgment-Confidence types
export * from './sjc/types';

// Layer 0.5: Source tracker & Judge engine (SJC enforcement)
export * from './sjc/source-tracker';
export * from './sjc/judge';

// Layer 1: Standards types (CalcNode, CalcGraph, CalcResult, etc.)
export * from './standards/types';

// Layer 1.5: KEC Condition Tree DSL & Multi-country registry
export * from './standards/kec';
export * from './standards/registry';

// Layer 2: Unit conversion engine
export * from './conversion/unit-conversion';

// Layer 3: Calculation graph engine
export * from './graph/calc-graph';

// Layer 4: Calculator modules (MVP 10)
export * from './calculators';

// Layer 5: Receipt system (audit trail, disclaimer, export)
export * from './receipt';

// Layer 6: LLM Control Layer ("LLM은 계산하지 않는다")
export type { ESATool, IntentResult, FilterResult, BlockedItem } from './llm/types';
export { ESVA_TOOLS, getToolByName, getToolsByCategory, toVercelToolsSchema } from './llm/tools';
export { getESASystemPrompt } from './llm/system-prompt';
export { filterLLMOutput, isClean } from './llm/output-filter';
export { parseIntent } from './llm/intent-parser';

// Layer 8: Report Templates
export { getTemplate, getTemplateIds, getTemplatesForCalc, generateReportData } from './report/templates';
export type { ReportTemplate, ReportSection, ReportData } from './report/templates';

// Layer 9: Verification (reverse calc, sensitivity, override)
export { reverseVerify } from './verification/reverse-calc';
export type { VerificationResult } from './verification/reverse-calc';
export { analyzeSensitivity, analyzeMultiSensitivity } from './verification/sensitivity';
export type { SensitivityResult, MultiSensitivityResult } from './verification/sensitivity';
export { applyOverride, applyOverrideWithRecalc, getOverridesForReceipt, getOverrideSummary, formatOverrideTag } from './verification/override';
export type { OverrideRecord, OverrideSummary } from './verification/override';
