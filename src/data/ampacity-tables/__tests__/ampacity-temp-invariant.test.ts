import { getAmpacity } from '../kec-ampacity';
import { getIecAmpacity } from '../iec-ampacity';
import { calculateTempCorrection } from '@/engine/calculators/global/temp-correction';

/**
 * 주변온도 보정을 **세 곳이 따로 들고 있다.**
 *
 *   ① KEC 표 (`kec-ampacity.ts` 의 `TEMP_CORRECTION`)
 *   ② IEC 표 (`iec-ampacity.ts` 의 `IEC_TEMP_CORRECTION`)
 *   ③ 공식 계산기 (`temp-correction.ts` 의 `√((Tmax−Ta)/(Tmax−30))`)
 *
 * 셋은 같은 물리를 적는다 — IEC 60364-5-52 Table B.52.14 의 값이 바로
 * 저 제곱근 식을 표로 만든 것이다(PVC 45°C: √(25/40) = 0.7906 → 표 0.79).
 * 그런데 **셋이 서로 같은지 검사하는 것이 없었다.**
 *
 * 그 사이로 두 번 샜다:
 *  · 2026-07-21 — KEC·IEC 표의 `xlpe90` 열이 PVC 값을 담아 XLPE 를 과소
 *    계산. 그때도 ③ 공식만 옳았고, 표는 손대조로만 고쳐졌다.
 *  · 2026-07-28 — KEC 폴백의 `tMax` 가 PVC 를 **60** 으로 봤다(열 이름이
 *    `pvc60` 이었다). 표 값은 70°C 기준인데 표 **밖**에서만 60 을 써서,
 *    주변 61°C 이상이면 계수 0 → "PVC 최대 온도 초과" 로 던졌다. 같은
 *    케이블을 IEC 경로는 65°C 에서 26.87A 로 정상 계산했다.
 *
 * 그래서 이 파일은 셋을 **식 하나에 함께 묶는다.** 어느 하나만 바뀌면 깨진다.
 */

/** 표준의 물리 관계. 이 파일이 대조본으로 삼는 유일한 정의. */
const factor = (tMax: number, ambient: number) => Math.sqrt((tMax - ambient) / (tMax - 30));

/** 열 이름의 숫자 = 도체 최고 허용온도. */
const TMAX = { PVC: 70, XLPE: 90 } as const;

