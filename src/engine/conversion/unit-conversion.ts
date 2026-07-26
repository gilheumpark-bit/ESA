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
/** 굵은 규격의 수식상 번수 — 1/0 은 0, 이후 한 단계마다 1씩 내려간다. */
const ZERO_SERIES_GAUGE: Record<string, number> = {
  '1/0': 0, '0': 0,
  '2/0': -1, '00': -1,
  '3/0': -2, '000': -2,
  '4/0': -3, '0000': -3,
};

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
// PART 4a — Imperial ↔ Metric Length/Area Constants (±0.01% 정밀도)
// =========================================================================

/** 1 inch = 25.4 mm (정의값 — 오차 0%) */
const INCH_TO_MM = 25.4;
/** 1 foot = 0.3048 m (정의값 — 오차 0%) */
const FOOT_TO_METER = 0.3048;
/** 1 yard = 0.9144 m */
const YARD_TO_METER = 0.9144;
/** 1 mile = 1609.344 m */
const MILE_TO_METER = 1609.344;
/** 1 sq inch = 645.16 mm² */
const SQINCH_TO_SQMM = 645.16;
/** 1 sq foot = 0.09290304 m² */
const SQFOOT_TO_SQM = 0.09290304;

// =========================================================================
// PART 5 — Core Conversion Functions
// =========================================================================

/**
 * 화면에 찍을 자릿수.
 *
 * 각 분기는 formula 문자열에서만 자릿수를 정하고 result 는 원시값을 준다.
 * 그래서 같은 카드 안에서 헤드라인이 "134.1021858656296 HP", 그 아래 공식이
 * "134.1021 HP" 로 갈렸다(실측 2026-07-26). 엔진 raw 는 정밀도를 유지해야
 * 하므로 자릿수는 표시하는 쪽에서만 다듬는다 — 분기별 자릿수 표를 또 만들면
 * 그 표가 다시 어긋난다.
 */
export function formatConverted(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return String(value);
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return String(Number(value.toFixed(decimals)));
}

/** 표에 있는 AWG 규격인가 — 문자열 입력을 받아들일 유일한 근거. */
export function isAwgSize(raw: string): boolean {
  return AWG_TABLE.has(AWG_ALIASES[raw] ?? raw);
}

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

// ── Imperial ↔ Metric 길이/면적 변환 ──

export function inchToMm(inch: number): number { return inch * INCH_TO_MM; }
export function mmToInch(mm: number): number { return mm / INCH_TO_MM; }
export function footToMeter(ft: number): number { return ft * FOOT_TO_METER; }
export function meterToFoot(m: number): number { return m / FOOT_TO_METER; }
export function yardToMeter(yd: number): number { return yd * YARD_TO_METER; }
export function meterToYard(m: number): number { return m / YARD_TO_METER; }
export function mileToMeter(mi: number): number { return mi * MILE_TO_METER; }
export function meterToMile(m: number): number { return m / MILE_TO_METER; }
export function sqInchToSqMm(sqin: number): number { return sqin * SQINCH_TO_SQMM; }
export function sqMmToSqInch(sqmm: number): number { return sqmm / SQINCH_TO_SQMM; }
export function sqFootToSqM(sqft: number): number { return sqft * SQFOOT_TO_SQM; }
export function sqMToSqFoot(sqm: number): number { return sqm / SQFOOT_TO_SQM; }

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
  | 'ohm' | 'pu'
  | 'inch' | 'mm' | 'ft' | 'm' | 'yd' | 'mile'
  | 'sqin' | 'sqmm' | 'sqft' | 'sqm';

export interface ConvertResult {
  result: number;
  formula: string;
  /**
   * 숫자로 다 담기지 않는 결과의 관용 표기. mm²→AWG 의 굵은 규격은 1/0·2/0·
   * 3/0·4/0 으로 쓰지 12·10 처럼 세지 않는다(수식에서는 각각 0·-1·-2·-3).
   * 화면은 이 값이 있으면 이것을 보여준다.
   */
  label?: string;
}

export interface ConvertOptions {
  powerFactor?: number;
  baseVoltageKv?: number;
  baseMva?: number;
}

/**
 * Universal conversion dispatcher.
 *
 * @param input     - 수치. 단 AWG 는 "4/0"·"0000" 처럼 숫자가 아닌 규격명을 쓰므로
 *                    문자열도 받는다. 그 외 단위는 문자열이 와도 수치로 읽는다.
 * @param fromUnit  - source unit
 * @param toUnit    - target unit
 * @param opts      - extra parameters needed for certain conversions (pf, base Z)
 * @returns         - { result, formula }
 */
