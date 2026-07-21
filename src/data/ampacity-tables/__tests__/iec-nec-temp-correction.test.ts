/**
 * IEC 60364-5-52 / NEC 310.15(C)(1) 온도보정 known-answer 회귀 가드.
 *
 * 버그 사냥 (계산기군 #1·#2·#3):
 *  #1 IEC 공기 보정표가 열 오정렬(xlpe90 열에 PVC 값, pvc70 열이 46°C↑ 0.00),
 *     NEC 표가 저온 밴드 시프트 + 60°C 열 오정렬(46-50 0.00). 공표 표준값으로 정렬.
 *  #2 IEC 미지원 설치방법이 무고지 Method C로 폴백(과대) → throw로 전환, EPR=XLPE 정규화.
 *  #3 IEC Method D(직매)가 공기표로 보정 → B.52.15 지중표(base 20°C)로 전환.
 *
 * 기존 스위트는 전부 30°C(중립)만 써 이 결함이 green과 양립했다(게이트 커버리지 착시).
 */

import { getIecAmpacity } from '../iec-ampacity';
import { getNecAmpacity } from '../nec-ampacity';

// factor = corrected / base(중립온도). IEC 공기: base 30°C. Method D: base 20°C.
function iecAirFactor(insulation: 'PVC' | 'XLPE', ambientTemp: number): number {
  const base = getIecAmpacity({ size: 25, conductor: 'Cu', insulation, method: 'C', ambientTemp: 30 }).corrected;
  const at = getIecAmpacity({ size: 25, conductor: 'Cu', insulation, method: 'C', ambientTemp }).corrected;
  return at / base;
}
function iecGroundFactor(insulation: 'PVC' | 'XLPE', groundTemp: number): number {
  const base = getIecAmpacity({ size: 25, conductor: 'Cu', insulation, method: 'D', ambientTemp: 20 }).corrected;
  const at = getIecAmpacity({ size: 25, conductor: 'Cu', insulation, method: 'D', ambientTemp: groundTemp }).corrected;
  return at / base;
}
function necFactor(tempRating: 60 | 75 | 90, ambientTemp: number): number {
  const base = getNecAmpacity({ size: '4/0', conductor: 'Cu', tempRating, ambientTemp: 30 }).corrected;
  const at = getNecAmpacity({ size: '4/0', conductor: 'Cu', tempRating, ambientTemp }).corrected;
  return at / base;
}

describe('IEC B.52.14 공기 온도보정 (#1)', () => {
  it.each([
    [35, 0.94], [40, 0.87], [45, 0.79], [50, 0.71], [60, 0.50],
  ])('PVC %i°C → %f', (t, f) => {
    expect(iecAirFactor('PVC', t as number)).toBeCloseTo(f as number, 2);
  });
  it.each([
    [35, 0.96], [40, 0.91], [45, 0.87], [50, 0.82], [60, 0.71],
  ])('XLPE %i°C → %f', (t, f) => {
    expect(iecAirFactor('XLPE', t as number)).toBeCloseTo(f as number, 2);
  });
  it('동일 온도에서 XLPE ≥ PVC (도체 최고온도 90 > 70)', () => {
    for (const t of [35, 40, 45, 50, 55, 60]) {
      expect(iecAirFactor('XLPE', t)).toBeGreaterThanOrEqual(iecAirFactor('PVC', t));
    }
  });
  it('PVC 50°C는 사용 가능해야 한다 — 0.71 (구버그: 0.00 → throw)', () => {
    expect(() => getIecAmpacity({ size: 25, conductor: 'Cu', insulation: 'PVC', method: 'C', ambientTemp: 50 })).not.toThrow();
    expect(iecAirFactor('PVC', 50)).toBeCloseTo(0.71, 2);
  });
  it('저온(15°C) uprating 과대 방지 — PVC ≤ 1.17 (구버그 1.22)', () => {
    expect(iecAirFactor('PVC', 15)).toBeLessThanOrEqual(1.17 + 1e-9);
  });
});

