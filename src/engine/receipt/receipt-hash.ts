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
  if (value === null || value === undefined) return 'null';

  if (Array.isArray(value)) {
    const items = value.map((v) => canonicalize(v));
    return `[${items.join(',')}]`;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Match JSON.stringify semantics at transport boundaries: object fields
    // whose value is undefined do not survive the HTTP/sessionStorage roundtrip.
    const sortedKeys = Object.keys(obj).filter((key) => obj[key] !== undefined).sort();
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

/** Hash any canonical JSON-compatible value with deterministic key ordering. */
export async function hashCanonicalValue(value: unknown): Promise<string> {
  return sha256Hex(canonicalize(value));
}

// ---------------------------------------------------------------------------
// PART 3 — Public API
// ---------------------------------------------------------------------------

/**
 * 봉인 대상 = 판정을 구성하는 모든 필드(claim). 이전에는 inputs+result만 덮어
 * 적용 기준(KEC↔NEC)·조항·수식·엔진버전을 바꿔도 해시가 불변이었다 —
 * 하나의 해시가 서로 다른 규격 주장에 재사용 가능한 위조 표면.
 */
export interface ReceiptClaim {
  calcId: string;
  appliedStandard: string;
  standardVersion: string;
  unitSystem: string;
  inputs: Record<string, unknown>;
  result: CalcResult;
  steps: readonly unknown[];
  formulaUsed: string;
  standardsUsed: readonly string[];
  engineVersion: string;
}

/**
 * Produce a deterministic SHA-256 hash sealing the full calculation claim.
 * (입력·결과뿐 아니라 적용 기준·조항·수식·엔진버전까지 포함.)
 *
 * NOTE: keyless SHA-256 = 무결성(변조 탐지)이지 진위 증명이 아니다. 서명(HMAC)은
 * 서명키 도입이 필요한 후속 과제. 그 전까지 이 해시는 체크섬으로 취급.
 */
export async function hashReceipt(claim: ReceiptClaim): Promise<string> {
  const payload = canonicalize({
    calcId: claim.calcId,
    appliedStandard: claim.appliedStandard,
    standardVersion: claim.standardVersion,
    unitSystem: claim.unitSystem,
    inputs: claim.inputs,
    result: claim.result,
    steps: claim.steps,
    formulaUsed: claim.formulaUsed,
    standardsUsed: claim.standardsUsed,
    engineVersion: claim.engineVersion,
  });
  return sha256Hex(payload);
}

/** Receipt에서 봉인 대상 claim을 추출한다. */
export function claimFromReceipt(receipt: Receipt): ReceiptClaim {
  return {
    calcId: receipt.calcId,
    appliedStandard: receipt.appliedStandard,
    standardVersion: receipt.standardVersion,
    unitSystem: receipt.unitSystem,
    inputs: receipt.inputs,
    result: receipt.result,
    steps: receipt.steps,
    formulaUsed: receipt.formulaUsed,
    standardsUsed: receipt.standardsUsed,
    engineVersion: receipt.engineVersion,
  };
}

/**
 * Recompute the hash from the receipt's full claim and compare against the
 * stored `receiptHash`. Returns `true` if the claim has not been tampered with.
 * (전체 claim이 보존된 Receipt에만 유효 — DB 컬럼 재구성본에는 steps/formulaUsed
 *  등이 없을 수 있으므로 그 경로에 쓰지 말 것.)
 */
export async function verifyReceipt(receipt: Receipt): Promise<boolean> {
  const recomputed = await hashReceipt(claimFromReceipt(receipt));
  return recomputed === receipt.receiptHash;
}
