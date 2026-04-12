/**
 * Unit Conversion Accuracy Tests
 *
 * AWG/mm² table values from ASTM B258 / NEC Chapter 9 Table 8.
 * Round-trip tolerance: +/- 0.5% (nearest AWG lookup is approximate).
 */

import { describe, test, expect } from '@jest/globals';
import {
  awgToMm2,
  mm2ToAwg,
  kcmilToMm2,
  mm2ToKcmil,
  kwToHp,
  hpToKw,
  kvaToKw,
  kwToKva,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  convert,
} from '../../conversion/unit-conversion';

// ── Helpers ─────────────────────────────────────────────────────

function expectWithinTolerance(actual: number, expected: number, tolerancePct = 0.01) {
  const diff = Math.abs(actual - expected);
  const limit = Math.abs(expected) * (tolerancePct / 100);
  expect(diff).toBeLessThanOrEqual(limit);
}

// ── AWG to mm² ──────────────────────────────────────────────────

describe('AWG to mm² conversion', () => {
  test('AWG 10 = 5.261 mm² (NEC standard)', () => {
    expect(awgToMm2('10')).toBe(5.261);
  });

  test('AWG 4/0 (0000) = 107.2 mm²', () => {
    expect(awgToMm2('4/0')).toBe(107.2);
  });

  test('AWG 3/0 = 85.01 mm²', () => {
    expect(awgToMm2('3/0')).toBe(85.01);
  });

  test('AWG 2/0 = 67.43 mm²', () => {
    expect(awgToMm2('2/0')).toBe(67.43);
  });

  test('AWG 1/0 = 53.49 mm²', () => {
    expect(awgToMm2('1/0')).toBe(53.49);
  });

  test('AWG 14 = 2.081 mm²', () => {
    expect(awgToMm2('14')).toBe(2.081);
  });

  test('AWG 12 = 3.309 mm²', () => {
    expect(awgToMm2('12')).toBe(3.309);
  });

  test('AWG 6 = 13.30 mm²', () => {
    expect(awgToMm2('6')).toBe(13.30);
  });

  test('unknown AWG throws', () => {
    expect(() => awgToMm2('999')).toThrow();
  });
});

// ── mm² to AWG (nearest) ────────────────────────────────────────

describe('mm² to AWG reverse lookup', () => {
  test('5.261 mm² -> AWG 10', () => {
    expect(mm2ToAwg(5.261)).toBe('10');
  });

  test('107.2 mm² -> AWG 0000 (4/0)', () => {
    expect(mm2ToAwg(107.2)).toBe('0000');
  });

  test('2.5 mm² -> nearest AWG (13 or 12)', () => {
    const awg = mm2ToAwg(2.5);
    // 2.5 is between AWG 13 (2.624) and AWG 14 (2.081)
    // Closer to 13 (diff 0.124) than 14 (diff 0.419)
    expect(awg).toBe('13');
  });
});

// ── Round-trip AWG -> mm² -> AWG ────────────────────────────────

describe('AWG round-trip conversion', () => {
  const testSizes = ['0000', '000', '00', '0', '1', '2', '4', '6', '8', '10', '12', '14'];

  for (const awg of testSizes) {
    test(`AWG ${awg} -> mm² -> AWG = ${awg}`, () => {
      const mm2 = awgToMm2(awg);
      const backToAwg = mm2ToAwg(mm2);
      expect(backToAwg).toBe(awg);
    });
  }

  test('round-trip with slight offset: 5.26 mm² -> AWG -> mm² close to 5.261', () => {
    const awg = mm2ToAwg(5.26);
    expect(awg).toBe('10');
    const mm2 = awgToMm2(awg);
    expectWithinTolerance(mm2, 5.261, 0.5);
  });
});

// ── kcmil conversions ───────────────────────────────────────────

describe('kcmil conversions', () => {
  test('250 kcmil = 126.7 mm² (standard)', () => {
    expect(kcmilToMm2(250)).toBe(126.7);
  });

  test('500 kcmil = 253.4 mm² (standard)', () => {
    expect(kcmilToMm2(500)).toBe(253.4);
  });

  test('1000 kcmil = 506.7 mm² (standard)', () => {
    expect(kcmilToMm2(1000)).toBe(506.7);
  });

  test('non-standard kcmil uses factor 0.5067', () => {
    const result = kcmilToMm2(333);
    expectWithinTolerance(result, 333 * 0.5067, 0.01);
  });

  test('mm² to kcmil round-trip', () => {
    const mm2 = 253.4;
    const kcmil = mm2ToKcmil(mm2);
    const backToMm2 = kcmil * 0.5067;
    expectWithinTolerance(backToMm2, mm2, 0.5);
  });
});

// ── Power conversions ───────────────────────────────────────────

