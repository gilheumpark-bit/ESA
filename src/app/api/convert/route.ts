/**
 * ESVA Unit Conversion API — /api/convert
 * ────────────────────────────────────────
 * POST: Convert between electrical engineering units.
 * AWG/mm2, kW/HP, V/kV, C/F, ohm/pu, etc.
 * No auth required.
 *
 * PART 1: Request types
 * PART 2: POST handler
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { convert, isAwgSize, type UnitType, type ConvertOptions } from '@engine/conversion/unit-conversion';
import { withRequestLog } from '@/lib/api/with-request-log';

// ─── PART 1: Request Types ──────────────────────────────────────

interface ConvertRequestBody {
  /** AWG 는 "4/0"·"0000" 같은 규격명이라 문자열도 온다. 그 외 단위는 수치만. */
  value: number | string;
  fromUnit: string;
  toUnit: string;
  options?: {
    powerFactor?: number;
    baseVoltageKv?: number;
    baseMva?: number;
  };
}

// ─── PART 2: Valid Unit Types ───────────────────────────────────

const VALID_UNITS: Set<string> = new Set([
  'AWG', 'mm2', 'kcmil',
  'kW', 'HP', 'kVA',
  'V', 'kV',
  'C', 'F',
  'ohm', 'pu',
]);

// ─── PART 3: POST Handler ───────────────────────────────────────

async function POST__impl(request: NextRequest) {
  try {
    const blocked = applyRateLimit(request, 'default');
    if (blocked) return blocked;

    const raw = await request.json().catch(() => null);
    // 깨진 JSON·빈 본문은 호출자 잘못이다. 던지게 두면 바깥 catch 가
    // 500 으로 뭉개 "우리 잘못" 으로 보고된다(§ 정직 거부).
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4030', message: 'Request body must be valid JSON' } },
        { status: 400 },
      );
    }
    const body = raw as ConvertRequestBody;

    // Validate value — AWG 규격명만 문자열을 허용한다. 아무 문자열이나
    // 통과시키면 다른 분기가 NaN 을 success:true 로 돌려준다.
    const awgSize = body.fromUnit === 'AWG' && typeof body.value === 'string' && isAwgSize(body.value);
    if (!awgSize && (typeof body.value !== 'number' || !isFinite(body.value))) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ESVA-4030',
            message: body.fromUnit === 'AWG'
              ? 'Invalid value: must be a finite number or a known AWG size (e.g. 12, 1/0, 4/0, 0000)'
              : 'Invalid value: must be a finite number',
          },
        },
        { status: 400 },
      );
    }

    // Validate units
    if (!body.fromUnit || typeof body.fromUnit !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4031', message: 'Missing fromUnit' } },
        { status: 400 },
      );
    }

    if (!body.toUnit || typeof body.toUnit !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4032', message: 'Missing toUnit' } },
        { status: 400 },
      );
    }

    if (!VALID_UNITS.has(body.fromUnit)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ESVA-4033',
            message: `Unknown fromUnit: ${body.fromUnit}. Valid: ${Array.from(VALID_UNITS).join(', ')}`,
          },
        },
        { status: 400 },
      );
    }

    if (!VALID_UNITS.has(body.toUnit)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ESVA-4034',
            message: `Unknown toUnit: ${body.toUnit}. Valid: ${Array.from(VALID_UNITS).join(', ')}`,
          },
        },
        { status: 400 },
      );
    }

    // Build options — 유한 숫자만 수용(버그 사냥 수리): 문자열·NaN·Infinity가
    // 그대로 convert()에 흘러가면 NaN 결과를 success:true로 반환했다.
    const opts: ConvertOptions = {};
    const finiteOpt = (v: unknown): number | undefined =>
      typeof v === 'number' && Number.isFinite(v) ? v : undefined;
    const pf = finiteOpt(body.options?.powerFactor);
    const bv = finiteOpt(body.options?.baseVoltageKv);
    const bm = finiteOpt(body.options?.baseMva);
    if (body.options?.powerFactor !== undefined && pf === undefined) {
      return NextResponse.json({ success: false, error: { code: 'ESVA-4003', message: 'powerFactor must be a finite number.' } }, { status: 400 });
    }
    if (body.options?.baseVoltageKv !== undefined && bv === undefined) {
      return NextResponse.json({ success: false, error: { code: 'ESVA-4003', message: 'baseVoltageKv must be a finite number.' } }, { status: 400 });
    }
    if (body.options?.baseMva !== undefined && bm === undefined) {
      return NextResponse.json({ success: false, error: { code: 'ESVA-4003', message: 'baseMva must be a finite number.' } }, { status: 400 });
    }
    if (pf !== undefined) opts.powerFactor = pf;
    if (bv !== undefined) opts.baseVoltageKv = bv;
    if (bm !== undefined) opts.baseMva = bm;

    // Execute conversion
    const result = convert(body.value, body.fromUnit as UnitType, body.toUnit as UnitType, opts);

    return NextResponse.json(
      {
        success: true,
        data: {
          result: result.result,
          formula: result.formula,
          ...(result.label ? { label: result.label } : {}),
          from: { value: body.value, unit: body.fromUnit },
          to: { value: result.label ?? result.result, unit: body.toUnit },
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ESVA /api/convert] Error:', message);

    // Distinguish conversion logic errors from system errors
    if (message.includes('not supported') || message.includes('Cannot convert')) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4035', message } },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { success: false, error: { code: 'ESVA-4999', message: 'Conversion error' } },
      { status: 500 },
    );
  }
}

export const POST = withRequestLog(POST__impl);
