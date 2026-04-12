/**
 * ESVA Agent System — Barrel Export
 * ────────────────────────────────
 * Public API for the 3-tier agent architecture.
 */

// ─── Types ──────────────────────────────────────────────────────

export type {
  AgentTier,
  CountryCode,
  Genre,
  SandboxId,
  ParsedQuery,
  AgentRequest,
  AgentResponse,
  AgentContext,
  CalculatorSuggestion,
  RelatedStandard,
  RoutingType,
  RoutingDecision,
  SandboxResult,
  SandboxData,
  SandboxConfig,
  ResponseTiming,
  CrossAccessLog,
} from './types';

// ─── Tier 1: Main Agent ─────────────────────────────────────────

import { MainAgent as _MainAgent } from './main';
export { MainAgent } from './main';

// ─── Tier 2: Bridge Agent ───────────────────────────────────────

export { BridgeAgent, createBridgeAgent } from './bridge';

// ─── Tier 3: Sandbox Agents ─────────────────────────────────────

export { SandboxAgent, createSandboxAgent } from './sandbox/sandbox-agent';

// ─── Sandbox Registry ───────────────────────────────────────────

export {
  SANDBOX_REGISTRY,
  getSandbox,
  getSandboxesByCountry,
  getSandboxesByGenre,
  getAllSandboxIds,
  isValidSandboxId,
} from './sandbox/sandbox-registry';

// ─── Isolation ──────────────────────────────────────────────────

export {
  IsolationMatrix,
  IsolationViolationError,
  getIsolationMatrix,
  resetIsolationMatrix,
} from './sandbox/isolation';

// ─── Factory ────────────────────────────────────────────────────

/**
 * Create a new MainAgent instance.
 * The main agent is stateless — safe to create per-request or as a singleton.
 */
export function createMainAgent(): _MainAgent {
  return new _MainAgent();
}
