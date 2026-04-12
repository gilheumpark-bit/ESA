/**
 * Transformer Standard Capacity & Impedance Database
 * ----------------------------------------------------
 * 표준 변압기 용량, %임피던스, 손실 데이터.
 * 한전 수전용 + 자가용 건식/유입식.
 *
 * PART 1: Standard capacities
 * PART 2: Impedance data
 * PART 3: Lookup functions
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Standard Capacities (kVA)
// ═══════════════════════════════════════════════════════════════════════════════

/** 한전 수전용 변압기 표준 용량 시리즈 (kVA) */
export const STANDARD_CAPACITIES_KVA = [
  10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000,
] as const;

/** 변압기 상세 사양 */
export interface TransformerSpec {
  capacityKVA: number;
  type: 'dry' | 'oil';
  primaryVoltage: number;     // kV
  secondaryVoltage: number;   // V
  impedancePercent: number;   // %Z
  noLoadLossW: number;        // 무부하 손실 (W)
  loadLossW: number;          // 부하 손실 (W)
  noLoadCurrentPercent: number; // 무부하 전류 (%)
  weight_kg?: number;
}

/** 22.9kV/380V 건식 변압기 표준 사양 (한전 기준) */
export const DRY_TRANSFORMERS: TransformerSpec[] = [
  { capacityKVA: 100,  type: 'dry', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 3.5, noLoadLossW: 350,   loadLossW: 1800,  noLoadCurrentPercent: 2.5, weight_kg: 650  },
  { capacityKVA: 150,  type: 'dry', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 4.0, noLoadLossW: 480,   loadLossW: 2500,  noLoadCurrentPercent: 2.3, weight_kg: 850  },
  { capacityKVA: 200,  type: 'dry', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 4.0, noLoadLossW: 600,   loadLossW: 3200,  noLoadCurrentPercent: 2.2, weight_kg: 1050 },
  { capacityKVA: 300,  type: 'dry', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 4.5, noLoadLossW: 820,   loadLossW: 4500,  noLoadCurrentPercent: 2.0, weight_kg: 1400 },
  { capacityKVA: 500,  type: 'dry', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 5.0, noLoadLossW: 1200,  loadLossW: 6800,  noLoadCurrentPercent: 1.8, weight_kg: 2100 },
  { capacityKVA: 750,  type: 'dry', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 5.5, noLoadLossW: 1650,  loadLossW: 9500,  noLoadCurrentPercent: 1.6, weight_kg: 2900 },
  { capacityKVA: 1000, type: 'dry', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 5.75,noLoadLossW: 2100,  loadLossW: 12000, noLoadCurrentPercent: 1.5, weight_kg: 3600 },
  { capacityKVA: 1500, type: 'dry', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 6.0, noLoadLossW: 2800,  loadLossW: 17000, noLoadCurrentPercent: 1.4, weight_kg: 5000 },
  { capacityKVA: 2000, type: 'dry', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 6.0, noLoadLossW: 3500,  loadLossW: 21000, noLoadCurrentPercent: 1.3, weight_kg: 6200 },
  { capacityKVA: 3000, type: 'dry', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 6.5, noLoadLossW: 4800,  loadLossW: 30000, noLoadCurrentPercent: 1.2, weight_kg: 8500 },
];

