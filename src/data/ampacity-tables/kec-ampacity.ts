/**
 * KEC 허용전류표 (Korean Electrotechnical Code)
 *
 * KEC 232.3 기준 허용전류
 * 도체 종류: Cu (구리), Al (알루미늄)
 * 절연체: PVC (60°C), XLPE (90°C), MI (70°C Mineral Insulated)
 * 시공방법: conduit (전선관), tray (케이블트레이), directBuried (직매), freeAir (기중)
 *
 * 보정계수:
 *   - 주위온도 보정 (KEC 232.3.3)
 *   - 전선 밀집 보정 (KEC 232.3.4)
 */

import { SourceTag, createSource } from '../../engine/sjc/types';

// =========================================================================
// PART 1 — Types
// =========================================================================

export type ConductorMaterial = 'Cu' | 'Al';
export type InsulationType = 'PVC' | 'XLPE' | 'MI';
export type InstallationMethod = 'conduit' | 'tray' | 'directBuried' | 'freeAir';

export interface CorrectionFactor {
  type: 'temperature' | 'grouping';
  factor: number;
  description: string;
}

export interface AmpacityOptions {
  /** Cable cross-section in mm² */
  size: number;
  /** Conductor material */
  conductor: ConductorMaterial;
  /** Insulation type */
  insulation: InsulationType;
  /** Installation method */
  installation: InstallationMethod;
  /** Ambient temperature in °C (default: 30°C for KEC) */
  ambientTemp?: number;
  /** Number of grouped circuits (default: 1) */
  groupCount?: number;
}

export interface AmpacityResult {
  /** Base ampacity before correction (A) */
  ampacity: number;
  /** Corrected ampacity after all factors applied (A) */
  corrected: number;
  /** Applied correction factors */
  factors: CorrectionFactor[];
  /** Source reference */
  source: SourceTag;
}

// =========================================================================
// PART 2 — Standard Cable Sizes (mm²)
// =========================================================================

export const KEC_CABLE_SIZES = [
  1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630,
] as const;

// =========================================================================
// PART 3 — Base Ampacity Tables (A)
// KEC 232.3 Table — 30°C ambient, single circuit
// =========================================================================

/**
 * Key format: `${conductor}_${insulation}_${installation}`
 * Values indexed by KEC_CABLE_SIZES position
 */
type AmpacityTableKey = `${ConductorMaterial}_${InsulationType}_${InstallationMethod}`;

const BASE_AMPACITY: Record<AmpacityTableKey, number[]> = {
  // -----------------------------------------------------------------------
  // Copper — PVC (60°C)
  // -----------------------------------------------------------------------
  Cu_PVC_conduit:      [14.5, 19.5, 26, 34, 46, 61, 80, 99, 119, 151, 182, 210, 240, 273, 321, 367, 0, 0, 0],
  Cu_PVC_tray:         [15.5, 21, 28, 36, 50, 66, 84, 104, 125, 160, 194, 225, 260, 297, 350, 400, 0, 0, 0],
  Cu_PVC_directBuried: [18, 24, 31, 39, 52, 67, 86, 106, 128, 163, 197, 227, 259, 295, 346, 396, 0, 0, 0],
  Cu_PVC_freeAir:      [17, 23, 30, 38, 52, 69, 90, 111, 133, 171, 207, 239, 275, 314, 370, 426, 0, 0, 0],

  // -----------------------------------------------------------------------
  // Copper — XLPE (90°C)
  // -----------------------------------------------------------------------
  Cu_XLPE_conduit:     [19.5, 27, 36, 46, 63, 85, 112, 138, 168, 213, 258, 299, 344, 392, 461, 530, 600, 679, 770],
  Cu_XLPE_tray:        [21, 29, 38, 49, 68, 91, 119, 147, 179, 229, 278, 322, 371, 424, 500, 576, 649, 736, 835],
  Cu_XLPE_directBuried:[24, 32, 42, 54, 73, 95, 121, 150, 183, 233, 280, 324, 371, 423, 497, 571, 644, 729, 826],
  Cu_XLPE_freeAir:     [23, 31, 42, 54, 75, 100, 133, 164, 198, 253, 306, 354, 407, 464, 546, 629, 710, 806, 916],

  // -----------------------------------------------------------------------
  // Copper — MI (70°C)
  // -----------------------------------------------------------------------
  Cu_MI_conduit:       [16, 22, 30, 38, 52, 69, 90, 111, 134, 171, 207, 239, 275, 314, 370, 426, 0, 0, 0],
  Cu_MI_tray:          [17, 23, 31, 40, 55, 74, 96, 119, 144, 184, 223, 259, 298, 340, 401, 461, 0, 0, 0],
  Cu_MI_directBuried:  [19, 26, 34, 43, 58, 76, 98, 121, 147, 187, 227, 263, 302, 345, 406, 467, 0, 0, 0],
  Cu_MI_freeAir:       [19, 25, 33, 43, 59, 79, 104, 129, 156, 200, 242, 280, 322, 367, 433, 498, 0, 0, 0],

  // -----------------------------------------------------------------------
  // Aluminium — PVC (60°C)
  // -----------------------------------------------------------------------
  Al_PVC_conduit:      [0, 15, 20, 26, 36, 47, 62, 77, 93, 118, 142, 164, 189, 215, 252, 289, 0, 0, 0],
  Al_PVC_tray:         [0, 16.5, 22, 28, 39, 51, 66, 81, 98, 125, 152, 176, 203, 232, 274, 315, 0, 0, 0],
  Al_PVC_directBuried: [0, 18.5, 24, 30, 40, 52, 67, 83, 100, 127, 154, 178, 204, 233, 273, 313, 0, 0, 0],
  Al_PVC_freeAir:      [0, 18, 24, 30, 40, 54, 70, 87, 104, 133, 162, 188, 217, 247, 292, 335, 0, 0, 0],

  // -----------------------------------------------------------------------
  // Aluminium — XLPE (90°C)
  // -----------------------------------------------------------------------
  Al_XLPE_conduit:     [0, 21, 28, 36, 49, 66, 87, 107, 131, 167, 202, 234, 270, 308, 362, 416, 471, 533, 605],
  Al_XLPE_tray:        [0, 23, 30, 38, 53, 71, 93, 115, 140, 179, 217, 251, 291, 332, 392, 451, 510, 578, 655],
  Al_XLPE_directBuried:[0, 25, 33, 42, 57, 74, 95, 117, 143, 183, 220, 254, 291, 332, 390, 448, 506, 572, 649],
  Al_XLPE_freeAir:     [0, 24, 33, 42, 58, 78, 104, 128, 155, 198, 240, 278, 319, 364, 429, 494, 558, 633, 719],

  // -----------------------------------------------------------------------
  // Aluminium — MI (70°C)
  // -----------------------------------------------------------------------
  Al_MI_conduit:       [0, 17, 23, 30, 40, 54, 70, 87, 105, 134, 162, 188, 216, 247, 291, 334, 0, 0, 0],
  Al_MI_tray:          [0, 18, 24, 31, 43, 57, 75, 93, 113, 144, 175, 203, 234, 267, 315, 362, 0, 0, 0],
  Al_MI_directBuried:  [0, 20, 26, 33, 45, 59, 77, 95, 115, 147, 178, 206, 237, 270, 319, 367, 0, 0, 0],
  Al_MI_freeAir:       [0, 20, 26, 33, 46, 62, 81, 101, 122, 157, 190, 220, 253, 288, 340, 391, 0, 0, 0],
};

