/**
 * ESVA Agent System — Type Definitions
 * ────────────────────────────────────
 * 3-tier architecture types: Main → Bridge → Sandbox
 *
 * PART 1: Enums & ID types
 * PART 2: Query & parsing types
 * PART 3: Request / Response types
 * PART 4: Routing types
 * PART 5: Sandbox configuration types
 * PART 6: Timing & telemetry types
 */

import type { SourceTag } from '@engine/sjc/types';
import type { Lang } from '@/lib/i18n';

// Re-export SourceTag so consumers can import from @agent/types
export type { SourceTag } from '@engine/sjc/types';

// ─── PART 1: Enums & ID Types ───────────────────────────────────

/** The three tiers of the agent hierarchy */
export type AgentTier = 'main' | 'bridge' | 'sandbox';

/** Supported country codes for electrical standards */
export type CountryCode = 'KR' | 'US' | 'JP' | 'CN' | 'DE' | 'AU' | 'ME';

/** Domain genres handled by sandboxes */
export type Genre = 'electrical' | 'ai' | 'standard' | 'certification';

/**
 * SandboxId — unique identifier combining country × genre.
 * Examples: 'kr-electrical', 'us-standard', 'global-ai', 'jp-certification'
 */
export type SandboxId =
  | `${Lowercase<CountryCode>}-${Genre}`
  | `global-${Genre}`;

// ─── PART 2: Query & Parsing Types ──────────────────────────────

/** Keywords extracted from natural language queries */
export interface ParsedQuery {
  /** Original raw query string */
  raw: string;
  /** Normalized query (lowercased, trimmed) */
  normalized: string;
  /** Detected language of the query */
  language: Lang;
  /** Detected country references */
  countries: CountryCode[];
  /** Detected genre/domain */
  genres: Genre[];
  /** Whether the query involves cross-country comparison */
  isComparison: boolean;
  /** Whether the query is a direct calculation request */
  isCalculation: boolean;
  /** Extracted calculator ID if applicable (e.g., 'voltage-drop') */
  calculatorId?: string;
  /** Extracted keywords for search */
  keywords: string[];
  /** Confidence score of the parse (0-1) */
  parseConfidence: number;
}

// ─── PART 3: Request / Response Types ───────────────────────────

/** Inbound request to the agent system */
export interface AgentRequest {
  /** Unique session identifier for isolation */
  sessionId: string;
  /** User's natural language query */
  query: string;
  /** UI language preference */
  language: Lang;
  /** Optional country code hint from user profile */
  countryCode?: CountryCode;
  /** Optional prior context (e.g., previous calculator result) */
  context?: AgentContext;
  /** Optional user ID for audit logging */
  userId?: string;
}

/** Context carried forward within a session */
export interface AgentContext {
  /** Previous sandbox results in the same session */
  previousResults?: SandboxResult[];
  /** Active calculator ID if user is in a calc workflow */
  activeCalculator?: string;
  /** Country set by user preference */
  preferredCountry?: CountryCode;
}

/** Outbound response from the agent system */
export interface AgentResponse {
  /** Primary answer text (markdown-formatted) */
  answer: string;
  /** Provenance: which standards/clauses were referenced */
  sources: SourceTag[];
  /** If a calculator is relevant, suggest it */
  calculatorSuggestion?: CalculatorSuggestion;
  /** Related standards the user might want to explore */
  relatedStandards?: RelatedStandard[];
  /** Which sandboxes contributed to this response */
  sandboxesUsed: SandboxId[];
  /** Timing breakdown */
  timing: ResponseTiming;
  /** Warnings (e.g., partial results due to timeout) */
  warnings?: string[];
}

/** Calculator suggestion embedded in a response */
export interface CalculatorSuggestion {
  /** Calculator ID (e.g., 'voltage-drop') */
  calculatorId: string;
  /** Display name */
  name: string;
  /** Why this calculator is relevant */
  reason: string;
  /** Pre-filled parameters extracted from the query */
  prefilledParams?: Record<string, unknown>;
}

/** A related standard reference */
export interface RelatedStandard {
  /** Standard name (e.g., 'KEC 232.3') */
  standard: string;
  /** Brief description */
  description: string;
  /** Country of origin */
  country: CountryCode | 'global';
}

// ─── PART 4: Routing Types ──────────────────────────────────────

/** How the main agent decided to route a query */
export type RoutingType = 'single' | 'cross' | 'direct_calc';

export interface RoutingDecision {
  /** Routing strategy */
  type: RoutingType;
  /** Which sandboxes should handle this query */
  targetSandboxes: SandboxId[];
  /** Whether the bridge agent is needed to coordinate */
  bridgeNeeded: boolean;
  /** Human-readable explanation of the routing choice */
  reason: string;
}

// ─── PART 5: Sandbox Configuration Types ────────────────────────

/** Result returned by a single sandbox execution */
export interface SandboxResult {
  /** Which sandbox produced this result */
  sandboxId: SandboxId;
  /** The data payload */
  data: SandboxData;
  /** Execution time in milliseconds */
  timing: number;
  /** Error if the sandbox failed */
  error?: string;
}

/** Structured data from a sandbox */
export interface SandboxData {
  /** Text answer from the sandbox */
  answer: string;
  /** Sources referenced */
  sources: SourceTag[];
  /** Calculator suggestion if relevant */
  calculatorSuggestion?: CalculatorSuggestion;
  /** Related standards found */
  relatedStandards?: RelatedStandard[];
}

/** Configuration for a sandbox agent instance */
export interface SandboxConfig {
  /** Unique sandbox identifier */
  id: SandboxId;
  /** Country scope */
  country: CountryCode | 'global';
  /** Domain genre */
  genre: Genre;
  /** System prompt defining the sandbox's expertise */
  systemPrompt: string;
  /** Tool IDs available to this sandbox */
  tools: string[];
  /** Data scope descriptor (e.g., 'KEC 2021, KEPIC') */
  dataScope: string;
  /** Display name for the sandbox */
  displayName: string;
}

// ─── PART 6: Timing & Telemetry Types ───────────────────────────

/** Timing breakdown for an agent response */
export interface ResponseTiming {
  /** Total wall-clock time in milliseconds */
  total: number;
  /** Per-sandbox timing breakdown */
  perSandbox: Record<SandboxId, number>;
  /** Time spent on routing decision */
  routingMs?: number;
  /** Time spent on result aggregation */
  aggregationMs?: number;
}

/** Audit log entry for cross-sandbox access via bridge */
export interface CrossAccessLog {
  /** Timestamp ISO-8601 */
  timestamp: string;
  /** Source sandbox */
  from: SandboxId;
  /** Target sandbox */
  to: SandboxId;
  /** Why this cross-access was needed */
  reason: string;
  /** Whether it was mediated by bridge (should always be true) */
  bridgeMediated: boolean;
}
