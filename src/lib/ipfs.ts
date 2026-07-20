/**
 * ESVA IPFS Pinning — Receipt Timestamp Registration
 * --------------------------------------------------
 * Pin a minimized receipt payload to IPFS and record its CID. This is not
 * legal notarization, a blockchain transaction, or an independent timestamp.
 *
 * PART 1: Types (AnonymizedReceipt, PinataResponse)
 * PART 2: Receipt anonymization (strip PII, keep verifiable data)
 * PART 3: Pinata IPFS pinning (pin JSON, retrieve by CID)
 * PART 4: Public API
 */

import type { Receipt } from '@engine/receipt/types';

// ─── PART 1: Types ────────────────────────────────────────────

/** Receipt with all PII stripped — safe for permanent public storage. */
export interface AnonymizedReceipt {
  receiptHash: string;
  calcId: string;
  countryCode: string;
  appliedStandard: string;
  /** Generalized inputs with no user-specific data */
  inputs: Record<string, unknown>;
  result: {
    value: unknown;
    unit: string;
    judgment?: string;
  };
  steps: Array<{
    step: number;
    title: string;
    formula: string;
    value: string;
    unit: string;
    standardRef?: string;
  }>;
  calculatedAt: string;
  engineVersion: string;
  disclaimerVersion: string;
}

interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

export interface IpfsPinResult {
  cid: string;
  url: string;
}

// ─── PART 2: Receipt Anonymization ─────────────────────────────

/** Normalized field names that contain identity, credentials, or arbitrary free text. */
const SENSITIVE_INPUT_KEYS = new Set([
  'userid', 'username', 'fullname', 'name',
  'email', 'emailaddress', 'phone', 'phonenumber', 'mobile',
  'address', 'siteaddress', 'streetaddress', 'company', 'organization',
  'ip', 'ipaddress', 'projectname', 'clientname', 'customername', 'contactname',
  'password', 'passphrase', 'apikey', 'token', 'accesstoken', 'refreshtoken',
  'secret', 'credential', 'authorization', 'cookie', 'session', 'sharetoken',
  'note', 'notes', 'comment', 'comments', 'message', 'freetext',
]);

const MAX_SANITIZE_DEPTH = 8;
const MAX_OBJECT_FIELDS = 200;
const MAX_ARRAY_ITEMS = 100;
const MAX_STRING_LENGTH = 500;

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function looksLikeCredential(value: string): boolean {
  return /^(?:bearer\s+|sk-|AIza|ghp_|github_pat_|xox[baprs]-)/i.test(value.trim())
    || /^[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}$/.test(value.trim());
}

function sanitizeString(value: string): string | undefined {
  if (looksLikeCredential(value)) return undefined;
  return value
    .slice(0, MAX_STRING_LENGTH)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?\d[\d().\s-]{7,}\d)/g, '[redacted-phone]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]');
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_SANITIZE_DEPTH || value === null) return value === null ? null : undefined;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== 'object') return undefined;

  const cleaned: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value).slice(0, MAX_OBJECT_FIELDS)) {
    const normalized = normalizedKey(key);
    if (!normalized || SENSITIVE_INPUT_KEYS.has(normalized)
      || normalized === 'prototype' || normalized === 'constructor' || normalized === 'proto') continue;
    const sanitized = sanitizeValue(child, depth + 1);
    if (sanitized !== undefined) cleaned[key] = sanitized;
  }
  return cleaned;
}

/**
 * Strip personally identifiable information from receipt inputs.
 * Keeps only technical parameters needed for verification.
 */
function sanitizeInputs(inputs: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(inputs, 0) as Record<string, unknown>;
}

/**
 * Convert a full Receipt into an AnonymizedReceipt suitable for IPFS pinning.
 * Removes: userId, projectId, shareToken, any PII in inputs.
 * Keeps: receiptHash, calcId, countryCode, standard, inputs (sanitized), result, steps.
 */
export function anonymizeReceipt(receipt: Receipt): AnonymizedReceipt {
  return {
    receiptHash: receipt.receiptHash,
    calcId: receipt.calcId,
    countryCode: receipt.countryCode,
    appliedStandard: receipt.appliedStandard,
    inputs: sanitizeInputs(receipt.inputs),
    result: {
      value: receipt.result.value,
      unit: receipt.result.unit,
      judgment: receipt.result.judgment?.message,
    },
    steps: receipt.steps.map((s, i) => ({
      step: i + 1,
      title: s.title,
      formula: s.formula ?? '',
      value: String(s.value),
      unit: s.unit,
      standardRef: s.standardRef,
    })),
    calculatedAt: receipt.calculatedAt,
    engineVersion: receipt.engineVersion,
    disclaimerVersion: receipt.disclaimerVersion,
  };
}

// ─── PART 3: Pinata IPFS Operations ──────────────────────────

function getPinataConfig() {
  const jwt = process.env.PINATA_JWT ?? '';
  const gateway = process.env.PINATA_GATEWAY ?? 'https://gateway.pinata.cloud';

  if (!jwt) {
    throw new Error('[ESA-6001] PINATA_JWT not configured. Set the PINATA_JWT environment variable.');
  }

  return { jwt, gateway };
}

/**
 * Pin a JSON object to IPFS via Pinata.
 * Content-addressed: identical data always produces the same CID.
 */
async function pinJsonToPinata(
  data: object,
  metadata?: { name?: string; keyvalues?: Record<string, string> },
): Promise<PinataResponse> {
  const { jwt } = getPinataConfig();

  const body = {
    pinataContent: data,
    pinataMetadata: {
      name: metadata?.name ?? `esa-receipt-${Date.now()}`,
      keyvalues: metadata?.keyvalues ?? {},
    },
    pinataOptions: {
      cidVersion: 1,
    },
  };

  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `[ESA-6002] Pinata pinning failed (${response.status}): ${errorText}`,
    );
  }

  return response.json() as Promise<PinataResponse>;
}

/**
 * Retrieve JSON data from IPFS by CID via Pinata gateway.
 * Returns null if CID not found or fetch fails.
 */
async function fetchFromGateway(cid: string): Promise<object | null> {
  const { gateway } = getPinataConfig();
  const url = `${gateway}/ipfs/${cid}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) return null;
    return response.json() as Promise<object>;
  } catch {
    return null;
  }
}

// ─── PART 4: Public API ──────────────────────────────────────

/**
 * Pin an anonymized receipt to IPFS.
 * Returns the CID and a public gateway URL.
 */
export async function pinToIPFS(data: object): Promise<IpfsPinResult> {
  const receiptHash = (data as { receiptHash?: string }).receiptHash ?? 'unknown';

  const pinataResult = await pinJsonToPinata(data, {
    name: `esa-receipt-${receiptHash.slice(0, 12)}`,
    keyvalues: {
      type: 'esa-calculation-receipt',
      receiptHash,
    },
  });

  const { gateway } = getPinataConfig();

  return {
    cid: pinataResult.IpfsHash,
    url: `${gateway}/ipfs/${pinataResult.IpfsHash}`,
  };
}

/**
 * Retrieve a pinned object from IPFS by CID.
 * Returns null if not found.
 */
export async function getFromIPFS(cid: string): Promise<object | null> {
  if (!cid || typeof cid !== 'string') return null;
  return fetchFromGateway(cid);
}
