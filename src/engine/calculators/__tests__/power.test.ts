/**
 * Power Calculator Accuracy Tests
 *
 * Reference values:
 *   Single-phase: P = V x I x cos(phi)
 *   Three-phase:  P = sqrt(3) x V_L x I_L x cos(phi)
 *
 * Tolerance: +/- 0.01%
 */

import { describe, test, expect } from '@jest/globals';
import { calculateSinglePhasePower } from '../power/single-phase-power';
import { calculateThreePhasePower } from '../power/three-phase-power';

// ── Helpers ─────────────────────────────────────────────────────

function expectWithinTolerance(actual: number, expected: number, tolerancePct = 0.01) {
  const diff = Math.abs(actual - expected);
  const limit = Math.abs(expected) * (tolerancePct / 100);
  expect(diff).toBeLessThanOrEqual(limit);
}

// ── Single-Phase Power ──────────────────────────────────────────

describe('Single-Phase Power Calculator', () => {
  test('220V x 10A x PF 0.85 = 1870 W', () => {
    const result = calculateSinglePhasePower({
      voltage: 220,
      current: 10,
      powerFactor: 0.85,
    });

    const expected = 220 * 10 * 0.85; // 1870 W
    expectWithinTolerance(result.value as number, expected);
    expect(result.unit).toBe('W');
  });

  test('220V x 10A: apparent power = 2200 VA', () => {
    const result = calculateSinglePhasePower({
      voltage: 220,
      current: 10,
      powerFactor: 0.85,
    });

    expect(result.additionalOutputs?.apparentPower?.value).toBe(2200);
    expect(result.additionalOutputs?.apparentPower?.unit).toBe('VA');
  });

  test('220V x 10A x PF 0.85: reactive power = V x I x sin(phi)', () => {
    const result = calculateSinglePhasePower({
      voltage: 220,
      current: 10,
      powerFactor: 0.85,
    });

    const sinPhi = Math.sqrt(1 - 0.85 * 0.85);
    const expectedQ = 220 * 10 * sinPhi;
    expectWithinTolerance(result.additionalOutputs!.reactivePower!.value as number, expectedQ);
  });

  test('120V x 15A x PF 1.0 (unity) = 1800 W', () => {
    const result = calculateSinglePhasePower({
      voltage: 120,
      current: 15,
      powerFactor: 1.0,
    });

    expectWithinTolerance(result.value as number, 1800);
  });

  test('240V x 30A x PF 0.9 = 6480 W', () => {
    const result = calculateSinglePhasePower({
      voltage: 240,
      current: 30,
      powerFactor: 0.9,
    });

    const expected = 240 * 30 * 0.9;
    expectWithinTolerance(result.value as number, expected);
  });
});

// ── Three-Phase Power ───────────────────────────────────────────

describe('Three-Phase Power Calculator', () => {
  const SQRT3 = 1.7320508075688772;

  test('380V x 100A x PF 0.9 = sqrt(3) x 380 x 100 x 0.9 = 59,244.19 W', () => {
    const result = calculateThreePhasePower({
      lineVoltage: 380,
      lineCurrent: 100,
      powerFactor: 0.9,
    });

    const expected = SQRT3 * 380 * 100 * 0.9; // 59244.19...
    expectWithinTolerance(result.value as number, expected);
  });

  test('380V x 100A: apparent power = sqrt(3) x 380 x 100 VA', () => {
    const result = calculateThreePhasePower({
      lineVoltage: 380,
      lineCurrent: 100,
      powerFactor: 0.9,
    });

    const expectedS = SQRT3 * 380 * 100;
    expectWithinTolerance(result.additionalOutputs!.apparentPower!.value as number, expectedS);
  });

  test('22.9kV x 500A x PF 0.95 high-voltage feeder', () => {
    const result = calculateThreePhasePower({
      lineVoltage: 22900,
      lineCurrent: 500,
      powerFactor: 0.95,
    });

    const expected = SQRT3 * 22900 * 500 * 0.95;
    expectWithinTolerance(result.value as number, expected);
  });

  test('415V x 50A x PF 0.8 (IEC common voltage)', () => {
    const result = calculateThreePhasePower({
      lineVoltage: 415,
      lineCurrent: 50,
      powerFactor: 0.8,
    });

    const expected = SQRT3 * 415 * 50 * 0.8;
    expectWithinTolerance(result.value as number, expected);
  });

  test('208V x 200A x PF 1.0 (NEC system)', () => {
    const result = calculateThreePhasePower({
      lineVoltage: 208,
      lineCurrent: 200,
      powerFactor: 1.0,
    });

    const expected = SQRT3 * 208 * 200 * 1.0;
    expectWithinTolerance(result.value as number, expected);
  });

  test('kW output matches W / 1000', () => {
    const result = calculateThreePhasePower({
      lineVoltage: 380,
      lineCurrent: 100,
      powerFactor: 0.9,
    });

    const kW = result.additionalOutputs!.activePower_kW!.value as number;
    const W = result.value as number;
    expectWithinTolerance(kW, W / 1000);
  });
});
