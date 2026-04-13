/**
 * IEC 60364-5-52 Ampacity Tables
 *
 * IEC 60364-5-52 Table B.52-2 through B.52-5
 *   Allowable current-carrying capacities for cables
 *   Reference methods A1, A2, B1, B2, C, D, E, F
 *   Based on ambient air temperature 30°C / ground temperature 20°C
 *
 * IEC 60364-5-52 Table B.52-14 — Temperature correction
 * IEC 60364-5-52 Table B.52-17 — Grouping correction
 */

import { SourceTag, createSource } from '../../engine/sjc/types';

// =========================================================================
// PART 1 — Types
// =========================================================================

export type IecConductorMaterial = 'Cu' | 'Al';
export type IecInsulationType = 'PVC' | 'XLPE' | 'EPR';
export type IecInstallMethod = 'A1' | 'A2' | 'B1' | 'B2' | 'C' | 'D' | 'E' | 'F';

export interface IecCorrectionFactor {
  type: 'temperature' | 'grouping' | 'soil_thermal';
  factor: number;
  description: string;
}

export interface IecAmpacityOptions {
  /** Cable cross-section in mm² */
  size: number;
  /** Conductor material */
  conductor: IecConductorMaterial;
  /** Insulation type */
  insulation: IecInsulationType;
  /** Installation reference method (default: C) */
  method?: IecInstallMethod;
  /** Ambient temperature °C (default: 30°C air, 20°C ground for method D) */
  ambientTemp?: number;
  /** Number of grouped circuits (default: 1) */
  groupCount?: number;
}

export interface IecAmpacityResult {
  ampacity: number;
  corrected: number;
  factors: IecCorrectionFactor[];
  source: SourceTag;
}

// =========================================================================
// PART 2 — Standard Cable Sizes (mm²) — IEC 60228
// =========================================================================

export const IEC_CABLE_SIZES = [
  1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630,
] as const;

export type IecSize = (typeof IEC_CABLE_SIZES)[number];

// =========================================================================
// PART 3 — Base Ampacity Data
// IEC 60364-5-52 Table B.52-4 (Method C — single-layer on wall/tray)
// =========================================================================

type IecAmpacityKey = `${IecConductorMaterial}_${IecInsulationType}_${IecInstallMethod}`;

/**
 * IEC 60364-5-52 Tables B.52-2 through B.52-5
 * Values indexed by IEC_CABLE_SIZES position
 * Method C values used as primary; A1/B1/D as secondary
 */
