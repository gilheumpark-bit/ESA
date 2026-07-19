/**
 * ESVA Saved Calculation API — /api/calculate/[id]
 * ─────────────────────────────────────────────────
 * GET: Load a calculation receipt by ID.
 * Public receipts: no auth required.
 * Private: requires Firebase ID token.
 *
 * PART 1: Token verification
 * PART 2: Receipt integrity (verifyReceipt 실배선)
 * PART 3: GET handler
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { loadCalculation, type CalculationReceipt } from '@/lib/supabase';
import { canonicalize, verifyReceipt, type ReceiptClaim } from '@engine/receipt/receipt-hash';
import type { Receipt } from '@engine/receipt/types';
import type { CalcResult } from '@engine/standards/types';

// ─── PART 1: Token Extraction ───────────────────────────────────

// 서명 검증 헬퍼로 위임 — 기존 atob-only 디코드는 서명 미검증이라 위조 토큰을 허용했음.
const extractUserId = (request: NextRequest): Promise<string | null> =>
  extractVerifiedUserId(request);

// ─── PART 2: Receipt Integrity ──────────────────────────────────
// 쌍둥이: src/app/api/receipt/[id]/route.ts 에 동일 헬퍼가 있다. 라우트 파일은 핸들러 외
// export가 금지(Next 라우트 export 검증)라 공용 모듈로 못 빼고 중복한다 —
// 통합 시 src/engine/receipt/ 쪽 신규 모듈로 이동할 것.

type ReceiptIntegrity = 'VALID' | 'TAMPERED' | 'UNVERIFIABLE';

const SHA256_HEX = /^[0-9a-f]{64}$/i;

const isStr = (v: unknown): v is string => typeof v === 'string';
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 저장된 봉인 해시를 verifyReceipt로 재계산 대조한다.
 *
 * - claim 필드는 metadata(봉인 시점 스냅샷) 우선, 컬럼은 writer가 동일 객체를 기록하는
 *   5필드만 폴백(POST /api/calculate: inputs=body.inputs, calculator_id=entry.id,
 *   formula_used=calcResult.formula, outputs=calcResult, standard_ref=stdInfo.version —
 *   receipt-generator.ts:121-167이 같은 값을 무변환 봉인).
 * - 재계산에 필요한 필드가 부족하면 지어내지 않고 UNVERIFIABLE(구형/부분 데이터).
 * - meta·컬럼 두 벌이 모두 있는데 서로 다르면 한쪽이 변조/훼손된 것 — TAMPERED.
 */
