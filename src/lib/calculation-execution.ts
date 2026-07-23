import { CALCULATOR_REGISTRY } from '@engine/calculators';
import { CalcValidationError, type CalculatorRegistryEntry, type DetailedCalcResult } from '@engine/calculators/types';
import { setActiveCountry } from '@engine/calculators/country-defaults';
import { convertInputsToSI, convertResultToImperial, appendAwgEquivalent } from '@engine/conversion/imperial-adapter';
import { ENGINE_VERSION, canonicalize, claimFromReceipt, verifyReceipt } from '@engine/receipt';
import type { Receipt, ReceiptClaim, UnitSystem } from '@engine/receipt';
import { getSafetyProfile, type CountryCode } from '@engine/constants/safety-factors';

const EXECUTABLE_COUNTRIES = new Set<CountryCode>(['KR', 'US', 'JP', 'INT']);

export const COUNTRY_STANDARD_MAP: Readonly<Record<'KR' | 'US' | 'JP' | 'INT', { standard: string; version: string }>> = {
  KR: { standard: 'KEC', version: 'KEC 2021' },
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
  reason?: 'MALFORMED' | 'CHECKSUM_MISMATCH' | 'UNSUPPORTED_CLAIM' | 'REPLAY_MISMATCH';
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
    return replayMatches
      ? { valid: true }
      : { valid: false, reason: 'REPLAY_MISMATCH' };
  } catch {
    return { valid: false, reason: 'MALFORMED' };
  }
}
