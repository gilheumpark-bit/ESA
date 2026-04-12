/**
 * Country-Specific Safety Factor Registry
 *
 * 국가 선택 한 번으로 에이전트들이 해당 국가의 안전율/여유치를 자동 적용.
 * 모든 수치는 해당 국가 기준서 근거 (KEC/NEC/IEC/JIS).
 *
 * PART 1: 타입 정의
 * PART 2: 국가별 프로파일
 * PART 3: 조회 API
 */

// ---------------------------------------------------------------------------
// PART 1 — 타입 정의
// ---------------------------------------------------------------------------

/**
 * 지원 국가 코드 (canonical 정의 — 다른 파일에서는 이 타입을 re-export)
 * Safety Factor Registry에 프로파일이 있는 국가: KR, US, JP, INT
 * 에이전트 라우팅에서만 사용하는 국가: CN, DE, AU, ME
 */
export type CountryCode = 'KR' | 'US' | 'JP' | 'INT' | 'CN' | 'DE' | 'AU' | 'ME';

export interface SafetyFactorProfile {
  /** ISO 3166-1 alpha-2 */
  country: CountryCode;
  /** 적용 기준서 */
  standard: string;
  /** 기준서 버전 */
  version: string;
  /** 기본 단위계 */
  unitSystem: 'SI' | 'Imperial';

  /** 전압강하 한도 (%) */
  voltageDropLimits: {
    branch: number;
    feeder: number;
    combined: number;
    lighting?: number;
  };

  /** 차단기 선정 배율 */
  breakerFactors: {
    /** 연속부하 배율 (KEC 212.3 / NEC 240.4) */
    continuousLoad: number;
    /** 전동기 분기회로 최대 배율 (NEC 430.52) */
    motorBranchMax: number;
    /** 전동기 과부하 계전기 (SF ≥ 1.15) */
    motorOverloadHigh: number;
    /** 전동기 과부하 계전기 (SF < 1.15) */
    motorOverloadLow: number;
  };

  /** 전선관 충전율 (%) */
  conduitFill: {
    single: number;
    two: number;
    threeOrMore: number;
  };

  /** 접지 저항 한도 (Ω) */
  groundingResistance: {
    /** 일반 접지 */
    general: number;
    /** 특별 3종 / 통신 접지 */
    special?: number;
    /** 피뢰 접지 */
    lightning?: number;
  };

  /** 케이블 보정계수 */
  cableDerating: {
    /** PVC vs XLPE 보정 */
    pvcFactor: number;
    /** 알루미늄 vs 구리 보정 */
    aluminumFactor: number;
    /** 기본 주위온도 (°C) */
    baseAmbientTemp: number;
  };

  /** 비상전원 절환 시간 (초) */
  emergencyTransferTime: number;

  /** 최소 절연저항 (MΩ) — 저압 기준 */
  minInsulationResistance: number;

  /** 누전차단기 감도전류 (mA) — 인체보호 */
  rcdSensitivity: number;
}

// ---------------------------------------------------------------------------
// PART 2 — 국가별 프로파일
// ---------------------------------------------------------------------------

