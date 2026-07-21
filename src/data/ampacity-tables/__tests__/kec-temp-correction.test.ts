/**
 * KEC 온도보정 계수 — IEC 60364-5-52 B.52.14 known-answer 회귀 가드
 *
 * 버그 사냥 #1: xlpe90 열이 PVC 값을, pvc60 열이 어긋난 값을 담아 XLPE를 과소·
 * 저온측을 과대(화재 방향) 계산했다. 여기서 공표 표준값으로 잠근다. 이 모듈은
 * 온도보정 테스트가 0이라 결함이 496 green과 양립했다(게이트 커버리지 착시).
 */

import { getAmpacity } from '../kec-ampacity';

// 30°C 기준 대비 보정. base×factor가 corrected이므로 factor = corrected/base.
function factor(insulation: 'PVC' | 'XLPE', ambientTemp: number): number {
  const base = getAmpacity({ size: 25, conductor: 'Cu', insulation, installation: 'conduit', ambientTemp: 30 }).corrected;
  const at = getAmpacity({ size: 25, conductor: 'Cu', insulation, installation: 'conduit', ambientTemp }).corrected;
  return Math.round((at / base) * 100) / 100;
}

describe('B.52.14 온도보정 — XLPE는 90°C 도체라 PVC보다 열에 강하다', () => {
  it.each([
    [35, 0.94],
    [40, 0.87],
    [45, 0.79],
    [50, 0.71],
    [60, 0.50],
  ])('PVC %i°C → %f', (t, f) => {
    expect(factor('PVC', t as number)).toBeCloseTo(f as number, 2);
  });

  it.each([
    [35, 0.96],
    [40, 0.91],
    [45, 0.87],
    [50, 0.82],
    [60, 0.71],
  ])('XLPE %i°C → %f', (t, f) => {
    expect(factor('XLPE', t as number)).toBeCloseTo(f as number, 2);
  });

  it('동일 온도에서 XLPE 보정 ≥ PVC 보정 (도체 최고온도 90 > 70)', () => {
    for (const t of [35, 40, 45, 50, 55, 60]) {
      expect(factor('XLPE', t)).toBeGreaterThanOrEqual(factor('PVC', t));
    }
  });

  it('30°C 기준은 보정 없음(1.0) — review 사슬 기본 경로', () => {
    expect(factor('PVC', 30)).toBe(1.0);
    expect(factor('XLPE', 30)).toBe(1.0);
  });

  it('저온(15°C) uprating이 과대하지 않다 — PVC ≤ 1.17 (구버그 1.22 방지)', () => {
    expect(factor('PVC', 15)).toBeLessThanOrEqual(1.17);
    expect(factor('XLPE', 15)).toBeLessThanOrEqual(1.12);
  });
});