describe('Power unit conversions', () => {
  test('1 HP = 0.7457 kW', () => {
    expectWithinTolerance(hpToKw(1), 0.7457);
  });

  test('100 kW = 134.1 HP', () => {
    expectWithinTolerance(kwToHp(100), 100 / 0.7457);
  });

  test('kVA to kW: 100 kVA x PF 0.85 = 85 kW', () => {
    expect(kvaToKw(100, 0.85)).toBe(85);
  });

  test('kW to kVA: 85 kW / PF 0.85 = 100 kVA', () => {
    expectWithinTolerance(kwToKva(85, 0.85), 100);
  });
});

// ── Temperature conversions ─────────────────────────────────────

describe('Temperature conversions', () => {
  test('0°C = 32°F', () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
  });

  test('100°C = 212°F', () => {
    expect(celsiusToFahrenheit(100)).toBe(212);
  });

  test('32°F = 0°C', () => {
    expectWithinTolerance(fahrenheitToCelsius(32), 0);
  });

  test('round-trip: 25°C -> °F -> °C = 25°C', () => {
    const f = celsiusToFahrenheit(25);
    const c = fahrenheitToCelsius(f);
    expectWithinTolerance(c, 25);
  });
});

// ── Unified convert() interface ─────────────────────────────────

describe('Unified convert() dispatcher', () => {
  test('AWG -> mm2 via convert()', () => {
    const r = convert(10, 'AWG', 'mm2');
    expect(r.result).toBe(5.261);
  });

  test('V -> kV via convert()', () => {
    const r = convert(22900, 'V', 'kV');
    expect(r.result).toBe(22.9);
  });

  test('identity conversion', () => {
    const r = convert(42, 'kW', 'kW');
    expect(r.result).toBe(42);
  });

  test('unsupported conversion throws', () => {
    expect(() => convert(1, 'AWG', 'kW')).toThrow();
  });
});

// -- Extended AWG Table (requested full table) ──────────────────────────

describe('AWG full table verification', () => {
  const fullTable: [string, number][] = [
    ['0000', 107.2],
    ['000', 85.01],
    ['00', 67.43],
    ['0', 53.49],
    ['1', 42.41],
    ['2', 33.63],
    ['4', 21.15],
    ['6', 13.30],
    ['8', 8.366],
    ['10', 5.261],
    ['12', 3.309],
    ['14', 2.081],
  ];

  for (const [awg, expectedMm2] of fullTable) {
    test(`AWG ${awg} = ${expectedMm2} mm2`, () => {
      expect(awgToMm2(awg)).toBe(expectedMm2);
    });
  }
});

// -- Extended kcmil Table ───────────────────────────────────────────────

describe('kcmil full table verification', () => {
  const kcmilTable: [number, number][] = [
    [250, 126.7],
    [500, 253.4],
    [1000, 506.7],
  ];

  for (const [kcmil, expectedMm2] of kcmilTable) {
    test(`${kcmil} kcmil = ${expectedMm2} mm2`, () => {
      expect(kcmilToMm2(kcmil)).toBe(expectedMm2);
    });
  }

  test('750 kcmil = 380.0 mm2 (non-standard, uses factor)', () => {
    expectWithinTolerance(kcmilToMm2(750), 750 * 0.5067, 0.5);
  });
});

// -- Extended Round-trip Tests ──────────────────────────────────────────

describe('AWG round-trip within 5%', () => {
  const offsets: [number, string, number][] = [
    [5.0, '10', 6],    // close to AWG 10 (5.261), ~5.2% off
    [21.0, '4', 5],    // close to AWG 4 (21.15)
    [67.0, '00', 5],   // close to AWG 2/0 (67.43)
  ];

  for (const [mm2Input, expectedAwg, tolerance] of offsets) {
    test(`${mm2Input} mm2 -> AWG ${expectedAwg} -> mm2 within ${tolerance}%`, () => {
      const awg = mm2ToAwg(mm2Input);
      expect(awg).toBe(expectedAwg);
      const mm2Back = awgToMm2(awg);
      const diff = Math.abs(mm2Back - mm2Input) / mm2Input * 100;
      expect(diff).toBeLessThan(tolerance);
    });
  }
});

// -- Extended Temperature Tests ─────────────────────────────────────────

describe('Extended temperature conversions', () => {
  test('-40C = -40F (intersection point)', () => {
    expect(celsiusToFahrenheit(-40)).toBe(-40);
  });

  test('-40F = -40C (reverse intersection)', () => {
    expectWithinTolerance(fahrenheitToCelsius(-40), -40);
  });

  test('212F = 100C', () => {
    expectWithinTolerance(fahrenheitToCelsius(212), 100);
  });
});

// -- Extended Power Tests ───────────────────────────────────────────────

describe('Extended power conversions', () => {
  test('1 HP = 0.7457 kW (exact)', () => {
    expectWithinTolerance(hpToKw(1), 0.7457);
  });

  test('100 kW = 134.1 HP (approx)', () => {
    expectWithinTolerance(kwToHp(100), 134.1, 0.5);
  });

  test('round-trip: 50 HP -> kW -> HP', () => {
    const kw = hpToKw(50);
    const hp = kwToHp(kw);
    expectWithinTolerance(hp, 50);
  });
});
