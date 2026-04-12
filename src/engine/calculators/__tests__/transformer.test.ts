/**
 * Transformer Capacity Calculator Accuracy Tests
 *
 * Formula:
 *   S_required = P_demand / (cos(phi) x eta)
 *   P_demand = P_total x demand_factor
 *   Select next standard kVA size >= S_required x (1 + margin)
 *
 * Standard sizes: [50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000] kVA
 * Tolerance: +/- 0.01%
 */

import { describe, test, expect } from '@jest/globals';
import {
  calculateTransformerCapacity,
  STANDARD_TRANSFORMER_SIZES_KVA,
} from '../transformer/transformer-capacity';

// ── Helpers ─────────────────────────────────────────────────────

function expectWithinTolerance(actual: number, expected: number, tolerancePct = 0.01) {
  const diff = Math.abs(actual - expected);
  const limit = Math.abs(expected) * (tolerancePct / 100);
  expect(diff).toBeLessThanOrEqual(limit);
}

// ── Tests ───────────────────────────────────────────────────────

describe('Transformer Capacity Calculator', () => {
  test('500kW, PF 0.85, eta 0.98, DF 0.8 — expected kVA and standard size', () => {
    const P = 500;     // kW
    const pf = 0.85;
    const eta = 0.98;
    const df = 0.8;

    const P_demand = P * df;                   // 400 kW
    const S_required = P_demand / (pf * eta);  // 400 / 0.833 = 480.29... kVA

    const result = calculateTransformerCapacity({
      totalLoad: P,
      powerFactor: pf,
      efficiency: eta,
      demandFactor: df,
    });

    // Check calculated S matches formula
    expectWithinTolerance(result.value as number, S_required);

    // Should select 500 kVA (next standard size >= 480.29)
    expect(result.additionalOutputs!.selectedStandard!.value).toBe(500);
  });

  test('1000kW, PF 0.9, eta 0.97, DF 0.7 — selects 1000 kVA', () => {
    const P_demand = 1000 * 0.7;                  // 700 kW
    const S_required = P_demand / (0.9 * 0.97);   // 801.57... kVA

    const result = calculateTransformerCapacity({
      totalLoad: 1000,
      powerFactor: 0.9,
      efficiency: 0.97,
      demandFactor: 0.7,
    });

    expectWithinTolerance(result.value as number, S_required);
    expect(result.additionalOutputs!.selectedStandard!.value).toBe(1000);
  });

  test('200kW, PF 0.8, eta 0.96, DF 0.9, margin 20% — growth margin applied', () => {
    const P_demand = 200 * 0.9;                    // 180 kW
    const S_required = P_demand / (0.8 * 0.96);    // 234.375 kVA
    const S_with_margin = S_required * 1.2;         // 281.25 kVA

    const result = calculateTransformerCapacity({
      totalLoad: 200,
      powerFactor: 0.8,
      efficiency: 0.96,
      demandFactor: 0.9,
      growthMargin: 0.2,
    });

    expectWithinTolerance(result.value as number, S_required);
    // With 281.25 kVA required, should select 300 kVA
    expect(result.additionalOutputs!.selectedStandard!.value).toBe(300);
    expectWithinTolerance(result.additionalOutputs!.requiredCapacity!.value as number, S_with_margin);
  });

  test('50kW, PF 0.95, eta 0.99, DF 1.0 — small load selects 75 kVA', () => {
    const S_required = (50 * 1.0) / (0.95 * 0.99); // 53.16... kVA

    const result = calculateTransformerCapacity({
      totalLoad: 50,
      powerFactor: 0.95,
      efficiency: 0.99,
      demandFactor: 1.0,
    });

    expectWithinTolerance(result.value as number, S_required);
    expect(result.additionalOutputs!.selectedStandard!.value).toBe(75);
  });

  test('utilization percentage is correct', () => {
    const result = calculateTransformerCapacity({
      totalLoad: 500,
      powerFactor: 0.85,
      efficiency: 0.98,
      demandFactor: 0.8,
    });

    const selectedKVA = result.additionalOutputs!.selectedStandard!.value as number;
    const requiredKVA = result.additionalOutputs!.requiredCapacity!.value as number;
    const expectedUtil = (requiredKVA / selectedKVA) * 100;

    expectWithinTolerance(
      result.additionalOutputs!.utilization!.value as number,
      expectedUtil,
      0.5, // utilization is rounded to 1 decimal, allow wider tolerance
    );
  });

  test('standard sizes array is sorted ascending', () => {
    for (let i = 1; i < STANDARD_TRANSFORMER_SIZES_KVA.length; i++) {
      expect(STANDARD_TRANSFORMER_SIZES_KVA[i]).toBeGreaterThan(
        STANDARD_TRANSFORMER_SIZES_KVA[i - 1],
      );
    }
  });

  test('exact standard size match: S_required = 500 kVA selects 500 kVA', () => {
    // Engineer inputs that produce exactly 500 kVA required
    // P_demand = 425 kW, pf=0.85, eta=1.0 → S = 425/0.85 = 500 kVA
    const result = calculateTransformerCapacity({
      totalLoad: 425,
      powerFactor: 0.85,
      efficiency: 1.0,
      demandFactor: 1.0,
    });

    expectWithinTolerance(result.value as number, 500);
    // When exactly on a standard size, should select that size (not next up)
    expect(result.additionalOutputs!.selectedStandard!.value).toBe(500);
  });

  test('demand factor properly reduces effective load', () => {
    // Same total load, different demand factors → different capacity
    const resultHigh = calculateTransformerCapacity({
      totalLoad: 1000,
      powerFactor: 0.9,
      efficiency: 0.98,
      demandFactor: 1.0,
    });

    const resultLow = calculateTransformerCapacity({
      totalLoad: 1000,
      powerFactor: 0.9,
      efficiency: 0.98,
      demandFactor: 0.5,
    });

    // Lower demand factor → lower required capacity
    expect(resultLow.value as number).toBeLessThan(resultHigh.value as number);
    // Ratio should match demand factor ratio
    expectWithinTolerance((resultLow.value as number) / (resultHigh.value as number), 0.5);
  });

  test('zero efficiency throws validation error', () => {
    expect(() =>
      calculateTransformerCapacity({
        totalLoad: 500,
        powerFactor: 0.85,
        efficiency: 0,
        demandFactor: 0.8,
      }),
    ).toThrow();
  });
});