export function convert(
  input: number | string,
  fromUnit: UnitType,
  toUnit: UnitType,
  opts: ConvertOptions = {},
): ConvertResult {
  // 굵은 AWG 규격은 숫자로 뭉개면 안 된다 — Number('0000') 은 0 이 되어
  // 107.2mm²(4/0) 가 53.49mm²(1/0) 로 바뀐다. 원문은 AWG 분기만 쓴다.
  const value = typeof input === 'number' ? input : Number(input);

  if (fromUnit === toUnit) {
    return { result: value, formula: `${input} ${fromUnit} = ${input} ${toUnit} (identity)` };
  }

  const key = `${fromUnit}->${toUnit}`;

  switch (key) {
    // AWG ↔ mm²
    case 'AWG->mm2': {
      const r = awgToMm2(String(input));
      return { result: r, formula: `AWG ${input} = ${r} mm²` };
    }
    case 'mm2->AWG': {
      // 다른 분기는 전부 **목표 단위의 값**을 돌려주는데 여기만 AWG_TABLE 로
      // 되돌아가 원 단위(mm²) 값을 돌려주고 있었다. 그 값이 to.unit='AWG' 와
      // 함께 화면에 찍혀 "53.49 AWG" 라는 없는 규격이 표시됐다(실측 2026-07-26:
      // 50mm² → 53.49 는 AWG 1/0 의 단면적이다). 굵은 규격의 수식상 번수는
      // 1/0=0, 2/0=-1, 3/0=-2, 4/0=-3 이다.
      const awg = mm2ToAwg(value);
      const gauge = ZERO_SERIES_GAUGE[awg] ?? Number(awg);
      return {
        result: gauge,
        // 단위(AWG)는 표시하는 쪽이 붙인다 — 여기 넣으면 "AWG 0 AWG" 가 된다.
        label: awg,
        formula: `${value} mm² ≈ AWG ${awg} (${AWG_TABLE.get(AWG_ALIASES[awg] ?? awg)!} mm²)`,
      };
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

    // inch ↔ mm
    case 'inch->mm': {
      const r = inchToMm(value);
      return { result: r, formula: `${value} in × ${INCH_TO_MM} = ${r} mm` };
    }
    case 'mm->inch': {
      const r = mmToInch(value);
      return { result: r, formula: `${value} mm / ${INCH_TO_MM} = ${r.toFixed(4)} in` };
    }

    // ft ↔ m
    case 'ft->m': {
      const r = footToMeter(value);
      return { result: r, formula: `${value} ft × ${FOOT_TO_METER} = ${r.toFixed(4)} m` };
    }
    case 'm->ft': {
      const r = meterToFoot(value);
      return { result: r, formula: `${value} m / ${FOOT_TO_METER} = ${r.toFixed(4)} ft` };
    }

    // yd ↔ m
    case 'yd->m': {
      const r = yardToMeter(value);
      return { result: r, formula: `${value} yd × ${YARD_TO_METER} = ${r.toFixed(4)} m` };
    }
    case 'm->yd': {
      const r = meterToYard(value);
      return { result: r, formula: `${value} m / ${YARD_TO_METER} = ${r.toFixed(4)} yd` };
    }

    // mile ↔ m
    case 'mile->m': {
      const r = mileToMeter(value);
      return { result: r, formula: `${value} mi × ${MILE_TO_METER} = ${r.toFixed(3)} m` };
    }
    case 'm->mile': {
      const r = meterToMile(value);
      return { result: r, formula: `${value} m / ${MILE_TO_METER} = ${r.toFixed(6)} mi` };
    }

    // sqin ↔ sqmm
    case 'sqin->sqmm': {
      const r = sqInchToSqMm(value);
      return { result: r, formula: `${value} in² × ${SQINCH_TO_SQMM} = ${r.toFixed(2)} mm²` };
    }
    case 'sqmm->sqin': {
      const r = sqMmToSqInch(value);
      return { result: r, formula: `${value} mm² / ${SQINCH_TO_SQMM} = ${r.toFixed(6)} in²` };
    }

    // sqft ↔ sqm
    case 'sqft->sqm': {
      const r = sqFootToSqM(value);
      return { result: r, formula: `${value} ft² × ${SQFOOT_TO_SQM} = ${r.toFixed(6)} m²` };
    }
    case 'sqm->sqft': {
      const r = sqMToSqFoot(value);
      return { result: r, formula: `${value} m² / ${SQFOOT_TO_SQM} = ${r.toFixed(4)} ft²` };
    }

    default:
      throw new Error(`Unsupported conversion: ${fromUnit} -> ${toUnit}`);
  }
}
