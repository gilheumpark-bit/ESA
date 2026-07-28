/**
 * Arc Flash Calculator — IEEE 1584-**2002**
 * ----------------------------------------
 * 아크플래시 입사 에너지·경계 거리. 208V~15kV, 0.2~106kA.
 *
 * **판(edition)을 먼저 밝힌다.** 이 구현은 2002 판이고 현행판은 2018 이다.
 * 2018 모델은 유료 표준 원문에만 있는 ~600 계수 체계라 이 리포에 없다.
 *
 * 2026-07-28 이전 판은 더 나빴다: 식이 `K1 + K2·lg Ibf + K3·(V/1000)` 라는
 * **어느 판에도 없는 3항식**이었는데 결과에는 `IEEE 1584-2018 Section 4.3`
 * 이 붙어 나갔다. 480V·20kA 에서 아크 전류 23.5kA(볼트 단락 20kA 초과)를
 * 냈고, 격자 280 점 중 189 점이 물리 제약을 위반했다. 출처 없는 수가 표준
 * 이름을 달고 PPE 등급을 내고 있었다(§2.10 도메인 진실).
 *
 * 검증 수준(과장 금지): 계수는 공개 문헌 **2 곳에서 계수 단위로 일치**를
 * 확인했다. **표준 원문 대조가 아니다.** 2002 판 공개 예제가 없어
 * known-answer 는 못 걸고, 대신 ① 물리 제약 ② 2018 공개 예제와의 거리
 * ③ Ia/Ibf 대역으로 잠근다 — `__tests__/arc-flash-known-answer.test.ts`.
 *
 * 주의: 이 계산기는 참고용이며, 실제 아크플래시 분석은
 *       반드시 전문 소프트웨어(ETAP, SKM, EasyPower)로 검증해야 합니다.
 *
 * PART 1: Input/Output types
 * PART 2: 간략 경험식 계산
 * PART 3: 보호구 선정 (NFPA 70E Table 130.5(G))
 * PART 4: Calculator entry point
 */

import type { DetailedCalcResult, CalcStep } from '../types';
import { CalcValidationError } from '../types';
import {
  IEEE_1584_2002,
  PPE_THRESHOLDS,
} from '@/engine/constants/electrical';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Input/Output Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ArcFlashInput {
  /** 공칭 전압 (V) — 208~15000V */
  voltage_V: number;
  /** 볼트 단락전류 (kA) — 0.2~106kA */
  boltedFaultCurrent_kA: number;
  /** 아크 지속시간 (s) — 보호장치 동작시간 + 지연 */
  arcDuration_s: number;
  /** 작업 거리 (mm) — 보통 457mm (18in) for LV switchgear */
  workingDistance_mm: number;
  /** 전극 구성 — 기기 유형에 따라 */
  electrodeConfig: ElectrodeConfig;
  /** 밀폐 여부 */
  enclosureType: 'open' | 'box';
  /** 밀폐 크기 (mm) — box일 때만 */
  enclosureWidth_mm?: number;
  enclosureHeight_mm?: number;
  enclosureDepth_mm?: number;
  /**
   * 전극 간격 (mm) — 2002 식의 `G`. 아크 전류식과 정규화 에너지식 양쪽에
   * 들어간다. 미기재 시 **기기 종류·전압대별 통상 간격**(2002 Table 4)을
   * 쓰고 가정했다는 사실을 결과에 싣는다 — 저압 배전반 32 · 저압 MCC 25 ·
   * 중고압 배전반 152mm.
   */
  conductorGap_mm?: number;
  /**
   * 계통 접지 — 정규화 에너지식의 `K2`. 미기재 시 비접지(K2=0)로 본다.
   * 접지계통(−0.113)보다 에너지가 크게 나오는 쪽이라 보수적이다.
   */
  grounding?: 'grounded' | 'ungrounded';
  /**
   * 기기 종류 — 2002 Table 4 의 **거리 지수 `x` 와 통상 전극 간격**을 고른다.
   * 미기재 시 `switchgear`(개방 배치는 `open_air`). 이 제품의 대상이
   * 수전설비라 배전반이 기본이다.
   */
  equipmentClass?: EquipmentClass;
}

