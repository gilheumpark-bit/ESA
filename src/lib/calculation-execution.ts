import { CALCULATOR_REGISTRY } from '@engine/calculators';
import { CalcValidationError, type CalculatorRegistryEntry, type DetailedCalcResult } from '@engine/calculators/types';
import { setActiveCountry } from '@engine/calculators/country-defaults';
import { convertInputsToSI, convertResultToImperial, appendAwgEquivalent } from '@engine/conversion/imperial-adapter';
import { ENGINE_VERSION, canonicalize, claimFromReceipt, verifyReceipt } from '@engine/receipt';
import type { Receipt, ReceiptClaim, UnitSystem } from '@engine/receipt';
import { getSafetyProfile, type CountryCode } from '@engine/constants/safety-factors';

const EXECUTABLE_COUNTRIES = new Set<CountryCode>(['KR', 'US', 'JP', 'INT']);

/**
 * 계산 결과·영수증·PDF 에 찍히는 판본 문자열.
 *
 * KR 이 `KEC 2021` 이었는데 2026-07-27 에 **조항 번호·표제를 현행 전문
 * (시행 2026.1.5)에 전수 대조**했다. 번호는 그 판본 기준이다.
 *
 * 다만 `KEC 2026` 이라고 쓰면 과장이다 — 대조한 것은 번호와 표제뿐이고
 * **임계값(수치)은 검증하지 않았다.** 확보한 원문 색인에 본문이 없다.
 * 그래서 무엇을 대조했는지까지 문자열에 적는다.
 *
 * 영수증은 이와 별개로 `isStandardCurrent: false` 를 유지한다
 * (`receipt-generator` 의 허용 목록이 의도적으로 비어 있다) — 판본을
 * "현행" 으로 주장하지 않는다.
 */
export const COUNTRY_STANDARD_MAP: Readonly<Record<'KR' | 'US' | 'JP' | 'INT', { standard: string; version: string }>> = {
  KR: { standard: 'KEC', version: 'KEC 조항번호 시행 2026.1.5 대조 (임계값 미검증)' },
  US: { standard: 'NEC', version: 'NEC 2023' },
  JP: { standard: 'JIS', version: 'JIS C 0364:2019' },
  INT: { standard: 'IEC', version: 'IEC 60364' },
};

export interface CalculationExecution {
  entry: CalculatorRegistryEntry;
  result: DetailedCalcResult;
  countryCode: 'KR' | 'US' | 'JP' | 'INT';
  standard: string;
  standardVersion: string;
  unitSystem: UnitSystem;
}

/**
 * Execute one registered calculator through the same country/unit pipeline used
 * by calculation receipts and anonymous exports. Countries without an embedded
 * safety profile fail closed instead of being calculated with KR defaults and
 * labelled as a different national standard.
 */
export function executeRegisteredCalculator(
  calculatorId: string,
  inputs: Record<string, unknown>,
  requestedCountry: string = 'KR',
): CalculationExecution {
  const entry = CALCULATOR_REGISTRY.get(calculatorId);
  if (!entry) {
    throw new CalcValidationError('calculatorId', `Unknown calculator: ${calculatorId}`);
  }

  if (!EXECUTABLE_COUNTRIES.has(requestedCountry as CountryCode)) {
    throw new CalcValidationError(
      'countryCode',
      `Calculation profile is not available for country: ${requestedCountry}`,
    );
  }

  const countryCode = requestedCountry as CalculationExecution['countryCode'];
  const safetyProfile = getSafetyProfile(countryCode);
  setActiveCountry(safetyProfile.country);

  const unitSystem = safetyProfile.unitSystem;
  const { converted: siInputs, conversions } = convertInputsToSI(inputs, unitSystem);
  let result = entry.calculator(siInputs);

  if (unitSystem === 'Imperial') {
    result = convertResultToImperial(result);
  }
  if (countryCode === 'US') {
    result = appendAwgEquivalent(result);
  }
  if (conversions.length > 0) {
    result = {
      ...result,
      warnings: [...(result.warnings ?? []), `[Unit Conversion] ${conversions.join('; ')}`],
    };
  }

  const standard = COUNTRY_STANDARD_MAP[countryCode];
  return {
    entry,
    result,
    countryCode,
    standard: standard.standard,
    standardVersion: standard.version,
    unitSystem,
  };
}

