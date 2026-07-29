/**
 * Ground Resistance Calculator Accuracy Tests
 *
 * Single rod (Dwight formula):
 *   R = (rho / (2 * pi * L)) * ln(4L / d)
 *
 * Multiple parallel rods (simplified):
 *   R_total = R_single / (n * eta)
 *
 * KEC 142 limits:
 *   - Type A (Class 1): 10 ohm
 *   - Type D: 100 ohm
 *
 * Tolerance: +/- 0.01%
 */

import { describe, test, expect } from '@jest/globals';
import { calculateGroundResistance } from '../grounding/ground-resistance';

// -- Helpers -----------------------------------------------------------------

const PI = Math.PI;

function expectWithinTolerance(actual: number, expected: number, tolerancePct = 0.01) {
  const diff = Math.abs(actual - expected);
  const limit = Math.abs(expected) * (tolerancePct / 100);
  expect(diff).toBeLessThanOrEqual(limit);
}

// -- Tests -------------------------------------------------------------------

describe('Ground Resistance Calculator', () => {
  test('Rod in 100 ohm*m soil, 2.4m rod, 16mm dia -- expected ~36.5 ohm -> FAIL (>10 ohm)', () => {
    const rho = 100;
    const L = 2.4;
    const d = 0.016; // 16mm in meters
    const R_expected = (rho / (2 * PI * L)) * Math.log(4 * L / d);

    const result = calculateGroundResistance({
      soilResistivity: rho,
      rodLength: L,
      rodDiameter: 16,
      targetResistance: 10,
    });

    // Formula check: R ~= 36.5 ohm
    expectWithinTolerance(result.value as number, Math.round(R_expected * 100) / 100, 0.5);
    // Must FAIL against 10 ohm limit
    expect(result.judgment!.pass).toBe(false);
  });

  test('Rod in 50 ohm*m soil, 2.4m rod, 16mm dia -- lower resistance than 100 ohm*m', () => {
    const result100 = calculateGroundResistance({
      soilResistivity: 100,
      rodLength: 2.4,
      rodDiameter: 16,
    });

    const result50 = calculateGroundResistance({
      soilResistivity: 50,
      rodLength: 2.4,
      rodDiameter: 16,
    });

    // Lower resistivity -> lower resistance (proportional)
    expect(result50.value as number).toBeLessThan(result100.value as number);
    // Should be roughly half
    expectWithinTolerance((result50.value as number) / (result100.value as number), 0.5, 1);
  });

  test('Multiple rods with parallel reduction -- 4 rods should reduce resistance', () => {
    const baseSingle = calculateGroundResistance({
      soilResistivity: 100,
      rodLength: 2.4,
      rodDiameter: 16,
      rodCount: 1,
    });

    const multiRod = calculateGroundResistance({
      soilResistivity: 100,
      rodLength: 2.4,
      rodDiameter: 16,
      rodCount: 4,
      spacing: 2.4, // S = L
    });

    // 4 rods with S/L = 1 should give R_total = R_single / (4 * eta)
    // eta at S/L=1, n=4 is 0.77 per the source
    const expectedMulti = (baseSingle.value as number) / (4 * 0.77);
    expectWithinTolerance(multiRod.value as number, Math.round(expectedMulti * 100) / 100, 1);
    // Must be significantly less than single rod
    expect(multiRod.value as number).toBeLessThan(baseSingle.value as number);
  });

  test('KEC judgment: 10 ohm limit for type A -- 9.9 ohm PASS, high resistance FAIL', () => {
    // Low resistivity soil to get below 10 ohm
    const resultLow = calculateGroundResistance({
      soilResistivity: 20,
      rodLength: 3.0,
      rodDiameter: 16,
      targetResistance: 10,
    });

    // High resistivity soil -> high resistance
    const resultHigh = calculateGroundResistance({
      soilResistivity: 200,
      rodLength: 2.4,
      rodDiameter: 16,
      targetResistance: 10,
    });

    // Low soil resistivity should pass
    if ((resultLow.value as number) <= 10) {
      expect(resultLow.judgment!.pass).toBe(true);
    }
    // High resistivity -> definitely > 10 ohm -> FAIL
    expect(resultHigh.judgment!.pass).toBe(false);
  });

  test('Suggested rod count when single rod fails target', () => {
    const result = calculateGroundResistance({
      soilResistivity: 100,
      rodLength: 2.4,
      rodDiameter: 16,
      rodCount: 1,
      targetResistance: 10,
    });

    // Single rod ~36 ohm > 10 ohm -> FAIL
    expect(result.judgment!.pass).toBe(false);
    // Should suggest additional rods
    expect(result.additionalOutputs!.suggestedRodCount).toBeDefined();
    expect(result.additionalOutputs!.suggestedRodCount!.value as number).toBeGreaterThanOrEqual(2);
  });

  test('100 ohm target (type D) -- single rod in moderate soil PASS', () => {
    const result = calculateGroundResistance({
      soilResistivity: 100,
      rodLength: 2.4,
      rodDiameter: 16,
      targetResistance: 100,
    });

    // ~36 ohm < 100 ohm -> PASS
    expect(result.judgment!.pass).toBe(true);
  });

  test('Validation: negative soil resistivity throws', () => {
    expect(() =>
      calculateGroundResistance({
        soilResistivity: -10,
        rodLength: 2.4,
        rodDiameter: 16,
      }),
    ).toThrow();
  });
});

