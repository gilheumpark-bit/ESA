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

// ─── Validation ───────────────────────────────────────────────

const VALID_STANDARDS: ReadonlySet<string> = new Set(['KEC', 'NEC', 'IEC', 'JIS']);

function isValidStandard(s: unknown): s is StandardCode {
  return typeof s === 'string' && VALID_STANDARDS.has(s.toUpperCase());
}

// ─── POST Handler ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const blocked = applyRateLimit(request, 'default');
    if (blocked) return blocked;

    const body = await request.json() as {
      fromStandard?: string;
      fromClause?: string;
      toStandard?: string;
    };

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
