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

/**
 * 계산 결과가 달라지면 **올린다.** 영수증은 이 값과 함께 저장되고, 내보내기
 * 검증은 입력을 재실행해 claim 전체를 대조한다 — 엔진이 값을 바꿨는데 이
 * 번호가 그대로면 **옛 영수증이 전부 위조로 보인다.**
 *
 * 0.1.0 → 0.2.0 (2026-07-28): KEC 허용전류표의 PVC 최고허용온도를 60 → 70°C
 * 로 고쳤다(표 키 이름이 `pvc60` 이라 폴백이 60 을 따라가고 있었다). 표 안의
 * 값은 그대로지만 **표 밖 온도의 보정계수가 달라진다**:
 *
 *   주위 5°C · PVC:  구 √(55/30)=1.354  →  신 √(65/40)=1.275   (−5.8%)
 *
 * 폼의 주위온도 하한이 −20°C 라 10°C 미만은 정상 사용자 경로다. 이 배포
 * 전에 발급된 저온 영수증은 재실행 값이 달라 `REPLAY_MISMATCH` 로 떨어졌고,
 * 사용자에게는 내보내기 거부로만 보였다 — "우리가 식을 바꿨다" 와 "당신
 * 영수증이 위조다" 를 구분할 근거가 응답에 없었다(2026-07-28 독립 심사
 * 백엔드 좌석). 번호를 올리고, 검증이 그 둘을 구분하도록 했다
 * (`lib/calculation-execution.ts` 의 `ENGINE_VERSION_DRIFT`).
 */
export const ENGINE_VERSION = '0.2.0';

// ---------------------------------------------------------------------------
// PART 2 — Standard edition currency
// ---------------------------------------------------------------------------

/**
 * Editions may only be labelled current after the embedded rule snapshot has
 * been checked against an authoritative publication and the verification date
 * is recorded in the receipt. The present datasets are historical snapshots,
 * so the allow-list intentionally starts empty instead of guessing validity.
 */
const VERIFIED_CURRENT_EDITIONS = new Set<string>();

function checkStandardCurrent(
  standardVersion: string,
  standardVerifiedAt?: string,
): boolean {
  if (!VERIFIED_CURRENT_EDITIONS.has(standardVersion) || !standardVerifiedAt) return false;
  const verifiedAt = Date.parse(standardVerifiedAt);
  return Number.isFinite(verifiedAt) && verifiedAt <= Date.now();
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
  const isStandardCurrent = checkStandardCurrent(
    opts.standardVersion,
    opts.standardVerifiedAt,
  );

  const receiptHash = await hashReceipt({
    calcId: opts.calcId,
    appliedStandard: opts.standard,
    standardVersion: opts.standardVersion,
    unitSystem: opts.unitSystem ?? 'SI',
    inputs: opts.inputs,
    result: opts.calcResult,
    steps: opts.steps,
    formulaUsed: opts.formulaUsed,
    standardsUsed: opts.standardsUsed,
    engineVersion: ENGINE_VERSION,
  });

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