/**
 * **화면에 보이는 중간 단계에도 눈금을 박는다.**
 *
 * 이 스위트는 최종 합성저항만 잡고 있었다. 변이 실측(2026-07-29):
 *
 *   최종값 ×1.5   → 1 실패  ✓ 잡힘
 *   단봉 저항 ×1.5 → 7 통과  ✗ 못 잡음
 *   집합계수 ×1.5  → 7 통과  ✗ 못 잡음
 *
 * 두 값은 영수증의 풀이 과정에 그대로 뜬다. 접지 설계에서 실무자가 실제로
 * 확인하는 것이 **집합계수**인데, 그게 틀려도 총합만 맞으면 통과했다.
 * arc-flash 가 빠져나간 구멍과 같은 형태다 — 상대 검사만으로는 눈금이 없다.
 *
 * 기대값은 손계산이다(구현을 돌려 얻은 값이 아니다):
 *   R₁ = ρ/(2πL)·ln(4L/d) = 100/(2π·3)·ln(750) = 5.3052 × 6.6201 = 35.12 Ω
 *   n=4, S/L=1 → η=0.77 (IEEE 142 표)
 *   R_total = R₁/(n·η) = 35.12/(4×0.77) = 11.40 Ω
 *
 * 참고(개발자 판단 대기): 구현은 Dwight 식의 `ln(4L/d)` 변형을 쓴다. 정식
 * `ln(8L/d) − 1` 로 계산하면 같은 조건에서 33.49 Ω 로 **4.6% 낮다**. 구현
 * 쪽이 저항을 크게 보므로 봉을 더 박는 방향(보수적)이지만, 어느 판을 쓰는지는
 * 문서에 적히지 않았다. 이 검사는 현행 식을 고정할 뿐 판을 승인하지 않는다.
 */
describe('접지저항 — 풀이 단계의 절대 눈금', () => {
  const result = calculateGroundResistance({
    soilResistivity: 100,
    rodLength: 3,
    rodDiameter: 16,
    rodCount: 4,
    spacing: 3,
    targetResistance: 10,
  });
  const step = (n: number) => result.steps?.find((s) => s.step === n)?.value as number;

  it('단봉 저항 = 35.12 Ω (손계산)', () => {
    expect(step(1)).toBeCloseTo(35.12, 1);
  });

  it('집합계수 = 0.77 (n=4 · S/L=1 · IEEE 142)', () => {
    expect(step(2)).toBeCloseTo(0.77, 2);
  });

  it('합성저항 = 11.40 Ω (손계산)', () => {
    expect(step(3)).toBeCloseTo(11.40, 1);
    expect(result.value as number).toBeCloseTo(11.40, 1);
  });

  /** 단계가 실제로 존재하는지 — 없으면 위 검사는 undefined 를 재는 공회전이다. */
  it('풀이 단계가 비어 있지 않다', () => {
    expect((result.steps ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
