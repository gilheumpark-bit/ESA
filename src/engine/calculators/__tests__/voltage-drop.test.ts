/**
 * Voltage Drop Calculator Accuracy Tests
 *
 * Formula:
 *   3-phase: e = sqrt(3) x I x (L/1000) x (R*cos(phi) + X*sin(phi))
 *   1-phase: e = 2 x I x (L/1000) x (R*cos(phi) + X*sin(phi))
 *   R = rho x 1000 / A   [Ohm/km]
 *
 * KEC 232.51 limit: 3% for branch/feeder
 * Tolerance: +/- 0.01%
 */

import { describe, test, expect } from '@jest/globals';
import { calculateVoltageDrop } from '../voltage-drop/voltage-drop';

// ── Helpers ─────────────────────────────────────────────────────

const SQRT3 = 1.7320508075688772;
const RESISTIVITY_CU = 0.017241;
const RESISTIVITY_AL = 0.028264;

/** Match the engine's rounding: round(v, decimals) */
function round(v: number, decimals: number = 4): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

function expectWithinTolerance(actual: number, expected: number, tolerancePct = 0.01) {
  const diff = Math.abs(actual - expected);
  const limit = Math.abs(expected) * (tolerancePct / 100);
  expect(diff).toBeLessThanOrEqual(limit);
}

// ── 3-Phase Voltage Drop ────────────────────────────────────────

describe('Voltage Drop Calculator — 3-phase', () => {
  test('380V, 100A, 50m, 25mm² Cu, PF 0.85 — known result', () => {
    const R = (RESISTIVITY_CU * 1000) / 25;   // 0.68964 Ohm/km
    const X = 0.08;
    const pf = 0.85;
    const sinPhi = Math.sqrt(1 - pf * pf);
    const Zfactor = R * pf + X * sinPhi;
    const raw_e = SQRT3 * 100 * (50 / 1000) * Zfactor;
    // Engine applies round(e, 2) and round(ePct, 2)
    const expected_e = round(raw_e, 2);
    const expected_pct = round((raw_e / 380) * 100, 2);

    const result = calculateVoltageDrop({
      voltage: 380,
      current: 100,
      length: 50,
      cableSize: 25,
      conductor: 'Cu',
      powerFactor: 0.85,
      phase: 3,
    });

    expectWithinTolerance(result.value as number, expected_e);
    expectWithinTolerance(
      result.additionalOutputs!.voltageDropPercent!.value as number,
      expected_pct,
    );
  });

  test('380V, 100A, 50m, 25mm² Cu — judgment PASS/FAIL against 3% KEC limit', () => {
    const result = calculateVoltageDrop({
      voltage: 380,
      current: 100,
      length: 50,
      cableSize: 25,
      conductor: 'Cu',
      powerFactor: 0.85,
      phase: 3,
    });

    const pct = result.additionalOutputs!.voltageDropPercent!.value as number;
    if (pct <= 3) {
      expect(result.judgment!.pass).toBe(true);
    } else {
      expect(result.judgment!.pass).toBe(false);
    }
  });

  test('380V, 50A, 100m, 70mm² Cu, PF 0.9 — long run low drop', () => {
    const R = (RESISTIVITY_CU * 1000) / 70;
    const X = 0.08;
    const pf = 0.9;
    const sinPhi = Math.sqrt(1 - pf * pf);
    const Zfactor = R * pf + X * sinPhi;
    const raw_e = SQRT3 * 50 * (100 / 1000) * Zfactor;
    const expected_e = round(raw_e, 2);

    const result = calculateVoltageDrop({
      voltage: 380,
      current: 50,
      length: 100,
      cableSize: 70,
      conductor: 'Cu',
      powerFactor: 0.9,
      phase: 3,
    });

    expectWithinTolerance(result.value as number, expected_e);
  });

  test('380V, 200A, 30m, 95mm² Al — aluminum conductor', () => {
    const R = (RESISTIVITY_AL * 1000) / 95;
    const X = 0.08;
    const pf = 0.85;
    const sinPhi = Math.sqrt(1 - pf * pf);
    const Zfactor = R * pf + X * sinPhi;
    const raw_e = SQRT3 * 200 * (30 / 1000) * Zfactor;
    const expected_e = round(raw_e, 2);

    const result = calculateVoltageDrop({
      voltage: 380,
      current: 200,
      length: 30,
      cableSize: 95,
      conductor: 'Al',
      powerFactor: 0.85,
      phase: 3,
    });

    expectWithinTolerance(result.value as number, expected_e);
  });
});

// ── 1-Phase Voltage Drop ────────────────────────────────────────

describe('Voltage Drop Calculator — 1-phase', () => {
  test('220V, 30A, 40m, 10mm² Cu, PF 0.9', () => {
    const R = (RESISTIVITY_CU * 1000) / 10;
    const X = 0.08;
    const pf = 0.9;
    const sinPhi = Math.sqrt(1 - pf * pf);
    const Zfactor = R * pf + X * sinPhi;
    const raw_e = 2 * 30 * (40 / 1000) * Zfactor;
    const expected_e = round(raw_e, 2);

    const result = calculateVoltageDrop({
      voltage: 220,
      current: 30,
      length: 40,
      cableSize: 10,
      conductor: 'Cu',
      powerFactor: 0.9,
      phase: 1,
    });

    expectWithinTolerance(result.value as number, expected_e);
  });

  test('custom drop limit 5% — total feeder+branch per KEC', () => {
    const result = calculateVoltageDrop({
      voltage: 220,
      current: 20,
      length: 80,
      cableSize: 6,
      conductor: 'Cu',
      powerFactor: 0.85,
      phase: 1,
      dropLimitPercent: 5,
    });

    const pct = result.additionalOutputs!.voltageDropPercent!.value as number;
    if (pct <= 5) {
      expect(result.judgment!.pass).toBe(true);
    } else {
      expect(result.judgment!.pass).toBe(false);
    }
  });
});
