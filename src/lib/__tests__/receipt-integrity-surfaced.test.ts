import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeReceiptIntegrity } from '@/lib/receipt-integrity';
import { hashReceipt } from '@engine/receipt/receipt-hash';
import type { CalculationReceipt } from '@/lib/supabase';

/**
 * 무결성 판정이 **화면까지 닿는지** 본다.
 *
 * 서버는 저장된 열로 해시를 다시 만들어 봉인 당시 값과 대조하고
 * (`computeReceiptIntegrity`), `/api/receipt/[id]` 응답에 `integrity` 로
 * 싣는다. 그런데 영수증 화면이 그 필드를 **읽지 않고 있었다** — 변조된
 * 영수증이 정상과 똑같이 보였다(2026-07-28 실측).
 *
 * 검증 로직이 옳은 것과 사용자가 그 결과를 보는 것은 다른 문제다.
 * 판정이 API 경계에서 멈추면 없는 것과 같다(§2.4 마지막 1마일).
 */
const REPO = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

const claim = {
  calcId: 'voltage-drop',
  appliedStandard: 'KEC',
  standardVersion: '2024',
  unitSystem: 'SI',
  inputs: { voltage: 380, current: 100, length: 50 },
  result: { value: 3.2, unit: '%', source: ['KEC 232.3.9'] },
  steps: [{ label: '전압강하', expression: 'e = ...', value: 3.2 }],
  formulaUsed: 'e = 30.8 × L × I / (1000 × A)',
  standardsUsed: ['KEC 232.3.9'],
  engineVersion: '0.2.0',
};

/** 봉인된 행을 만든다 — metadata 에 claim 전부, 열에는 중복분. */
async function sealedRow(overrides: Partial<CalculationReceipt> = {}): Promise<CalculationReceipt> {
  const receiptHash = await hashReceipt(claim as never);
  return {
    user_id: 'u1',
    calculator_id: claim.calcId,
    calculator_name: '전압 강하',
    inputs: claim.inputs,
    outputs: claim.result as unknown as Record<string, unknown>,
    formula_used: claim.formulaUsed,
    standard_ref: claim.standardVersion,
    metadata: { ...claim, receiptHash },
    ...overrides,
  } as CalculationReceipt;
}

describe('영수증 무결성 판정', () => {
  it('봉인 그대로면 VALID', async () => {
    expect(await computeReceiptIntegrity(await sealedRow())).toBe('VALID');
  });

  it('결과값을 바꾸면 TAMPERED — 이게 없으면 위 검사가 무의미하다', async () => {
    const row = await sealedRow();
    const meta = row.metadata as Record<string, unknown>;
    row.metadata = { ...meta, result: { value: 99, unit: '%', source: ['KEC 232.3.9'] } };
    row.outputs = { value: 99, unit: '%', source: ['KEC 232.3.9'] };
    expect(await computeReceiptIntegrity(row)).toBe('TAMPERED');
  });

  it('열과 metadata 가 어긋나면 TAMPERED — 한쪽만 고친 흔적', async () => {
    const row = await sealedRow();
    row.formula_used = 'e = 다른 공식';
    expect(await computeReceiptIntegrity(row)).toBe('TAMPERED');
  });

  it('봉인 항목이 없으면 UNVERIFIABLE — 변조로 몰지 않는다', async () => {
    const row = await sealedRow();
    const meta = { ...(row.metadata as Record<string, unknown>) };
    delete meta.engineVersion;
    row.metadata = meta;
    expect(await computeReceiptIntegrity(row)).toBe('UNVERIFIABLE');
  });
});

describe('판정이 화면까지 닿는가', () => {
  const page = 'src/app/(with-nav)/receipt/[id]/page.tsx';

  it('API 가 판정을 응답에 싣는다', () => {
    const route = read('src/app/api/receipt/[id]/route.ts');
    expect(route).toContain('computeReceiptIntegrity(row)');
    expect(route).toMatch(/integrity[:,]/);
  });

  it('화면이 그 필드를 읽는다', () => {
    const src = read(page);
    expect(src).toContain('receipt.integrity');
  });

  it('세 판정 모두 화면 표현을 갖는다 — 하나라도 빠지면 그 경우가 안 보인다', () => {
    const src = read(page);
    for (const verdict of ['VALID', 'TAMPERED', 'UNVERIFIABLE']) {
      expect(src).toContain(verdict);
    }
  });

  it('TAMPERED 는 단정하되 UNVERIFIABLE 은 변조로 말하지 않는다', () => {
    const src = read(page);
    expect(src).toContain('재계산 불일치');
    expect(src).toContain('변조 판정이 아닙니다');
  });
});
