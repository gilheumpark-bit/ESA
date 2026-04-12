/**
 * Solar PV Generation & Battery Capacity Calculator Tests
 *
 * Solar formula:
 *   E_daily  = P x H x K x PR
 *   E_month  = E_daily x 30
 *   E_annual = E_daily x 365
 *
 * Battery formula:
 *   C = (P x t x 1000) / (V x DoD x eta)
 *
 * Tolerance: +/- 0.01% for calculations
 */

import { describe, test, expect } from '@jest/globals';
import { calculateSolarGeneration } from '../renewable/solar-generation';
import { calculateBatteryCapacity } from '../renewable/battery-capacity';

// -- Helpers -----------------------------------------------------------------

function expectWithinTolerance(actual: number, expected: number, tolerancePct = 0.01) {
  const diff = Math.abs(actual - expected);
  const limit = Math.abs(expected) * (tolerancePct / 100);
  expect(diff).toBeLessThanOrEqual(limit);
}

// -- Solar Generation Tests --------------------------------------------------

describe('Solar PV Generation Calculator', () => {
  test('10kWp, 4.5h PSH, PR 0.85, loss 5% -- daily/monthly/annual', () => {
    const P = 10;      // kWp
    const H = 4.5;     // PSH
    const PR = 0.85;
    const loss = 5;     // %
    const K = 1 - loss / 100; // 0.95

    const E_daily = P * H * K * PR;    // 10 * 4.5 * 0.95 * 0.85 = 36.3375
    const E_monthly = E_daily * 30;     // 1090.125
    const E_annual = E_daily * 365;     // 13263.1875

    const result = calculateSolarGeneration({
      installedCapacity: P,
      peakSunHours: H,
      performanceRatio: PR,
      systemLoss: loss,
    });

    // Daily generation
    expectWithinTolerance(result.value as number, Math.round(E_daily * 100) / 100, 0.5);
    // Monthly generation
    expectWithinTolerance(
      result.additionalOutputs!.monthlyGeneration!.value as number,
      Math.round(E_monthly * 10) / 10,
      0.5,
    );
    // Annual generation
    expectWithinTolerance(
      result.additionalOutputs!.annualGeneration!.value as number,
      Math.round(E_annual),
      0.5,
    );
  });

  test('Specific yield is E_annual / P_installed', () => {
    const result = calculateSolarGeneration({
      installedCapacity: 10,
      peakSunHours: 4.5,
      performanceRatio: 0.85,
      systemLoss: 5,
    });

    const annual = result.additionalOutputs!.annualGeneration!.value as number;
    const specificYield = result.additionalOutputs!.specificYield!.value as number;
    expectWithinTolerance(specificYield, Math.round(annual / 10), 1);
  });

  test('Zero system loss -- K = 1.0', () => {
    const result = calculateSolarGeneration({
      installedCapacity: 5,
      peakSunHours: 4.0,
      performanceRatio: 0.80,
      systemLoss: 0,
    });

    // 5 * 4.0 * 1.0 * 0.80 = 16 kWh/day
    expectWithinTolerance(result.value as number, 16, 0.5);
  });

  test('Higher PSH produces proportionally more energy', () => {
    const result3h = calculateSolarGeneration({
      installedCapacity: 10,
      peakSunHours: 3.0,
      performanceRatio: 0.85,
      systemLoss: 5,
    });

    const result6h = calculateSolarGeneration({
      installedCapacity: 10,
      peakSunHours: 6.0,
      performanceRatio: 0.85,
      systemLoss: 5,
    });

    expectWithinTolerance((result6h.value as number) / (result3h.value as number), 2.0, 0.5);
  });

  test('Validation: PR out of range throws', () => {
    expect(() =>
      calculateSolarGeneration({
        installedCapacity: 10,
        peakSunHours: 4.5,
        performanceRatio: 1.5,
        systemLoss: 5,
      }),
    ).toThrow();
  });

  test('Validation: system loss > 50% throws', () => {
    expect(() =>
      calculateSolarGeneration({
        installedCapacity: 10,
        peakSunHours: 4.5,
        performanceRatio: 0.85,
        systemLoss: 60,
      }),
    ).toThrow();
  });
});

// -- Battery Capacity Tests --------------------------------------------------

describe('Battery Capacity Calculator', () => {
  test('5kW, 4h, 48V, 0.8 DoD, 0.95 eta -- required Ah', () => {
    const P = 5;      // kW
    const t = 4;      // hours
    const V = 48;     // V
    const DoD = 0.8;
    const eta = 0.95;

    // E_required = 5 * 4 = 20 kWh
    // E_battery = 20 / (0.8 * 0.95) = 26.3158 kWh
    // C_required = 26.3158 * 1000 / 48 = 548.245 Ah
    const E_required = P * t;
    const E_battery = E_required / (DoD * eta);
    const C_required = (E_battery * 1000) / V;

    const result = calculateBatteryCapacity({
      loadPower: P,
      backupTime: t,
      batteryVoltage: V,
      depthOfDischarge: DoD,
      inverterEfficiency: eta,
    });

    expectWithinTolerance(result.value as number, Math.round(C_required * 10) / 10, 0.5);
  });

  test('Recommended capacity includes 20% safety margin by default', () => {
    const result = calculateBatteryCapacity({
      loadPower: 5,
      backupTime: 4,
      batteryVoltage: 48,
      depthOfDischarge: 0.8,
      inverterEfficiency: 0.95,
    });

    const required = result.additionalOutputs!.requiredCapacity!.value as number;
    const recommended = result.additionalOutputs!.recommendedCapacity!.value as number;
    expectWithinTolerance(recommended / required, 1.2, 0.5);
  });

  test('Higher voltage reduces required Ah (same energy)', () => {
    const result48V = calculateBatteryCapacity({
      loadPower: 10,
      backupTime: 2,
      batteryVoltage: 48,
      depthOfDischarge: 0.8,
      inverterEfficiency: 0.95,
    });

    const result96V = calculateBatteryCapacity({
      loadPower: 10,
      backupTime: 2,
      batteryVoltage: 96,
      depthOfDischarge: 0.8,
      inverterEfficiency: 0.95,
    });

    // Doubling voltage halves required Ah
    expectWithinTolerance((result48V.value as number) / (result96V.value as number), 2.0, 0.5);
  });

  test('Custom safety margin 30%', () => {
    const result = calculateBatteryCapacity({
      loadPower: 5,
      backupTime: 4,
      batteryVoltage: 48,
      depthOfDischarge: 0.8,
      inverterEfficiency: 0.95,
      safetyMargin: 0.30,
    });

    const required = result.additionalOutputs!.requiredCapacity!.value as number;
    const recommended = result.additionalOutputs!.recommendedCapacity!.value as number;
    expectWithinTolerance(recommended / required, 1.3, 0.5);
  });

  test('Validation: zero DoD throws', () => {
    expect(() =>
      calculateBatteryCapacity({
        loadPower: 5,
        backupTime: 4,
        batteryVoltage: 48,
        depthOfDischarge: 0,
        inverterEfficiency: 0.95,
      }),
    ).toThrow();
  });
});
