/**
 * ESVA Electrical Engineering Constants
 * ----------------------------------------
 * 모든 매직 넘버를 한 곳에서 관리.
 * 출처 명시 + 단위 포함 + 불변.
 *
 * PART 1: Material properties
 * PART 2: Standard thresholds (KEC/NEC/IEC)
 * PART 3: IEEE 1584 coefficients
 * PART 4: Physical constants
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Material Properties
// ═══════════════════════════════════════════════════════════════════════════════

/** 전기 저항률 (Ω·mm²/m at 20°C) */
export const RESISTIVITY = {
  /** 구리 (Cu) — IEC 60228 */
  CU_20C: 0.0178,
  /** 알루미늄 (Al) — IEC 60228 */
  AL_20C: 0.0283,
  /** 온도 계수 (Cu, per °C) */
  CU_TEMP_COEFF: 0.00393,
  /** 온도 계수 (Al, per °C) */
  AL_TEMP_COEFF: 0.00403,
} as const;

/** 토양 저항률 기본값 (Ω·m) */
export const SOIL_RESISTIVITY = {
  CLAY_WET: 20,
  CLAY_DRY: 100,
  SAND_WET: 60,
  SAND_DRY: 1000,
  ROCK: 3000,
  /** 일반 설계 기본값 */
  DEFAULT: 100,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Standard Thresholds (KEC/NEC/IEC)
// ═══════════════════════════════════════════════════════════════════════════════

/** 전압강하 허용 기준 (%) */
export const VOLTAGE_DROP_LIMITS = {
  /** KEC 232.52 분기회로 */
  KEC_BRANCH: 3.0,
  /** KEC 232.52 간선 */
  KEC_FEEDER: 3.0,
  /** KEC 232.52 합산 (간선+분기) */
  KEC_COMBINED: 5.0,
  /** NEC 210.19 분기 (권고) */
  NEC_BRANCH: 3.0,
  /** NEC 215.2 간선 (권고) */
  NEC_FEEDER: 3.0,
  /** NEC 합산 (권고) */
  NEC_COMBINED: 5.0,
  /** IEC 60364-5-25 (일반) */
  IEC_GENERAL: 4.0,
  /** IEC 조명 */
  IEC_LIGHTING: 3.0,
} as const;

/** 전선관 충전율 (KEC 232.31 / NEC 348) */
export const CONDUIT_FILL_RATES = {
  /** 전선 1본 — 53% */
  SINGLE: 0.53,
  /** 전선 2본 — 31% */
  TWO: 0.31,
  /** 전선 3본 이상 — 40% */
  THREE_OR_MORE: 0.40,
} as const;

/** 차단기 보호 협조 계수 */
export const BREAKER_COORDINATION = {
  /** 연속 부하: 차단기 ≥ 125% × 부하전류 (KEC 212.3 / NEC 240.4) */
  CONTINUOUS_LOAD_FACTOR: 1.25,
  /** 전동기 분기: 차단기 ≤ 250% × FLC (NEC 430.52) */
  MOTOR_BRANCH_MAX: 2.50,
  /** 전동기 과부하 계전기: ≤ 115% FLA (SF≥1.15) */
  MOTOR_OL_SF_HIGH: 1.15,
  /** 전동기 과부하 계전기: ≤ 125% FLA (SF<1.15) */
  MOTOR_OL_SF_LOW: 1.25,
} as const;

/** 접지 저항 기준 (Ω) */
export const GROUNDING_RESISTANCE = {
  /** KEC 142.5 특별 3종 접지 */
  KEC_SPECIAL_3RD: 10,
  /** KEC 142.5 제1종 접지 */
  KEC_1ST: 10,
  /** KEC 142.5 제2종 접지 */
  KEC_2ND: 150, // ÷ 1초 이내 차단 전류
  /** KEC 142.5 제3종 접지 */
  KEC_3RD: 100,
  /** IEC TT 시스템: R_A × I_Δn ≤ 50V */
  IEC_TT_TOUCH_VOLTAGE: 50,
} as const;

/** 절연 저항 최소값 (MΩ) — IEC 612.3 */
export const INSULATION_RESISTANCE = {
  /** SELV/PELV */
  SELV_PELV: 0.5,
  /** ≤500V 회로 */
  LV_500V: 1.0,
  /** >500V 회로 */
  HV: 1.0,
} as const;

/** TN 시스템 차단 시간 (s) — IEC 411.3.2 */
export const DISCONNECTION_TIME = {
  /** 230V 최종 회로 (≤32A) */
  TN_230V_FINAL: 0.4,
  /** 230V 배전 회로 */
  TN_230V_DISTRIBUTION: 5.0,
  /** 400V 최종 회로 */
  TN_400V_FINAL: 0.2,
  /** TT 시스템 */
  TT_GENERAL: 0.2,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — IEEE 1584-2018 Coefficients
// ═══════════════════════════════════════════════════════════════════════════════

/** IEEE 1584-2018 아크 전류 계수 (저압 ≤1000V) */
export const IEEE_1584_ARC_CURRENT = {
  /** K1 per electrode config */
  K1: {
    VCB: -0.04287,
    VCBB: -0.05441,
    HCB: -0.03510,
    VOA: -0.04287,
    HOA: -0.04287,
  },
  /** K2: 볼트 단락전류 지수 */
  K2: 0.98,
  /** K3: 전압 계수 */
  K3: 0.29,
  /** 변동 계수 (최소 아크 전류) */
  VARIATION_FACTOR: 0.85,
} as const;

/** IEEE 1584-2018 거리 지수 */
export const IEEE_1584_DISTANCE_EXPONENT = {
  VCB: 1.641,
  VCBB: 1.641,
  HCB: 1.641,
  VOA: 2.0,
  HOA: 2.0,
} as const;

/** NFPA 70E PPE 등급 경계 (cal/cm²) */
export const PPE_THRESHOLDS = {
  /** Category 0 상한 */
  CAT_0_MAX: 1.2,
  /** Category 1 상한 */
  CAT_1_MAX: 4.0,
  /** Category 2 상한 */
  CAT_2_MAX: 8.0,
  /** Category 3 상한 */
  CAT_3_MAX: 25.0,
  /** Category 4 상한 */
  CAT_4_MAX: 40.0,
  /** 2차 화상 경계 */
  BURN_THRESHOLD: 1.2,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Physical Constants
// ═══════════════════════════════════════════════════════════════════════════════

export const PHYSICS = {
  /** √3 (3상 계수) */
  SQRT3: 1.7320508075688772,
  /** 접촉 전압 상한 (V AC, 건조 조건) — IEC 60364-4-41 */
  TOUCH_VOLTAGE_LIMIT_AC: 50,
  /** 접촉 전압 상한 (V DC) */
  TOUCH_VOLTAGE_LIMIT_DC: 120,
  /** 표준 주파수 (Hz) */
  STANDARD_FREQUENCIES: [50, 60] as readonly number[],
  /** 표준 전압 (V, 3상 선간, LV ≤1kV) */
  STANDARD_VOLTAGES_3PH: [208, 220, 380, 400, 440, 460, 480, 690] as readonly number[],
  /** 표준 전압 (V, MV/HV >1kV) — KEC 131-22 중압·고압 표준전압 */
  STANDARD_VOLTAGES_MV_HV: [
    3_300, 6_600, 11_000, 22_000, 22_900, 33_000,
    66_000, 100_000, 154_000, 345_000, 765_000,
  ] as readonly number[],
  /** 단상 표준 전압 (V) — KEC/NEC/IEC */
  STANDARD_VOLTAGES_1PH: [100, 110, 120, 200, 220, 230, 240] as readonly number[],
} as const;

/** KEC 표준 전선 규격 (mm²) */
export const KEC_STANDARD_SIZES = [
  1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630,
] as const;

/** NEC 표준 AWG/kcmil */
export const NEC_STANDARD_SIZES_AWG = [
  14, 12, 10, 8, 6, 4, 3, 2, 1, '1/0', '2/0', '3/0', '4/0',
  250, 300, 350, 400, 500, 600, 700, 750, 800, 900, 1000,
] as const;

/** 표준 차단기 정격 (A) — NEC 240.6 */
export const STANDARD_BREAKER_RATINGS = [
  15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100,
  110, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500,
  600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6000,
] as const;
