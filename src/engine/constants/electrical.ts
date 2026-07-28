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
  /** KEC 232.3.9 분기회로 */
  KEC_BRANCH: 3.0,
  /** KEC 232.3.9 간선 */
  KEC_FEEDER: 3.0,
  /** KEC 232.3.9 합산 (간선+분기) */
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

/**
 * 전선관 충전율 — **NEC Chapter 9 Table 1** 값이다(1본 53% / 2본 31% / 3본 이상 40%).
 *
 * 전에 `KEC 232.31` 로 달아 뒀는데 원문 확인 결과(2026-07-26) 232.31 은 전선관이
 * 아니라 금속덕트공사이고 한도도 20% 다. KEC 는 전선관 공사(232.11·232.12·232.13)에
 * 충전율을 규정하지 않으며, 한국의 전선관 충전율은 내선규정 2225-5 소관으로
 * 32%(굵기가 다른 절연전선) / 48%(같은 굵기·인출이 쉬운 경우)다.
 * 아래 상수를 한국 기준으로 소개하면 안 된다.
 */
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
  /** 연속 부하: 차단기 ≥ 125% × 부하전류 — **NEC 210.19/215.2**.
   *  KEC·IEC 는 배수가 아니라 `Ib ≤ In ≤ Iz` 로 간다. */
  CONTINUOUS_LOAD_FACTOR: 1.25,
  /** 전동기 분기: 차단기 ≤ 250% × FLC (NEC 430.52) */
  MOTOR_BRANCH_MAX: 2.50,
  /** 전동기 과부하 계전기: ≤ 115% FLA (SF≥1.15) */
  MOTOR_OL_SF_HIGH: 1.15,
  /** 전동기 과부하 계전기: ≤ 125% FLA (SF<1.15) */
  MOTOR_OL_SF_LOW: 1.25,
} as const;

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
  /** 특별 3종 접지 — 구 판단기준 (KEC 아님) */
  LEGACY_SPECIAL_3RD: 10,
  /** 제1종 접지 — 구 판단기준 (KEC 아님) */
  LEGACY_1ST: 10,
  /** 제2종 접지 — 구 판단기준 (KEC 아님) */
  LEGACY_2ND: 150, // ÷ 1초 이내 차단 전류
  /** 제3종 접지 — 구 판단기준 (KEC 아님) */
  LEGACY_3RD: 100,
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
/**
 * IEEE 1584**-2002** 계수. 2018 판이 아니다 — 2018 모델은 유료 표준 원문에만
 * 있는 ~600 계수 체계라 이 리포에 없다.
 *
 * 앞선 값(`K2: 0.98`·`K3: 0.29`·전극별 `K1`)은 **어느 판에도 없는 수**였다.
 * 그 식은 480V·20kA 에서 아크 전류 23.5kA 를 냈다 — 볼트 단락 20kA 보다 큰,
 * 물리적으로 불가능한 값(2026-07-28 실측: 280 점 중 189 점 위반). 그런데
 * 결과는 `standardRef: 'IEEE 1584-2018 Section 4.3'` 을 달고 PPE 등급까지
 * 냈다. 출처 없는 수가 표준 이름을 쓰고 있었다(§2.10).
 *
 * 아래는 공개 문헌 2 곳에서 계수 단위로 일치 확인한 2002 판 식이다:
 *  · ecmag.com "Arcing Short-Circuit Current"
 *  · arcadvisor.com "Procedure for IEEE 1584 based arc flash calculations"
 * **표준 원문 대조가 아니다** — 검증 수준은 `arc-flash-known-answer.test.ts`
 * 에 그대로 적어 두었다.
 */
