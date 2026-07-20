import { generateReceipt, type GenerateReceiptOpts } from '../receipt-generator';

function options(standardVersion: string): GenerateReceiptOpts {
  return {
    calcId: 'single-phase-power',
    calcResult: { value: 100, unit: 'W', source: [] },
    steps: [],
    formulaUsed: 'P = VI',
    standardsUsed: [],
    inputs: { voltage: 100, current: 1 },
    countryCode: 'KR',
    standard: 'KEC',
    standardVersion,
    difficulty: 'basic',
  };
}

describe('receipt standard currency claims', () => {
  it.each(['KEC 2021', 'NEC 2023', 'IEC 60364:2017', 'UNKNOWN 2099'])(
    'does not label an unverified or superseded snapshot as current: %s',
    async (standardVersion) => {
      const receipt = await generateReceipt(options(standardVersion));
      expect(receipt.isStandardCurrent).toBe(false);
      expect(receipt.standardVerifiedAt).toBeUndefined();
    },
  );
});