// =========================================================================
// PART 4 — Temperature Correction Factors (KEC 232.3.3)
// =========================================================================

interface TempCorrectionRow {
  ambientMin: number;
  ambientMax: number;
  pvc60: number;
  mi70: number;
  xlpe90: number;
}

/**
 * Temperature correction factors.
 * Base ambient temperature: 30°C for KEC.
 */
const TEMP_CORRECTION: TempCorrectionRow[] = [
  { ambientMin: 10, ambientMax: 15, pvc60: 1.22, mi70: 1.18, xlpe90: 1.15 },
  { ambientMin: 16, ambientMax: 20, pvc60: 1.17, mi70: 1.14, xlpe90: 1.12 },
  { ambientMin: 21, ambientMax: 25, pvc60: 1.12, mi70: 1.10, xlpe90: 1.08 },
  { ambientMin: 26, ambientMax: 30, pvc60: 1.00, mi70: 1.00, xlpe90: 1.00 },
  { ambientMin: 31, ambientMax: 35, pvc60: 0.91, mi70: 0.93, xlpe90: 0.94 },
  { ambientMin: 36, ambientMax: 40, pvc60: 0.82, mi70: 0.87, xlpe90: 0.87 },
  { ambientMin: 41, ambientMax: 45, pvc60: 0.71, mi70: 0.79, xlpe90: 0.79 },
  { ambientMin: 46, ambientMax: 50, pvc60: 0.58, mi70: 0.71, xlpe90: 0.71 },
  { ambientMin: 51, ambientMax: 55, pvc60: 0.41, mi70: 0.61, xlpe90: 0.61 },
  { ambientMin: 56, ambientMax: 60, pvc60: 0.00, mi70: 0.50, xlpe90: 0.50 },
];

function getTemperatureFactor(ambientTemp: number, insulation: InsulationType): number {
  for (const row of TEMP_CORRECTION) {
    if (ambientTemp >= row.ambientMin && ambientTemp <= row.ambientMax) {
      switch (insulation) {
        case 'PVC':  return row.pvc60;
        case 'MI':   return row.mi70;
        case 'XLPE': return row.xlpe90;
      }
    }
  }
  // Out of table range — extrapolate using the formula:
  // Kt = sqrt((Tmax - Tambient) / (Tmax - 30))
  const tMax = insulation === 'PVC' ? 60 : insulation === 'MI' ? 70 : 90;
  const numerator = tMax - ambientTemp;
  if (numerator <= 0) return 0;
  return Math.sqrt(numerator / (tMax - 30));
}