describe('IEC 설치방법 폴백/EPR (#2)', () => {
  it('미지원 방법(F, Cu/XLPE 표 없음)은 조용히 Method C로 폴백하지 않고 throw', () => {
    expect(() => getIecAmpacity({ size: 25, conductor: 'Cu', insulation: 'XLPE', method: 'F' })).toThrow(/method 'F'/);
  });
  it('EPR는 XLPE로 정규화 — 같은 값', () => {
    const epr = getIecAmpacity({ size: 25, conductor: 'Cu', insulation: 'EPR', method: 'C' }).ampacity;
    const xlpe = getIecAmpacity({ size: 25, conductor: 'Cu', insulation: 'XLPE', method: 'C' }).ampacity;
    expect(epr).toBe(xlpe);
  });
  it('EPR A1도 XLPE A1로 조회(112) — 구버그: EPR C(133)로 폴백해 과대', () => {
    const eprA1 = getIecAmpacity({ size: 25, conductor: 'Cu', insulation: 'EPR', method: 'A1' }).ampacity;
    const xlpeA1 = getIecAmpacity({ size: 25, conductor: 'Cu', insulation: 'XLPE', method: 'A1' }).ampacity;
    expect(eprA1).toBe(xlpeA1);
    expect(eprA1).toBe(112);
    expect(eprA1).toBeLessThan(133); // Method C가 아님
  });
});

describe('IEC Method D 지중 온도보정 B.52.15 (#3)', () => {
  it.each([
    [25, 0.96], [30, 0.93], [40, 0.85],
  ])('XLPE 지중 %i°C → %f (base 20°C)', (t, f) => {
    expect(iecGroundFactor('XLPE', t as number)).toBeCloseTo(f as number, 2);
  });
  it.each([
    [25, 0.95], [30, 0.89], [40, 0.77],
  ])('PVC 지중 %i°C → %f (base 20°C)', (t, f) => {
    expect(iecGroundFactor('PVC', t as number)).toBeCloseTo(f as number, 2);
  });
  it('20°C(지중 기준)에서는 보정 없음(1.0) — 공기표(30°C 기준) 오적용 방지', () => {
    expect(iecGroundFactor('XLPE', 20)).toBeCloseTo(1.0, 2);
    // 공기표를 잘못 쓰면 20°C에서 XLPE 1.08(uprate)로 나온다 — 그 회귀 차단.
    expect(iecGroundFactor('XLPE', 20)).toBeLessThan(1.05);
  });
});

describe('NEC 310.15(C)(1) 온도보정 (#1)', () => {
  it.each([
    [60, 35, 0.91], [60, 50, 0.58], [60, 55, 0.41],
    [75, 40, 0.88], [75, 25, 1.05],
    [90, 40, 0.91], [90, 45, 0.87],
  ])('%i°C 도체 @ %i°C → %f', (rating, t, f) => {
    expect(necFactor(rating as 60 | 75 | 90, t as number)).toBeCloseTo(f as number, 2);
  });
  it('60°C 도체 50°C는 사용 가능 — 0.58 (구버그: 0.00 → throw)', () => {
    expect(() => getNecAmpacity({ size: '4/0', conductor: 'Cu', tempRating: 60, ambientTemp: 50 })).not.toThrow();
  });
  it('저온 밴드 시프트 회귀 — 75°C @ 25°C = 1.05 (구버그 1.11)', () => {
    expect(necFactor(75, 25)).toBeLessThan(1.10);
  });
  it('동일 온도에서 f90 ≥ f75 ≥ f60 (도체 최고온도 순)', () => {
    for (const t of [35, 40, 45]) {
      expect(necFactor(90, t)).toBeGreaterThanOrEqual(necFactor(75, t));
      expect(necFactor(75, t)).toBeGreaterThanOrEqual(necFactor(60, t));
    }
  });
});
