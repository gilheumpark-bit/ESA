/**
 * LLM Control Layer — Type Definitions
 *
 * "LLM은 계산하지 않는다" — The LLM is an interface, not a calculator.
 *
 * PART 1: Tool definition types
 * PART 2: Intent parsing result types
 * PART 3: Output filter result types
 */

// ---------------------------------------------------------------------------
// PART 1 — Tool Definition Types
// ---------------------------------------------------------------------------

/** Parameter definition for an ESVA tool */
export interface ParamDef {
  /** Parameter name */
  name: string;
  /** Zod-compatible type string */
  type: 'number' | 'string' | 'boolean' | 'enum';
  /** Engineering unit, e.g. "V", "A", "mm2" */
  unit?: string;
  /** Human-readable description (Korean) */
  description?: string;
  /** Human-readable description (English) */
  descriptionEn?: string;
  /** Whether this parameter is required */
  required: boolean;
  /** Default value if omitted */
  default?: unknown;
  /** For enum type: allowed values */
  enumValues?: string[];
  /** Min/max for number type */
  min?: number;
  max?: number;
}

/** ESVA Tool definition — Vercel AI SDK compatible */
export interface ESATool {
  /** Unique tool name (kebab-case), e.g. "calculate_voltage_drop" */
  name: string;
  /** Korean description */
  description: string;
  /** English description */
  descriptionEn: string;
  /** Parameter definitions keyed by param name */
  parameters: Record<string, ParamDef>;
  /** Handler identifier — maps to engine calculator function */
  handler: string;
  /** Calculator category for routing */
  category: 'calculation' | 'lookup' | 'conversion' | 'comparison' | 'report';
}

// ---------------------------------------------------------------------------
// PART 2 — Intent Parsing Result Types
// ---------------------------------------------------------------------------

/** Recognized user intent categories */
export type IntentType =
  | 'calculate'
  | 'lookup'
  | 'convert'
  | 'compare'
  | 'explain'
  | 'ambiguous';

/** Result of parsing a natural language query into a structured intent */
export interface IntentResult {
  /** Detected intent category */
  intent: IntentType;
  /** Matched tool name (undefined if ambiguous) */
  tool?: string;
  /** Parameters extracted from the query text */
  extractedParams: Record<string, unknown>;
  /** Confidence score 0-1 */
  confidence: number;
  /** Parameters still needed to execute the tool */
  missingParams: string[];
  /** Clarifying questions if intent is ambiguous */
  clarifyingQuestions?: string[];
  /** Alternative tool matches if confidence is low */
  alternatives?: Array<{ tool: string; confidence: number }>;
}

// ---------------------------------------------------------------------------
// PART 3 — Output Filter Result Types
// ---------------------------------------------------------------------------

/** Reason a piece of content was blocked */
export type BlockReason =
  | 'no_source'
  | 'probabilistic'
  | 'direct_citation'
  | 'no_tool_call'
  | 'insufficient_data';

/** A single blocked item found in LLM output */
export interface BlockedItem {
  /** The blocked text fragment */
  text: string;
  /** Why it was blocked */
  reason: BlockReason;
  /** Character position in original output */
  position: number;
}

/** Result of filtering LLM output */
export interface FilterResult {
  /** Original LLM output */
  original: string;
  /** Cleaned output with blocked content removed */
  filtered: string;
  /** Items that were blocked */
  blocked: BlockedItem[];
  /** Whether the output passed without any blocking */
  passed: boolean;
}
