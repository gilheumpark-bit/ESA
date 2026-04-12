/**
 * Unit Conversion Engine
 *
 * Provides bidirectional conversion between all electrical engineering unit
 * systems used in KEC, NEC, IEC, and global practice.
 *
 * Key tables:
 *   - AWG_TABLE: AWG designation -> cross-sectional area in mm²
 *   - KCMIL_FACTOR: 1 kcmil = 0.5067 mm²
 *   - HP/kW, kVA/kW, V/kV, °C/°F, Ohm/pu
 */

// =========================================================================
// PART 1 — AWG ↔ mm² Full Table (AWG 0000 through 40)
// =========================================================================

/**
 * Complete AWG to mm² mapping.
 * Formula: d(mm) = 0.127 × 92^((36-n)/39), area = π/4 × d²
 * Values here are the accepted standard rounded values used in NEC/UL practice.
 */
export const AWG_TABLE: Map<string, number> = new Map<string, number>([
  // Large sizes (using "0000"/"000"/"00"/"0" notation)
  ['0000', 107.2],    // 4/0 AWG
  ['000',   85.01],   // 3/0 AWG
  ['00',    67.43],   // 2/0 AWG
  ['0',     53.49],   // 1/0 AWG
  // Standard AWG numbers
  ['1',     42.41],
  ['2',     33.63],
  ['3',     26.67],
  ['4',     21.15],
  ['5',     16.77],
  ['6',     13.30],
  ['7',     10.55],
  ['8',      8.366],
  ['9',      6.632],
  ['10',     5.261],
  ['11',     4.172],
  ['12',     3.309],
  ['13',     2.624],
  ['14',     2.081],
  ['15',     1.650],
  ['16',     1.309],
  ['17',     1.038],
  ['18',     0.8230],
  ['19',     0.6527],
  ['20',     0.5176],
  ['21',     0.4105],
  ['22',     0.3255],
  ['23',     0.2582],
  ['24',     0.2047],
  ['25',     0.1624],
  ['26',     0.1288],
  ['27',     0.1021],
  ['28',     0.08098],
  ['29',     0.06422],
  ['30',     0.05093],
  ['31',     0.04039],
  ['32',     0.03203],
  ['33',     0.02540],
  ['34',     0.02011],
  ['35',     0.01594],
  ['36',     0.01266],
  ['37',     0.01003],
  ['38',     0.007950],
  ['39',     0.006305],
  ['40',     0.004998],
]);

/** Reverse lookup: mm² → AWG (finds nearest) */
const AWG_REVERSE: Array<{ awg: string; mm2: number }> = (() => {
  const entries: Array<{ awg: string; mm2: number }> = [];
  AWG_TABLE.forEach((mm2, awg) => entries.push({ awg, mm2 }));
  entries.sort((a, b) => b.mm2 - a.mm2);
  return entries;
})();

/** Also accept "4/0", "3/0", "2/0", "1/0" aliases */
const AWG_ALIASES: Record<string, string> = {
  '4/0': '0000',
  '3/0': '000',
  '2/0': '00',
  '1/0': '0',
};

// =========================================================================
// PART 2 — kcmil ↔ mm² Conversion
// =========================================================================

/** 1 kcmil (thousand circular mils) = 0.5067 mm² */
const KCMIL_TO_MM2 = 0.5067;

// =========================================================================
// PART 3 — Standard kcmil Sizes
// =========================================================================

export const KCMIL_SIZES: Map<number, number> = new Map<number, number>([
  [250,   126.7],
  [300,   152.0],
  [350,   177.3],
  [400,   202.7],
  [500,   253.4],
  [600,   304.0],
  [700,   354.7],
  [750,   380.0],
  [800,   405.4],
  [900,   456.0],
  [1000,  506.7],
  [1250,  633.4],
  [1500,  760.1],
  [1750,  886.7],
  [2000, 1013.4],
]);

// =========================================================================
// PART 4 — Conversion Constants
// =========================================================================

