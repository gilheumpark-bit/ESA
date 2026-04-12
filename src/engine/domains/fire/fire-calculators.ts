/**
 * Fire Protection Calculators (소방 계산기)
 *
 * 5 calculators for fire protection engineering:
 *   1. calculateSprinklerFlow     — 스프링클러 유량 (Q = K x sqrt(P))
 *   2. calculateFirePumpCapacity  — 소화펌프 용량 (total flow + pressure head)
 *   3. calculateExtinguisherCount — 소화기 배치 수량 (area-based, NFSC 101)
 *   4. calculateSmokeExhaust      — 제연 배기량 (floor area x height x ACH)
 *   5. calculateFireAlarmZone     — 화재감지기 수량 (area / coverage per detector)
 *
 * PART 1: Input types
 * PART 2: Sprinkler flow
 * PART 3: Fire pump capacity
 * PART 4: Extinguisher count
 * PART 5: Smoke exhaust
 * PART 6: Fire alarm zone
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  assertOneOf,
  round,
} from '../../calculators/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Input Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface SprinklerFlowInput {
  /** K-factor of sprinkler head (L/min/√bar or gpm/√psi) */
  kFactor: number;
  /** Operating pressure in bar */
  pressure: number;
  /** Number of sprinkler heads operating simultaneously */
  headCount: number;
}

export interface FirePumpCapacityInput {
  /** Required total flow rate in L/min */
  requiredFlow: number;
  /** Static head (vertical height) in meters */
  staticHead: number;
  /** Friction loss in meters of head */
  frictionLoss: number;
  /** Required nozzle pressure in bar */
  nozzlePressure: number;
  /** Safety factor (1.0 - 1.5, default 1.1) */
  safetyFactor?: number;
}

export interface ExtinguisherCountInput {
  /** Total floor area in m² */
  floorArea: number;
  /** Hazard level: light, ordinary, extra */
  hazardLevel: 'light' | 'ordinary' | 'extra';
  /** Floor count (each floor needs at least 1) */
  floorCount: number;
}

export interface SmokeExhaustInput {
  /** Floor area in m² */
  floorArea: number;
  /** Floor-to-ceiling height in meters */
  ceilingHeight: number;
  /** Required air changes per hour (default 5 for smoke exhaust) */
  airChangesPerHour?: number;
  /** Space type for default ACH lookup */
  spaceType?: 'corridor' | 'lobby' | 'stairwell' | 'parking' | 'general';
}

