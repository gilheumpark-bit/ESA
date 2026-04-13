/**
 * Arc Flash Calculator — IEEE 1584-2018
 * ----------------------------------------
 * 아크플래시 사고 에너지 및 경계 거리 계산.
 * IEEE 1584-2018 경험식 기반. 208V~15kV, 200A~106kA 범위.
 *
 * 주의: 이 계산기는 참고용이며, 실제 아크플래시 분석은
 *       반드시 전문 소프트웨어(ETAP, SKM, EasyPower)로 검증해야 합니다.
 *
 * PART 1: Input/Output types
 * PART 2: IEEE 1584-2018 calculation
 * PART 3: PPE Category determination
 * PART 4: Calculator entry point
 */

import type { DetailedCalcResult, CalcStep } from '../types';
import {
  IEEE_1584_ARC_CURRENT,
  IEEE_1584_DISTANCE_EXPONENT,
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
}

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
  /** PPE 등급 */
  ppeCategory: number;
  /** PPE 설명 */
  ppeDescription: string;
  /** 위험도 라벨 색상 */
  hazardLabel: 'green' | 'yellow' | 'orange' | 'red';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — IEEE 1584-2018 Calculation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * IEEE 1584-2018 아크 전류 계산 (간략 모델).
 * 전체 모델은 600+ 계수이지만, 여기서는 핵심 경험식만 사용.
 * 정밀 분석은 ETAP/SKM 사용을 권장.
 */
function calculateArcingCurrent(
  voltage_V: number,
  boltedFault_kA: number,
  electrodeConfig: ElectrodeConfig,
): { arcCurrent_kA: number; variationFactor: number } {
  const V = voltage_V;
  const Ibf = boltedFault_kA;

  // IEEE 1584-2018 간략 모델 (저압 ≤1000V)
  if (V <= 1000) {
    // log(Ia) = K1 + K2×log(Ibf) + K3×(V/1000)
    // K 계수는 전극 구성에 따라 다름 (여기선 VCB 기본값)
    const K1 = IEEE_1584_ARC_CURRENT.K1[electrodeConfig] ?? IEEE_1584_ARC_CURRENT.K1.VCB;
    const K2 = IEEE_1584_ARC_CURRENT.K2;
    const K3 = IEEE_1584_ARC_CURRENT.K3;

    const logIa = K1 + K2 * Math.log10(Ibf) + K3 * (V / 1000);
    const arcCurrent_kA = Math.pow(10, logIa);

    const variationFactor = IEEE_1584_ARC_CURRENT.VARIATION_FACTOR;

    return { arcCurrent_kA, variationFactor };
  }

  // 중/고압 (>1000V)
  // log(Ia) = 0.00402 + 0.983×log(Ibf)
  const logIa = 0.00402 + 0.983 * Math.log10(Ibf);
  return { arcCurrent_kA: Math.pow(10, logIa), variationFactor: 1.0 };
}

/**
 * IEEE 1584-2018 입사 에너지 계산.
 * E = Cn × En × (t/0.2) × (610^x / D^x)
 */
