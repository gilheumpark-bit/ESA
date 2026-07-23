import { generateReceipt } from '@engine/receipt';
import {
  COUNTRY_STANDARD_MAP,
  executeRegisteredCalculator,
  validateClientReceiptForExport,
} from '../calculation-execution';
import { CALCULATION_COUNTRIES } from '@/hooks/useSettings';

const INPUTS = { voltage: 230, current: 10, powerFactor: 0.9 };

async function makeReceipt(overrides: { resultValue?: number; countryCode?: string } = {}) {
  const execution = executeRegisteredCalculator(
    'single-phase-power',
    INPUTS,
    overrides.countryCode ?? 'KR',
  );
  const result = overrides.resultValue === undefined
    ? execution.result
    : { ...execution.result, value: overrides.resultValue };

  return generateReceipt({
    calcId: execution.entry.id,
    calcResult: result,
    steps: result.steps,
    formulaUsed: result.formula,
    standardsUsed: result.steps
      .map((step) => step.standardRef)
      .filter((ref): ref is string => Boolean(ref)),
    inputs: INPUTS,
    countryCode: execution.countryCode,
    standard: execution.standard,
    standardVersion: execution.standardVersion,
    unitSystem: execution.unitSystem,
    difficulty: execution.entry.difficulty,
  });
}

describe('calculation execution and anonymous export replay', () => {
  test('genuine server-engine claim is accepted', async () => {
    expect(await validateClientReceiptForExport(await makeReceipt())).toEqual({ valid: true });
  });

  test('rejects a forged result even when the attacker recomputed the keyless checksum', async () => {
    const forgedButChecksumValid = await makeReceipt({ resultValue: 999_999 });
    expect(await validateClientReceiptForExport(forgedButChecksumValid)).toEqual({
      valid: false,
      reason: 'REPLAY_MISMATCH',
    });
  });

  test('US execution records the actual Imperial unit system and NEC version', () => {
    const execution = executeRegisteredCalculator('single-phase-power', INPUTS, 'US');
    expect(execution.unitSystem).toBe('Imperial');
    expect(execution.standard).toBe('NEC');
    expect(execution.standardVersion).toBe('NEC 2023');
  });

  test('fails closed for countries without an embedded calculation profile', () => {
    expect(() => executeRegisteredCalculator('single-phase-power', INPUTS, 'CN'))
      .toThrow('Calculation profile is not available');
  });

  test('settings exposes exactly the countries wired to calculator profiles', () => {
    expect([...CALCULATION_COUNTRIES].sort()).toEqual(Object.keys(COUNTRY_STANDARD_MAP).sort());
  });
});
