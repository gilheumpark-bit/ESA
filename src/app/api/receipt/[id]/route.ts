/**
 * ESVA Receipt Fetch API — /api/receipt/[id]
 * ──────────────────────────────────────────
 * GET: 저장된 계산 레코드로부터 RAW Receipt 객체를 하이드레이션하여 반환한다.
 *      영수증 뷰어 페이지(/receipt/[id])가 `const data: Receipt = await res.json()`로
 *      직접 소비하므로 {success,data} 래핑 없이 RAW Receipt를 그대로 반환한다.
 *
 * PART 1: ACL — 공개 영수증은 무인증, 비공개 영수증은 소유자만 (미소유 시 404)
 * PART 2: Receipt 하이드레이션 (notarize/route.ts와 동일 매핑)
 */

import { NextResponse } from 'next/server';
import { loadCalculation } from '@/lib/supabase';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import type { Receipt } from '@engine/receipt/types';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const stored = await loadCalculation(id);
  if (!stored) {
    return new Response(null, { status: 404 });
  }

  const metadata = (stored.metadata as Record<string, unknown>) ?? {};

  // ─── PART 1: ACL ───────────────────────────────────────────────
  // 공개 영수증은 무인증 접근 허용. 비공개 영수증은 소유자만 접근 가능하며,
  // 존재 여부 노출을 막기 위해 비소유자에게는 404를 반환한다.
  const isPublic = metadata.isPublic === true;
  if (!isPublic) {
    const callerId = await extractVerifiedUserId(req);
    if (!callerId || callerId !== stored.user_id) {
      return new Response(null, { status: 404 });
    }
  }

  // ─── PART 2: Receipt 하이드레이션 ──────────────────────────────
  const receipt: Receipt = {
    id: stored.id ?? id,
    calcId: stored.calculator_id,
    userId: stored.user_id,
    countryCode: (metadata.countryCode as string) ?? 'KR',
    appliedStandard: stored.standard_ref ?? 'KEC',
    unitSystem: 'SI',
    difficultyLevel: 'basic',
    inputs: stored.inputs,
    result: stored.outputs as Receipt['result'],
    steps: (metadata.steps ?? []) as Receipt['steps'],
    formulaUsed: stored.formula_used ?? '',
    standardsUsed: [],
    warnings: [],
    recommendations: [],
    disclaimerText: '',
    disclaimerVersion: 'v3.1',
    calculatedAt: stored.created_at ?? new Date().toISOString(),
    standardVersion: stored.standard_ref ?? '',
    engineVersion: (metadata.engineVersion as string) ?? '1.0.0',
    isStandardCurrent: true,
    receiptHash: (metadata.receiptHash as string) ?? '',
    isPublic,
  };

  return NextResponse.json(receipt);
}
