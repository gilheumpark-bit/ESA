/**
 * Calculator Thresholds — 중앙 집중형 계산 임계값 설정
 * ─────────────────────────────────────────────────────
 * 계산기 내 하드코딩된 매직 넘버를 이 파일로 통합.
 * 표준 변경 시 이 파일만 수정하면 전체 계산기에 반영됨.
 *
 * 참조: KEC 2021, NEC 2023, IEC 60364:2009+A1:2023, IEC 60909:2016
 */

// =========================================================================
// PART 1 — Cable Reactance Defaults (Ω/km)
// =========================================================================

/**
 * 케이블 리액턴스 기본값.
 * 정확한 값은 케이블 제조사 데이터시트에서 가져와야 하나,
 * 예비 설계 시 아래 근사값을 사용.
 *
 * Reference: IEC 60228, KEC 232.3.9 해설서
 */
export const CABLE_REACTANCE_DEFAULTS = {
  /** 일반 PVC/XLPE 저압 케이블 (1.5~300mm², 600/1000V) */
  lv_general: 0.08,
  /** 단심 케이블 삼각 배치 (trefoil touching) */
  lv_trefoil: 0.07,
  /** 단심 케이블 평행 배치 (flat spaced) */
  lv_flat_spaced: 0.09,
  /** 고압 케이블 (3.3~11kV) */
  mv_general: 0.10,
  /** 고압 케이블 (22~33kV) */
  hv_general: 0.12,
  /** 버스바 (busbar) — 간격 의존적 */
  busbar: 0.15,
} as const;

/** 기본 리액턴스 (계산기 fallback용) */
export const DEFAULT_REACTANCE_OHM_PER_KM = CABLE_REACTANCE_DEFAULTS.lv_general;

// =========================================================================
// PART 2 — Insulation Temperature Limits (°C)
// =========================================================================

/**
 * 절연체별 최대 허용 도체 온도.
 * Reference: IEC 60364-5-52 Table 52.1, KEC 232.5 (허용전류)
 */
export const INSULATION_TEMP_LIMITS: Record<string, number> = {
  PVC: 70,
  XLPE: 90,
  EPR: 90,
  MI: 70,        // Mineral Insulated — 70°C sheath
  MI_105: 105,   // MI with special sheath
  'Silicon Rubber': 180,
} as const;

/** 절연체 → 최대 온도 조회 (fallback 70°C) */
export function getInsulationTempLimit(insulation: string): number {
  return INSULATION_TEMP_LIMITS[insulation] ?? 70;
}

// =========================================================================
// PART 3 — Short-Circuit Peak Current Factors
// =========================================================================

/**
 * IEC 60909-0 Table 1 — κ factor (피크 전류 계수)
 * ip = κ × √2 × Ik"
 *
 * 값은 R/X ratio와 전압 레벨에 따라 결정됨.
 * 예비 설계 시 아래 보수적 기본값 사용.
 */
export const PEAK_CURRENT_FACTORS = {
  /** 저압 (≤1kV) — R/X ≈ 0.5~0.7 */
  lv: 1.8,
  /** 중압 (1~35kV) — R/X ≈ 0.2~0.3 */
  mv: 1.8,
  /** 고압 (35~230kV) — R/X < 0.1 */
  hv: 2.0,
  /** 초고압 (>230kV) — nearly pure X */
  ehv: 2.0,
} as const;

export type VoltageLevel = keyof typeof PEAK_CURRENT_FACTORS;

/**
 * 전압 레벨에 따른 κ factor 반환.
 * @param systemVoltage_V 계통 전압 (V)
 */
export function getKappaFactor(systemVoltage_V: number): number {
  if (systemVoltage_V <= 1000) return PEAK_CURRENT_FACTORS.lv;
  if (systemVoltage_V <= 35_000) return PEAK_CURRENT_FACTORS.mv;
  if (systemVoltage_V <= 230_000) return PEAK_CURRENT_FACTORS.hv;
  return PEAK_CURRENT_FACTORS.ehv;
}

// =========================================================================
// PART 4 — Motor Starting Voltage Drop Limits
// =========================================================================

/**
 * 모터 기동 시 허용 전압강하 한도.
 * Reference: KEC 232.3.9 해설, NEMA MG-1, IEEE Std 141 (Red Book)
 */
export const MOTOR_STARTING_VD_LIMITS = {
  /** 일반 분기회로 — 단자 전압 15% 이하 */
  general: 15.0,
  /** 민감 부하 공존 시 — 10% 이하 권장 */
  sensitive_load: 10.0,
  /** 리액터/오토트랜스 기동 — 25% 이하 */
  reactor_start: 25.0,
  /** 소프트스타터/VFD — 전압강하 무관 */
  soft_starter: Infinity,
} as const;