function calculateIncidentEnergy(
  arcCurrent_kA: number,
  arcDuration_s: number,
  workingDistance_mm: number,
  voltage_V: number,
  electrodeConfig: ElectrodeConfig,
  enclosureType: 'open' | 'box',
): number {
  const Ia = arcCurrent_kA;
  const t = arcDuration_s;
  const D = workingDistance_mm;

  // 정규화 입사 에너지 (0.2초, 610mm 기준)
  // log(En) = K1 + K2×log(Ia) + K3×log(V)
  const K1 = enclosureType === 'box' ? -0.5588 : -0.3968;
  const K2 = 1.5;
  const K3 = voltage_V <= 1000 ? 0.0 : 0.5;

  const logEn = K1 + K2 * Math.log10(Ia) + K3 * Math.log10(voltage_V / 1000);
  const En = Math.pow(10, logEn);

  // 거리 지수 (전극 구성에 따라)
  const distanceExponent: Record<ElectrodeConfig, number> = {
    VCB: 1.641, VCBB: 1.641, HCB: 1.641, VOA: 2.0, HOA: 2.0,
  };
  const x = distanceExponent[electrodeConfig];

  // 밀폐 보정 계수
  const Cf = enclosureType === 'box' ? 1.5 : 1.0;

  // 최종 입사 에너지 (cal/cm²)
  const E = Cf * En * (t / 0.2) * Math.pow(610, x) / Math.pow(D, x);

  return Math.round(E * 100) / 100;
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
// PART 3 — PPE Category (NFPA 70E Table 130.7(C)(15)(a))
// ═══════════════════════════════════════════════════════════════════════════════

interface PPEInfo {
  category: number;
  description: string;
  minCalRating: number;
  hazardLabel: 'green' | 'yellow' | 'orange' | 'red';
}

function determinePPE(incidentEnergy: number): PPEInfo {
  if (incidentEnergy <= PPE_THRESHOLDS.CAT_0_MAX) {
    return { category: 0, description: '일반 작업복 (면 또는 합성섬유)', minCalRating: 0, hazardLabel: 'green' };
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

  // 입력 검증
  if (input.voltage_V < 208 || input.voltage_V > 15000) {
    throw new Error('ESVA-4401: 전압 범위 초과 (208V~15,000V)');
  }
  if (input.boltedFaultCurrent_kA < 0.2 || input.boltedFaultCurrent_kA > 106) {
    throw new Error('ESVA-4402: 단락전류 범위 초과 (0.2~106kA)');
  }
  if (input.arcDuration_s <= 0 || input.arcDuration_s > 10) {
    throw new Error('ESVA-4403: 아크 지속시간 범위 초과 (0~10s)');
  }

  // Step 1: 아크 전류 계산
  const { arcCurrent_kA, variationFactor } = calculateArcingCurrent(
    input.voltage_V,
    input.boltedFaultCurrent_kA,
    input.electrodeConfig,
  );
  steps.push({
    step: 1,
    title: '아크 전류 계산 (IEEE 1584-2018)',
    formula: 'log(I_a) = K_1 + K_2 \\cdot log(I_{bf}) + K_3 \\cdot (V/1000)',
    value: Math.round(arcCurrent_kA * 100) / 100,
    unit: 'kA',
    standardRef: 'IEEE 1584-2018 Section 4.3',
  });

  // Step 2: 입사 에너지 계산
  const incidentEnergy = calculateIncidentEnergy(
    arcCurrent_kA,
    input.arcDuration_s,
    input.workingDistance_mm,
    input.voltage_V,
    input.electrodeConfig,
    input.enclosureType,
  );
  steps.push({
    step: 2,
    title: '입사 에너지 계산',
    formula: 'E = C_f \\cdot E_n \\cdot (t/0.2) \\cdot (610^x / D^x)',
    value: incidentEnergy,
    unit: 'cal/cm²',
    standardRef: 'IEEE 1584-2018 Section 4.4',
  });

  // 변동 계수 적용 (최소 아크 전류 시나리오)
  const minArcCurrent = arcCurrent_kA * variationFactor;
  const minIncidentEnergy = calculateIncidentEnergy(
    minArcCurrent,
    input.arcDuration_s,
    input.workingDistance_mm,
    input.voltage_V,
    input.electrodeConfig,
    input.enclosureType,
  );
  const worstEnergy = Math.max(incidentEnergy, minIncidentEnergy);

  steps.push({
    step: 3,
    title: '변동 분석 (85% 최소 아크 전류)',
    formula: 'I_{a,min} = 0.85 \\cdot I_a',
    value: worstEnergy,
    unit: 'cal/cm²',
    standardRef: 'IEEE 1584-2018 Section 4.9',
  });

  // Step 4: 아크플래시 경계
  const distExp = input.electrodeConfig.includes('OA') ? 2.0 : 1.641;
  const boundary = calculateArcFlashBoundary(worstEnergy, input.workingDistance_mm, distExp);
  steps.push({
    step: 4,
    title: '아크플래시 경계 거리 (1.2 cal/cm² 기준)',
    formula: 'D_B = D \\cdot (E / E_b)^{1/x}',
    value: boundary,
    unit: 'mm',
    standardRef: 'IEEE 1584-2018 Section 4.7',
  });

  // Step 5: PPE 등급
  const ppe = determinePPE(worstEnergy);
  steps.push({
    step: 5,
    title: `PPE Category ${ppe.category}`,
    formula: 'NFPA 70E Table 130.7(C)(15)(a)',
    value: ppe.category,
    unit: '',
    standardRef: 'NFPA 70E',
  });

  return {
    value: worstEnergy,
    unit: 'cal/cm²',
    source: [{ standard: 'IEEE 1584', clause: '4.3-4.9', edition: '2018' }],
    label: '아크플래시 입사 에너지',
    formula: 'IEEE 1584-2018 경험식',
    steps,
    standardRef: 'IEEE 1584-2018, NFPA 70E',
    arcingCurrent_kA: Math.round(arcCurrent_kA * 100) / 100,
    incidentEnergy_cal_cm2: worstEnergy,
    arcFlashBoundary_mm: boundary,
    ppeCategory: ppe.category,
    ppeDescription: ppe.description,
    hazardLabel: ppe.hazardLabel,
    warnings: [
      'IEEE 1584-2018은 경험식(empirical model)으로 정확도 ±25% 범위입니다.',
      '안전 관련 최종 판단에는 ETAP/SKM 등 전문 소프트웨어 검증이 필요합니다.',
      '아크 지속시간 > 2초인 경우 반드시 에너지 저감 조치를 검토하세요.',
    ],
  };
}
