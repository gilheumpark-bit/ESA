/**
 * ESVA IPFS Timestamp API — /api/notarize
 * ──────────────────────────────────────
 * POST: Register a minimized receipt payload (minimize → IPFS pin → server proof registry).
 * The legacy route name is retained for compatibility; this is not legal notarization.
 *
 * PART 1: Auth extraction
 * PART 2: POST handler (load receipt → anonymize → pin → proof → update)
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { loadCalculation, getSupabaseAdmin } from '@/lib/supabase';
import { anonymizeReceipt, pinToIPFS } from '@/lib/ipfs';
import { createTimestampProof, getProofForReceipt, verifyProof } from '@/lib/blockchain';
import { isTierAtLeast, type Tier } from '@/lib/tier-gate';
import type { Receipt } from '@engine/receipt/types';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { isFeatureEnabledServer } from '@/lib/feature-flags';
import { isRequestOriginAllowed } from '@/lib/request-origin';
import { withRequestLog } from '@/lib/api/with-request-log';

// ─── PART 1: Auth ──────────────────────────────────────────────
// 티어는 서버 DB에서만 결정한다. 이전 구현은 서명 미검증 atob 파싱으로
// JWT claims의 user_tier/tier를 신뢰하는 fast-path를 뒀는데, 이 리포엔
// setCustomUserClaims가 없어 정당하게 발화할 수 없는 순수 권한상승
// 위험점이었다(unverified-input → AUTHZ). 제거하고 DB 단일 출처로.

const VALID_TIERS: Tier[] = ['free', 'pro', 'team', 'enterprise'];

async function resolveUserTier(userId: string): Promise<Tier> {
  // Look up from Supabase user profile (single source of truth)
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin
      .from('users')
      .select('tier')
      .eq('id', userId)
      .single();

    if (data?.tier && VALID_TIERS.includes(data.tier as Tier)) {
      return data.tier as Tier;
    }
  } catch (err) {
    console.warn('[ESVA Timestamp] Tier lookup failed; defaulting to free:', err instanceof Error ? err.name : 'UnknownError');
  }

  // 3) Default to free with warning
  console.warn('[ESVA Timestamp] Could not determine user tier; defaulting to free');
  return 'free';
}

// ─── PART 2: POST Handler ──────────────────────────────────────

async function POST__impl(request: NextRequest) {
  try {
    if (!isRequestOriginAllowed(
      request.headers.get('origin'),
      request.url,
      undefined,
      request.headers.get('host'),
      request.headers.get('x-forwarded-proto'),
    )) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-9001', message: 'Invalid origin' } },
        { status: 403 },
      );
    }
    const blocked = applyRateLimit(request, 'notarize');
    if (blocked) return blocked;
    if (!isFeatureEnabledServer('RECEIPT_NOTARIZE')) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-6001', message: 'IPFS timestamp registration is not enabled' } },
        { status: 404 },
      );
    }

    // Auth check
    const userId = await extractVerifiedUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-1001', message: 'Authentication required' } },
        { status: 401 },
      );
    }

    // Tier check — IPFS timestamp registration requires Pro or higher
    const userTier: Tier = await resolveUserTier(userId);
    if (!isTierAtLeast(userTier, 'pro')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ESVA-2001',
            message: 'IPFS timestamp registration requires Pro plan or higher',
            requiredTier: 'pro',
          },
        },
        { status: 403 },
      );
    }

    // Parse body
    const body = await request.json() as { receiptId?: string };

    if (!body.receiptId || typeof body.receiptId !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-6003', message: 'Missing receiptId' } },
        { status: 400 },
      );
    }

    // Load receipt from Supabase
    const stored = await loadCalculation(body.receiptId);
    if (!stored) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-6004', message: 'Receipt not found' } },
        { status: 404 },
      );
    }

    // Verify ownership
    if (stored.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-1002', message: 'Not authorized to register this receipt timestamp' } },
        { status: 403 },
      );
    }

    // Check if already registered
    const receiptHash = (stored.metadata as Record<string, string>)?.receiptHash;
    if (receiptHash) {
      const existingProof = await getProofForReceipt(receiptHash);
      if (existingProof) {
        return NextResponse.json({
          success: true,
          data: {
            ipfsCid: existingProof.ipfsCid,
            proof: existingProof,
            verifyUrl: `/receipt/${body.receiptId}?verify=true`,
            alreadyRegistered: true,
          },
        });
      }
    }

    // Build a Receipt-like object from the stored calculation
    const receipt: Receipt = {
      id: stored.id ?? body.receiptId,
      calcId: stored.calculator_id,
      userId: stored.user_id,
      countryCode: (stored.metadata as Record<string, string>)?.countryCode ?? 'KR',
      appliedStandard: stored.standard_ref ?? 'KEC',
      unitSystem: 'SI',
      difficultyLevel: 'basic',
      inputs: stored.inputs,
      result: stored.outputs as Receipt['result'],
      steps: ((stored.metadata as Record<string, unknown>)?.steps ?? []) as Receipt['steps'],
      formulaUsed: stored.formula_used ?? '',
      standardsUsed: [],
      warnings: [],
      recommendations: [],
      disclaimerText: '',
      disclaimerVersion: 'v3.1',
      calculatedAt: stored.created_at ?? new Date().toISOString(),
      standardVersion: stored.standard_ref ?? '',
      engineVersion: ((stored.metadata as Record<string, string>)?.engineVersion) ?? '1.0.0',
      // A stored edition string alone does not prove current authority.
      isStandardCurrent: false,
      receiptHash: receiptHash ?? '',
      isPublic: false,
    };

    // Step 1: Anonymize
    const anonymized = anonymizeReceipt(receipt);

    // Step 2: Pin to IPFS
    const pinResult = await pinToIPFS(anonymized);

    // Step 3: Create timestamp proof
    const proof = await createTimestampProof(anonymized.receiptHash, pinResult.cid);

    // Step 4: Update receipt record with timestamp registration metadata
    const admin = getSupabaseAdmin();
    const { error: updateError } = await admin
      .from('calculation_receipts')
      .update({
        metadata: {
          ...(stored.metadata as Record<string, unknown> ?? {}),
          ipfsCid: pinResult.cid,
          ipfsUrl: pinResult.url,
          proofRegistryRecordId: proof.txHash,
          proofRecordedAt: proof.timestamp,
          proofRegistry: proof.chain,
          timestampRegisteredAt: new Date().toISOString(),
        },
      })
      .eq('id', stored.id);
    if (updateError) {
      throw new Error(`[ESVA-6014] Failed to persist timestamp registration: ${updateError.message}`);
    }

    return NextResponse.json({
      success: true,
      data: {
        ipfsCid: pinResult.cid,
        proof,
        verifyUrl: `/receipt/${body.receiptId}?verify=true`,
      },
    });
  } catch (err) {
    console.error('[ESVA Timestamp]', err instanceof Error ? err.name : 'UnknownError');

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ESVA-6099',
          message: 'IPFS 타임스탬프를 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        },
      },
      { status: 500 },
    );
  }
}

// ─── PART 3: GET — 등록된 증명 대조 ────────────────────────────

/**
 * 영수증 행이 들고 있는 증명 정보를 **증명 레지스트리와 맞춰 본다.**
 *
 * 이게 자기 대조가 아닌 이유: 두 저장소가 다르다. 영수증 행의
 * `metadata.ipfsCid`·`proofRegistryRecordId` 는 등록 시점에 그 행에 쓰였고,
 * `timestamp_proofs` 표는 같은 시점에 **따로** 쓰였다. 나중에 영수증 행이
 * 손대지면 둘이 어긋난다 — `verifyProof` 가 CID·txHash 불일치로 잡는다.
 *
 * 레지스트리에서 꺼낸 것을 레지스트리와 맞추면 언제나 통과한다(§2.3).
 * 그래서 **영수증 행 쪽을 제시본으로** 삼는다.
 *
 * 등록과 같은 플래그·티어·소유 규율을 따른다 — 남의 영수증 증명 상태를
 * 조회할 수 있으면 그 자체가 노출이다.
 */
