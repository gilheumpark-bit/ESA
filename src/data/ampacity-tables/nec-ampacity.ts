/**
 * NEC Ampacity Tables (National Electrical Code — NFPA 70)
 *
 * NEC Table 310.16 — Allowable Ampacities of Insulated Conductors
 *   Rated Up to and Including 2000 Volts, 60°C Through 90°C
 *   Not More Than 3 Current-Carrying Conductors in Raceway, Cable, or Earth
 *   Based on Ambient Temperature of 30°C (86°F)
 *
 * NEC 310.15(C)(1) — Ambient Temperature Correction Factors
 * NEC 310.15(C)(2) — Adjustment Factors for More Than 3 Current-Carrying Conductors
 */

import { SourceTag, createSource } from '../../engine/sjc/types';

// =========================================================================
// PART 1 — Types
// =========================================================================

export type NecConductorMaterial = 'Cu' | 'Al';
export type NecTempRating = 60 | 75 | 90;

/** Common wire type to temperature rating mapping */
export type NecWireType = 'TW' | 'UF' | 'THWN' | 'THW' | 'THWN-2' | 'XHHW' | 'USE' |
  'THHN' | 'XHHW-2' | 'USE-2' | 'RHH' | 'RHW-2';

export interface NecCorrectionFactor {
  type: 'temperature' | 'conduitFill';
  factor: number;
  description: string;
}

export interface NecAmpacityOptions {
  /** Wire size as AWG string (e.g., "14", "1/0") or kcmil number converted to string (e.g., "250") */
  size: string;
  /** Conductor material */
  conductor: NecConductorMaterial;
  /** Temperature rating in °C */
  tempRating: NecTempRating;
  /** Ambient temperature in °C (default: 30°C) */
  ambientTemp?: number;
  /** Number of current-carrying conductors in raceway (default: 3) */
  conductorCount?: number;
}

export interface NecAmpacityResult {
  ampacity: number;
  corrected: number;
  factors: NecCorrectionFactor[];
  source: SourceTag;
}

// =========================================================================
// PART 2 — Wire Type to Temperature Rating Mapping
// =========================================================================

export const WIRE_TYPE_TEMP: Record<NecWireType, NecTempRating> = {
  'TW':      60,
  'UF':      60,
  'THW':     75,
  'THWN':    75,
  'XHHW':    75,
  'USE':     75,
  'THHN':    90,
  'THWN-2':  90,
  'XHHW-2':  90,
  'USE-2':   90,
  'RHH':     90,
  'RHW-2':   90,
};

// =========================================================================
// PART 3 — NEC Table 310.16 Conductor Sizes
// =========================================================================

/** Ordered list of NEC conductor sizes (AWG then kcmil) */
export const NEC_SIZES = [
  '14', '12', '10', '8', '6', '4', '3', '2', '1',
  '1/0', '2/0', '3/0', '4/0',
  '250', '300', '350', '400', '500', '600', '700', '750',
  '800', '900', '1000', '1250', '1500', '1750', '2000',
] as const;

export type NecSize = (typeof NEC_SIZES)[number];

// =========================================================================
// PART 4 — NEC Table 310.16 Base Ampacity Data
// =========================================================================

type AmpacityKey = `${NecConductorMaterial}_${NecTempRating}`;

/**
 * NEC Table 310.16
 * Allowable Ampacities of Insulated Conductors
 * Not More Than 3 Current-Carrying Conductors in Raceway, Cable, or Earth
 * Ambient Temperature of 30°C (86°F)
 *
 * Values indexed by NEC_SIZES position
 */