const HP_TO_KW = 0.7457;   // 1 mechanical horsepower = 0.7457 kW
const KV_FACTOR = 1000;     // 1 kV = 1000 V

// =========================================================================
// PART 5 — Core Conversion Functions
// =========================================================================

export function awgToMm2(awg: string): number {
  const normalized = AWG_ALIASES[awg] ?? awg;
  const val = AWG_TABLE.get(normalized);
  if (val === undefined) {
    throw new Error(`Unknown AWG size: "${awg}"`);
  }
  return val;
}

export function mm2ToAwg(mm2: number): string {
  let closest = AWG_REVERSE[0];
  let minDiff = Math.abs(mm2 - closest.mm2);
  for (const entry of AWG_REVERSE) {
    const diff = Math.abs(mm2 - entry.mm2);
    if (diff < minDiff) {
      minDiff = diff;
      closest = entry;
    }
  }
  return closest.awg;
}

export function kcmilToMm2(kcmil: number): number {
  // Check standard sizes first
  const standard = KCMIL_SIZES.get(kcmil);
  if (standard !== undefined) return standard;
  return kcmil * KCMIL_TO_MM2;
}

export function mm2ToKcmil(mm2: number): number {
  return mm2 / KCMIL_TO_MM2;
}

export function kwToHp(kw: number): number {
  return kw / HP_TO_KW;
}

export function hpToKw(hp: number): number {
  return hp * HP_TO_KW;
}

export function kvaToKw(kva: number, powerFactor: number): number {
  if (powerFactor < 0 || powerFactor > 1) {
    throw new RangeError(`Power factor must be 0-1, got ${powerFactor}`);
  }
  return kva * powerFactor;
}

export function kwToKva(kw: number, powerFactor: number): number {
  if (powerFactor <= 0 || powerFactor > 1) {
    throw new RangeError(`Power factor must be >0 and <=1, got ${powerFactor}`);
  }
  return kw / powerFactor;
}

export function vToKv(v: number): number {
  return v / KV_FACTOR;
}

export function kvToV(kv: number): number {
  return kv * KV_FACTOR;
}

export function celsiusToFahrenheit(c: number): number {
  return c * 9 / 5 + 32;
}

export function fahrenheitToCelsius(f: number): number {
  return (f - 32) * 5 / 9;
}

/**
 * Convert impedance between Ohm and per-unit (pu).
 * Base impedance Zbase = Vbase² / Sbase
 */
export function ohmToPu(
  ohm: number,
  baseVoltageKv: number,
  baseMva: number,
): number {
  const baseImpedance = (baseVoltageKv * 1000) ** 2 / (baseMva * 1e6);
  return ohm / baseImpedance;
}

export function puToOhm(
  pu: number,
  baseVoltageKv: number,
  baseMva: number,
): number {
  const baseImpedance = (baseVoltageKv * 1000) ** 2 / (baseMva * 1e6);
  return pu * baseImpedance;
}

// =========================================================================
// PART 6 — Unified convert() Interface
// =========================================================================

export type UnitType =
  | 'AWG' | 'mm2' | 'kcmil'
  | 'kW' | 'HP' | 'kVA'
  | 'V' | 'kV'
  | 'C' | 'F'
  | 'ohm' | 'pu';

export interface ConvertResult {
  result: number;
  formula: string;
}

export interface ConvertOptions {
  powerFactor?: number;
  baseVoltageKv?: number;
  baseMva?: number;
}

/**
 * Universal conversion dispatcher.
 *
 * @param value     - numeric input
 * @param fromUnit  - source unit
 * @param toUnit    - target unit
 * @param opts      - extra parameters needed for certain conversions (pf, base Z)
 * @returns         - { result, formula }
 */
