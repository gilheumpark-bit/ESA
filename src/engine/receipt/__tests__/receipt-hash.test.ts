import { generateReceipt, type GenerateReceiptOpts } from '../receipt-generator';
import { hashReceipt, verifyReceipt, claimFromReceipt } from '../receipt-hash';
import type { CalcResult } from '@engine/standards/types';

// ═══════════════════════════════════════════════════════════════════════════════
// 회귀 방지 — 영수증 해시가 판정(claim) 전체를 봉인하는가
//
// 이전: hashReceipt(inputs, result) — 적용 기준·조항·수식을 안 덮어
// KEC↔NEC로 바꿔도 해시가 불변 = 하나의 해시를 서로 다른 규격 주장에 재사용 가능.
// 이제: claim 전체(calcId·appliedStandard·standardVersion·unitSystem·inputs·
// result·steps·formulaUsed·standardsUsed·engineVersion)를 봉인.
// ═══════════════════════════════════════════════════════════════════════════════

const RESULT: CalcResult = { value: 2.79, unit: '%', source: [] };

function opts(overrides: Partial<GenerateReceiptOpts> = {}): GenerateReceiptOpts {
  return {
    calcId: 'voltage-drop',
    calcResult: RESULT,
    steps: [],
    formulaUsed: 'e = √3·I·L·(Rcosφ + Xsinφ)',
    standardsUsed: ['KEC 232.3.9'],
    inputs: { voltage: 380, current: 84.4, length: 100 },
    countryCode: 'KR',
    standard: 'KEC',
    standardVersion: '2021',
    difficulty: 'basic',
    ...overrides,
  };
}

describe('영수증 해시 — claim 전체 봉인', () => {
  test('동일 claim → 동일 해시 (결정론)', async () => {
    const a = await generateReceipt(opts());
    const b = await generateReceipt(opts());
    expect(a.receiptHash).toBe(b.receiptHash);
  });

  test('genuine 영수증은 verifyReceipt 통과', async () => {
    const r = await generateReceipt(opts());
    expect(await verifyReceipt(r)).toBe(true);
  });

  test('적용 기준(KEC→NEC) 변조 시 해시가 달라지고 verify 실패 (핵심 위조 차단)', async () => {
    const genuine = await generateReceipt(opts({ standard: 'KEC' }));
    const nec = await generateReceipt(opts({ standard: 'NEC' }));
    expect(nec.receiptHash).not.toBe(genuine.receiptHash);

    // 기존 해시는 유지한 채 적용 기준만 바꿔치기 → verify 실패해야 함
    const tampered = { ...genuine, appliedStandard: 'NEC' };
    expect(await verifyReceipt(tampered)).toBe(false);
  });

  test('참조 조항(standardsUsed) 변조 시 해시가 달라진다', async () => {
    const a = await generateReceipt(opts({ standardsUsed: ['KEC 232.3.9'] }));
    const b = await generateReceipt(opts({ standardsUsed: ['KEC 999.9.9'] }));
    expect(a.receiptHash).not.toBe(b.receiptHash);
  });

  test('수식(formulaUsed) 변조 시 verify 실패', async () => {
    const genuine = await generateReceipt(opts());
    const tampered = { ...genuine, formulaUsed: 'e = wrong' };
    expect(await verifyReceipt(tampered)).toBe(false);
  });

  test('입력·결과는 여전히 봉인 대상', async () => {
    const genuine = await generateReceipt(opts());
    expect(await verifyReceipt({ ...genuine, inputs: { voltage: 999 } })).toBe(false);
    expect(await verifyReceipt({ ...genuine, result: { value: 99, unit: '%', source: [] } })).toBe(false);
  });

  test('claimFromReceipt 왕복 = 원 해시', async () => {
    const r = await generateReceipt(opts());
    expect(await hashReceipt(claimFromReceipt(r))).toBe(r.receiptHash);
  });
});