export interface FireAlarmZoneInput {
  /** Protection area in m² */
  area: number;
  /** Ceiling height in meters */
  ceilingHeight: number;
  /** Detector type */
  detectorType: 'smoke' | 'heat' | 'flame';
  /** Building use category */
  buildingUse?: 'residential' | 'commercial' | 'industrial' | 'assembly';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Sprinkler Flow (스프링클러 유량, NFSC 103)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate sprinkler flow rate.
 *
 * Formula: Q_per_head = K x sqrt(P)
 * Total: Q_total = Q_per_head x N
 *
 * Standard: NFSC 103 (스프링클러설비의 화재안전기준)
 */
export function calculateSprinklerFlow(input: SprinklerFlowInput): DetailedCalcResult {
  assertPositive(input.kFactor, 'kFactor');
  assertPositive(input.pressure, 'pressure');
  assertPositive(input.headCount, 'headCount');

  const { kFactor: K, pressure: P, headCount: N } = input;

  const steps: CalcStep[] = [];

  // Step 1: Flow per head
  const sqrtP = Math.sqrt(P);
  const qPerHead = K * sqrtP;
  steps.push({
    step: 1,
    title: '헤드당 유량 계산 (Calculate flow per head)',
    formula: 'Q_{head} = K \\times \\sqrt{P}',
    value: round(qPerHead, 2),
    unit: 'L/min',
    standardRef: 'NFSC 103 §7',
  });

  // Step 2: Total flow
  const qTotal = qPerHead * N;
  steps.push({
    step: 2,
    title: '총 유량 계산 (Calculate total flow)',
    formula: 'Q_{total} = Q_{head} \\times N',
    value: round(qTotal, 2),
    unit: 'L/min',
  });

  // Step 3: Convert to m³/min
  const qCubicMin = qTotal / 1000;
  steps.push({
    step: 3,
    title: '단위 환산 (Convert to m³/min)',
    formula: 'Q_{m^3/min} = Q_{total} / 1000',
    value: round(qCubicMin, 4),
    unit: 'm³/min',
  });

  return {
    value: round(qTotal, 2),
    unit: 'L/min',
    formula: 'Q = K \\times \\sqrt{P} \\times N',
    steps,
    source: [createSource('NFSC', '103 §7', { edition: '2022' })],
    judgment: createJudgment(
      qTotal > 0,
      `총 유량 = ${round(qTotal, 2)} L/min (${N}개 헤드, ${P} bar)`,
      'info',
    ),
    additionalOutputs: {
      flowPerHead: { value: round(qPerHead, 2), unit: 'L/min', formula: 'Q_{head} = K \\times \\sqrt{P}' },
      flowCubicMeter: { value: round(qCubicMin, 4), unit: 'm³/min' },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Fire Pump Capacity (소화펌프 용량, NFSC 103)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate fire pump capacity.
 *
 * Total head: H = Hs + Hf + (P_nozzle x 10.2)
 * Pump power: W = (Q x H x 9.81) / (η x 60) [kW]
 *
 * Standard: NFSC 103 (소화펌프)
 */
export function calculateFirePumpCapacity(input: FirePumpCapacityInput): DetailedCalcResult {
  assertPositive(input.requiredFlow, 'requiredFlow');
  assertPositive(input.staticHead, 'staticHead');
  assertPositive(input.frictionLoss, 'frictionLoss');
  assertPositive(input.nozzlePressure, 'nozzlePressure');

  const sf = input.safetyFactor ?? 1.1;
  assertRange(sf, 1.0, 2.0, 'safetyFactor');

  const { requiredFlow: Q, staticHead: Hs, frictionLoss: Hf, nozzlePressure: Pn } = input;

  const steps: CalcStep[] = [];

  // Step 1: Convert nozzle pressure to head
  const Hp = Pn * 10.2; // 1 bar = 10.2 m water column
  steps.push({
    step: 1,
    title: '노즐압력 수두 환산 (Nozzle pressure to head)',
    formula: 'H_p = P_{nozzle} \\times 10.2',
    value: round(Hp, 2),
    unit: 'm',
    standardRef: 'NFSC 103',
  });

  // Step 2: Total head
  const H = Hs + Hf + Hp;
  steps.push({
    step: 2,
    title: '총 양정 계산 (Total pump head)',
    formula: 'H = H_s + H_f + H_p',
    value: round(H, 2),
    unit: 'm',
  });

  // Step 3: Design flow with safety factor
  const Qd = Q * sf;
  steps.push({
    step: 3,
    title: '설계유량 (Design flow with safety factor)',
    formula: `Q_d = Q \\times ${sf}`,
    value: round(Qd, 2),
    unit: 'L/min',
  });

  // Step 4: Pump power (assuming 70% efficiency)
  const eta = 0.7;
  const pumpPower = (Qd / 1000 / 60) * H * 9810 / (eta * 1000); // kW
  steps.push({
    step: 4,
    title: '펌프 동력 (Pump power, η=0.7)',
    formula: 'W = \\frac{Q_d \\times H \\times 9.81}{\\eta \\times 60 \\times 1000}',
    value: round(pumpPower, 2),
    unit: 'kW',
  });

  const pass = H > 0 && pumpPower > 0;

  return {
    value: round(pumpPower, 2),
    unit: 'kW',
    formula: 'W = \\frac{Q \\times H \\times 9.81}{\\eta \\times 60000}',
    steps,
    source: [createSource('NFSC', '103', { edition: '2022' })],
    judgment: createJudgment(pass, `펌프 동력 = ${round(pumpPower, 2)} kW, 양정 = ${round(H, 2)} m`, 'info'),
    additionalOutputs: {
      totalHead: { value: round(H, 2), unit: 'm', formula: 'H = H_s + H_f + H_p' },
      designFlow: { value: round(Qd, 2), unit: 'L/min' },
      nozzlePressureHead: { value: round(Hp, 2), unit: 'm' },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Extinguisher Count (소화기 배치, NFSC 101)
// ═══════════════════════════════════════════════════════════════════════════════

/** Coverage area per extinguisher unit by hazard level (m²) */
const EXTINGUISHER_COVERAGE: Record<string, number> = {
  light: 200,    // 소위험: 200 m² 당 1단위
  ordinary: 100, // 중위험: 100 m² 당 1단위
  extra: 50,     // 대위험: 50 m² 당 1단위
};

/**
 * Calculate required number of fire extinguishers by area.
 *
 * Count = ceil(floor_area / coverage_per_unit)
 * Minimum 1 per floor.
 *
 * Standard: NFSC 101 (소화기구 및 자동소화장치의 화재안전기준)
 */
export function calculateExtinguisherCount(input: ExtinguisherCountInput): DetailedCalcResult {
  assertPositive(input.floorArea, 'floorArea');
  assertOneOf(input.hazardLevel, ['light', 'ordinary', 'extra'] as const, 'hazardLevel');
  assertPositive(input.floorCount, 'floorCount');

  const { floorArea, hazardLevel, floorCount } = input;
  const coverage = EXTINGUISHER_COVERAGE[hazardLevel];

  const steps: CalcStep[] = [];

  // Step 1: Coverage per unit
  steps.push({
    step: 1,
    title: `위험등급별 기준면적 (Coverage area for ${hazardLevel} hazard)`,
    formula: `A_{coverage} = ${coverage}\\; m^2`,
    value: coverage,
    unit: 'm²/unit',
    standardRef: 'NFSC 101 별표1',
  });

  // Step 2: Required units per floor
  const unitsPerFloor = Math.ceil(floorArea / coverage);
  steps.push({
    step: 2,
    title: '층당 필요 수량 (Units per floor)',
    formula: 'N_{floor} = \\lceil A_{floor} / A_{coverage} \\rceil',
    value: unitsPerFloor,
    unit: '개',
  });

  // Step 3: Total units
  const totalUnits = Math.max(unitsPerFloor, 1) * floorCount;
  steps.push({
    step: 3,
    title: '총 필요 수량 (Total units)',
    formula: 'N_{total} = N_{floor} \\times floors',
    value: totalUnits,
    unit: '개',
  });

  return {
    value: totalUnits,
    unit: '개',
    formula: 'N = \\lceil A / A_{coverage} \\rceil \\times floors',
    steps,
    source: [createSource('NFSC', '101 별표1', { edition: '2022' })],
    judgment: createJudgment(
      true,
      `소화기 ${totalUnits}개 필요 (${hazardLevel} 위험등급, ${floorArea}m², ${floorCount}층)`,
      'info',
    ),
    additionalOutputs: {
      unitsPerFloor: { value: unitsPerFloor, unit: '개/층' },
      coverageArea: { value: coverage, unit: 'm²/unit' },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Smoke Exhaust (제연 배기량, NFSC 501)
// ═══════════════════════════════════════════════════════════════════════════════

/** Default ACH (air changes per hour) by space type for smoke exhaust */
const DEFAULT_ACH: Record<string, number> = {
  corridor: 5,
  lobby: 5,
  stairwell: 7,
  parking: 6,
  general: 5,
};

/**
 * Calculate smoke exhaust volume.
 *
 * V = A x h x ACH [m³/h]
 * Q = V / 60 [m³/min]
 *
 * Standard: NFSC 501 (제연설비의 화재안전기준)
 */
export function calculateSmokeExhaust(input: SmokeExhaustInput): DetailedCalcResult {
  assertPositive(input.floorArea, 'floorArea');
  assertPositive(input.ceilingHeight, 'ceilingHeight');

  const spaceType = input.spaceType ?? 'general';
  const ach = input.airChangesPerHour ?? DEFAULT_ACH[spaceType] ?? 5;
  assertPositive(ach, 'airChangesPerHour');

  const { floorArea: A, ceilingHeight: h } = input;

  const steps: CalcStep[] = [];

  // Step 1: Space volume
  const volume = A * h;
  steps.push({
    step: 1,
    title: '공간 체적 (Space volume)',
    formula: 'V_{space} = A \\times h',
    value: round(volume, 2),
    unit: 'm³',
  });

  // Step 2: Hourly exhaust volume
  const exhaustHourly = volume * ach;
  steps.push({
    step: 2,
    title: '시간당 배기량 (Hourly exhaust volume)',
    formula: 'V_{exhaust} = V_{space} \\times ACH',
    value: round(exhaustHourly, 2),
    unit: 'm³/h',
    standardRef: 'NFSC 501 §6',
  });

  // Step 3: Per-minute rate
  const exhaustMinute = exhaustHourly / 60;
  steps.push({
    step: 3,
    title: '분당 배기량 (Per-minute rate)',
    formula: 'Q = V_{exhaust} / 60',
    value: round(exhaustMinute, 2),
    unit: 'm³/min',
  });

  return {
    value: round(exhaustHourly, 2),
    unit: 'm³/h',
    formula: 'V_{exhaust} = A \\times h \\times ACH',
    steps,
    source: [createSource('NFSC', '501 §6', { edition: '2022' })],
    judgment: createJudgment(
      true,
      `제연 배기량 = ${round(exhaustHourly, 2)} m³/h (ACH=${ach})`,
      'info',
    ),
    additionalOutputs: {
      perMinuteRate: { value: round(exhaustMinute, 2), unit: 'm³/min' },
      spaceVolume: { value: round(volume, 2), unit: 'm³' },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6 — Fire Alarm Zone (화재감지기 수량, NFSC 203)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Coverage area per detector (m²) by type and ceiling height range.
 * Based on NFSC 203 별표1.
 */
function getDetectorCoverage(detectorType: string, ceilingHeight: number): number {
  if (detectorType === 'smoke') {
    if (ceilingHeight <= 4) return 150;
    if (ceilingHeight <= 8) return 75;
    return 50; // > 8m, limited applicability
  }
  if (detectorType === 'heat') {
    // 차동식/정온식 감지기
    if (ceilingHeight <= 4) return 50;
    if (ceilingHeight <= 8) return 35;
    return 25;
  }
  if (detectorType === 'flame') {
    // 불꽃감지기 — coverage by viewing angle, simplified
    return 200;
  }
  return 50; // fallback
}

/**
 * Calculate fire alarm detector count for a zone.
 *
 * N = ceil(A / A_detector)
 *
 * Standard: NFSC 203 (자동화재탐지설비의 화재안전기준)
 */
export function calculateFireAlarmZone(input: FireAlarmZoneInput): DetailedCalcResult {
  assertPositive(input.area, 'area');
  assertPositive(input.ceilingHeight, 'ceilingHeight');
  assertOneOf(input.detectorType, ['smoke', 'heat', 'flame'] as const, 'detectorType');

  const { area: A, ceilingHeight: h, detectorType } = input;

  const steps: CalcStep[] = [];

  // Step 1: Determine coverage per detector
  const coverage = getDetectorCoverage(detectorType, h);
  steps.push({
    step: 1,
    title: '감지기 1개당 감시면적 (Coverage per detector)',
    formula: `A_{det} = ${coverage}\\; m^2 \\;(${detectorType}, h=${h}m)`,
    value: coverage,
    unit: 'm²/개',
    standardRef: 'NFSC 203 별표1',
  });

  // Step 2: Required detector count
  const count = Math.ceil(A / coverage);
  steps.push({
    step: 2,
    title: '필요 감지기 수 (Required detector count)',
    formula: 'N = \\lceil A / A_{det} \\rceil',
    value: count,
    unit: '개',
  });

  // Step 3: Warning for high ceilings with smoke detectors
  const highCeilingWarning = detectorType === 'smoke' && h > 15;
  if (highCeilingWarning) {
    steps.push({
      step: 3,
      title: '경고: 높은 천장 (Warning: high ceiling)',
      formula: 'h > 15m \\Rightarrow 연기감지기 부적합',
      value: h,
      unit: 'm',
      standardRef: 'NFSC 203 §5',
    });
  }

  const severity = highCeilingWarning ? 'warning' as const : 'info' as const;
  const msg = highCeilingWarning
    ? `감지기 ${count}개 필요. 주의: 천장높이 ${h}m — 연기감지기 유효 감지 한계 초과`
    : `${detectorType} 감지기 ${count}개 필요 (${A}m², 천장 ${h}m)`;

  return {
    value: count,
    unit: '개',
    formula: 'N = \\lceil A / A_{det} \\rceil',
    steps,
    source: [createSource('NFSC', '203 별표1', { edition: '2022' })],
    judgment: createJudgment(!highCeilingWarning, msg, severity),
    additionalOutputs: {
      coveragePerDetector: { value: coverage, unit: 'm²/개' },
      ceilingHeight: { value: h, unit: 'm' },
    },
  };
}