/** 2002 Table 4 의 기기 분류. */
export type EquipmentClass = 'switchgear' | 'mcc_panel' | 'cable' | 'open_air';

export type ElectrodeConfig =
  | 'VCB'    // Vertical conductors in box
  | 'VCBB'   // Vertical conductors terminated in barrier in box
  | 'HCB'    // Horizontal conductors in box
  | 'VOA'    // Vertical conductors in open air
  | 'HOA';   // Horizontal conductors in open air

export interface ArcFlashResult extends DetailedCalcResult {
  /** 아크 전류 (kA) */
  arcingCurrent_kA: number;
  /** 입사 에너지 (cal/cm²) */
  incidentEnergy_cal_cm2: number;
  /** 아크플래시 경계 (mm) — 1.2 cal/cm² 기준 */
  arcFlashBoundary_mm: number;
  /**
   * 내부 심각도 밴드(1~4, −1 = 작업 금지). **NFPA 등급이 아니다** —
   * 130.5(F) 가 입사 에너지 분석 결과로 130.7(C)(15)(c) 등급을 지정하는
   * 것을 허용하지 않는다. 화면 색·정렬용이고, 표준 산출물은
   * 5 단계 step 의 `value`(최소 내아크 정격 cal/cm² · Table 130.5(G))다.
   */
  ppeCategory: number;
  /** PPE 설명 */
  ppeDescription: string;
  /** 위험도 라벨 색상 */
  hazardLabel: 'green' | 'yellow' | 'orange' | 'red';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 간략 경험식 계산 (IEEE 1584 전체 모델 아님)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 아크 전류 — IEEE 1584-**2002**.
 *
 *   저압(≤1kV): lg Ia = K + 0.662·lg Ibf + 0.0966·V + 0.000526·G
 *                       + 0.5588·V·lg Ibf − 0.00304·G·lg Ibf     (V in kV, G in mm)
 *   중고압(>1kV): lg Ia = 0.00402 + 0.983·lg Ibf
 *
 * 앞 판은 저압에서 `K1 + K2·lg Ibf + K3·(V/1000)` 라는 **어느 판에도 없는
 * 3항식**을 썼다. 480V·20kA 에 23.5kA 를 냈다 — 볼트 단락보다 큰 값이다.
 * 두 항(V·lg Ibf 교차항·G 항)이 통째로 빠져 있었던 게 원인이다.
 *
 * 물리 제약은 그대로 둔다: 아크 임피던스가 회로에 더해지므로 Ia < Ibf 다.
 * 2002 식은 이 격자에서 이를 위반하지 않지만, 검사는 유지한다 — 계수를
 * 다시 건드리면 그때 잡혀야 한다.
 */
function calculateArcingCurrent(
  voltage_V: number,
  boltedFault_kA: number,
  gap_mm: number,
  enclosureType: 'open' | 'box',
): { arcCurrent_kA: number; variationFactor: number; violatesPhysics: boolean } {
  const Ibf = boltedFault_kA;
  const lgIbf = Math.log10(Ibf);

  let raw: number;
  let variationFactor: number;

  // 경계 1kV 는 두 식의 범위에 모두 들어간다(저압 0.208~1kV · 중고압 1~15kV).
  // 저압 식은 V→1kV 에서 교차항 `0.5588·V·lg Ibf` 가 커져 발산한다 —
  // 1000V·100kA 에서 Ia/Ibf 가 1.83 까지 간다(2026-07-28 실측). 경계값은
  // 중고압 식으로 보낸다. 2018 판이 나온 이유 중 하나가 이 불연속이다.
  if (voltage_V < 1000) {
    const c = IEEE_1584_2002.ARC_LV;
    const V = voltage_V / 1000; // 식은 kV 단위
    const K = enclosureType === 'box' ? c.K_BOX : c.K_OPEN;
    const lgIa = K
      + c.LG_IBF * lgIbf
      + c.V * V
      + c.G * gap_mm
      + c.V_LG_IBF * V * lgIbf
      + c.G_LG_IBF * gap_mm * lgIbf;
    raw = Math.pow(10, lgIa);
    variationFactor = IEEE_1584_2002.VARIATION_FACTOR;
  } else {
    const c = IEEE_1584_2002.ARC_HV;
    raw = Math.pow(10, c.CONST + c.LG_IBF * lgIbf);
    variationFactor = 1.0;
  }

  // **값을 고치지 않는다.** 물리 한계로 자르면 Ia = Ibf 가 되는데 그것도
  // 도달 불가한 극한이라 또 다른 거짓이 된다. 위반 사실을 실어 보내고
  // PPE 판정을 거부한다 — 절연 미상 케이블을 UNKNOWN 으로 두는 것과 같다.
  return { arcCurrent_kA: raw, variationFactor, violatesPhysics: raw > Ibf };
}

/**
 * 입사 에너지 — IEEE 1584-**2002**.
 *
 *   lg En = K1 + K2 + 1.081·lg Ia + 0.0011·G
 *   E     = 4.184 · Cf · En · (t/0.2) · (610^x / D^x)      **[J/cm²]**
 *
 * **J → cal 로 바꿔 반환한다. 앞서 이 주석이 식 옆에 `[cal/cm²]` 라고 적어
 * 놓았고, 코드는 J 값을 그대로 돌려주면서 `cal/cm²` 라벨을 붙여 cal 기준
 * PPE 표(1.2·4·8·25·40)와 대조했다 — 전 구간 4.184 배 과대.**
 *
 * 480V·20kA·0.2s·457mm 에서 41.55 가 나와 40 을 넘겨 **"작업 금지"** 판정이
 * 됐다. 정답은 9.93 cal/cm² · Category 3 이다. 더 나쁜 것은 이 리포의
 * `ppe-safety-wording.test.ts` 가 바로 그 41.55 를 관측하고도 *입력을
 * 5kA·0.1s 로 바꿔 회피*했다는 점이다 — 값이 이상하다고 적어 놓고 값을
 * 의심하는 대신 테스트를 비켜 갔다. 이 파일 머리말이 죽이려 한 "늑대 소년"
 * 이 단위 차원에서 되살아나 있었다(2026-07-28 독립 심사 도메인 좌석).
 *
 * 앞 판은 `K1 + 1.5·lg Ia + K3·lg(V/1000)` 를 썼고 K1 에 −0.5588 을 넣었다 —
 * 그건 **아크 전류식의 교차항 계수**(0.5588)를 부호만 바꿔 옮겨 놓은 것이다.
 * 지수 1.5 도 표준값 1.081 이 아니고, 간격항(+0.0011·G)과 단위계수(4.184)는
 * 아예 없었다. Cf 도 함체 여부로 갈랐는데 2002 는 **전압**으로 가른다
 * (<1kV 1.5 · >1kV 1.0).
 */
function calculateIncidentEnergy(
  arcCurrent_kA: number,
  arcDuration_s: number,
  workingDistance_mm: number,
  voltage_V: number,
  gap_mm: number,
  enclosureType: 'open' | 'box',
  grounding: 'grounded' | 'ungrounded',
  distanceExponent: number,
): number {
  const en = IEEE_1584_2002.ENERGY_NORMALIZED;
  const e = IEEE_1584_2002.ENERGY;

  const K1 = enclosureType === 'box' ? en.K1_BOX : en.K1_OPEN;
  const K2 = grounding === 'grounded' ? en.K2_GROUNDED : en.K2_UNGROUNDED;
  const lgEn = K1 + K2 + en.LG_IA * Math.log10(arcCurrent_kA) + en.G * gap_mm;
  const En = Math.pow(10, lgEn);

  const Cf = voltage_V < 1000 ? e.CF_LV : e.CF_HV;
  const x = distanceExponent;

  // 식 (5) 의 결과는 **J/cm²** 다.
  const E_Jcm2 = e.J_PER_CAL * Cf * En * (arcDuration_s / e.REF_TIME_S)
    * Math.pow(e.REF_DISTANCE_MM, x) / Math.pow(workingDistance_mm, x);

  // PPE 표도, 우리가 붙이는 라벨도 cal/cm² 다. 여기서 바꾼다.
  return Math.round((E_Jcm2 / e.J_PER_CAL) * 100) / 100;
}

/**
 * 아크플래시 경계 거리 계산.
 * 입사 에너지가 1.2 cal/cm² (2차 화상 기준)가 되는 거리.
 */
function calculateArcFlashBoundary(
  incidentEnergy: number,
  workingDistance_mm: number,
  distanceExponent: number,
): number {
  const Eb = PPE_THRESHOLDS.BURN_THRESHOLD;
  const DB = workingDistance_mm * Math.pow(incidentEnergy / Eb, 1 / distanceExponent);
  return Math.round(DB);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — 보호구 선정 (NFPA 70E Table 130.5(G) · 입사 에너지 분석 경로)
// ═══════════════════════════════════════════════════════════════════════════════

interface PPEInfo {
  category: number;
  description: string;
  minCalRating: number;
  hazardLabel: 'green' | 'yellow' | 'orange' | 'red';
}

/**
 * 입사 에너지 → PPE 등급.
 *
 * 2026-07-28 에 두 가지를 고쳤다. 둘 다 인명 안전 문구다:
 *
 *  ① **Category 0 은 NFPA 70E 2015 판에서 삭제됐다.** 표는 1 부터 시작한다.
 *     1.2 cal/cm² 는 등급 경계가 아니라 2도 화상 경계다. 없어진 등급 이름을
 *     10 년 넘게 내보내고 있었다.
 *  ② 그 구간 안내가 `'일반 작업복 (면 또는 합성섬유)'` 였다. **합성섬유는
 *     금지다** — NFPA 70E 130.7(C)(9) 는 315°C 미만에서 녹는 섬유(아세테이트·
 *     아크릴·나일론·폴리에스터·폴리에틸렌·폴리프로필렌·스판덱스)를 단독·혼방
 *     모두 금한다. 녹아서 피부에 들러붙어 화상을 키우기 때문이다. 계산기가
 *     **정확히 금지된 옷을 권하고 있었다.** 100% 천연섬유도 보호가 필요한
 *     자리에서는 불충분하다고 본다(2015 판 변경).
 */
function determinePPE(incidentEnergy: number): PPEInfo {
  if (incidentEnergy <= PPE_THRESHOLDS.BURN_THRESHOLD) {
    return {
      category: 0,
      description: '등급 없음 (1.2 cal/cm² 이하 — 2015 판부터 이 구간에 등급을 매기지 않음)'
        + ' · 녹는 합성섬유(나일론·폴리에스터·아크릴·스판덱스 등) 착용 금지',
      minCalRating: 0,
      hazardLabel: 'green',
    };
  }
  if (incidentEnergy <= PPE_THRESHOLDS.CAT_1_MAX) {
    return { category: 1, description: '내아크 상의 + 내아크 장갑 + 안면 보호구', minCalRating: 4, hazardLabel: 'yellow' };
  }
  if (incidentEnergy <= PPE_THRESHOLDS.CAT_2_MAX) {
    return { category: 2, description: '내아크 상하의 + 내아크 장갑 + 후드 + 안면 보호구', minCalRating: 8, hazardLabel: 'orange' };
  }
  if (incidentEnergy <= PPE_THRESHOLDS.CAT_3_MAX) {
    return { category: 3, description: '내아크 상하의(2중) + 내아크 장갑 + 후드 + 안면 보호구', minCalRating: 25, hazardLabel: 'orange' };
  }
  if (incidentEnergy <= PPE_THRESHOLDS.CAT_4_MAX) {
    return { category: 4, description: '내아크 슈트(2중) + 내아크 장갑 + 후드(2중) + 안면 보호구', minCalRating: 40, hazardLabel: 'red' };
  }
  return { category: -1, description: '위험 — 40 cal/cm² 초과: 작업 금지. 에너지 저감 조치 필요', minCalRating: 999, hazardLabel: 'red' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Calculator Entry Point
// ═══════════════════════════════════════════════════════════════════════════════

export function calculateArcFlash(input: ArcFlashInput): ArcFlashResult {
  const steps: CalcStep[] = [];

  // 입력 검증 — IEEE 1584-**2002** 시험 범위(208~15,000V · 0.7~106kA · 13~152mm).
  // 2026-07-28 정정: 아래 메시지는 2002 라고 말하는데 이 주석만 "2018" 로
  // 남아 있었다 — 이 커밋이 고치려던 **판 라벨 불일치 그 자체**를 내가
  // 새로 만든 셈이다(독립 심사 지적). 판 표기는 한 파일 안에서도 어긋난다.
  // ESVA-440x 코드를 throw 메시지에 포함해 API 응답에서 표준 에러 코드를 노출한다.
  if (!Number.isFinite(input.voltage_V) || input.voltage_V < 208 || input.voltage_V > 15000) {
    throw new CalcValidationError(
      'voltage_V',
      `ESVA-4401: voltage_V must be between 208 and 15000 (IEEE 1584-2002 시험 범위), got ${input.voltage_V}`,
    );
  }
  // IEEE 1584-2002 시험 범위의 **하한은 700A** 다. 앞 판은 0.2kA(200A)까지
  // 받아 범위 밖에서 PPE 등급을 냈다(2026-07-28 적출) — 모델이 검증되지 않은
  // 구간의 답을 안전 판단에 쓰는 것이 §2.10 이 말하는 실패다.
  if (!Number.isFinite(input.boltedFaultCurrent_kA) || input.boltedFaultCurrent_kA < 0.7 || input.boltedFaultCurrent_kA > 106) {
    throw new CalcValidationError(
      'boltedFaultCurrent_kA',
      `ESVA-4402: boltedFaultCurrent_kA must be between 0.7 and 106 kA (IEEE 1584-2002 시험 범위), got ${input.boltedFaultCurrent_kA}`,
    );
  }
  // 전극 간격도 시험 범위가 있다(13~152mm). 범위 밖 간격은 외삽이다.
  if (input.conductorGap_mm !== undefined
    && (!Number.isFinite(input.conductorGap_mm) || input.conductorGap_mm < 13 || input.conductorGap_mm > 152)) {
    throw new CalcValidationError(
      'conductorGap_mm',
      `ESVA-4404: conductorGap_mm must be between 13 and 152 mm (IEEE 1584-2002 시험 범위), got ${input.conductorGap_mm}`,
    );
  }
  if (!Number.isFinite(input.arcDuration_s) || input.arcDuration_s < 0.001 || input.arcDuration_s > 10) {
    throw new CalcValidationError(
      'arcDuration_s',
      `ESVA-4403: arcDuration_s must be between 0.001 and 10 seconds, got ${input.arcDuration_s}`,
    );
  }

  /**
   * 기기 종류 — 2002 Table 4 의 행을 고른다.
   *
   * 입력에 없으면 개방 여부만 `electrodeConfig` 로 보고 나머지는
   * **`switchgear`** 로 둔다. `electrodeConfig`(VCB/VCBB/HCB)는 2018 판의
   * 전극 배치라 2002 의 기기 분류(배전반/MCC/케이블)를 구분해 주지 못한다.
   *
   * 한때 저압 기본을 `mcc_panel`(x=1.641)로 두려 했다 — 457mm 에서 값이 더
   * 크게 나와 "보수적" 이라는 이유였다. 바꿨다. 이 제품의 대상은 154kV 급
   * **수전설비**이고 거기서 세는 기기는 배전반이다. 잘못된 기기의 값을
   * 크게 내는 것은 보수가 아니라 **다른 기기를 계산하는 것**이고, 사용자가
   * 다른 도구와 대조하면 어긋난다. 값이 궁금하면 `equipmentClass` 로 고른다.
   *
   * 중고압 `switchgear`(x=0.973 · gap 152mm)는 보수적일 뿐 아니라 표준이
   * 정한 값 그 자체다 — 앞서 저압 MCC 행을 쓰던 것이 오류였다.
   */
  const isOpenAir = input.electrodeConfig.endsWith('OA');
  const band = input.voltage_V < 1000 ? 'LV' : 'MV';
  const equipmentClass: EquipmentClass = input.equipmentClass
    ?? (isOpenAir ? 'open_air' : 'switchgear');
  const classRow = IEEE_1584_2002.EQUIPMENT_CLASS[band][equipmentClass];

  // 표준이 요구하는데 입력에 없던 두 값. 기본값을 쓸 때는 그 사실을 남긴다.
  const gapAssumed = !Number.isFinite(input.conductorGap_mm as number);
  const gap_mm = gapAssumed ? classRow.gap_mm : (input.conductorGap_mm as number);
  const groundingAssumed = input.grounding === undefined;
  const grounding = input.grounding ?? 'ungrounded';
  const distExp = classRow.x;

  // Step 1: 아크 전류 계산
  const { arcCurrent_kA, variationFactor, violatesPhysics } = calculateArcingCurrent(
    input.voltage_V,
    input.boltedFaultCurrent_kA,
    gap_mm,
    input.enclosureType,
  );
  steps.push({
    step: 1,
    title: '아크 전류 계산 (IEEE 1584-2002)',
    formula: input.voltage_V <= 1000
      ? 'lg I_a = K + 0.662\\cdot lg I_{bf} + 0.0966V + 0.000526G + 0.5588V\\cdot lg I_{bf} - 0.00304G\\cdot lg I_{bf}'
      : 'lg I_a = 0.00402 + 0.983\\cdot lg I_{bf}',
    value: Math.round(arcCurrent_kA * 100) / 100,
    unit: 'kA',
    standardRef: 'IEEE 1584-2002 (2018 판으로 대체됨)',
  });

  // Step 2: 입사 에너지 계산
  const incidentEnergy = calculateIncidentEnergy(
    arcCurrent_kA, input.arcDuration_s, input.workingDistance_mm,
    input.voltage_V, gap_mm, input.enclosureType, grounding, distExp,
  );
  steps.push({
    step: 2,
    title: '입사 에너지 계산',
    formula: 'lg E_n = K_1 + K_2 + 1.081\\cdot lg I_a + 0.0011G, \\quad E = 4.184 C_f E_n (t/0.2)(610^x / D^x)',
    value: incidentEnergy,
    unit: 'cal/cm²',
    standardRef: 'IEEE 1584-2002 (2018 판으로 대체됨)',
  });

  // 변동 계수 적용 (최소 아크 전류 시나리오)
  const minArcCurrent = arcCurrent_kA * variationFactor;
  const minIncidentEnergy = calculateIncidentEnergy(
    minArcCurrent, input.arcDuration_s, input.workingDistance_mm,
    input.voltage_V, gap_mm, input.enclosureType, grounding, distExp,
  );
  const worstEnergy = Math.max(incidentEnergy, minIncidentEnergy);

  steps.push({
    step: 3,
    title: '변동 분석 (85% 최소 아크 전류)',
    formula: 'I_{a,min} = 0.85 \\cdot I_a',
    value: worstEnergy,
    unit: 'cal/cm²',
    standardRef: 'IEEE 1584-2002 (2018 판으로 대체됨)',
  });

  // Step 4: 아크플래시 경계
  const boundary = calculateArcFlashBoundary(worstEnergy, input.workingDistance_mm, distExp);
  steps.push({
    step: 4,
    title: '아크플래시 경계 거리 (1.2 cal/cm² 기준)',
    formula: 'D_B = D \\cdot (E / E_b)^{1/x}',
    value: boundary,
    unit: 'mm',
    standardRef: 'IEEE 1584-2002 (2018 판으로 대체됨)',
  });

  // Step 5: PPE 등급
  const ppe = determinePPE(worstEnergy);
  steps.push({
    step: 5,
    // 0 은 등급이 아니다 — 2015 판에서 Category 0 이 삭제됐다.
    title: ppe.minCalRating > 0 && ppe.category > 0
      ? `보호구 선정 — 최소 내아크 정격 ${ppe.minCalRating} cal/cm²`
      : '화상 경계 이하 (내아크 정격 요구 없음)',
    /**
     * **표를 바꿨다. 앞서 인용한 표를 표준이 금지한다.**
     *
     * 여기엔 이렇게 적혀 있었다: "(a) 는 작업 기반 표다. 입사 에너지로
     * 고르는 것은 (c) 다 — 이 계산기는 에너지를 냈으므로 (c) 가 맞다."
     * 정반대다(2026-07-28 독립 심사 도메인 좌석 → 외부 대조로 확정).
     *
     * NFPA 70E 130.5(F) 는 보호구 선정에 두 길을 두고 **같은 기기에 병용을
     * 금지**한다: ① 입사 에너지 분석 → 130.5(G) ② 아크플래시 PPE 등급표
     * → 130.7(C)(15). 그리고 **입사 에너지 분석 결과로 130.7(C)(15)(c) 의
     * 등급을 지정하는 것은 허용되지 않는다.**
     *
     * 이 계산기는 ① 을 한다. 그러므로 정본은 **Table 130.5(G)** 이고,
     * 산출물은 등급 번호가 아니라 **최소 내아크 정격(cal/cm²)** 이다.
     * 등급 번호(`ppeCategory`)는 화면 색·정렬용 내부 심각도 밴드로 남기되,
     * 그것이 NFPA 등급이라고 말하지 않는다.
     */
    formula: 'NFPA 70E Table 130.5(G) — 입사 에너지 분석 기반 보호구 선정'
      + ' (내아크 정격 ≥ 입사 에너지)',
    value: ppe.minCalRating,
    unit: 'cal/cm²',
    standardRef: 'NFPA 70E 130.5(G)',
  });

  return {
    value: worstEnergy,
    unit: 'cal/cm²',
    source: [{ standard: 'IEEE 1584', clause: '아크 전류·입사 에너지·경계', edition: '2002' }],
    label: '아크플래시 입사 에너지',
    formula: 'IEEE 1584-2002 아크 전류·정규화 에너지·입사 에너지 식 (2018 판 아님)',
    steps,
    standardRef: 'IEEE 1584-2002 · PPE 등급 NFPA 70E 2018+',
    arcingCurrent_kA: Math.round(arcCurrent_kA * 100) / 100,
    incidentEnergy_cal_cm2: worstEnergy,
    arcFlashBoundary_mm: boundary,
    ppeCategory: ppe.category,
    ppeDescription: ppe.description,
    hazardLabel: ppe.hazardLabel,
    warnings: [
      // 판(edition)을 먼저 말한다. 전에는 결과가 "IEEE 1584-2018 Section 4.3"
      // 을 달고 나갔는데 식은 어느 판에도 없는 것이었다(2026-07-28 적출).
      // 어느 판인지가 PPE 등급을 좌우하므로 이게 첫 줄이다.
      '이 계산은 IEEE 1584-**2002** 식입니다. 현행판은 2018 이며 두 판의 결과는 다릅니다(전극 구성별 계수 체계가 2018 에서 새로 들어왔습니다).',
      '2018 판의 전극 구성별 계수·함체 크기 보정·전압 구간 보간은 적용하지 않습니다.',
      ...(gapAssumed
        ? [`전극 간격을 입력하지 않아 저압 배전반 기준 ${gap_mm}mm 로 가정했습니다. 실제 간격을 넣으면 결과가 달라집니다(25↔32mm 기준 2~4%).`]
        : []),
      ...(groundingAssumed
        ? ['계통 접지를 입력하지 않아 비접지로 가정했습니다 — 접지계통보다 에너지가 크게 나오는 쪽입니다.']
        : []),
      ...(violatesPhysics
        ? ['⚠ 이 입력에서는 식이 볼트 단락전류보다 큰 아크 전류를 냅니다 — 물리적으로 불가능한 값입니다(아크 임피던스가 더해지면 전류는 줄어듭니다). 입사 에너지와 PPE 등급을 신뢰할 수 없으니 전문 소프트웨어로 산정하세요.']
        : []),
      '표준 자체의 모델 불확실성(±25%)이 있습니다. 이 구현은 표준 원문이 아니라 공개 문헌 2 곳에서 계수 단위로 대조해 옮긴 것입니다.',
      'PPE 등급 선정 등 안전 관련 최종 판단에는 ETAP/SKM/EasyPower 등 전문 소프트웨어 검증이 필요합니다.',
      '아크 지속시간 > 2초인 경우 반드시 에너지 저감 조치를 검토하세요.',
      // 등급이 낮게 나왔을 때가 오히려 위험하다 — "이 정도면 평상복" 으로 읽힌다.
      '녹는 합성섬유(아세테이트·아크릴·나일론·폴리에스터·폴리에틸렌·폴리프로필렌·스판덱스)는 단독·혼방 모두 착용 금지입니다 — 녹아서 피부에 들러붙습니다(NFPA 70E 130.7(C)(9)). 등급이 낮게 나온 경우에도 같습니다.',
    ],
  };
}
