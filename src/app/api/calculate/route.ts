/**
 * ESVA Calculator API — /api/calculate
 * ─────────────────────────────────────
 * POST: Execute a calculator, generate receipt, optionally persist.
 *
 * PART 1: Request/response types
 * PART 2: Tier validation
 * PART 3: Calculator execution
 * PART 4: Receipt generation & persistence
 */

import { NextRequest } from 'next/server';
import { logAudit } from '@/lib/audit-log';
import { getDefaultTenantId } from '@/lib/esa-config';
import { jsonWithEsa } from '@/lib/esa-http';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { CALCULATOR_REGISTRY } from '@engine/calculators';
import { CalcValidationError } from '@engine/calculators/types';
import { executeQuery, type StructuredQuery } from '@engine/standards/kec/kec-table-query';
import { generateReceipt } from '@engine/receipt';
import type { GenerateReceiptOpts } from '@engine/receipt';
import { checkCalcAccess, type Tier, type CalcDifficulty } from '@/lib/tier-gate';
import { getUserTier, listUserCalculations, saveCalculation } from '@/lib/supabase';
import { sanitizeInput } from '@/lib/security-hardening';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { executeRegisteredCalculator } from '@/lib/calculation-execution';
import { withRequestLog } from '@/lib/api/with-request-log';

// ─── PART 1: Request Types ──────────────────────────────────────

interface CalculateRequestBody {
  calculatorId: string;
  inputs: Record<string, unknown>;
  countryCode?: string;
  language?: 'ko' | 'en';
}

// ─── PART 2: Auth Token Extraction ──────────────────────────────
// Uses shared extractVerifiedUserId from @/lib/auth-helpers

// ─── PART 3: Difficulty → Tier Mapping ──────────────────────────

const DIFFICULTY_TO_CALC_DIFFICULTY: Record<string, CalcDifficulty> = {
  basic: 'basic',
  intermediate: 'intermediate',
  advanced: 'advanced',
  expert: 'expert',
};

// ─── PART 5: GET persistent history ────────────────────────────

