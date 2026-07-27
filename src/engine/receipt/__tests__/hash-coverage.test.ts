import { claimFromReceipt, verifyReceipt } from '../receipt-hash';
import { generateReceipt, type GenerateReceiptOpts } from '../receipt-generator';
import type { Receipt } from '../types';

/**
 * 영수증 해시가 **무엇을 덮고 무엇을 안 덮는지** 못박는다.
 *
 * 화면은 이 해시를 「무결성 검증」 패널에 놓고 "결과의 무결성을 검증할 수
 * 있습니다" 라고 말한다. 그런데 봉인되는 것은 10 개 필드뿐이다 —
 * `warnings` · `recommendations` · `disclaimerText` · `calculatedAt` ·
 * `countryCode` · `isStandardCurrent` 는 밖이다.
 *
 * `calculatedAt` 이 밖인 것은 **옳다** — 시각은 재현되지 않으니 넣으면
 * "같은 입력 → 같은 해시" 가 깨진다. 문제는 그게 아니라, 같은 패널에
 * 봉인된 것과 안 된 것이 구분 없이 놓인다는 점이다. 특히
 * `isStandardCurrent`(현행 확인됨/미확인)는 해시 옆 칸에 있는데 봉인 밖이다.
 *
 * 봉인 범위를 넓히면 **기존에 저장된 영수증의 해시가 전부 바뀐다** — 이전
 * 영수증이 일제히 검증 실패한다. 그건 마이그레이션 결정이라 여기서 하지
 * 않는다. 대신 범위를 명시적으로 적어 두고, 바뀌면 눈에 띄게 한다.
 */

const SEALED = [
  'calcId',
  'appliedStandard',
  'standardVersion',
  'unitSystem',
  'inputs',
  'result',
  'steps',
  'formulaUsed',
  'standardsUsed',
  'engineVersion',
] as const;

/** 영수증에 있지만 해시 밖인 것 — 위조해도 검증이 통과한다. */
const UNSEALED = [
  'warnings',
  'recommendations',
  'disclaimerText',
  'disclaimerVersion',
  'calculatedAt',
  'countryCode',
  'isStandardCurrent',
] as const;

function opts(): GenerateReceiptOpts {
  return {
    calcId: 'single-phase-power',
    calcResult: { value: 100, unit: 'W', source: [] },
    steps: [],
    formulaUsed: 'P = VI',
    standardsUsed: [],
    inputs: { voltage: 100, current: 1 },
    countryCode: 'KR',
    standard: 'KEC',
    standardVersion: 'KEC 2021',
    difficulty: 'basic',
    warnings: ['안전 관련 주의 문구'],
  };
}

describe('영수증 해시가 덮는 범위', () => {
  it('봉인 대상이 선언과 같다 — 늘거나 줄면 기존 영수증의 해시가 바뀐다', async () => {
    const receipt = await generateReceipt(opts());
    expect(Object.keys(claimFromReceipt(receipt)).sort()).toEqual([...SEALED].sort());
  });

  it('정상 영수증은 검증을 통과한다', async () => {
    const receipt = await generateReceipt(opts());
    await expect(verifyReceipt(receipt)).resolves.toBe(true);
  });

  it('봉인된 값을 바꾸면 검증이 깨진다 — 안 깨지면 봉인이 아니다', async () => {
    const receipt = await generateReceipt(opts());
    const tampered: Receipt = {
      ...receipt,
      result: { ...receipt.result, value: 999 } as Receipt['result'],
    };
    await expect(verifyReceipt(tampered)).resolves.toBe(false);
  });

  /**
   * 이 단언은 **결함을 고정하는 것이 아니라 사실을 적어 두는 것**이다.
   * 봉인 밖 필드를 바꿔도 검증이 통과한다 — 그게 현재 설계다. 화면 문구가
   * 이 범위를 정확히 말해야 하는 이유이기도 하다.
   */
  it.each(UNSEALED)('%s 는 봉인 밖이다 — 바꿔도 검증이 통과한다', async (field) => {
    const receipt = await generateReceipt(opts());
    const altered = { ...receipt } as unknown as Record<string, unknown>;
    const current = (receipt as unknown as Record<string, unknown>)[field];
    altered[field] = field === 'isStandardCurrent'
      ? !receipt.isStandardCurrent
      : Array.isArray(current) ? [] : '변조됨';
    await expect(verifyReceipt(altered as unknown as Receipt)).resolves.toBe(true);
  });

  it('화면 문구가 봉인 범위를 뭉뚱그리지 않는다', () => {
    const page = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', '..', '..', 'app', '(with-nav)', 'receipt', '[id]', 'page.tsx'),
      'utf8',
    ) as string;
    // 해시가 덮지 않는 것이 있다는 사실을 화면이 말해야 한다.
    expect(page).toMatch(/해시에 포함되지 않|봉인 밖|포함되지 않습니다/);
  });
});
