/**
 * ESVA Notarization API — /api/notarize
 * ──────────────────────────────────────
 * POST: Notarize a calculation receipt (anonymize → IPFS pin → timestamp proof).
 *
 * PART 1: Auth extraction
 * PART 2: POST handler (load receipt → anonymize → pin → proof → update)
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { loadCalculation, getSupabaseAdmin } from '@/lib/supabase';
import { anonymizeReceipt, pinToIPFS } from '@/lib/ipfs';
import { createTimestampProof, getProofForReceipt } from '@/lib/blockchain';
import { isTierAtLeast, type Tier } from '@/lib/tier-gate';
import type { Receipt } from '@engine/receipt/types';
import { extractVerifiedUserId } from '@/lib/auth-helpers';

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
    console.warn('[ESVA Notarize] Failed to look up user tier from DB, defaulting to free:', err);
  }

  // 3) Default to free with warning
  console.warn(`[ESVA Notarize] Could not determine tier for user ${userId}, defaulting to 'free'`);
  return 'free';
}

// ─── PART 2: POST Handler ──────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Rate limit (R4 stub repair).
    const blocked = applyRateLimit(request, 'default');
    if (blocked) return blocked;

    // Auth check
    const userId = await extractVerifiedUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-1001', message: 'Authentication required' } },
        { status: 401 },
      );
    }

    // Tier check — notarization requires Pro or higher
    const userTier: Tier = await resolveUserTier(userId);
    if (!isTierAtLeast(userTier, 'pro')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ESVA-2001',
            message: 'Notarization requires Pro plan or higher',
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
        { success: false, error: { code: 'ESVA-1002', message: 'Not authorized to notarize this receipt' } },
        { status: 403 },
      );
    }

    // Check if already notarized
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
            alreadyNotarized: true,
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
      isStandardCurrent: true,
      receiptHash: receiptHash ?? '',
      isPublic: false,
    };

    // Step 1: Anonymize
    const anonymized = anonymizeReceipt(receipt);

    // Step 2: Pin to IPFS
    const pinResult = await pinToIPFS(anonymized);

    // Step 3: Create timestamp proof
    const proof = await createTimestampProof(anonymized.receiptHash, pinResult.cid);

    // Step 4: Update receipt record with notarization metadata
    const admin = getSupabaseAdmin();
    await admin
      .from('calculation_receipts')
      .update({
        metadata: {
          ...(stored.metadata as Record<string, unknown> ?? {}),
          ipfsCid: pinResult.cid,
          ipfsUrl: pinResult.url,
          proofTxHash: proof.txHash,
          proofTimestamp: proof.timestamp,
          proofChain: proof.chain,
          notarizedAt: new Date().toISOString(),
        },
      })
      .eq('id', stored.id);

    return NextResponse.json({
      success: true,
      data: {
        ipfsCid: pinResult.cid,
        proof,
        verifyUrl: `/receipt/${body.receiptId}?verify=true`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[ESVA Notarize]', message);

    return NextResponse.json(
      { success: false, error: { code: 'ESVA-6099', message } },
      { status: 500 },
    );
  }
}
