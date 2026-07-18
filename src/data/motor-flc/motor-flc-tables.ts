/**
 * Motor Full-Load Current Tables
 * --------------------------------
 * NEC Table 430.247 (DC), 430.248 (1φ AC), 430.250 (3φ AC).
 * 기준값 = 사실 정보 (저작권 자유).
 * 원문 확인: https://www.nfpa.org/codes-and-standards
 *
 * PART 1: 3-Phase AC motors (Table 430.250)
 * PART 2: Single-Phase AC motors (Table 430.248)
 * PART 3: Lookup functions
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 3-Phase AC Motor FLC (Table 430.250)
// ═══════════════════════════════════════════════════════════════════════════════

/** 전압별 3상 전동기 전부하전류 (A) — HP 기준 */
interface MotorFLCEntry {
  hp: number;
  kw: number;
  /** 200V */
  flc_200v: number;
  /** 208V */
  flc_208v: number;
  /** 230V */
  flc_230v: number;
  /** 460V */
  flc_460v: number;
  /** 575V */
  flc_575v: number;
}

export const MOTOR_FLC_3PH: MotorFLCEntry[] = [
  { hp: 0.5,  kw: 0.37,  flc_200v: 2.5,   flc_208v: 2.4,   flc_230v: 2.2,   flc_460v: 1.1,   flc_575v: 0.9   },
  { hp: 0.75, kw: 0.56,  flc_200v: 3.7,   flc_208v: 3.5,   flc_230v: 3.2,   flc_460v: 1.6,   flc_575v: 1.3   },
  { hp: 1,    kw: 0.75,  flc_200v: 4.8,   flc_208v: 4.6,   flc_230v: 4.2,   flc_460v: 2.1,   flc_575v: 1.7   },
  { hp: 1.5,  kw: 1.1,   flc_200v: 6.9,   flc_208v: 6.6,   flc_230v: 6.0,   flc_460v: 3.0,   flc_575v: 2.4   },
  { hp: 2,    kw: 1.5,   flc_200v: 7.8,   flc_208v: 7.5,   flc_230v: 6.8,   flc_460v: 3.4,   flc_575v: 2.7   },
  { hp: 3,    kw: 2.2,   flc_200v: 11.0,  flc_208v: 10.6,  flc_230v: 9.6,   flc_460v: 4.8,   flc_575v: 3.9   },
  { hp: 5,    kw: 3.7,   flc_200v: 17.5,  flc_208v: 16.7,  flc_230v: 15.2,  flc_460v: 7.6,   flc_575v: 6.1   },
  { hp: 7.5,  kw: 5.5,   flc_200v: 25.3,  flc_208v: 24.2,  flc_230v: 22.0,  flc_460v: 11.0,  flc_575v: 9.0   },
  { hp: 10,   kw: 7.5,   flc_200v: 32.2,  flc_208v: 30.8,  flc_230v: 28.0,  flc_460v: 14.0,  flc_575v: 11.0  },
  { hp: 15,   kw: 11,    flc_200v: 48.3,  flc_208v: 46.2,  flc_230v: 42.0,  flc_460v: 21.0,  flc_575v: 17.0  },
  { hp: 20,   kw: 15,    flc_200v: 62.1,  flc_208v: 59.4,  flc_230v: 54.0,  flc_460v: 27.0,  flc_575v: 22.0  },
  { hp: 25,   kw: 18.5,  flc_200v: 78.2,  flc_208v: 74.8,  flc_230v: 68.0,  flc_460v: 34.0,  flc_575v: 27.0  },
  { hp: 30,   kw: 22,    flc_200v: 92.0,  flc_208v: 88.0,  flc_230v: 80.0,  flc_460v: 40.0,  flc_575v: 32.0  },
  { hp: 40,   kw: 30,    flc_200v: 120.0, flc_208v: 114.0, flc_230v: 104.0, flc_460v: 52.0,  flc_575v: 41.0  },
  { hp: 50,   kw: 37,    flc_200v: 150.0, flc_208v: 143.0, flc_230v: 130.0, flc_460v: 65.0,  flc_575v: 52.0  },
  { hp: 60,   kw: 45,    flc_200v: 177.0, flc_208v: 169.0, flc_230v: 154.0, flc_460v: 77.0,  flc_575v: 62.0  },
  { hp: 75,   kw: 55,    flc_200v: 221.0, flc_208v: 211.0, flc_230v: 192.0, flc_460v: 96.0,  flc_575v: 77.0  },
  { hp: 100,  kw: 75,    flc_200v: 285.0, flc_208v: 273.0, flc_230v: 248.0, flc_460v: 124.0, flc_575v: 99.0  },
  { hp: 125,  kw: 90,    flc_200v: 359.0, flc_208v: 343.0, flc_230v: 312.0, flc_460v: 156.0, flc_575v: 125.0 },
  { hp: 150,  kw: 110,   flc_200v: 414.0, flc_208v: 396.0, flc_230v: 360.0, flc_460v: 180.0, flc_575v: 144.0 },
  { hp: 200,  kw: 150,   flc_200v: 552.0, flc_208v: 528.0, flc_230v: 480.0, flc_460v: 240.0, flc_575v: 192.0 },
  // NEC Table 430.250 (NFPA 70-2023): 460V·575V 열은 공표 정수, 200/208/230V 열은 460V 기준 비율 정합(2.3/2.2/2.0)
  { hp: 250,  kw: 185,   flc_200v: 695.0, flc_208v: 664.0, flc_230v: 604.0, flc_460v: 302.0, flc_575v: 242.0 },
  { hp: 300,  kw: 220,   flc_200v: 830.0, flc_208v: 794.0, flc_230v: 722.0, flc_460v: 361.0, flc_575v: 289.0 },
  { hp: 350,  kw: 260,   flc_200v: 952.0, flc_208v: 911.0, flc_230v: 828.0, flc_460v: 414.0, flc_575v: 336.0 },
  { hp: 400,  kw: 300,   flc_200v: 1097.0, flc_208v: 1049.0, flc_230v: 954.0, flc_460v: 477.0, flc_575v: 382.0 },
  { hp: 450,  kw: 335,   flc_200v: 1185.0, flc_208v: 1133.0, flc_230v: 1030.0, flc_460v: 515.0, flc_575v: 412.0 },
  { hp: 500,  kw: 375,   flc_200v: 1357.0, flc_208v: 1298.0, flc_230v: 1180.0, flc_460v: 590.0, flc_575v: 472.0 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Single-Phase AC Motor FLC (Table 430.248)
// ═══════════════════════════════════════════════════════════════════════════════

interface MotorFLC1PH {
  hp: number;
  kw: number;
  flc_115v: number;
  flc_200v: number;
  flc_208v: number;
  flc_230v: number;
}

export const MOTOR_FLC_1PH: MotorFLC1PH[] = [
  { hp: 0.167, kw: 0.12, flc_115v: 4.4,  flc_200v: 2.5, flc_208v: 2.4, flc_230v: 2.2  },
  { hp: 0.25,  kw: 0.19, flc_115v: 5.8,  flc_200v: 3.3, flc_208v: 3.2, flc_230v: 2.9  },
  { hp: 0.333, kw: 0.25, flc_115v: 7.2,  flc_200v: 4.1, flc_208v: 4.0, flc_230v: 3.6  },
  { hp: 0.5,   kw: 0.37, flc_115v: 9.8,  flc_200v: 5.6, flc_208v: 5.4, flc_230v: 4.9  },
  { hp: 0.75,  kw: 0.56, flc_115v: 13.8, flc_200v: 7.9, flc_208v: 7.6, flc_230v: 6.9  },
  { hp: 1,     kw: 0.75, flc_115v: 16.0, flc_200v: 9.2, flc_208v: 8.8, flc_230v: 8.0  },
  { hp: 1.5,   kw: 1.1,  flc_115v: 20.0, flc_200v: 11.5,flc_208v: 11.0,flc_230v: 10.0 },
  { hp: 2,     kw: 1.5,  flc_115v: 24.0, flc_200v: 13.8,flc_208v: 13.2,flc_230v: 12.0 },
  { hp: 3,     kw: 2.2,  flc_115v: 34.0, flc_200v: 19.6,flc_208v: 18.7,flc_230v: 17.0 },
  { hp: 5,     kw: 3.7,  flc_115v: 56.0, flc_200v: 32.2,flc_208v: 30.8,flc_230v: 28.0 },
  { hp: 7.5,   kw: 5.5,  flc_115v: 80.0, flc_200v: 46.0,flc_208v: 44.0,flc_230v: 40.0 },
  { hp: 10,    kw: 7.5,  flc_115v: 100.0,flc_200v: 57.5,flc_208v: 55.0,flc_230v: 50.0 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Lookup Functions
// ═══════════════════════════════════════════════════════════════════════════════

type VoltageKey3PH = 'flc_200v' | 'flc_208v' | 'flc_230v' | 'flc_460v' | 'flc_575v';
type VoltageKey1PH = 'flc_115v' | 'flc_200v' | 'flc_208v' | 'flc_230v';

function voltageKey3PH(v: number): VoltageKey3PH {
  if (v <= 204) return 'flc_200v';
  if (v <= 219) return 'flc_208v';
  if (v <= 345) return 'flc_230v';
  if (v <= 517) return 'flc_460v';
  return 'flc_575v';
}

function voltageKey1PH(v: number): VoltageKey1PH {
  if (v <= 157) return 'flc_115v';
  if (v <= 204) return 'flc_200v';
  if (v <= 219) return 'flc_208v';
  return 'flc_230v';
}

/**
 * 3상 전동기 전부하전류 조회.
 * @param hp - 마력 (0.5~500)
 * @param voltage - 선간전압 (200/208/230/460/575V)
 * @returns FLC (A) or null
 */
export function getMotorFLC3PH(hp: number, voltage: number): number | null {
  // NEC 430.6(A)(1): 중간 HP는 다음 상위 정격행으로 올림(보수적 선정). 500HP 초과 시 undefined → null (범위 밖)
  const entry = MOTOR_FLC_3PH.find(e => e.hp >= hp) ?? null;
  if (!entry) return null;
  return entry[voltageKey3PH(voltage)];
}

/**
 * 단상 전동기 전부하전류 조회.
 */
export function getMotorFLC1PH(hp: number, voltage: number): number | null {
  // NEC 430.6(A)(1): 중간 HP는 다음 상위 정격행으로 올림(보수적 선정). 범위 밖은 undefined → null
  const entry = MOTOR_FLC_1PH.find(e => e.hp >= hp) ?? null;
  if (!entry) return null;
  return entry[voltageKey1PH(voltage)];
}

/**
 * kW → HP 변환.
 */
export function kwToHp(kw: number): number {
  return Math.round(kw / 0.746 * 10) / 10;
}

/**
 * HP → kW 변환.
 */
export function hpToKw(hp: number): number {
  return Math.round(hp * 0.746 * 10) / 10;
}

/** 전동기 FLC 테이블 엔트리 수 */
export function getMotorFLCCount(): { threePH: number; singlePH: number } {
  return { threePH: MOTOR_FLC_3PH.length, singlePH: MOTOR_FLC_1PH.length };
}