const PROFILES: Record<ProfiledCountry, SafetyFactorProfile> = {
  // ── 한국 (KEC 2021) ──
  KR: {
    country: 'KR',
    standard: 'KEC',
    version: '2021',
    unitSystem: 'SI',
    voltageDropLimits: {
      branch: 3.0,       // KEC 232.52
      feeder: 3.0,       // KEC 232.52
      combined: 5.0,     // KEC 232.52 합산
      lighting: 3.0,
    },
    breakerFactors: {
      continuousLoad: 1.25,   // KEC 212.3
      motorBranchMax: 2.50,
      motorOverloadHigh: 1.15,
      motorOverloadLow: 1.25,
    },
    conduitFill: {
      single: 0.53,      // KEC 232.12
      two: 0.31,
      threeOrMore: 0.40,
    },
    groundingResistance: {
      general: 100,       // KEC 142.2 제3종
      special: 10,        // KEC 142.2 제1종/특별3종
      lightning: 10,      // KEC 142.7
    },
    cableDerating: {
      pvcFactor: 0.87,
      aluminumFactor: 0.78,
      baseAmbientTemp: 30,
    },
    emergencyTransferTime: 40,  // KEC 353.1 (40초 이내)
    minInsulationResistance: 0.1, // KEC 134.2 (저압 0.1MΩ)
    rcdSensitivity: 30,         // KEC 232.81 (30mA)
  },

  // ── 미국 (NEC 2023) ──
  US: {
    country: 'US',
    standard: 'NEC',
    version: '2023',
    unitSystem: 'Imperial',
    voltageDropLimits: {
      branch: 3.0,       // NEC 210.19(A) Informational Note
      feeder: 3.0,       // NEC 215.2(A) Informational Note
      combined: 5.0,
      lighting: 3.0,
    },
    breakerFactors: {
      continuousLoad: 1.25,   // NEC 240.4
      motorBranchMax: 2.50,   // NEC 430.52 Table (inverse-time breaker)
      motorOverloadHigh: 1.15, // NEC 430.32(A)(1)
      motorOverloadLow: 1.25,  // NEC 430.32(A)(1)
    },
    conduitFill: {
      single: 0.53,      // NEC Chapter 9 Table 1
      two: 0.31,
      threeOrMore: 0.40,
    },
    groundingResistance: {
      general: 25,        // NEC 250.56 (보충 접지전극 필요 기준)
      lightning: 25,
    },
    cableDerating: {
      pvcFactor: 0.87,
      aluminumFactor: 0.78,
      baseAmbientTemp: 30,  // NEC Table 310.16 (30°C 기준)
    },
    emergencyTransferTime: 10,  // NEC 700.12 (10초 이내)
    minInsulationResistance: 1.0, // NFPA 70B 권고
    rcdSensitivity: 5,           // NEC 210.8 GFCI (5mA Class A)
  },

  // ── 일본 (JIS C 0364 / 전기설비기술기준) ──
  JP: {
    country: 'JP',
    standard: 'JIS',
    version: 'C 0364',
    unitSystem: 'SI',
    voltageDropLimits: {
      branch: 3.0,       // 電技 内線規程 3202-1
      feeder: 3.0,
      combined: 5.0,
      lighting: 2.0,     // 조명회로 더 엄격
    },
    breakerFactors: {
      continuousLoad: 1.25,
      motorBranchMax: 2.50,
      motorOverloadHigh: 1.15,
      motorOverloadLow: 1.25,
    },
    conduitFill: {
      single: 0.53,
      two: 0.32,         // JIS 약간 다름
      threeOrMore: 0.40,
    },
    groundingResistance: {
      general: 100,       // D종 접지
      special: 10,        // A종/B종 접지
      lightning: 10,
    },
    cableDerating: {
      pvcFactor: 0.87,
      aluminumFactor: 0.80,  // JIS는 약간 관대
      baseAmbientTemp: 30,
    },
    emergencyTransferTime: 40,
    minInsulationResistance: 0.1,
    rcdSensitivity: 30,          // 人體保護 30mA
  },

  // ── 국제 (IEC 60364) ──
  INT: {
    country: 'INT',
    standard: 'IEC',
    version: '60364',
    unitSystem: 'SI',
    voltageDropLimits: {
      branch: 4.0,       // IEC 60364-5-52 Table G.52.1
      feeder: 4.0,
      combined: 5.0,
      lighting: 3.0,
    },
    breakerFactors: {
      continuousLoad: 1.25,
      motorBranchMax: 2.50,
      motorOverloadHigh: 1.15,
      motorOverloadLow: 1.25,
    },
    conduitFill: {
      single: 0.53,
      two: 0.31,
      threeOrMore: 0.40,
    },
    groundingResistance: {
      general: 20,        // IEC 60364-5-54 (TT 시스템)
      lightning: 10,      // IEC 62305
    },
    cableDerating: {
      pvcFactor: 0.87,
      aluminumFactor: 0.78,
      baseAmbientTemp: 30,
    },
    emergencyTransferTime: 15,  // IEC 60364-5-56
    minInsulationResistance: 0.5, // IEC 60364-6 (500kΩ for SELV)
    rcdSensitivity: 30,
  },
};

// ---------------------------------------------------------------------------
// PART 3 — 조회 API
// ---------------------------------------------------------------------------

/**
 * 국가 코드로 Safety Factor 프로파일 전체를 반환한다.
 * 국가 선택 한 번으로 모든 에이전트가 해당 프로파일을 참조.
 */
/** 프로파일이 존재하는 국가 코드 */
export type ProfiledCountry = 'KR' | 'US' | 'JP' | 'INT';

export function getSafetyProfile(country: CountryCode): SafetyFactorProfile {
  if (country in PROFILES) return PROFILES[country as ProfiledCountry];
  return PROFILES.INT; // 프로파일 미등록 국가는 IEC 국제 기준 적용
}

/** 특정 국가의 전압강하 한도 조회 */
export function getVoltageDropLimit(
  country: CountryCode,
  type: 'branch' | 'feeder' | 'combined' | 'lighting'
): number {
  const limits = getSafetyProfile(country).voltageDropLimits;
  return limits[type] ?? limits.combined;
}

/** 특정 국가의 차단기 배율 조회 */
export function getBreakerFactor(
  country: CountryCode,
  type: keyof SafetyFactorProfile['breakerFactors']
): number {
  return getSafetyProfile(country).breakerFactors[type];
}

/** 특정 국가의 전선관 충전율 조회 */
export function getConduitFillRate(
  country: CountryCode,
  wireCount: number
): number {
  const fill = getSafetyProfile(country).conduitFill;
  if (wireCount === 1) return fill.single;
  if (wireCount === 2) return fill.two;
  return fill.threeOrMore;
}

/** 특정 국가의 접지 저항 한도 조회 */
export function getGroundingLimit(
  country: CountryCode,
  type: 'general' | 'special' | 'lightning'
): number {
  const limits = getSafetyProfile(country).groundingResistance;
  return limits[type] ?? limits.general;
}

/** 지원 국가 목록 */
export function getSupportedCountries(): CountryCode[] {
  return Object.keys(PROFILES) as CountryCode[];
}

/** 국가 간 Safety Factor 비교표 생성 */
export function compareSafetyFactors(
  countries: CountryCode[]
): Record<string, Record<CountryCode, number | string>> {
  const result: Record<string, Record<CountryCode, number | string>> = {};

  const keys = [
    'voltageDropLimits.combined',
    'breakerFactors.continuousLoad',
    'conduitFill.threeOrMore',
    'groundingResistance.general',
    'emergencyTransferTime',
    'rcdSensitivity',
    'minInsulationResistance',
  ];

  for (const key of keys) {
    const row: Record<CountryCode, number | string> = {} as Record<CountryCode, number | string>;
    for (const c of countries) {
      const profile = getSafetyProfile(c);
      const parts = key.split('.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let val: any = profile;
      for (const p of parts) val = val?.[p];
      row[c] = val ?? 'N/A';
    }
    result[key] = row;
  }

  return result;
}