export const IEEE_1584_2002 = {
  /** 저압(0.208~1kV) 아크 전류: lg Ia = K + 0.662·lg Ibf + 0.0966·V + 0.000526·G + 0.5588·V·lg Ibf − 0.00304·G·lg Ibf */
  ARC_LV: {
    /** K — 개방(open) / 함체(box) */
    K_OPEN: -0.153,
    K_BOX: -0.097,
    LG_IBF: 0.662,
    V: 0.0966,
    G: 0.000526,
    V_LG_IBF: 0.5588,
    G_LG_IBF: -0.00304,
  },
  /** 중·고압(1~15kV): lg Ia = 0.00402 + 0.983·lg Ibf */
  ARC_HV: { CONST: 0.00402, LG_IBF: 0.983 },
  /** 정규화 입사 에너지: lg En = K1 + K2 + 1.081·lg Ia + 0.0011·G */
  ENERGY_NORMALIZED: {
    K1_OPEN: -0.792,
    K1_BOX: -0.555,
    /** K2 — 비접지·고저항접지 0 / 접지 −0.113. 비접지가 에너지가 더 크다(보수적). */
    K2_UNGROUNDED: 0,
    K2_GROUNDED: -0.113,
    LG_IA: 1.081,
    G: 0.0011,
  },
  /** E = 4.184·Cf·En·(t/0.2)·(610^x / D^x) */
  ENERGY: { UNIT: 4.184, CF_LV: 1.5, CF_HV: 1.0, REF_DISTANCE_MM: 610, REF_TIME_S: 0.2 },
  /**
   * 전극 간격 기본값 — 표준의 기기 종류별 표(2002 Table 4) 전체는 이 리포에
   * 없다. 공개 문헌에서 확인된 저압 두 행만 쓴다. 기본값을 쓸 때는 결과에
   * 가정 사실을 실어 보낸다.
   */
  TYPICAL_GAP_MM: { LV_SWITCHGEAR: 32, LV_MCC_PANEL: 25 },
  /** 변동 계수 (최소 아크 전류 시나리오 — 저압 0.85) */
  VARIATION_FACTOR: 0.85,
} as const;

// `IEEE_1584_DISTANCE_EXPONENT` 는 삭제했다(2026-07-28). 라벨은 "2018" 인데
// 값(1.641·2.0)은 2002 판 Table 4 행이었고, 아크플래시가 2002 판으로 바뀌면서
// 거리 지수를 제 자리에서 정하게 돼 **호출처가 0** 이 됐다. 내 수리가 만든
// 고아라 같은 배치에서 치운다(§2.5-①·§2.11).

/**
 * PPE 등급 경계 (cal/cm²) — **NFPA 70E 2018 이후** 기준.
 *
 * 값은 각 등급의 최소 내아크 정격(4·8·25·40 cal/cm²)이고, 1.2 는 등급이
 * 아니라 **2도 화상 경계**다(Stoll curve). 앞 판은 이걸 `CAT_0_MAX` 라
 * 불렀는데 **Category 0 은 2015 판에서 삭제됐다** — 지금 표는 1 부터
 * 시작한다. 이름이 없어진 등급을 부르고 있었다(2026-07-28 적출).
 */
export const PPE_THRESHOLDS = {
  /** 2도 화상 경계 — 등급 아님. 이 아래는 NFPA 70E 가 등급을 매기지 않는다. */
  BURN_THRESHOLD: 1.2,
  /** Category 1 상한 (최소 내아크 정격 4) */
  CAT_1_MAX: 4.0,
  /** Category 2 상한 (8) */
  CAT_2_MAX: 8.0,
  /** Category 3 상한 (25) */
  CAT_3_MAX: 25.0,
  /** Category 4 상한 (40) */
  CAT_4_MAX: 40.0,
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

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Motor Constants (IEC 60034)
// ═══════════════════════════════════════════════════════════════════════════════

/** 전동기 기동 배율 (IEC 60034-12) */
export const MOTOR_STARTING = {
  /** DOL 직입 기동 전류 배율 (전부하 전류의 n배) — IEC 60034-12 typical */
  DOL_START_MULTIPLE: 7,
  /** 기동시 전압강하 허용 한계 (%) */
  STARTING_VOLTAGE_DROP_LIMIT: 15,
} as const;

/** 표준 차단기 정격 (A) — NEC 240.6 */
export const STANDARD_BREAKER_RATINGS = [
  15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100,
  110, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500,
  600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6000,
] as const;