/** 22.9kV/380V 유입 변압기 표준 사양 */
export const OIL_TRANSFORMERS: TransformerSpec[] = [
  { capacityKVA: 100,  type: 'oil', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 3.5, noLoadLossW: 270,   loadLossW: 1550,  noLoadCurrentPercent: 2.0, weight_kg: 550  },
  { capacityKVA: 200,  type: 'oil', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 4.0, noLoadLossW: 450,   loadLossW: 2700,  noLoadCurrentPercent: 1.8, weight_kg: 850  },
  { capacityKVA: 300,  type: 'oil', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 4.0, noLoadLossW: 600,   loadLossW: 3700,  noLoadCurrentPercent: 1.6, weight_kg: 1100 },
  { capacityKVA: 500,  type: 'oil', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 4.5, noLoadLossW: 900,   loadLossW: 5500,  noLoadCurrentPercent: 1.4, weight_kg: 1600 },
  { capacityKVA: 1000, type: 'oil', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 5.0, noLoadLossW: 1500,  loadLossW: 10000, noLoadCurrentPercent: 1.2, weight_kg: 2800 },
  { capacityKVA: 2000, type: 'oil', primaryVoltage: 22.9, secondaryVoltage: 380, impedancePercent: 5.5, noLoadLossW: 2500,  loadLossW: 18000, noLoadCurrentPercent: 1.0, weight_kg: 4800 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Cable Impedance Data (R + jX per km)
// ═══════════════════════════════════════════════════════════════════════════════

export interface CableImpedance {
  size_mm2: number;
  conductor: 'Cu' | 'Al';
  insulation: 'XLPE' | 'PVC' | 'HIV';
  /** 저항 (Ω/km at 75°C for XLPE, 70°C for PVC) */
  r_ohm_km: number;
  /** 리액턴스 (Ω/km) */
  x_ohm_km: number;
}

export const CABLE_IMPEDANCE_DB: CableImpedance[] = [
  // Cu XLPE (0.6/1kV, 3C, 75°C)
  { size_mm2: 2.5,  conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 9.45,  x_ohm_km: 0.110 },
  { size_mm2: 4,    conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 5.88,  x_ohm_km: 0.107 },
  { size_mm2: 6,    conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 3.93,  x_ohm_km: 0.100 },
  { size_mm2: 10,   conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 2.33,  x_ohm_km: 0.094 },
  { size_mm2: 16,   conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 1.47,  x_ohm_km: 0.090 },
  { size_mm2: 25,   conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 0.927, x_ohm_km: 0.086 },
  { size_mm2: 35,   conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 0.668, x_ohm_km: 0.083 },
  { size_mm2: 50,   conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 0.493, x_ohm_km: 0.081 },
  { size_mm2: 70,   conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 0.342, x_ohm_km: 0.079 },
  { size_mm2: 95,   conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 0.247, x_ohm_km: 0.077 },
  { size_mm2: 120,  conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 0.196, x_ohm_km: 0.076 },
  { size_mm2: 150,  conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 0.159, x_ohm_km: 0.075 },
  { size_mm2: 185,  conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 0.127, x_ohm_km: 0.074 },
  { size_mm2: 240,  conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 0.098, x_ohm_km: 0.073 },
  { size_mm2: 300,  conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 0.080, x_ohm_km: 0.072 },
  { size_mm2: 400,  conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 0.064, x_ohm_km: 0.071 },
  { size_mm2: 500,  conductor: 'Cu', insulation: 'XLPE', r_ohm_km: 0.051, x_ohm_km: 0.070 },
  // Al XLPE (0.6/1kV, 3C, 75°C)
  { size_mm2: 25,   conductor: 'Al', insulation: 'XLPE', r_ohm_km: 1.54,  x_ohm_km: 0.086 },
  { size_mm2: 35,   conductor: 'Al', insulation: 'XLPE', r_ohm_km: 1.11,  x_ohm_km: 0.083 },
  { size_mm2: 50,   conductor: 'Al', insulation: 'XLPE', r_ohm_km: 0.822, x_ohm_km: 0.081 },
  { size_mm2: 70,   conductor: 'Al', insulation: 'XLPE', r_ohm_km: 0.568, x_ohm_km: 0.079 },
  { size_mm2: 95,   conductor: 'Al', insulation: 'XLPE', r_ohm_km: 0.411, x_ohm_km: 0.077 },
  { size_mm2: 120,  conductor: 'Al', insulation: 'XLPE', r_ohm_km: 0.325, x_ohm_km: 0.076 },
  { size_mm2: 150,  conductor: 'Al', insulation: 'XLPE', r_ohm_km: 0.265, x_ohm_km: 0.075 },
  { size_mm2: 185,  conductor: 'Al', insulation: 'XLPE', r_ohm_km: 0.211, x_ohm_km: 0.074 },
  { size_mm2: 240,  conductor: 'Al', insulation: 'XLPE', r_ohm_km: 0.164, x_ohm_km: 0.073 },
  { size_mm2: 300,  conductor: 'Al', insulation: 'XLPE', r_ohm_km: 0.132, x_ohm_km: 0.072 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Lookup Functions
// ═══════════════════════════════════════════════════════════════════════════════

/** 변압기 사양 조회 */
export function getTransformerSpec(
  capacityKVA: number,
  type: 'dry' | 'oil' = 'dry',
): TransformerSpec | null {
  const db = type === 'dry' ? DRY_TRANSFORMERS : OIL_TRANSFORMERS;
  return db.find(t => t.capacityKVA === capacityKVA) ?? null;
}

/** 부하 용량에 맞는 최소 변압기 용량 선정 */
export function selectTransformerCapacity(
  loadKVA: number,
  margin: number = 1.25,
): number {
  const required = loadKVA * margin;
  return STANDARD_CAPACITIES_KVA.find(c => c >= required)
    ?? STANDARD_CAPACITIES_KVA[STANDARD_CAPACITIES_KVA.length - 1];
}

/** 케이블 임피던스 조회 */
export function getCableImpedance(
  size_mm2: number,
  conductor: 'Cu' | 'Al' = 'Cu',
  insulation: 'XLPE' | 'PVC' | 'HIV' = 'XLPE',
): CableImpedance | null {
  return CABLE_IMPEDANCE_DB.find(c =>
    c.size_mm2 === size_mm2 && c.conductor === conductor && c.insulation === insulation
  ) ?? CABLE_IMPEDANCE_DB.find(c =>
    c.size_mm2 === size_mm2 && c.conductor === conductor
  ) ?? null;
}

/** 2차측 단락전류 간이 계산 (변압기 %Z 기반) */
export function estimateSecondaryShortCircuit(
  capacityKVA: number,
  impedancePercent: number,
  secondaryVoltage: number = 380,
  phase: 3 | 1 = 3,
): number {
  // Isc = (kVA × 1000) / (√3 × V × %Z / 100) (3상)
  const sqrt = phase === 3 ? 1.732 : 1;
  return Math.round((capacityKVA * 1000) / (sqrt * secondaryVoltage * impedancePercent / 100));
}

/** 차단기 표준 정격 (A) — ACB/VCB/MCCB 통합 */
export const BREAKER_RATINGS = {
  MCCB: [15, 20, 30, 50, 75, 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 500, 600, 700, 800] as const,
  ACB: [800, 1000, 1200, 1600, 2000, 2500, 3000, 3200, 4000, 5000, 6300] as const,
  VCB: [200, 400, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150] as const,
} as const;

/** 부하전류 기반 차단기 종류 + 정격 추천 */
export function recommendBreaker(loadCurrent: number): { type: 'MCCB' | 'ACB' | 'VCB'; rating: number } {
  const minRating = Math.ceil(loadCurrent * 1.25);
  // MCCB (≤800A)
  const mccb = BREAKER_RATINGS.MCCB.find(r => r >= minRating);
  if (mccb) return { type: 'MCCB', rating: mccb };
  // ACB (>800A)
  const acb = BREAKER_RATINGS.ACB.find(r => r >= minRating);
  if (acb) return { type: 'ACB', rating: acb };
  return { type: 'ACB', rating: BREAKER_RATINGS.ACB[BREAKER_RATINGS.ACB.length - 1] };
}

/** 데이터 수 */
export function getTransformerDBCount() {
  return {
    dryTransformers: DRY_TRANSFORMERS.length,
    oilTransformers: OIL_TRANSFORMERS.length,
    cableImpedances: CABLE_IMPEDANCE_DB.length,
    standardCapacities: STANDARD_CAPACITIES_KVA.length,
  };
}