const IEC_BASE_AMPACITY: Partial<Record<IecAmpacityKey, number[]>> = {
  // ── Method C: Clipped direct to wall, single-layer ──
  // Copper / PVC (70°C)
  Cu_PVC_C: [
    17.5, 24, 32, 41, 57, 76, 101, 125, 151, 192, 232, 269, 309, 353, 415, 477, 0, 0, 0,
  ],
  // Copper / XLPE (90°C)
  Cu_XLPE_C: [
    23, 31, 42, 54, 75, 100, 133, 164, 198, 253, 306, 354, 407, 464, 546, 629, 710, 806, 916,
  ],
  // Copper / EPR (90°C) — same as XLPE per IEC
  Cu_EPR_C: [
    23, 31, 42, 54, 75, 100, 133, 164, 198, 253, 306, 354, 407, 464, 546, 629, 710, 806, 916,
  ],
  // Aluminium / PVC (70°C)
  Al_PVC_C: [
    13.5, 18.5, 25, 32, 44, 59, 78, 97, 118, 150, 181, 210, 241, 276, 324, 372, 0, 0, 0,
  ],
  // Aluminium / XLPE (90°C)
  Al_XLPE_C: [
    18, 24, 33, 43, 58, 78, 103, 128, 154, 198, 239, 276, 318, 362, 427, 490, 554, 628, 713,
  ],
  // Aluminium / EPR (90°C)
  Al_EPR_C: [
    18, 24, 33, 43, 58, 78, 103, 128, 154, 198, 239, 276, 318, 362, 427, 490, 554, 628, 713,
  ],

  // ── Method A1: Enclosed in conduit in thermally insulated wall ──
  Cu_PVC_A1: [
    14.5, 19.5, 26, 34, 46, 61, 80, 99, 119, 151, 182, 210, 240, 273, 321, 367, 0, 0, 0,
  ],
  Cu_XLPE_A1: [
    19.5, 27, 36, 46, 63, 85, 112, 138, 168, 213, 258, 299, 344, 392, 461, 530, 600, 679, 770,
  ],
  Al_PVC_A1: [
    11, 15, 20, 26, 36, 47, 62, 77, 93, 118, 142, 164, 189, 215, 252, 289, 0, 0, 0,
  ],
  Al_XLPE_A1: [
    15, 21, 28, 36, 49, 66, 87, 107, 131, 167, 202, 234, 270, 308, 362, 416, 471, 533, 605,
  ],

  // ── Method B1: Enclosed in conduit on wall ──
  Cu_PVC_B1: [
    15.5, 21, 28, 36, 50, 68, 89, 110, 134, 171, 207, 239, 275, 314, 370, 426, 0, 0, 0,
  ],
  Cu_XLPE_B1: [
    20, 28, 37, 48, 66, 88, 117, 144, 175, 224, 271, 314, 361, 412, 485, 559, 0, 0, 0,
  ],

  // ── Method D: Direct buried in ground (20°C base) ──
  Cu_PVC_D: [
    22, 29, 37, 46, 61, 79, 101, 124, 148, 187, 226, 261, 298, 340, 398, 455, 0, 0, 0,
  ],
  Cu_XLPE_D: [
    27, 36, 46, 58, 77, 100, 127, 157, 190, 240, 290, 335, 384, 437, 513, 588, 665, 753, 855,
  ],
  Al_PVC_D: [
    17, 22, 29, 36, 47, 61, 79, 96, 115, 146, 176, 203, 232, 265, 310, 355, 0, 0, 0,
  ],
  Al_XLPE_D: [
    21, 28, 36, 45, 60, 78, 99, 122, 148, 187, 226, 261, 300, 341, 400, 459, 519, 587, 666,
  ],

  // ── Method E: Free air (on perforated tray) ──
  Cu_PVC_E: [
    19, 26, 35, 45, 61, 81, 107, 134, 162, 208, 253, 293, 338, 386, 455, 524, 0, 0, 0,
  ],
  Cu_XLPE_E: [
    26, 36, 49, 63, 86, 115, 149, 185, 225, 289, 352, 410, 473, 542, 641, 741, 0, 0, 0,
  ],
};

// =========================================================================
// PART 4 — Temperature Correction Factors
// IEC 60364-5-52 Table B.52-14
// =========================================================================

interface IecTempCorrRow {
  ambientMin: number;
  ambientMax: number;
  pvc70: number;
  xlpe90: number;
}

const IEC_TEMP_CORRECTION: IecTempCorrRow[] = [
  { ambientMin: 10, ambientMax: 15, pvc70: 1.22, xlpe90: 1.15 },
  { ambientMin: 16, ambientMax: 20, pvc70: 1.17, xlpe90: 1.12 },
  { ambientMin: 21, ambientMax: 25, pvc70: 1.12, xlpe90: 1.08 },
  { ambientMin: 26, ambientMax: 30, pvc70: 1.00, xlpe90: 1.00 },
  { ambientMin: 31, ambientMax: 35, pvc70: 0.87, xlpe90: 0.94 },
  { ambientMin: 36, ambientMax: 40, pvc70: 0.71, xlpe90: 0.87 },
  { ambientMin: 41, ambientMax: 45, pvc70: 0.50, xlpe90: 0.79 },
  { ambientMin: 46, ambientMax: 50, pvc70: 0.00, xlpe90: 0.71 },
  { ambientMin: 51, ambientMax: 55, pvc70: 0.00, xlpe90: 0.61 },
  { ambientMin: 56, ambientMax: 60, pvc70: 0.00, xlpe90: 0.50 },
];

function getIecTempFactor(ambientTemp: number, insulation: IecInsulationType): number {
  const isXlpeType = insulation === 'XLPE' || insulation === 'EPR';
  for (const row of IEC_TEMP_CORRECTION) {
    if (ambientTemp >= row.ambientMin && ambientTemp <= row.ambientMax) {
      return isXlpeType ? row.xlpe90 : row.pvc70;
    }
  }
  // Extrapolate
  const tMax = isXlpeType ? 90 : 70;
  const baseAmbient = insulation === 'PVC' ? 30 : 30;
  const numerator = tMax - ambientTemp;
  if (numerator <= 0) return 0;
  return Math.sqrt(numerator / (tMax - baseAmbient));
}