async function computeReceiptIntegrity(row: CalculationReceipt): Promise<ReceiptIntegrity> {
  try {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;

    // 봉인 해시 — 별칭(meta.hash)까지 수용하되 SHA-256 hex가 아니면 receipt seal 자체가
    // 아니므로 대조 불가로 처리한다(오탐 TAMPERED 방지).
    const storedHash = isStr(meta.receiptHash) ? meta.receiptHash : isStr(meta.hash) ? meta.hash : null;
    if (!storedHash || !SHA256_HEX.test(storedHash)) return 'UNVERIFIABLE';

    // 이중 저장 필드(meta 스냅샷 + 컬럼)는 canonical 직렬화가 일치해야 한다.
    const duplicated: ReadonlyArray<readonly [unknown, unknown]> = [
      [meta.calcId, row.calculator_id],
      [meta.inputs, row.inputs],
      [meta.formulaUsed, row.formula_used],
      [meta.result, row.outputs],
      [meta.standardVersion, row.standard_ref],
    ];
    const conflicted = duplicated.some(
      ([m, c]) => m != null && c != null && canonicalize(m) !== canonicalize(c),
    );
    if (conflicted) return 'TAMPERED';

    const calcId = isStr(meta.calcId) ? meta.calcId : isStr(row.calculator_id) ? row.calculator_id : null;
    const appliedStandard = isStr(meta.appliedStandard) ? meta.appliedStandard : null;
    const standardVersion = isStr(meta.standardVersion)
      ? meta.standardVersion
      : isStr(row.standard_ref) ? row.standard_ref : null;
    const unitSystem = isStr(meta.unitSystem) ? meta.unitSystem : null;
    const inputs = isObj(meta.inputs) ? meta.inputs : isObj(row.inputs) ? row.inputs : null;
    const result = isObj(meta.result) ? meta.result : isObj(row.outputs) ? row.outputs : null;
    const steps = Array.isArray(meta.steps) ? meta.steps : null;
    const standardsUsed =
      Array.isArray(meta.standardsUsed) && meta.standardsUsed.every(isStr) ? meta.standardsUsed : null;
    const engineVersion = isStr(meta.engineVersion) ? meta.engineVersion : null;
    const formulaUsed = isStr(meta.formulaUsed)
      ? meta.formulaUsed
      : isStr(row.formula_used) ? row.formula_used : null;

    if (
      !calcId || !appliedStandard || !standardVersion || !unitSystem || !inputs ||
      !result || !steps || !standardsUsed || !engineVersion || formulaUsed === null
    ) {
      return 'UNVERIFIABLE'; // 구형/부분 데이터 — 필드를 지어내 재계산하지 않는다
    }

    const claim: ReceiptClaim & { receiptHash: string } = {
      calcId,
      appliedStandard,
      standardVersion,
      unitSystem,
      inputs,
      // 해시는 구조 무관 canonical 직렬화라 CalcResult 타입 정밀도는 판정에 영향 없다.
      result: result as CalcResult,
      steps,
      formulaUsed,
      standardsUsed,
      engineVersion,
      receiptHash: storedHash,
    };
    // verifyReceipt는 claimFromReceipt의 10개 claim 필드 + receiptHash만 읽는다
    // (src/engine/receipt/receipt-hash.ts:125-149) — 그 외 Receipt 필드는 해시에 불참.
    return (await verifyReceipt(claim as unknown as Receipt)) ? 'VALID' : 'TAMPERED';
  } catch (err) {
    console.warn('[ESVA /api/calculate/[id]] integrity check error:', err);
    return 'UNVERIFIABLE'; // 검증 실패를 VALID/TAMPERED로 위장하지 않는다
  }
}

// ─── PART 3: GET Handler ────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Rate limit (R4 stub repair).
    const blocked = applyRateLimit(request, 'default');
    if (blocked) return blocked;

    const { id } = await params;

    if (!id || typeof id !== 'string' || id.length < 10) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4020', message: 'Invalid receipt ID' } },
        { status: 400 },
      );
    }

    const receipt = await loadCalculation(id);

    if (!receipt) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4021', message: 'Receipt not found' } },
        { status: 404 },
      );
    }

    // If the receipt has a user_id, verify the requester owns it
    if (receipt.user_id) {
      const requesterId = await extractUserId(request);

      if (!requesterId) {
        return NextResponse.json(
          { success: false, error: { code: 'ESVA-1001', message: 'Authentication required' } },
          { status: 401 },
        );
      }

      if (requesterId !== receipt.user_id) {
        return NextResponse.json(
          { success: false, error: { code: 'ESVA-1002', message: 'Access denied' } },
          { status: 403 },
        );
      }
    }

    // G3: 저장 해시 재계산 대조 — VALID / TAMPERED / UNVERIFIABLE(재계산 불가 구형·부분 데이터)
    const integrity = await computeReceiptIntegrity(receipt);

    return NextResponse.json(
      { success: true, data: receipt, integrity },
      {
        status: 200,
        headers: {
          'Cache-Control': receipt.user_id
            ? 'private, max-age=300'
            : 'public, max-age=3600, s-maxage=86400',
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ESVA /api/calculate/[id]] Error:', message);

    return NextResponse.json(
      { success: false, error: { code: 'ESVA-4999', message: 'Failed to load receipt' } },
      { status: 500 },
    );
  }
}