/** 기본 모터 기동 전압강하 한도 */
export const DEFAULT_MOTOR_STARTING_VD_LIMIT = MOTOR_STARTING_VD_LIMITS.general;

// =========================================================================
// PART 5 — Breaker Coordination Multipliers
// =========================================================================

/**
 * 차단기 선정 배수.
 * Reference: NEC 240.4, IEC 60364-4-43, KEC 212.4/212.5
 *
 * 연속부하 125%·전동기 250% 는 **NEC 개념**이다(210.19/215.2/430.52).
 * KEC·IEC 는 `Ib ≤ In ≤ Iz`, `I2 ≤ 1.45×Iz` 로 가고 125% 배수를 두지 않는다.
 */
export const BREAKER_MULTIPLIERS = {
  /** 연속 부하 — NEC 125% (KEC 는 배수 규정 없음) */
  continuous: 1.25,
  /** 모터 과부하 — NEC 250% (KEC 는 배수 규정 없음) */
  motor: 2.50,
  /** 과부하 보호 범위 상한 */
  overload_upper: 1.45,
  /** 순시 차단: 일반 */
  instantaneous_general: 10,
  /** 순시 차단: 모터 */
  instantaneous_motor: 13,
} as const;

// =========================================================================
// PART 6 — Conduit Fill Rate Limits
// =========================================================================

/**
 * 전선관 점유율 — **NEC Chapter 9 Table 1** 값이다.
 *
 * `KEC 232.6` 으로 달아 뒀는데 그 번호는 KEC 에 없다. KEC 는 전선관 공사
 * (232.11 합성수지관·232.12 금속관·232.13 가요전선관)에 충전율을 규정하지
 * 않는다 — 232.31 금속덕트가 20% 일 뿐이다. 한국의 전선관 충전율은 내선규정
 * 2225-5 소관으로 32%(굵기 상이)/48%(동일 굵기)다(2026-07-27 정정).
 *
 * Reference: NEC Chapter 9 Table 1, NEC 300.17/Annex C
 */
export const CONDUIT_FILL_RATES = {
  /** 1본 삽입 */
  single: 0.53,
  /** 2본 삽입 */
  two: 0.31,
  /** 3본 이상 삽입 */
  three_or_more: 0.40,
} as const;

// =========================================================================
// PART 7 — Grounding Resistance Thresholds
// =========================================================================

/**
 * 접지 저항 기준 (Ω).
 *
 * **종별 접지(제1종·제2종·제3종·특별 제3종)는 KEC 가 아니다.** 구 「전기설비
 * 기술기준의 판단기준」 용어이고 KEC(2021.1.1 시행)가 폐지했다 — 현행 색인
 * 전수 검색에서 그 표제는 0 건이다. KEC 142 는 계통접지(TN/TT/IT)와
 * 142.2 접지극·접지저항 / 142.5 변압기 중성점 접지 / 142.6 공통·통합접지로
 * 간다. 폐지된 종별을 "KEC 기준" 으로 제시하면 현행 규정과 어긋난 판정이
 * 나온다(2026-07-27 정정).
 *
 * 아래 값은 **구 판단기준** 값이다. 기존 설비 도면에 그 표기가 남아 있어
 * 읽어야 할 때가 있어 남기되, 근거를 KEC 로 쓰지 않는다.
 */
export const GROUNDING_RESISTANCE = {
  /** 제1종 접지 — 구 판단기준 (KEC 아님) */
  legacy_class1: 10,
  /** 제2종 접지 — 구 판단기준, 150/Ig 단 max 150Ω (KEC 아님) */
  legacy_class2_max: 150,
  /** 제3종 접지 — 구 판단기준 (KEC 아님) */
  legacy_class3: 100,
  /** 특별 제3종 접지 — 구 판단기준 (KEC 아님) */
  legacy_special3: 10,
  /** TT system (IEC) — 50V/Ia */
  iec_tt_touch_voltage: 50,
  /** NEC 250 — 25Ω 권장 */
  nec_recommended: 25,
} as const;

// =========================================================================
// PART 8 — Voltage Drop Default Limits (%)
// =========================================================================

/**
 * 전압강하 기본 한도 (%).
 * 국가별 세부 값은 safety-factors.ts의 SafetyProfile 사용.
 * 여기는 표준/계산기 기본값.
 */
export const VOLTAGE_DROP_DEFAULTS = {
  /** 간선 (feeder) */
  feeder: 3.0,
  /** 분기 (branch) */
  branch: 3.0,
  /** 합산 (feeder + branch) */
  combined: 5.0,
  /** IEC 기본 (합산) */
  iec_total: 4.0,
} as const;