// =========================================================================
// PART 5 — Grouping Correction Factors
// IEC 60364-5-52 Table B.52-17
// =========================================================================

const IEC_GROUPING_FACTORS: Array<{ min: number; max: number; factor: number }> = [
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

function getIecGroupingFactor(count: number): number {
  for (const row of IEC_GROUPING_FACTORS) {
    if (count >= row.min && count <= row.max) return row.factor;
  }
  return 0.38;
}

// =========================================================================
// PART 6 — Main Lookup Function
// =========================================================================

/**
 * Look up IEC 60364-5-52 ampacity with temperature and grouping corrections.
 *
 * @example
 * getIecAmpacity({ size: 25, conductor: 'Cu', insulation: 'XLPE' })
 * // => { ampacity: 133, corrected: 133, factors: [], source: {...} }
 */
export function getIecAmpacity(opts: IecAmpacityOptions): IecAmpacityResult {
  const {
    size, conductor, insulation,
    method = 'C',
    ambientTemp = 30,
    groupCount = 1,
  } = opts;

  // Find size index
  const sizeIdx = IEC_CABLE_SIZES.indexOf(size as IecSize);
  if (sizeIdx === -1) {
    throw new Error(
      `Invalid IEC cable size: ${size} mm². Valid sizes: ${IEC_CABLE_SIZES.join(', ')}`,
    );
  }

  // Try exact key first, then fallback to method C
  const primaryKey = `${conductor}_${insulation}_${method}` as IecAmpacityKey;
  const fallbackKey = `${conductor}_${insulation}_C` as IecAmpacityKey;
  const row = IEC_BASE_AMPACITY[primaryKey] ?? IEC_BASE_AMPACITY[fallbackKey];

  if (!row) {
    throw new Error(`No IEC ampacity data for: ${conductor}/${insulation}/${method}`);
  }

  const baseAmpacity = row[sizeIdx];
  if (baseAmpacity === 0) {
    throw new Error(
      `Cable size ${size} mm² not available for ${conductor}/${insulation}/${method}`,
    );
  }

  const factors: IecCorrectionFactor[] = [];
  let corrected = baseAmpacity;

  // Temperature correction
  if (ambientTemp !== 30) {
    const tf = getIecTempFactor(ambientTemp, insulation);
    if (tf === 0) {
      throw new Error(
        `Ambient temperature ${ambientTemp}°C exceeds maximum for ${insulation} insulation`,
      );
    }
    factors.push({
      type: 'temperature',
      factor: tf,
      description: `IEC 60364-5-52 Table B.52-14: ambient ${ambientTemp}°C, factor = ${tf}`,
    });
    corrected *= tf;
  }

  // Grouping correction
  if (groupCount > 1) {
    const gf = getIecGroupingFactor(groupCount);
    factors.push({
      type: 'grouping',
      factor: gf,
      description: `IEC 60364-5-52 Table B.52-17: ${groupCount} circuits, factor = ${gf}`,
    });
    corrected *= gf;
  }

  return {
    ampacity: baseAmpacity,
    corrected: Math.round(corrected * 100) / 100,
    factors,
    source: createSource('IEC', '60364-5-52', {
      edition: '2009+A1:2023',
      verifiedAt: '2025-01-15',
    }),
  };
}

// =========================================================================
// PART 7 — Utility: Find Minimum Cable Size
// =========================================================================

export function findMinIecCableSize(
  current: number,
  conductor: IecConductorMaterial,
  insulation: IecInsulationType,
  method: IecInstallMethod = 'C',
  ambientTemp = 30,
  groupCount = 1,
): { size: number; ampacity: number; corrected: number } | null {
  for (const size of IEC_CABLE_SIZES) {
    try {
      const result = getIecAmpacity({
        size, conductor, insulation, method, ambientTemp, groupCount,
      });
      if (result.corrected >= current) {
        return { size, ampacity: result.ampacity, corrected: result.corrected };
      }
    } catch {
      continue;
    }
  }
  return null;
}
