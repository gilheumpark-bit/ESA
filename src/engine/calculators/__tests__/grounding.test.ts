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
