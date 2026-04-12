/**
 * Short-Circuit Current Calculator Accuracy Tests
 *
 * Formula (IEC 60909 simplified):
 *   Z_source = (V² / S_tr) x (Zk% / 100)
 *   Z_cable  = sqrt(R² + X²)  where R = rho*1000/A [Ohm/km], length applied
 *   Z_total  = Z_source + Z_cable
 *   Isc      = V / (sqrt(3) x Z_total)
 *
 * Tolerance: +/- 0.01%
 */

import { describe, test, expect } from '@jest/globals';
import { calculateShortCircuit } from '../protection/short-circuit';

// ── Helpers ─────────────────────────────────────────────────────

const SQRT3 = 1.7320508075688772;
const RESISTIVITY_CU = 0.017241;

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

// ── Tests ───────────────────────────────────────────────────────

describe('Short-Circuit Current Calculator', () => {
  test('1000kVA transformer, Zk=5%, 50m of 95mm² Cu cable at 380V', () => {
    const V = 380;
    const S_VA = 1000 * 1000;
    const Zk_pct = 5;
    const L = 50;
    const A = 95;
    const X_per_km = 0.08;

    // Source impedance
    const Z_source = (V * V / S_VA) * (Zk_pct / 100);

    // Cable impedance
    const R_per_km = (RESISTIVITY_CU * 1000) / A;
    const R_cable = R_per_km * (L / 1000);
    const X_cable = X_per_km * (L / 1000);
    const Z_cable = Math.sqrt(R_cable * R_cable + X_cable * X_cable);

    const Z_total = Z_source + Z_cable;
    const Isc = V / (SQRT3 * Z_total);
    const Isc_kA = round(Isc / 1000, 2); // Engine applies round(Isc_kA, 2)

    const result = calculateShortCircuit({
      systemVoltage: V,
      transformerCapacity: 1000,
      impedancePercent: Zk_pct,
      cableLength: L,
      cableSize: A,
      conductor: 'Cu',
    });

    expectWithinTolerance(result.value as number, Isc_kA);
    expect(result.unit).toBe('kA');
  });

  test('500kVA transformer, Zk=4%, 20m of 50mm² Cu at 380V', () => {
    const V = 380;
    const S_VA = 500 * 1000;
    const Zk_pct = 4;
    const L = 20;
    const A = 50;
    const X_per_km = 0.08;

    const Z_source = (V * V / S_VA) * (Zk_pct / 100);
    const R_per_km = (RESISTIVITY_CU * 1000) / A;
    const R_cable = R_per_km * (L / 1000);
    const X_cable = X_per_km * (L / 1000);
    const Z_cable = Math.sqrt(R_cable * R_cable + X_cable * X_cable);
    const Z_total = Z_source + Z_cable;
    const Isc_kA = round(V / (SQRT3 * Z_total) / 1000, 2); // Engine applies round(Isc_kA, 2)

    const result = calculateShortCircuit({
      systemVoltage: V,
      transformerCapacity: 500,
      impedancePercent: Zk_pct,
      cableLength: L,
      cableSize: A,
      conductor: 'Cu',
    });

    expectWithinTolerance(result.value as number, Isc_kA);
  });

  test('Al conductor produces lower Isc (higher impedance) than Cu', () => {
    const baseInput = {
      systemVoltage: 380,
      transformerCapacity: 1000,
      impedancePercent: 5,
      cableLength: 100,
      cableSize: 95,
    } as const;

    const resultCu = calculateShortCircuit({ ...baseInput, conductor: 'Cu' });
    const resultAl = calculateShortCircuit({ ...baseInput, conductor: 'Al' });

    // Al has higher resistivity, so Z_cable is larger, hence Isc is smaller
    expect(resultAl.value as number).toBeLessThan(resultCu.value as number);
  });

  test('longer cable reduces Isc', () => {
    const baseInput = {
      systemVoltage: 380,
      transformerCapacity: 1000,
      impedancePercent: 5,
      cableSize: 95,
      conductor: 'Cu' as const,
    };

    const resultShort = calculateShortCircuit({ ...baseInput, cableLength: 10 });
    const resultLong = calculateShortCircuit({ ...baseInput, cableLength: 200 });

    expect(resultLong.value as number).toBeLessThan(resultShort.value as number);
  });

  test('peak current = kappa x sqrt(2) x Isc', () => {
    // Reproduce the engine's internal computation to get the raw Isc_kA
    const V = 380;
    const S_VA = 1000 * 1000;
    const Zk_pct = 5;
    const L = 50;
    const A = 95;
    const X_per_km = 0.08;
    const Z_source = (V * V / S_VA) * (Zk_pct / 100);
    const R_per_km = (RESISTIVITY_CU * 1000) / A;
    const R_cable = R_per_km * (L / 1000);
    const X_cable = X_per_km * (L / 1000);
    const Z_cable = Math.sqrt(R_cable * R_cable + X_cable * X_cable);
    const Z_total = Z_source + Z_cable;
    const raw_Isc_kA = V / (SQRT3 * Z_total) / 1000;

    const result = calculateShortCircuit({
      systemVoltage: V,
      transformerCapacity: 1000,
      impedancePercent: Zk_pct,
      cableLength: L,
      cableSize: A,
      conductor: 'Cu',
    });

    // Engine computes peak from raw (unrounded) Isc, then rounds to 2dp
    const kappa = 1.8;
    const expectedPeak = round(kappa * Math.SQRT2 * raw_Isc_kA, 2);

    expectWithinTolerance(
      result.additionalOutputs!.peakCurrent_kA!.value as number,
      expectedPeak,
    );
  });

  test('source impedance matches formula V²/S x Zk%/100', () => {
    const V = 380;
    const S_kVA = 750;
    const Zk = 6;
    const expected_Zsrc = (V * V / (S_kVA * 1000)) * (Zk / 100);

    const result = calculateShortCircuit({
      systemVoltage: V,
      transformerCapacity: S_kVA,
      impedancePercent: Zk,
      cableLength: 30,
      cableSize: 70,
      conductor: 'Cu',
    });

    expectWithinTolerance(
      result.additionalOutputs!.sourceImpedance!.value as number,
      expected_Zsrc,
    );
  });
});
