/**
 * ESVA Standard Conversion API — /api/standard-convert
 * ─────────────────────────────────────────────────────
 * POST: Convert a clause reference from one standard to another.
 *
 * Input:  { fromStandard, fromClause, toStandard }
 * Output: ConversionResult with confidence, equivalent clause, notes
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import {
  convertStandard,
  type StandardCode,
  type ConversionResult,
} from '@/lib/standard-converter';
import { withRequestLog } from '@/lib/api/with-request-log';

// ─── Validation ───────────────────────────────────────────────

const VALID_STANDARDS: ReadonlySet<string> = new Set(['KEC', 'NEC', 'IEC', 'JIS']);

function isValidStandard(s: unknown): s is StandardCode {
  return typeof s === 'string' && VALID_STANDARDS.has(s.toUpperCase());
}

// ─── POST Handler ─────────────────────────────────────────────

async function POST__impl(request: NextRequest) {
  try {
    const blocked = applyRateLimit(request, 'default');
    if (blocked) return blocked;

    const raw = await request.json().catch(() => null);
    // 깨진 JSON·빈 본문은 호출자 잘못이다. 던지게 두면 바깥 catch 가
    // 500 으로 뭉개 "우리 잘못" 으로 보고된다.
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4040', message: 'Request body must be valid JSON' } },
        { status: 400 },
      );
    }
    const body = raw as { fromStandard?: string; fromClause?: string; toStandard?: string };

    // Validate required fields
    if (!body.fromStandard || !body.fromClause || !body.toStandard) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ESVA-7001',
            message: 'Missing required fields: fromStandard, fromClause, toStandard',
          },
        },
        { status: 400 },
      );
    }

    const fromStandard = body.fromStandard.toUpperCase();
    const toStandard = body.toStandard.toUpperCase();

    if (!isValidStandard(fromStandard) || !isValidStandard(toStandard)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ESVA-7002',
            message: `Invalid standard code. Supported: ${[...VALID_STANDARDS].join(', ')}`,
          },
        },
        { status: 400 },
      );
    }

    const result: ConversionResult = convertStandard({
      fromStandard,
      fromClause: body.fromClause.trim(),
      toStandard,
    });

    return NextResponse.json(
      { success: true, data: result },
      {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=3600' },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[ESVA Standard Convert]', message);

    return NextResponse.json(
      { success: false, error: { code: 'ESVA-7099', message } },
      { status: 500 },
    );
  }
}

export const POST = withRequestLog(POST__impl);