function expectedClaim(receipt: Receipt, execution: CalculationExecution): ReceiptClaim {
  return {
    calcId: execution.entry.id,
    appliedStandard: execution.standard,
    standardVersion: execution.standardVersion,
    unitSystem: execution.unitSystem,
    inputs: receipt.inputs,
    result: execution.result,
    steps: execution.result.steps,
    formulaUsed: execution.result.formula,
    standardsUsed: execution.result.steps
      .map((step) => step.standardRef)
      .filter((ref): ref is string => Boolean(ref)),
    engineVersion: ENGINE_VERSION,
  };
}

export interface ClientReceiptValidation {
  valid: boolean;
  reason?:
    | 'MALFORMED'
    | 'CHECKSUM_MISMATCH'
    | 'UNSUPPORTED_CLAIM'
    | 'REPLAY_MISMATCH'
    /**
     * 재실행 값이 다르고 **영수증의 엔진 판이 현재와 다르다** — 우리가 식을
     * 바꾼 것이지 영수증이 위조된 것이 아니다. 둘을 뭉뚱그리면 사용자는
     * 자기 영수증이 의심받는다고 읽는다(2026-07-28 독립 심사 백엔드 좌석).
     *
     * 그래도 통과시키지는 않는다 — 옛 판으로는 재실행할 수 없으니 **확인
     * 못 한 것**이고, 확인 못 한 것을 확인된 것처럼 내보내는 게 이 제품이
     * 하지 않기로 한 일이다. 다만 사유를 정확히 말한다.
     */
    | 'ENGINE_VERSION_DRIFT';
}

/**
 * A client can recompute the keyless checksum, so checksum verification alone
 * is not authenticity. Replaying the embedded inputs with the server engine and
 * comparing the full claim prevents a forged result/standard from being
 * exported as an ESA calculation receipt.
 */
export async function validateClientReceiptForExport(
  receipt: Receipt,
): Promise<ClientReceiptValidation> {
  try {
    if (
      !receipt
      || typeof receipt !== 'object'
      || typeof receipt.calcId !== 'string'
      || typeof receipt.countryCode !== 'string'
      || !receipt.inputs
      || typeof receipt.inputs !== 'object'
      || canonicalize(receipt).length > 1_000_000
    ) {
      return { valid: false, reason: 'MALFORMED' };
    }

    if (!(await verifyReceipt(receipt))) {
      return { valid: false, reason: 'CHECKSUM_MISMATCH' };
    }

    let execution: CalculationExecution;
    try {
      execution = executeRegisteredCalculator(receipt.calcId, receipt.inputs, receipt.countryCode);
    } catch {
      return { valid: false, reason: 'UNSUPPORTED_CLAIM' };
    }

    if (receipt.difficultyLevel !== execution.entry.difficulty) {
      return { valid: false, reason: 'REPLAY_MISMATCH' };
    }

    const replayMatches = canonicalize(claimFromReceipt(receipt))
      === canonicalize(expectedClaim(receipt, execution));
    if (replayMatches) return { valid: true };

    // 값이 다를 때만 판을 본다 — 옛 판이어도 값이 그대로면 통과가 맞다.
    return receipt.engineVersion !== ENGINE_VERSION
      ? { valid: false, reason: 'ENGINE_VERSION_DRIFT' }
      : { valid: false, reason: 'REPLAY_MISMATCH' };
  } catch {
    return { valid: false, reason: 'MALFORMED' };
  }
}