export function convert(
  value: number,
  fromUnit: UnitType,
  toUnit: UnitType,
  opts: ConvertOptions = {},
): ConvertResult {
  if (fromUnit === toUnit) {
    return { result: value, formula: `${value} ${fromUnit} = ${value} ${toUnit} (identity)` };
  }

  const key = `${fromUnit}->${toUnit}`;

  switch (key) {
    // AWG ↔ mm²
    case 'AWG->mm2': {
      const r = awgToMm2(String(value));
      return { result: r, formula: `AWG ${value} = ${r} mm²` };
    }
    case 'mm2->AWG': {
      const awg = mm2ToAwg(value);
      return { result: AWG_TABLE.get(AWG_ALIASES[awg] ?? awg)!, formula: `${value} mm² ≈ AWG ${awg}` };
    }

    // kcmil ↔ mm²
    case 'kcmil->mm2': {
      const r = kcmilToMm2(value);
      return { result: r, formula: `${value} kcmil × ${KCMIL_TO_MM2} = ${r} mm²` };
    }
    case 'mm2->kcmil': {
      const r = mm2ToKcmil(value);
      return { result: r, formula: `${value} mm² / ${KCMIL_TO_MM2} = ${r.toFixed(1)} kcmil` };
    }

    // kW ↔ HP
    case 'kW->HP': {
      const r = kwToHp(value);
      return { result: r, formula: `${value} kW / ${HP_TO_KW} = ${r.toFixed(4)} HP` };
    }
    case 'HP->kW': {
      const r = hpToKw(value);
      return { result: r, formula: `${value} HP × ${HP_TO_KW} = ${r.toFixed(4)} kW` };
    }

    // kVA ↔ kW
    case 'kVA->kW': {
      const pf = opts.powerFactor ?? 0.9;
      const r = kvaToKw(value, pf);
      return { result: r, formula: `${value} kVA × ${pf} (pf) = ${r.toFixed(2)} kW` };
    }
    case 'kW->kVA': {
      const pf = opts.powerFactor ?? 0.9;
      const r = kwToKva(value, pf);
      return { result: r, formula: `${value} kW / ${pf} (pf) = ${r.toFixed(2)} kVA` };
    }

    // V ↔ kV
    case 'V->kV': {
      const r = vToKv(value);
      return { result: r, formula: `${value} V / 1000 = ${r} kV` };
    }
    case 'kV->V': {
      const r = kvToV(value);
      return { result: r, formula: `${value} kV × 1000 = ${r} V` };
    }

    // Celsius ↔ Fahrenheit
    case 'C->F': {
      const r = celsiusToFahrenheit(value);
      return { result: r, formula: `${value}°C × 9/5 + 32 = ${r.toFixed(1)}°F` };
    }
    case 'F->C': {
      const r = fahrenheitToCelsius(value);
      return { result: r, formula: `(${value}°F - 32) × 5/9 = ${r.toFixed(1)}°C` };
    }

    // Ohm ↔ pu
    case 'ohm->pu': {
      const vb = opts.baseVoltageKv;
      const sb = opts.baseMva;
      if (vb === undefined || sb === undefined) {
        throw new Error('ohm->pu conversion requires baseVoltageKv and baseMva');
      }
      const r = ohmToPu(value, vb, sb);
      const zBase = ((vb * 1000) ** 2) / (sb * 1e6);
      return { result: r, formula: `${value} Ω / Zbase(${zBase.toFixed(4)} Ω) = ${r.toFixed(6)} pu` };
    }
    case 'pu->ohm': {
      const vb = opts.baseVoltageKv;
      const sb = opts.baseMva;
      if (vb === undefined || sb === undefined) {
        throw new Error('pu->ohm conversion requires baseVoltageKv and baseMva');
      }
      const r = puToOhm(value, vb, sb);
      const zBase = ((vb * 1000) ** 2) / (sb * 1e6);
      return { result: r, formula: `${value} pu × Zbase(${zBase.toFixed(4)} Ω) = ${r.toFixed(4)} Ω` };
    }

    default:
      throw new Error(`Unsupported conversion: ${fromUnit} -> ${toUnit}`);
  }
}