async function GET__impl(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = checkRateLimit(ip, 'default');
  if (!rl.allowed) {
    return jsonWithEsa(
      {
        success: false,
        error: {
          code: 'ESVA-4002',
          // 이 문구는 계산기 화면에 그대로 렌더된다(useCalculator 가 API message 를
          // 그대로 error 로 넘긴다). 정상 사용 중에도 뜨는 메시지라 한국어로 쓴다.
          message: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
        },
      },
      { status: 429 },
    );
  }

  const userId = await extractVerifiedUserId(request);
  if (!userId) {
    return jsonWithEsa(
      { success: false, error: { code: 'ESVA-1001', message: 'Authentication required' } },
      { status: 401 },
    );
  }

  const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1);
  const requestedPageSize = Number.parseInt(request.nextUrl.searchParams.get('pageSize') ?? '20', 10) || 20;
  const pageSize = Math.min(100, Math.max(1, requestedPageSize));
  const result = await listUserCalculations(userId, { page, pageSize });

  return jsonWithEsa(
    { success: true, data: result },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

// ─── PART 6: POST Handler ───────────────────────────────────────

async function POST__impl(request: NextRequest) {
  try {
    // Rate limit
    const ip = getClientIp(request.headers);
    const rl = checkRateLimit(ip, 'calculate');
    if (!rl.allowed) {
      return jsonWithEsa(
        {
          success: false,
          error: {
            code: 'ESVA-4002',
            message: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
            retryAfter: rl.retryAfter,
          },
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfter ?? 60) },
        },
      );
    }

    // Parse body + sanitize
    const raw = await request.json().catch(() => null);
    // 깨진 JSON·빈 본문은 호출자 잘못이다. 던지게 두면 바깥 catch 가
    // 500 으로 뭉개 "우리 잘못" 으로 보고된다(§ 정직 거부).
    if (!raw || typeof raw !== 'object') {
      return jsonWithEsa(
        { success: false, error: { code: 'ESVA-4002', message: 'Request body must be valid JSON' } },
        { status: 400 },
      );
    }
    const body = raw as CalculateRequestBody;
    if (body.calculatorId && typeof body.calculatorId === 'string') {
      body.calculatorId = sanitizeInput(body.calculatorId);
    }

    if (!body.calculatorId || typeof body.calculatorId !== 'string') {
      return jsonWithEsa(
        { success: false, error: { code: 'ESVA-4003', message: 'Missing calculatorId' } },
        { status: 400 },
      );
    }

    if (!body.inputs || typeof body.inputs !== 'object') {
      return jsonWithEsa(
        { success: false, error: { code: 'ESVA-4004', message: 'Missing or invalid inputs' } },
        { status: 400 },
      );
    }

    // KEC 구조화 쿼리 라우팅 (ampacity/min_cable_size/breaker/voltage_drop)
    const KEC_QUERY_TYPES = ['ampacity', 'min_cable_size', 'breaker', 'voltage_drop'];
    if (KEC_QUERY_TYPES.includes(body.calculatorId)) {
      const queryResult = executeQuery({
        type: body.calculatorId as StructuredQuery['type'],
        params: body.inputs,
      });
      return jsonWithEsa({ success: queryResult.success, data: queryResult.data, source: queryResult.source, error: queryResult.error });
    }

    // Look up calculator
    const entry = CALCULATOR_REGISTRY.get(body.calculatorId);
    if (!entry) {
      return jsonWithEsa(
        { success: false, error: { code: 'ESVA-4005', message: `Unknown calculator: ${body.calculatorId}` } },
        { status: 404 },
      );
    }

    // Validate tier access (default to 'free' for anonymous)
    const userId = await extractVerifiedUserId(request);
    const userTier: Tier = userId ? await getUserTier(userId) : 'free';
    const calcDifficulty = DIFFICULTY_TO_CALC_DIFFICULTY[entry.difficulty] ?? 'basic';
    const access = checkCalcAccess(userTier, calcDifficulty, body.language ?? 'ko');

    if (!access.allowed) {
      return jsonWithEsa(
        {
          success: false,
          error: {
            code: 'ESVA-2001',
            message: access.reason ?? 'Upgrade required',
            requiredTier: access.requiredTier,
          },
        },
        { status: 403 },
      );
    }

    const execution = executeRegisteredCalculator(
      entry.id,
      body.inputs,
      body.countryCode ?? 'KR',
    );
    const { result: calcResult, countryCode, unitSystem } = execution;

    // Generate receipt
    const receiptOpts: GenerateReceiptOpts = {
      calcId: entry.id,
      calcResult,
      steps: calcResult.steps,
      formulaUsed: calcResult.formula,
      standardsUsed: calcResult.steps
        .map((s) => s.standardRef)
        .filter((ref): ref is string => !!ref),
      inputs: body.inputs,
      countryCode,
      standard: execution.standard,
      standardVersion: execution.standardVersion,
      unitSystem,
      difficulty: entry.difficulty,
      userId: userId ?? undefined,
      lang: (body.language ?? 'ko') as 'ko' | 'en',
    };

    const receipt = await generateReceipt(receiptOpts);

    const clientIp = getClientIp(request.headers);
    void logAudit({
      tenantId: getDefaultTenantId(),
      userId: userId ?? 'anonymous',
      action: 'calc.execute',
      resource: entry.id,
      resourceId: receipt.id,
      details: {
        calculatorId: entry.id,
        countryCode,
        receiptHash: receipt.receiptHash,
      },
      ip: clientIp,
    }).catch(() => undefined);

    // Save to Supabase if user is authenticated
    if (userId) {
      try {
        await saveCalculation(userId, {
          id: receipt.id,
          calculator_id: entry.id,
          calculator_name: entry.name,
          inputs: body.inputs,
          outputs: calcResult as unknown as Record<string, unknown>,
          formula_used: calcResult.formula,
          standard_ref: execution.standardVersion,
          lang: body.language ?? 'ko',
          receipt_hash: receipt.receiptHash,
          country_code: receipt.countryCode,
          applied_standard: receipt.appliedStandard,
          unit_system: receipt.unitSystem,
          difficulty_level: receipt.difficultyLevel,
          steps: receipt.steps,
          standards_used: receipt.standardsUsed,
          warnings: receipt.warnings,
          recommendations: receipt.recommendations,
          disclaimer_text: receipt.disclaimerText,
          disclaimer_version: receipt.disclaimerVersion,
          calculated_at: receipt.calculatedAt,
          standard_version: receipt.standardVersion,
          standard_verified_at: receipt.standardVerifiedAt,
          engine_version: receipt.engineVersion,
          is_standard_current: receipt.isStandardCurrent,
          is_public: receipt.isPublic,
          metadata: {
            receiptId: receipt.id,
            receiptHash: receipt.receiptHash,
            calcId: receipt.calcId,
            appliedStandard: receipt.appliedStandard,
            standardVersion: receipt.standardVersion,
            unitSystem: receipt.unitSystem,
            inputs: receipt.inputs,
            result: receipt.result,
            steps: receipt.steps,
            formulaUsed: receipt.formulaUsed,
            standardsUsed: receipt.standardsUsed,
            engineVersion: receipt.engineVersion,
          },
        });
      } catch (saveErr) {
        // Non-blocking: log but don't fail the response
        console.warn('[ESVA /api/calculate] Save failed:', saveErr);
      }
    }

    // Build related calculators
    const relatedCalculators = Array.from(CALCULATOR_REGISTRY.values())
      .filter((c) => c.category === entry.category && c.id !== entry.id)
      .slice(0, 3)
      .map((c) => ({ id: c.id, name: c.name, nameEn: c.nameEn, category: c.category }));

    return jsonWithEsa(
      {
        success: true,
        data: {
          result: calcResult,
          receipt,
          relatedCalculators,
        },
      },
      {
        status: 200,
        headers: { 'X-RateLimit-Remaining': String(rl.remaining) },
      },
    );
  } catch (err) {
    // Handle calculator validation errors distinctly
    if (err instanceof CalcValidationError) {
      return jsonWithEsa(
        // `field` 를 함께 싣는다. 앞서 `{code, message}` 만 보내고 버렸는데,
        // 계산기가 어느 칸이 문제인지 이미 알고 있으면서 화면은 그걸 못 받아
        // 아무 칸도 짚지 못했다 — 422 로 바꾼 목적의 절반이 여기서 끊겨 있었다
        // (2026-07-28 독립 심사 백엔드 좌석).
        { success: false, error: { code: 'ESVA-4010', message: err.message, field: err.field } },
        { status: 422 },
      );
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ESVA /api/calculate] Error:', message);

    return jsonWithEsa(
      { success: false, error: { code: 'ESVA-4999', message: 'Internal calculation error' } },
      { status: 500 },
    );
  }
}

export const GET = withRequestLog(GET__impl);
export const POST = withRequestLog(POST__impl);
