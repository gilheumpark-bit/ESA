/**
 * ESVA Receipt Alias API — GET /api/receipt/[id]
 * ──────────────────────────────────────────────
 * UI(`/receipt/[id]`) 호환 별칭. 본 구현은 `/api/calculate/[id]`와 동일 저장소에서
 * 영수증을 로드한다. 응답은 ReceiptCard가 기대하는 shape로 정규화한다.
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { loadCalculation } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const blocked = applyRateLimit(request, 'default');
    if (blocked) return blocked;

    const { id } = await params;

    if (!id || typeof id !== 'string' || id.length < 8) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4020', message: 'Invalid receipt ID' } },
        { status: 400 },
      );
    }

    const row = await loadCalculation(id);

    if (!row) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4021', message: 'Receipt not found' } },
        { status: 404 },
      );
    }

    if (row.user_id) {
      const requesterId = await extractVerifiedUserId(request);
      if (!requesterId) {
        return NextResponse.json(
          { success: false, error: { code: 'ESVA-1001', message: 'Authentication required' } },
          { status: 401 },
        );
      }
      if (requesterId !== row.user_id) {
        return NextResponse.json(
          { success: false, error: { code: 'ESVA-1002', message: 'Access denied' } },
          { status: 403 },
        );
      }
    }

    // DB 행 → engine Receipt 유사 shape (ReceiptCard / 페이지 소비)
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const rowId = row.id ?? id;
    const receipt = {
      id: rowId,
      calculatorId: row.calculator_id,
      calculatorName: row.calculator_name,
      inputs: row.inputs,
      outputs: row.outputs,
      formulaUsed: row.formula_used,
      standardRef: row.standard_ref,
      lang: row.lang ?? 'ko',
      createdAt: row.created_at,
      userId: row.user_id,
      hash: meta.receiptHash ?? meta.hash ?? rowId,
      model: meta.model,
      confidence: meta.confidence,
      sourceTags: meta.sourceTags,
      ...meta,
    };

    return NextResponse.json(receipt, {
      status: 200,
      headers: {
        'Cache-Control': row.user_id
          ? 'private, max-age=300'
          : 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ESVA /api/receipt/[id]] Error:', message);
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-4999', message: 'Failed to load receipt' } },
      { status: 500 },
    );
  }
}
