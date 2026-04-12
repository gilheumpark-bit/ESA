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
import { saveCalculation } from '@/lib/supabase';
import { sanitizeInput } from '@/lib/security-hardening';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { setActiveCountry } from '@/engine/calculators/country-defaults';
import { convertInputsToSI, convertResultToImperial, appendAwgEquivalent } from '@/engine/conversion/imperial-adapter';
import { getSafetyProfile } from '@/engine/constants/safety-factors';
import type { CountryCode } from '@/engine/constants/safety-factors';

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

// ─── PART 4: Standard Lookup ────────────────────────────────────

const COUNTRY_STANDARD_MAP: Record<string, { standard: string; version: string }> = {
  KR: { standard: 'KEC', version: 'KEC 2021' },
  US: { standard: 'NEC', version: 'NEC 2023' },
  JP: { standard: 'JIS', version: 'JIS C 0364:2019' },
  CN: { standard: 'GB', version: 'GB 50054-2011' },
  DE: { standard: 'VDE', version: 'IEC 60364:2017' },
  AU: { standard: 'AS/NZS', version: 'AS/NZS 3000:2018' },
  ME: { standard: 'DEWA', version: 'DEWA 2020' },
};

// ─── PART 5: POST Handler ───────────────────────────────────────

export async function POST(request: NextRequest) {
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
            message: 'Rate limit exceeded',
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
    const body: CalculateRequestBody = await request.json();
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
    const userTier: Tier = 'free'; // In production, look up user's tier from DB
    const calcDifficulty = DIFFICULTY_TO_CALC_DIFFICULTY[entry.difficulty] ?? 'basic';
    const access = checkCalcAccess(userTier, calcDifficulty);

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

    // Determine country/standard + set active country for safety factor defaults
    const countryCode = (body.countryCode ?? 'KR') as CountryCode;
    const safetyProfile = getSafetyProfile(countryCode in { KR: 1, US: 1, JP: 1, INT: 1 } ? countryCode : 'KR');
    setActiveCountry(safetyProfile.country);

    // Imperial → SI 입력 변환 (미국 시장 지원)
    const unitSystem = safetyProfile.unitSystem;
    const { converted: siInputs, conversions } = convertInputsToSI(body.inputs, unitSystem);

    // Execute calculator (항상 SI 단위로 실행)
    let calcResult = entry.calculator(siInputs);

    // SI → Imperial 출력 변환 (필요 시)
    if (unitSystem === 'Imperial') {
      calcResult = convertResultToImperial(calcResult);
    }
    // mm² 결과에 AWG 등가 표시 추가 (미국 시장)
    if (countryCode === 'US') {
      calcResult = appendAwgEquivalent(calcResult);
    }
    // 변환 이력을 경고에 추가
    if (conversions.length > 0) {
      calcResult = { ...calcResult, warnings: [...(calcResult.warnings || []), `[Unit Conversion] ${conversions.join('; ')}`] };
    }
    const stdInfo = COUNTRY_STANDARD_MAP[countryCode] ?? COUNTRY_STANDARD_MAP.KR;

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
      standard: stdInfo.standard,
      standardVersion: stdInfo.version,
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
          calculator_id: entry.id,
          calculator_name: entry.name,
          inputs: body.inputs,
          outputs: calcResult as unknown as Record<string, unknown>,
          formula_used: calcResult.formula,
          standard_ref: stdInfo.version,
          lang: body.language ?? 'ko',
          metadata: { receiptId: receipt.id },
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
        { success: false, error: { code: 'ESVA-4010', message: err.message } },
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
