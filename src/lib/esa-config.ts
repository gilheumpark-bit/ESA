/**
 * ESVA runtime configuration — single source for tunables (Vertical AI ops).
 * Override via env where noted; safe defaults for local dev.
 */
import { ENGINE_VERSION } from '@engine/receipt';

/** Public API contract version (headers + health), not npm semver. */
export const ESVA_API_VERSION = '1';

/** Orchestrator / agent bundle version (bump when routing behavior changes). */
export const ESVA_AGENT_VERSION = '1';

function envNum(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Weaviate hybrid: vector weight = alpha, BM25 = 1-alpha (0–1). */
export const RAG_HYBRID_ALPHA = envNum('ESVA_RAG_ALPHA', 0.7);

/** Max hits to pull per collection before merge (cost cap). */
export const RAG_FETCH_LIMIT_CAP = envNum('ESVA_RAG_FETCH_CAP', 50);

/** Snippet length for open-license full-text excerpts. */
export const RAG_SNIPPET_MAX_CHARS = envNum('ESVA_RAG_SNIPPET_MAX_CHARS', 500);

/** Freshness boost upper bound multiplier. */
export const FRESHNESS_MAX_BOOST = envNum('ESVA_RAG_FRESHNESS_MAX_BOOST', 1.15);

/** Freshness half-life in days (exponential decay). */
export const FRESHNESS_HALF_LIFE_DAYS = envNum('ESVA_RAG_FRESHNESS_HALF_LIFE_DAYS', 365);

/** Default tenant for single-tenant SaaS audit rows (override in multi-tenant). */
export function getDefaultTenantId(): string {
  return process.env.ESVA_DEFAULT_TENANT_ID?.trim() || 'esa';
}

export interface PublicRuntimeInfo {
  apiVersion: string;
  agentVersion: string;
  engineVersion: string;
  appVersion: string;
  node: string;
  ragHybridAlpha: number;
  ragFetchCap: number;
}

export function getPublicRuntimeInfo(): PublicRuntimeInfo {
  return {
    apiVersion: ESVA_API_VERSION,
    agentVersion: ESVA_AGENT_VERSION,
    engineVersion: ENGINE_VERSION,
    appVersion: process.env.npm_package_version ?? '0.1.0',
    node: typeof process !== 'undefined' ? process.version : '',
    ragHybridAlpha: RAG_HYBRID_ALPHA,
    ragFetchCap: RAG_FETCH_LIMIT_CAP,
  };
}