const NEC_TABLE_310_16: Record<AmpacityKey, number[]> = {
  // Copper — 60°C (TW, UF)
  Cu_60: [
    15, 20, 30, 40, 55, 70, 85, 95, 110,
    125, 145, 165, 195,
    215, 240, 260, 280, 320, 350, 385, 400,
    410, 435, 455, 495, 520, 545, 560,
  ],
  // Copper — 75°C (THW, THWN, XHHW, USE)
  Cu_75: [
    20, 25, 35, 50, 65, 85, 100, 115, 130,
    150, 175, 200, 230,
    255, 285, 310, 335, 380, 420, 460, 475,
    490, 520, 545, 590, 625, 650, 665,
  ],
  // Copper — 90°C (THHN, THWN-2, XHHW-2, USE-2, RHH, RHW-2)
  Cu_90: [
    25, 30, 40, 55, 75, 95, 115, 130, 145,
    170, 195, 225, 260,
    290, 320, 350, 380, 430, 475, 520, 535,
    555, 585, 615, 665, 705, 735, 750,
  ],
  // Aluminum — 60°C
  Al_60: [
    0, 15, 25, 30, 40, 55, 65, 75, 85,
    100, 115, 130, 150,
    170, 190, 210, 225, 260, 285, 310, 320,
    330, 355, 375, 405, 435, 455, 470,
  ],
  // Aluminum — 75°C
  Al_75: [
    0, 20, 30, 40, 50, 65, 75, 90, 100,
    120, 135, 155, 180,
    205, 230, 250, 270, 310, 340, 375, 385,
    395, 425, 445, 485, 520, 545, 560,
  ],
  // Aluminum — 90°C
  Al_90: [
    0, 25, 35, 45, 60, 75, 85, 100, 115,
    135, 150, 175, 205,
    230, 255, 280, 305, 350, 385, 420, 435,
    450, 480, 500, 545, 585, 615, 630,
  ],
};

// =========================================================================
// PART 5 — NEC 310.15(C)(1) Ambient Temperature Correction Factors
// =========================================================================

interface NecTempCorrRow {
  ambientMin: number;
  ambientMax: number;
  f60: number;
  f75: number;
  f90: number;
}

/**
 * NEC Table 310.15(C)(1)(1)
 * Ambient Temperature Correction Factors Based on 30°C
 */
const NEC_TEMP_CORRECTION: NecTempCorrRow[] = [
  { ambientMin: 10, ambientMax: 15, f60: 1.29, f75: 1.20, f90: 1.15 },
  { ambientMin: 16, ambientMax: 20, f60: 1.22, f75: 1.15, f90: 1.12 },
  { ambientMin: 21, ambientMax: 25, f60: 1.15, f75: 1.11, f90: 1.08 },
  { ambientMin: 26, ambientMax: 30, f60: 1.00, f75: 1.00, f90: 1.00 },
  { ambientMin: 31, ambientMax: 35, f60: 0.87, f75: 0.94, f90: 0.96 },
  { ambientMin: 36, ambientMax: 40, f60: 0.71, f75: 0.88, f90: 0.91 },
  { ambientMin: 41, ambientMax: 45, f60: 0.50, f75: 0.82, f90: 0.87 },
  { ambientMin: 46, ambientMax: 50, f60: 0.00, f75: 0.75, f90: 0.82 },
  { ambientMin: 51, ambientMax: 55, f60: 0.00, f75: 0.67, f90: 0.76 },
  { ambientMin: 56, ambientMax: 60, f60: 0.00, f75: 0.58, f90: 0.71 },
  { ambientMin: 61, ambientMax: 65, f60: 0.00, f75: 0.47, f90: 0.65 },
  { ambientMin: 66, ambientMax: 70, f60: 0.00, f75: 0.33, f90: 0.58 },
  { ambientMin: 71, ambientMax: 75, f60: 0.00, f75: 0.00, f90: 0.50 },
  { ambientMin: 76, ambientMax: 80, f60: 0.00, f75: 0.00, f90: 0.41 },
];

function getNecTempFactor(ambientTemp: number, tempRating: NecTempRating): number {
  for (const row of NEC_TEMP_CORRECTION) {
    if (ambientTemp >= row.ambientMin && ambientTemp <= row.ambientMax) {
      switch (tempRating) {
        case 60:  return row.f60;
        case 75:  return row.f75;
        case 90:  return row.f90;
      }
    }
  }
  // Extrapolate using the formula
  const tMax = tempRating;
  const numerator = tMax - ambientTemp;
  if (numerator <= 0) return 0;
  return Math.sqrt(numerator / (tMax - 30));
}

// =========================================================================
// PART 6 — NEC 310.15(C)(2) Conduit Fill Adjustment Factors
// =========================================================================

const NEC_CONDUIT_FILL: Array<{ min: number; max: number; factor: number }> = [
  { min: 1, max: 3, factor: 1.00 },
  { min: 4, max: 6, factor: 0.80 },
  { min: 7, max: 9, factor: 0.70 },
  { min: 10, max: 20, factor: 0.50 },
  { min: 21, max: 30, factor: 0.45 },
  { min: 31, max: 40, factor: 0.40 },
  { min: 41, max: Infinity, factor: 0.35 },
];

