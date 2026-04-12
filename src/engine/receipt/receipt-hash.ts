/**
 * Receipt Hash — SHA-256 integrity verification
 *
 * PART 1: Canonical JSON serialization (deterministic key ordering)
 * PART 2: SHA-256 hashing (Web Crypto API — works in browser + Node 18+)
 * PART 3: Verification helper
 */

import type { Receipt } from './types';
import type { CalcResult } from '@engine/standards/types';

// ---------------------------------------------------------------------------
// PART 1 — Canonical JSON (sorted keys, no whitespace)
// ---------------------------------------------------------------------------

/**
 * Produce a deterministic JSON string by recursively sorting object keys.
 * Arrays preserve order; primitives pass through unchanged.
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((v) => canonicalize(v));
    return `[${items.join(',')}]`;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const pairs = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
    return `{${pairs.join(',')}}`;
  }

  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// PART 2 — SHA-256 (isomorphic: Web Crypto API)
// ---------------------------------------------------------------------------

/**
 * Resolve the SubtleCrypto instance for both browser and Node.js.
 */
async function getSubtleCrypto(): Promise<SubtleCrypto> {
  // Browser
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    return globalThis.crypto.subtle;
  }

  // Node.js 18+ (webcrypto is a global or available via 'crypto')
  try {
    const nodeCrypto = await import('crypto');
    if (nodeCrypto.webcrypto?.subtle) {
      return nodeCrypto.webcrypto.subtle as unknown as SubtleCrypto;
    }
  } catch {
    // noop — not in Node
  }

  throw new Error('SubtleCrypto is not available in this environment');
}

/**
 * Compute SHA-256 hex digest of an arbitrary string.
 */
async function sha256Hex(data: string): Promise<string> {
  const subtle = await getSubtleCrypto();
  const encoder = new TextEncoder();
  const buffer = await subtle.digest('SHA-256', encoder.encode(data));
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// PART 3 — Public API
// ---------------------------------------------------------------------------

/**
 * Produce a deterministic SHA-256 hash from inputs + result.
 * Used at receipt creation time to seal the calculation.
 */
export async function hashReceipt(
  inputs: Record<string, unknown>,
  result: CalcResult,
): Promise<string> {
  const payload = canonicalize({ inputs, result });
  return sha256Hex(payload);
}

/**
 * Recompute the hash and compare against the stored `receiptHash`.
 * Returns `true` if the receipt has not been tampered with.
 */
export async function verifyReceipt(receipt: Receipt): Promise<boolean> {
  const recomputed = await hashReceipt(receipt.inputs, receipt.result);
  return recomputed === receipt.receiptHash;
}
