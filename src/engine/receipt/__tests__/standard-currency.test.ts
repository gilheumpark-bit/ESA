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
  // `KEC 조항번호 … 대조` 는 2026-07-27 에 바뀐 실제 판본 문자열이다.
  // 조항 번호를 현행 전문에 대조했다고 해서 판본이 "현행" 이 되는 것은
  // 아니다 — 임계값은 검증하지 않았다. 그 구분을 여기서 못박는다.
  it.each([
    'KEC 2021',
    'KEC 조항번호 시행 2026.1.5 대조 (임계값 미검증)',
    'NEC 2023',
    'IEC 60364:2017',
    'UNKNOWN 2099',
  ])(
    'does not label an unverified or superseded snapshot as current: %s',
    async (standardVersion) => {
      const receipt = await generateReceipt(options(standardVersion));
      expect(receipt.isStandardCurrent).toBe(false);
      expect(receipt.standardVerifiedAt).toBeUndefined();
    },
  );
});
