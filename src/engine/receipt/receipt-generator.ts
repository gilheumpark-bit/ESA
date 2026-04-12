/**
 * Receipt Generator — creates a sealed Receipt from calculation output
 *
 * PART 1: Constants
 * PART 2: Standard currency checker
 * PART 3: generateReceipt()
 */

import type { CalcResult } from '@engine/standards/types';
import type { CalcStep, DifficultyLevel } from '@engine/calculators/types';
import type { Receipt, UnitSystem } from './types';
import { hashReceipt } from './receipt-hash';
import { getDisclaimer, DISCLAIMER_VERSION } from './disclaimer';
import type { DisclaimerLang } from './disclaimer';

// ---------------------------------------------------------------------------
// PART 1 — Constants
// ---------------------------------------------------------------------------

export const ENGINE_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// PART 2 — Standard edition currency
// ---------------------------------------------------------------------------

/**
 * Known standard editions with their validity cutoff dates.
 * A standard is considered "current" if today < cutoff.
 * If the standard is not listed, it is assumed current.
 */
const STANDARD_CUTOFFS: Record<string, string> = {
  'KEC 2021': '2027-01-01',
  'KEC 2016': '2022-01-01',
  'NEC 2023': '2029-01-01',
  'NEC 2020': '2026-01-01',
  'IEC 60364:2005': '2024-01-01',
  'IEC 60364:2017': '2028-01-01',
  'JIS C 0364:2019': '2028-01-01',
  'GB 50054-2011': '2026-01-01',
};

function checkStandardCurrent(standardVersion: string): boolean {
  const cutoff = STANDARD_CUTOFFS[standardVersion];
  if (!cutoff) return true; // unknown edition assumed current
  return new Date().toISOString() < cutoff;
}

// ---------------------------------------------------------------------------
// PART 3 — UUID v4 generator (isomorphic)
// ---------------------------------------------------------------------------

async function generateUuid(): Promise<string> {
  // crypto.randomUUID is available in modern browsers and Node 19+
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  // Fallback: manual v4 UUID from getRandomValues
  const getRandomBytes = async (): Promise<Uint8Array> => {
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      return globalThis.crypto.getRandomValues(new Uint8Array(16));
    }
    try {
      const nodeCrypto = await import('crypto');
      return new Uint8Array(nodeCrypto.randomBytes(16));
    } catch {
      throw new Error('No crypto source available for UUID generation');
    }
  };

  const bytes = await getRandomBytes();
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

// ---------------------------------------------------------------------------
// PART 4 — generateReceipt
// ---------------------------------------------------------------------------

export interface GenerateReceiptOpts {
  calcId: string;
  calcResult: CalcResult;
  steps: CalcStep[];
  formulaUsed: string;
  standardsUsed: string[];
  inputs: Record<string, unknown>;
  countryCode: string;
  standard: string;
  standardVersion: string;
  unitSystem?: UnitSystem;
  difficulty: DifficultyLevel;
  userId?: string;
  projectId?: string;
  lang?: DisclaimerLang;
  warnings?: string[];
  recommendations?: string[];
  conversionConfidence?: number;
  standardVerifiedAt?: string;
}

/**
 * Build a complete, hash-sealed Receipt from calculation output.
 */
export async function generateReceipt(opts: GenerateReceiptOpts): Promise<Receipt> {
  const lang = opts.lang ?? 'ko';
  const calculatedAt = new Date().toISOString();
  const isStandardCurrent = checkStandardCurrent(opts.standardVersion);

  const receiptHash = await hashReceipt(opts.inputs, opts.calcResult);

  const receipt: Receipt = {
    id: await generateUuid(),
    calcId: opts.calcId,
    userId: opts.userId,
    projectId: opts.projectId,
    countryCode: opts.countryCode,
    appliedStandard: opts.standard,
    unitSystem: opts.unitSystem ?? 'SI',
    difficultyLevel: opts.difficulty,

    inputs: opts.inputs,
    result: opts.calcResult,
    steps: opts.steps,
    formulaUsed: opts.formulaUsed,
    standardsUsed: opts.standardsUsed,

    conversionConfidence: opts.conversionConfidence,

    warnings: opts.warnings ?? [],
    recommendations: opts.recommendations ?? [],

    disclaimerText: getDisclaimer(lang),
    disclaimerVersion: DISCLAIMER_VERSION,

    calculatedAt,
    standardVersion: opts.standardVersion,
    standardVerifiedAt: opts.standardVerifiedAt,
    engineVersion: ENGINE_VERSION,
    isStandardCurrent,

    receiptHash,
    shareToken: undefined,
    isPublic: false,
  };

  return receipt;
}