// =========================================================================
// PART 5 — Grouping Correction Factors (KEC 232.3.4)
// Number of current-carrying circuits or cables
// =========================================================================

const GROUPING_FACTORS: Array<{ min: number; max: number; factor: number }> = [
  { min: 1, max: 1, factor: 1.00 },
  { min: 2, max: 2, factor: 0.80 },
  { min: 3, max: 3, factor: 0.70 },
  { min: 4, max: 4, factor: 0.65 },
  { min: 5, max: 5, factor: 0.60 },
  { min: 6, max: 6, factor: 0.57 },
  { min: 7, max: 8, factor: 0.52 },
  { min: 9, max: 11, factor: 0.48 },
  { min: 12, max: 15, factor: 0.44 },
  { min: 16, max: 19, factor: 0.41 },
  { min: 20, max: Infinity, factor: 0.38 },
];

function getGroupingFactor(count: number): number {
  for (const row of GROUPING_FACTORS) {
    if (count >= row.min && count <= row.max) return row.factor;
  }
  return 0.38;
}

// =========================================================================
// PART 6 — Main Lookup Function
// =========================================================================

/**
 * Look up KEC ampacity with optional temperature and grouping corrections.
 *
 * @example
 * getAmpacity({ size: 25, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit' })
 * // => { ampacity: 112, corrected: 112, factors: [], source: {...} }
 *
 * getAmpacity({ size: 25, conductor: 'Cu', insulation: 'XLPE', installation: 'conduit', ambientTemp: 40, groupCount: 3 })
 * // => { ampacity: 112, corrected: 112 * 0.87 * 0.70 = 68.21, factors: [...], source: {...} }
 */
export function getAmpacity(opts: AmpacityOptions): AmpacityResult {
  const { size, conductor, insulation, installation, ambientTemp = 30, groupCount = 1 } = opts;

  // Find size index
  const sizeIdx = KEC_CABLE_SIZES.indexOf(size as (typeof KEC_CABLE_SIZES)[number]);
  if (sizeIdx === -1) {
    throw new Error(
      `Invalid cable size: ${size} mm². Valid KEC sizes: ${KEC_CABLE_SIZES.join(', ')}`,
    );
  }

  // Lookup base ampacity
  const tableKey = `${conductor}_${insulation}_${installation}` as AmpacityTableKey;
  const row = BASE_AMPACITY[tableKey];
  if (!row) {
    throw new Error(`No ampacity data for: ${tableKey}`);
  }

  const baseAmpacity = row[sizeIdx];
  if (baseAmpacity === 0) {
    throw new Error(
      `Cable size ${size} mm² is not available for ${conductor}/${insulation}/${installation}`,
    );
  }

  // Apply correction factors
  const factors: CorrectionFactor[] = [];
  let corrected = baseAmpacity;

  // Temperature correction
  if (ambientTemp !== 30) {
    const tf = getTemperatureFactor(ambientTemp, insulation);
    if (tf === 0) {
      throw new Error(`Ambient temperature ${ambientTemp}°C exceeds maximum for ${insulation} insulation`);
    }
    factors.push({
      type: 'temperature',
      factor: tf,
      description: `주위온도 보정: ${ambientTemp}°C (기준 30°C), 계수 ${tf}`,
    });
    corrected *= tf;
  }

  // Grouping correction
  if (groupCount > 1) {
    const gf = getGroupingFactor(groupCount);
    factors.push({
      type: 'grouping',
      factor: gf,
      description: `전선 밀집 보정: ${groupCount}회선, 계수 ${gf}`,
    });
    corrected *= gf;
  }

  return {
    ampacity: baseAmpacity,
    corrected: Math.round(corrected * 100) / 100,
    factors,
    source: createSource('KEC', '232.3', {
      edition: '2021',
      verifiedAt: '2024-12-01',
    }),
  };
}

// =========================================================================
// PART 7 — Utility Exports
// =========================================================================

/** Get all available sizes for a given configuration */
export function getAvailableSizes(
  conductor: ConductorMaterial,
  insulation: InsulationType,
  installation: InstallationMethod,
): number[] {
  const tableKey = `${conductor}_${insulation}_${installation}` as AmpacityTableKey;
  const row = BASE_AMPACITY[tableKey];
  if (!row) return [];
  return KEC_CABLE_SIZES.filter((_, idx) => row[idx] > 0);
}

/** Find minimum cable size for a given current */
export function findMinCableSize(
  current: number,
  conductor: ConductorMaterial,
  insulation: InsulationType,
  installation: InstallationMethod,
  ambientTemp = 30,
  groupCount = 1,
): { size: number; ampacity: number; corrected: number } | null {
  const available = getAvailableSizes(conductor, insulation, installation);
  for (const size of available) {
    const result = getAmpacity({ size, conductor, insulation, installation, ambientTemp, groupCount });
    if (result.corrected >= current) {
      return { size, ampacity: result.ampacity, corrected: result.corrected };
    }
  }
  return null;
}
