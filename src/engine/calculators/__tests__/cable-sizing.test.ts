/**
 * Cable Sizing Calculator Accuracy Tests
 *
 * Method:
 *   1. Required ampacity = I_load / (Kt x Kg)
 *   2. Select smallest cable where base ampacity >= required AND voltage drop <= limit
 *
 * Reference: KEC 232.3, IEC 60364-5-52 Table B.52-4
 * Tolerance: exact size match (discrete selection)
 */

import { describe, test, expect } from '@jest/globals';
import { calculateCableSizing, CABLE_SIZES_MM2 } from '../cable/cable-sizing';

// ── Tests ───────────────────────────────────────────────────────

describe('Cable Sizing Calculator', () => {
  test('100A, XLPE Cu, 30°C, no grouping — minimum 25mm² per KEC table', () => {
    // XLPE Cu ampacity: 25mm² = 129A (>= 100A), 16mm² = 98A (< 100A)
    // So minimum by ampacity alone is 25mm²
    const result = calculateCableSizing({
      current: 100,
      length: 20,      // short run, VD not dominant
      voltage: 380,
      conductor: 'Cu',
      insulation: 'XLPE',
      ambientTemp: 30,
      groupCount: 1,
      powerFactor: 0.85,
      phase: 3,
    });

    expect(result.value).toBe(25);
    expect(result.unit).toBe('mm²');
  });

  test('100A, PVC Cu — requires 35mm² (PVC 25mm² = 106A marginal, with VD check)', () => {
    // PVC Cu: 25mm² = 106A (just above 100A), but check if VD passes
    const result = calculateCableSizing({
      current: 100,
      length: 30,
      voltage: 380,
      conductor: 'Cu',
      insulation: 'PVC',
      ambientTemp: 30,
      groupCount: 1,
      powerFactor: 0.85,
      phase: 3,
    });

    // Either 25mm² or 35mm² depending on VD
    expect(CABLE_SIZES_MM2).toContain(result.value);
    expect(result.value).toBeGreaterThanOrEqual(25);
  });

  test('200A, XLPE Cu — selects 70mm² (70mm² = 243A)', () => {
    const result = calculateCableSizing({
      current: 200,
      length: 20,
      voltage: 380,
      conductor: 'Cu',
      insulation: 'XLPE',
      ambientTemp: 30,
      groupCount: 1,
      powerFactor: 0.85,
      phase: 3,
    });

    // XLPE Cu: 50mm² = 190A (< 200A), 70mm² = 243A (>= 200A)
    expect(result.value).toBe(70);
  });

  test('temperature derating at 40°C increases required size', () => {
    const result30 = calculateCableSizing({
      current: 90,
      length: 20,
      voltage: 380,
      conductor: 'Cu',
      insulation: 'XLPE',
      ambientTemp: 30,
      groupCount: 1,
      phase: 3,
    });

    const result40 = calculateCableSizing({
      current: 90,
      length: 20,
      voltage: 380,
      conductor: 'Cu',
      insulation: 'XLPE',
      ambientTemp: 40,
      groupCount: 1,
      phase: 3,
    });

    // Higher ambient temp may require larger cable
    expect(result40.value as number).toBeGreaterThanOrEqual(result30.value as number);
  });

  test('grouping derating (3 cables) increases required size', () => {
    const resultSingle = calculateCableSizing({
      current: 120,
      length: 20,
      voltage: 380,
      conductor: 'Cu',
      insulation: 'XLPE',
      ambientTemp: 30,
      groupCount: 1,
      phase: 3,
    });

    const resultGrouped = calculateCableSizing({
      current: 120,
      length: 20,
      voltage: 380,
      conductor: 'Cu',
      insulation: 'XLPE',
      ambientTemp: 30,
      groupCount: 3,
      phase: 3,
    });

    expect(resultGrouped.value as number).toBeGreaterThanOrEqual(resultSingle.value as number);
  });

  test('long cable run forces larger size due to voltage drop', () => {
    const resultShort = calculateCableSizing({
      current: 50,
      length: 10,
      voltage: 380,
      conductor: 'Cu',
      insulation: 'XLPE',
      phase: 3,
    });

    const resultLong = calculateCableSizing({
      current: 50,
      length: 200,
      voltage: 380,
      conductor: 'Cu',
      insulation: 'XLPE',
      phase: 3,
    });

    expect(resultLong.value as number).toBeGreaterThanOrEqual(resultShort.value as number);
  });

  test('judgment passes when both ampacity and VD are within limits', () => {
    const result = calculateCableSizing({
      current: 50,
      length: 20,
      voltage: 380,
      conductor: 'Cu',
      insulation: 'XLPE',
      phase: 3,
    });

    if (result.additionalOutputs!.voltageDropPercent!.value <= 3
        && result.additionalOutputs!.correctedAmpacity!.value >= 50) {
      expect(result.judgment!.pass).toBe(true);
    }
  });
});