async function GET__impl(request: NextRequest) {
  try {
    const blocked = applyRateLimit(request, 'notarize');
    if (blocked) return blocked;
    if (!isFeatureEnabledServer('RECEIPT_NOTARIZE')) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-6001', message: 'IPFS timestamp registration is not enabled' } },
        { status: 404 },
      );
    }

    const userId = await extractVerifiedUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-1001', message: 'Authentication required' } },
        { status: 401 },
      );
    }

    const receiptId = new URL(request.url).searchParams.get('receiptId');
    if (!receiptId) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-6020', message: 'receiptId 가 필요합니다.' } },
        { status: 400 },
      );
    }

    const stored = await loadCalculation(receiptId);
    if (!stored || stored.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-6021', message: '영수증을 찾지 못했습니다.' } },
        { status: 404 },
      );
    }

    const meta = (stored.metadata ?? {}) as Record<string, unknown>;
    const receiptHash = typeof meta.receiptHash === 'string' ? meta.receiptHash : stored.receipt_hash;
    const ipfsCid = typeof meta.ipfsCid === 'string' ? meta.ipfsCid : '';
    const txHash = typeof meta.proofRegistryRecordId === 'string' ? meta.proofRegistryRecordId : '';
    const recordedAt = typeof meta.proofRecordedAt === 'string' ? meta.proofRecordedAt : '';
    const chain = typeof meta.proofRegistry === 'string' ? meta.proofRegistry : '';

    // 등록한 적이 없으면 "위조" 가 아니라 "등록 안 됨" 이다. 가르지 않으면
    // 사용자는 무언가 잘못됐다고 읽는다.
    if (!receiptHash || !ipfsCid || !txHash) {
      return NextResponse.json({
        success: true,
        data: { registered: false, valid: null, reason: '이 영수증은 타임스탬프에 등록된 적이 없습니다.' },
      });
    }

    const verification = await verifyProof({
      txHash, blockNumber: 0, timestamp: recordedAt, chain: chain || 'esa-registry', receiptHash, ipfsCid,
    });

    return NextResponse.json({
      success: true,
      data: {
        registered: true,
        valid: verification.valid,
        timestamp: verification.timestamp,
        reason: verification.reason,
        ipfsCid,
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    console.error('[ESVA Timestamp verify]', err instanceof Error ? err.name : 'UnknownError');
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-6098', message: '타임스탬프 대조에 실패했습니다.' } },
      { status: 500 },
    );
  }
}

export const POST = withRequestLog(POST__impl);
export const GET = withRequestLog(GET__impl);
