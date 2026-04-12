/**
 * ESVA Batch Calculation API — /api/calculate/batch
 * ──────────────────────────────────────────────────
 * POST: Execute multiple calculations in parallel.
 *
 * PART 1: Request/response types
 * PART 2: Auth extraction
 * PART 3: POST handler — parallel execution via Promise.allSettled
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { CALCULATOR_REGISTRY } from '@engine/calculators';
import { CalcValidationError } from '@engine/calculators/types';
import { generateReceipt } from '@engine/receipt';
import type { GenerateReceiptOpts } from '@engine/receipt';

// ─── PART 1: Request/Response Types ────────────────────────────

interface BatchCalculation {
  calculatorId: string;
  inputs: Record<string, unknown>;
  countryCode?: string;
}

interface BatchRequestBody {
  calculations: BatchCalculation[];
}

interface BatchResultItem {
  index: number;
  success: boolean;
  result?: unknown;
  receipt?: unknown;
  error?: { code: string; message: string };
}

interface BatchSummary {
  total: number;
  passed: number;
  failed: number;
  errors: string[];
}

// ─── PART 2: Country → Standard Mapping ────────────────────────

const COUNTRY_STANDARD_MAP: Record<string, { standard: string; version: string }> = {
  KR: { standard: 'KEC', version: 'KEC 2021' },
  US: { standard: 'NEC', version: 'NEC 2023' },
  JP: { standard: 'JIS', version: 'JIS C 0364:2019' },
  CN: { standard: 'GB', version: 'GB 50054-2011' },
  DE: { standard: 'VDE', version: 'IEC 60364:2017' },
  AU: { standard: 'AS/NZS', version: 'AS/NZS 3000:2018' },
  ME: { standard: 'DEWA', version: 'DEWA 2020' },
};

// ─── PART 3: Auth Token Extraction ─────────────────────────────

async function extractUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  if (!token || token.length < 10) return null;

  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(atob(payloadB64));
    return payload.user_id ?? payload.sub ?? null;
  } catch {
    return null;
  }
}

// ─── PART 4: Single Calculation Executor ───────────────────────

async function executeSingle(
  calc: BatchCalculation,
  index: number,
): Promise<BatchResultItem> {
  try {
    const entry = CALCULATOR_REGISTRY.get(calc.calculatorId);
    if (!entry) {
      return {
        index,
        success: false,
        error: { code: 'ESVA-4005', message: `Unknown calculator: ${calc.calculatorId}` },
      };
    }

    if (!calc.inputs || typeof calc.inputs !== 'object') {
      return {
        index,
        success: false,
        error: { code: 'ESVA-4004', message: 'Missing or invalid inputs' },
      };
    }

    const calcResult = entry.calculator(calc.inputs);

    const countryCode = calc.countryCode ?? 'KR';
    const stdInfo = COUNTRY_STANDARD_MAP[countryCode] ?? COUNTRY_STANDARD_MAP.KR;

    const receiptOpts: GenerateReceiptOpts = {
      calcId: entry.id,
      calcResult,
      steps: calcResult.steps,
      formulaUsed: calcResult.formula,
      standardsUsed: calcResult.steps
        .map((s) => s.standardRef)
        .filter((ref): ref is string => !!ref),
      inputs: calc.inputs,
      countryCode,
      standard: stdInfo.standard,
      standardVersion: stdInfo.version,
      difficulty: entry.difficulty,
      lang: 'ko',
    };

    const receipt = await generateReceipt(receiptOpts);

    return { index, success: true, result: calcResult, receipt };
  } catch (err) {
    if (err instanceof CalcValidationError) {
      return {
        index,
        success: false,
        error: { code: 'ESVA-4010', message: err.message },
      };
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      index,
      success: false,
      error: { code: 'ESVA-4999', message },
    };
  }
}

// ─── PART 5: POST Handler ──────────────────────────────────────

const MAX_BATCH_SIZE = 100;

export async function POST(request: NextRequest) {
  try {
    // Auth required for batch
    const userId = await extractUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-1001', message: 'Authentication required for batch calculations' } },
        { status: 401 },
      );
    }

    // Rate limit — each calculation in the batch counts as one request
    const ip = getClientIp(request.headers);

    const body: BatchRequestBody = await request.json();

    if (!body.calculations || !Array.isArray(body.calculations)) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4003', message: 'Missing calculations array' } },
        { status: 400 },
      );
    }

    if (body.calculations.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4003', message: 'Empty calculations array' } },
        { status: 400 },
      );
    }

    if (body.calculations.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ESVA-4006',
            message: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}. Received: ${body.calculations.length}`,
          },
        },
        { status: 400 },
      );
    }

    // Count each calculation against the rate limit
    for (let i = 0; i < body.calculations.length; i++) {
      const rl = checkRateLimit(ip, 'calculate');
      if (!rl.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'ESVA-4002',
              message: `Rate limit exceeded at calculation ${i + 1} of ${body.calculations.length}`,
              retryAfter: rl.retryAfter,
            },
          },
          {
            status: 429,
            headers: { 'Retry-After': String(rl.retryAfter ?? 60) },
          },
        );
      }
    }

    // Execute all calculations in parallel
    const settled = await Promise.allSettled(
      body.calculations.map((calc, index) => executeSingle(calc, index)),
    );

    // Collect results
    const results: BatchResultItem[] = settled.map((outcome, index) => {
      if (outcome.status === 'fulfilled') {
        return outcome.value;
      }
      return {
        index,
        success: false,
        error: {
          code: 'ESVA-4999',
          message: outcome.reason instanceof Error ? outcome.reason.message : 'Unexpected error',
        },
      };
    });

    // Build summary
    const passed = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const errors = results
      .filter((r) => !r.success && r.error)
      .map((r) => `[${r.index}] ${r.error!.message}`);

    const summary: BatchSummary = {
      total: results.length,
      passed,
      failed,
      errors,
    };

    return NextResponse.json(
      { success: true, data: { results, summary } },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ESVA /api/calculate/batch] Error:', message);

    return NextResponse.json(
      { success: false, error: { code: 'ESVA-4999', message: 'Internal batch calculation error' } },
      { status: 500 },
    );
  }
}
