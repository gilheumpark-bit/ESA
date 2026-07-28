import { ENGINE_VERSION, hashReceipt, claimFromReceipt, generateReceipt } from '@engine/receipt';
import type { Receipt } from '@engine/receipt';
import {
  executeRegisteredCalculator,
  validateClientReceiptForExport,
} from '../calculation-execution';

/**
 * **엔진 판이 바뀐 옛 영수증을 "위조" 로 부르지 않는다.**
 *
 * 내보내기 검증은 입력을 재실행해 claim 전체를 대조한다. 그런데 claim 에
 * `engineVersion` 이 들어 있어 — 값이 하나도 안 바뀌었어도 — **판이 다르면
 * 무조건 불일치**다. 그리고 그 결과가 `REPLAY_MISMATCH` 로 나갔다:
 *
 *   "ESVA-5012: Receipt verification failed (REPLAY_MISMATCH)"
 *
 * 사용자에게는 내보내기 거부로만 보이고, 그 문장은 자기 영수증이 의심받는
 * 것처럼 읽힌다. 실제로는 **우리가 엔진을 바꾼 것**이다(2026-07-28: KEC PVC
 * 최고허용온도 60 → 70°C 수리로 표 밖 온도의 보정계수가 −5.8% 달라졌고,
 * 폼 하한이 −20°C 라 저온은 정상 사용자 경로다). 독립 심사 백엔드 좌석 지적.
 *
 * 통과시키지는 않는다 — 옛 판으로 재실행할 수 없으니 **확인 못 한 것**이다.
 * 사유만 정확히 말한다.
 */

const INPUTS = {
  loads: [{ name: 'A', ratedPower: 10, demandFactor: 0.8 }],
  diversityFactor: 1.2,
} as const;

/**
 * 실제 경로로 영수증을 만든다 — 손으로 지으면 형태가 어긋난다.
 * `/api/calculate` 가 `generateReceipt` 에 넘기는 것과 같은 모양으로 짠다.
 */
async function realReceipt(): Promise<Receipt> {
  const exec = executeRegisteredCalculator('max-demand', INPUTS as never, 'KR');
  const r = exec.result;
  return generateReceipt({
    calcId: exec.entry.id,
    calcResult: r,
    steps: r.steps,
    formulaUsed: r.formula,
    standardsUsed: r.steps.map((s) => s.standardRef).filter((x): x is string => !!x),
    inputs: INPUTS as unknown as Record<string, unknown>,
    countryCode: 'KR',
    standard: exec.standard,
    standardVersion: exec.standardVersion,
    unitSystem: exec.unitSystem,
    difficulty: exec.entry.difficulty,
  });
}

/** 옛 판으로 발급된 영수증 — 해시는 그 판 기준으로 유효하다. */
async function asOldEngine(receipt: Receipt, version: string): Promise<Receipt> {
  const old = { ...receipt, engineVersion: version };
  return { ...old, receiptHash: await hashReceipt(claimFromReceipt(old)) };
}

describe('내보내기 검증 — 엔진 판 드리프트', () => {
  it('현재 판 영수증은 통과한다 — 이 검사가 상수 false 가 아님', async () => {
    const r = await validateClientReceiptForExport(await realReceipt());
    expect(r).toEqual({ valid: true });
  });

  it('옛 판 영수증은 REPLAY_MISMATCH 가 아니라 ENGINE_VERSION_DRIFT 다', async () => {
    const old = await asOldEngine(await realReceipt(), '0.1.0');
    const r = await validateClientReceiptForExport(old);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('ENGINE_VERSION_DRIFT');
  });

  /**
   * 판을 구분한다고 해서 위조 탐지가 약해지면 안 된다. 판은 현재와 같은데
   * 결과만 바꿔치기한 영수증은 계속 잡혀야 한다.
   */
  it('현재 판인데 결과가 바뀐 영수증은 계속 막힌다', async () => {
    const base = await realReceipt();
    const forged = { ...base, result: { ...base.result, value: 99999 } };
    const withHash = { ...forged, receiptHash: await hashReceipt(claimFromReceipt(forged)) };
    const r = await validateClientReceiptForExport(withHash);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('REPLAY_MISMATCH');
  });

  /** 해시를 안 맞춘 손댄 영수증은 재실행까지 가기 전에 잡힌다. */
  it('해시가 안 맞으면 CHECKSUM_MISMATCH 다', async () => {
    const base = await realReceipt();
    const r = await validateClientReceiptForExport({ ...base, engineVersion: '0.1.0' });
    expect(r.reason).toBe('CHECKSUM_MISMATCH');
  });

  /**
   * 판 번호를 올리는 것을 잊지 않도록 — 이 검사는 값이 아니라 **규율**을
   * 지킨다. 값이 달라졌는데 번호가 그대로면 옛 영수증이 전부 위조로 보인다.
   */
  it('엔진 판은 0.1.0 이 아니다 — PVC 60→70 수리 후 올렸다', () => {
    expect(ENGINE_VERSION).not.toBe('0.1.0');
  });
});