describe('주변온도 보정 — 세 경로 불변식', () => {
  // 표가 덮는 구간(밴드 상한값을 쓰므로 밴드 상한 온도에서 대조한다)
  const inTable = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

  describe('① KEC 표가 식과 같다', () => {
    it.each(inTable)('PVC %d°C', (t) => {
      const got = getAmpacity({ size: 16, conductor: 'Cu', insulation: 'PVC', installation: 'conduit', ambientTemp: t });
      const kt = got.factors.find((f) => f.type === 'temperature')?.factor ?? 1;
      expect(kt).toBeCloseTo(factor(TMAX.PVC, t), 2);
    });

    it.each(inTable)('XLPE %d°C', (t) => {
      const got = getAmpacity({ size: 16, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit', ambientTemp: t });
      const kt = got.factors.find((f) => f.type === 'temperature')?.factor ?? 1;
      expect(kt).toBeCloseTo(factor(TMAX.XLPE, t), 2);
    });
  });

  describe('② IEC 표가 같은 식과 같다', () => {
    it.each(inTable)('PVC %d°C', (t) => {
      const got = getIecAmpacity({ size: 16, conductor: 'Cu', insulation: 'PVC', method: 'C', ambientTemp: t });
      const kt = got.factors.find((f) => f.type === 'temperature')?.factor ?? 1;
      expect(kt).toBeCloseTo(factor(TMAX.PVC, t), 2);
    });

    it.each(inTable)('XLPE %d°C', (t) => {
      const got = getIecAmpacity({ size: 16, conductor: 'Cu', insulation: 'XLPE', method: 'C', ambientTemp: t });
      const kt = got.factors.find((f) => f.type === 'temperature')?.factor ?? 1;
      expect(kt).toBeCloseTo(factor(TMAX.XLPE, t), 2);
    });
  });

  describe('③ 공식 계산기가 같은 식을 낸다', () => {
    it.each(inTable)('PVC %d°C', (t) => {
      const r = calculateTempCorrection({
        baseAmpacity: 100, referenceTemp: 30, actualTemp: t, maxConductorTemp: TMAX.PVC,
      });
      // 이 계산기의 `value` 는 **보정계수**다(unit 빈 문자열). 보정된 전류는
      // 4단계에 있다 — 처음에 4단계의 unit 'A' 를 결과 단위로 잘못 읽었다.
      expect(r.value).toBeCloseTo(factor(TMAX.PVC, t), 3);
      const step4 = r.steps.find((x) => x.step === 4);
      expect(step4?.unit).toBe('A');
      expect(step4?.value).toBeCloseTo(100 * factor(TMAX.PVC, t), 1);
    });
  });

  /**
   * **표 밖이 이 검사의 핵심이다.** 2026-07-28 결함이 정확히 여기 있었다 —
   * 표 안은 맞고 표 밖만 다른 Tmax 를 썼다. 표 안만 보는 검사는 통과한다.
   */
  describe('표 밖(10°C 미만 · 60°C 초과)에서도 셋이 같다', () => {
    const outOfTable = [0, 5, 9, 61, 65, 68];

    it.each(outOfTable)('KEC PVC %d°C 가 식과 같고 던지지 않는다', (t) => {
      const got = getAmpacity({ size: 16, conductor: 'Cu', insulation: 'PVC', installation: 'conduit', ambientTemp: t });
      const kt = got.factors.find((f) => f.type === 'temperature')?.factor ?? 1;
      expect(kt).toBeCloseTo(factor(TMAX.PVC, t), 3);
    });

    it.each(outOfTable)('IEC PVC %d°C 가 식과 같다', (t) => {
      const got = getIecAmpacity({ size: 16, conductor: 'Cu', insulation: 'PVC', method: 'C', ambientTemp: t });
      const kt = got.factors.find((f) => f.type === 'temperature')?.factor ?? 1;
      expect(kt).toBeCloseTo(factor(TMAX.PVC, t), 3);
    });

    it('두 표가 표 밖에서 서로 같은 계수를 낸다', () => {
      for (const t of outOfTable) {
        const kec = getAmpacity({ size: 16, conductor: 'Cu', insulation: 'PVC', installation: 'conduit', ambientTemp: t })
          .factors.find((f) => f.type === 'temperature')?.factor ?? 1;
        const iec = getIecAmpacity({ size: 16, conductor: 'Cu', insulation: 'PVC', method: 'C', ambientTemp: t })
          .factors.find((f) => f.type === 'temperature')?.factor ?? 1;
        expect(kec).toBeCloseTo(iec, 3);
      }
    });
  });

  /**
   * **지중(Method D)은 기준이 20°C 다** — 공기표(30°C)를 쓰면 안 된다.
   * 여기도 표와 폴백이 따로 있고, 처음 이 파일은 공기 경로만 봤다.
   * 변이 실측에서 지중 폴백의 Tmax 를 60 으로 훼손해도 초록이었다
   * (2026-07-28) — 내 게이트의 구멍이었다.
   */
  describe('지중 경로(Method D · 기준 20°C)도 같은 식이다', () => {
    const ground = (tMax: number, tg: number) => Math.sqrt((tMax - tg) / (tMax - 20));
    const ktOf = (t: number, insulation: 'PVC' | 'XLPE') =>
      getIecAmpacity({ size: 16, conductor: 'Cu', insulation, method: 'D', ambientTemp: t })
        .factors.find((f) => f.type === 'temperature')?.factor ?? 1;

    it.each([30, 35, 40, 45, 50, 55, 60])('표 안 PVC %d°C', (t) => {
      expect(ktOf(t, 'PVC')).toBeCloseTo(ground(TMAX.PVC, t), 2);
    });

    it.each([30, 45, 60])('표 안 XLPE %d°C', (t) => {
      expect(ktOf(t, 'XLPE')).toBeCloseTo(ground(TMAX.XLPE, t), 2);
    });

    it.each([5, 61, 65])('표 밖 PVC %d°C', (t) => {
      expect(ktOf(t, 'PVC')).toBeCloseTo(ground(TMAX.PVC, t), 3);
    });

    it('공기 기준(30°C)과 다른 값이다 — 같으면 지중이 공기표를 쓰는 것', () => {
      const air = getIecAmpacity({ size: 16, conductor: 'Cu', insulation: 'PVC', method: 'C', ambientTemp: 40 })
        .factors.find((f) => f.type === 'temperature')?.factor ?? 1;
      expect(ktOf(40, 'PVC')).not.toBeCloseTo(air, 2);
    });
  });

  /**
   * 도체 온도에 도달하면 여유가 0 이다 — 그때는 못 쓴다고 말해야 한다.
   * 위 수리가 "무조건 계산해 준다" 로 흘러가지 않았는지 본다.
   */
  it('도체 최고온도 이상에서는 여전히 사용 불가로 막는다', () => {
    expect(() => getAmpacity({ size: 16, conductor: 'Cu', insulation: 'PVC', installation: 'conduit', ambientTemp: 70 }))
      .toThrow(/최대 온도|exceeds maximum/);
    expect(() => getAmpacity({ size: 16, conductor: 'Cu', insulation: 'PVC', installation: 'conduit', ambientTemp: 75 }))
      .toThrow(/최대 온도|exceeds maximum/);
  });

  it('대조본 자체가 값을 낸다 — 이 파일이 공회전이 아님', () => {
    expect(factor(70, 45)).toBeCloseTo(0.7906, 3);
    expect(factor(90, 45)).toBeCloseTo(0.866, 3);
    expect(factor(70, 30)).toBe(1);
  });
});
