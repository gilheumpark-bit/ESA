import { getAmpacity } from '@/data/ampacity-tables/kec-ampacity';
import { getIecAmpacity } from '@/data/ampacity-tables/iec-ampacity';
import { getActiveCountry } from '../../country-defaults';
import { CalcValidationError } from '../../types';
import { lookupAmpacityByCountry, UI_TO_KEC_METHOD } from '../ampacity-basis';
import { calculateCableSizing } from '../cable-sizing';

/**
 * **한국 제품이면 허용전류도 KEC 표에서 나와야 한다.**
 *
 * 2026-07-28 사용자 지적("kec규정이지 한국이니깐"). 확인해 보니 케이블
 * 사이징만 IEC 표로 계산하고 있었다 — 같은 계산기의 전압강하 한도는 이미
 * KEC(`kecVoltageDropLimit`)였고, 도면 검토(`circuit-review`)도 KEC 표를
 * 쓰는데 계산기만 IEC 였다. 같은 질문에 두 화면이 다른 표로 답했다.
 *
 * 실측 대조에서 IEC 가 더 **가는 케이블**을 내줬다 — 한국 기준으로는
 * 규정 미달이다:
 *   · 125A XLPE (벽/트레이) : IEC 25mm² → **KEC 35mm²**
 *   · 100A XLPE (벽/트레이) : IEC 16mm² → **KEC 25mm²**
 */

describe('허용전류 기준 — 한국은 KEC', () => {
  it('기본 국가가 KR 이다 — 이 검사의 전제', () => {
    expect(getActiveCountry()).toBe('KR');
  });

  it('KR 에서는 KEC 표 값을 낸다', () => {
    const r = lookupAmpacityByCountry({
      size: 35, conductor: 'Cu', insulation: 'PVC', installation: 'C',
    });
    expect(r.basis).toBe('KEC');
    expect(r.standardRef).toMatch(/KEC 232\.3/);
    const kec = getAmpacity({ size: 35, conductor: 'Cu', insulation: 'PVC', installation: 'tray' });
    expect(r.ampacity).toBe(kec.ampacity);
  });

  it('IEC 값을 그대로 내지 않는다 — 두 표가 실제로 다른 자리에서', () => {
    const mine = lookupAmpacityByCountry({
      size: 35, conductor: 'Cu', insulation: 'PVC', installation: 'C',
    });
    const iec = getIecAmpacity({ size: 35, conductor: 'Cu', insulation: 'PVC', method: 'C' });
    expect(mine.ampacity).not.toBe(iec.ampacity);
    // 방향도 본다 — KEC 가 낮아야(보수적) 한다.
    expect(mine.ampacity).toBeLessThan(iec.ampacity);
  });

  /** conduit↔A1 은 두 표가 완전히 같다(전 굵기 35/35 실측) — 그 자리는 안 변한다. */
  it('A1(전선관)은 KEC·IEC 가 같아 값이 변하지 않는다', () => {
    for (const size of [16, 35, 95]) {
      const mine = lookupAmpacityByCountry({ size, conductor: 'Cu', insulation: 'XLPE', installation: 'A1' });
      const iec = getIecAmpacity({ size, conductor: 'Cu', insulation: 'XLPE', method: 'A1' });
      expect(mine.ampacity).toBe(iec.ampacity);
    }
  });

  it('세 선택지가 모두 KEC 공사방법으로 매핑된다', () => {
    expect(Object.keys(UI_TO_KEC_METHOD).sort()).toEqual(['A1', 'C', 'D']);
    expect(UI_TO_KEC_METHOD.A1).toBe('conduit');
    expect(UI_TO_KEC_METHOD.D).toBe('directBuried');
  });

  /**
   * **IEC 로 조용히 넘어가지 않는다.** 처음엔 매핑 없는 코드를 IEC 로
   * 계산했는데 기존 검사가 잡았다 — "정본 표가 없는 A2 는 근사계수로
   * 계산하지 않고 거부한다". 그 검사가 옳다.
   */
  it.each(['A2', 'B1', 'B2', 'E', 'F'])('KEC 대응이 없는 %s 는 거부한다', (m) => {
    expect(() => lookupAmpacityByCountry({
      size: 35, conductor: 'Cu', insulation: 'PVC', installation: m as never,
    })).toThrow(CalcValidationError);
  });

  /** 계산기 끝단까지 — 표만 바꾸고 계산기가 안 쓰면 의미가 없다(§2.4). */
  describe('계산기 결과가 실제로 KEC 기준이다', () => {
    const run = (current: number) => calculateCableSizing({
      current, length: 20, voltage: 380, conductor: 'Cu',
      insulation: 'XLPE', installation: 'C', phase: 3,
    });

    it('125A 는 35mm² 다 — IEC 로는 25mm² 였다', () => {
      expect(run(125).value).toBe(35);
    });

    it('100A 는 25mm² 다 — IEC 로는 16mm² 였다', () => {
      expect(run(100).value).toBe(25);
    });
  });

  it('화면 라벨이 IEC 를 기준으로 내세우지 않는다', () => {
    const params = require('@/lib/calculator-params') as { CALCULATOR_PARAMS: Record<string, Array<{ name: string; description: string }>> };
    const inst = params.CALCULATOR_PARAMS['cable-sizing']?.find((p) => p.name === 'installation');
    expect(inst).toBeDefined();
    expect(inst!.description).toMatch(/KEC/);
    expect(inst!.description).not.toMatch(/IEC 60364-5-52\)/);
  });
});