function getNecConduitFillFactor(conductorCount: number): number {
  for (const row of NEC_CONDUIT_FILL) {
    if (conductorCount >= row.min && conductorCount <= row.max) return row.factor;
  }
  return 0.35;
}

// =========================================================================
// PART 7 — Main Lookup Function
// =========================================================================

/**
 * Look up NEC Table 310.16 ampacity with temperature and conduit fill corrections.
 *
 * @example
 * getNecAmpacity({ size: '4/0', conductor: 'Cu', tempRating: 75 })
 * // => { ampacity: 230, corrected: 230, factors: [], source: {...} }
 *
 * getNecAmpacity({ size: '4/0', conductor: 'Cu', tempRating: 75, ambientTemp: 40, conductorCount: 6 })
 * // => { ampacity: 230, corrected: 230 * 0.88 * 0.80, factors: [...], source: {...} }
 */
export function getNecAmpacity(opts: NecAmpacityOptions): NecAmpacityResult {
  const { size, conductor, tempRating, ambientTemp = 30, conductorCount = 3 } = opts;

  // Find size index
  const sizeIdx = NEC_SIZES.indexOf(size as NecSize);
  if (sizeIdx === -1) {
    throw new Error(
      `Invalid NEC wire size: "${size}". Valid sizes: ${NEC_SIZES.join(', ')}`,
    );
  }

  const tableKey = `${conductor}_${tempRating}` as AmpacityKey;
  const row = NEC_TABLE_310_16[tableKey];
  if (!row) {
    throw new Error(`No NEC ampacity data for: ${tableKey}`);
  }

  const baseAmpacity = row[sizeIdx];
  if (baseAmpacity === 0) {
    throw new Error(
      `Wire size ${size} is not available in ${conductor} ${tempRating}°C column`,
    );
  }

  const factors: NecCorrectionFactor[] = [];
  let corrected = baseAmpacity;

  // Temperature correction
  if (ambientTemp !== 30) {
    const tf = getNecTempFactor(ambientTemp, tempRating);
    if (tf === 0) {
      throw new Error(`Ambient temperature ${ambientTemp}°C exceeds maximum for ${tempRating}°C rated conductors`);
    }
    factors.push({
      type: 'temperature',
      factor: tf,
      description: `NEC 310.15(C)(1): ambient ${ambientTemp}°C correction = ${tf}`,
    });
    corrected *= tf;
  }

  // Conduit fill adjustment
  if (conductorCount > 3) {
    const cf = getNecConduitFillFactor(conductorCount);
    factors.push({
      type: 'conduitFill',
      factor: cf,
      description: `NEC 310.15(C)(2): ${conductorCount} conductors in raceway, factor = ${cf}`,
    });
    corrected *= cf;
  }

  return {
    ampacity: baseAmpacity,
    corrected: Math.round(corrected * 100) / 100,
    factors,
    source: createSource('NEC (NFPA 70)', 'Table 310.16', {
      edition: '2023',
      verifiedAt: '2024-12-01',
    }),
  };
}

// =========================================================================
// PART 8 — Convenience: Lookup by Wire Type
// =========================================================================

export function getNecAmpacityByWireType(opts: {
  size: string;
  conductor: NecConductorMaterial;
  wireType: NecWireType;
  ambientTemp?: number;
  conductorCount?: number;
}): NecAmpacityResult {
  const tempRating = WIRE_TYPE_TEMP[opts.wireType];
  return getNecAmpacity({
    size: opts.size,
    conductor: opts.conductor,
    tempRating,
    ambientTemp: opts.ambientTemp,
    conductorCount: opts.conductorCount,
  });
}

// =========================================================================
// PART 9 — Utility: Find Minimum Wire Size
// =========================================================================

export function findMinNecWireSize(
  current: number,
  conductor: NecConductorMaterial,
  tempRating: NecTempRating,
  ambientTemp = 30,
  conductorCount = 3,
): { size: string; ampacity: number; corrected: number } | null {
  for (const size of NEC_SIZES) {
    try {
      const result = getNecAmpacity({
        size,
        conductor,
        tempRating,
        ambientTemp,
        conductorCount,
      });
      if (result.corrected >= current) {
        return { size, ampacity: result.ampacity, corrected: result.corrected };
      }
    } catch {
      // Size not available for this configuration, skip
      continue;
    }
  }
  return null;
}
