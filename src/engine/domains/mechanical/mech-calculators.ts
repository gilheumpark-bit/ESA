/**
 * Mechanical Engineering Calculators (기계 계산기)
 *
 * 5 calculators for mechanical/HVAC engineering:
 *   1. calculatePipeSizing      — 배관 구경 (velocity method, ASME B31)
 *   2. calculateHeatLoss        — 열손실 계산 (Q = U x A x ΔT, ASHRAE)
 *   3. calculatePumpHead        — 펌프 양정 (H = Hs + Hf + Hp)
 *   4. calculateBoilerCapacity  — 보일러 용량 (steam output, ASME BPVC)
 *   5. calculateHVACLoad        — 냉난방 부하 (simplified, ASHRAE)
 *
 * PART 1: Input types
 * PART 2: Pipe sizing
 * PART 3: Heat loss
 * PART 4: Pump head
 * PART 5: Boiler capacity
 * PART 6: HVAC load
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

export interface PipeSizingInput {
  /** Volumetric flow rate in m³/h */
  flowRate: number;
  /** Desired fluid velocity in m/s (typically 1-3 for water, 15-30 for steam) */
  velocity: number;
  /** Fluid type for velocity validation */
  fluidType?: 'water' | 'steam' | 'oil' | 'gas';
}

export interface HeatLossInput {
  /** Overall heat transfer coefficient in W/(m²·K) */
  uValue: number;
  /** Heat transfer area in m² */
  area: number;
  /** Indoor temperature in °C */
  indoorTemp: number;
  /** Outdoor temperature in °C */
  outdoorTemp: number;
  /** Safety factor (default 1.1) */
  safetyFactor?: number;
}

export interface PumpHeadInput {
  /** Static head (elevation difference) in meters */
  staticHead: number;
  /** Friction head loss in meters */
  frictionHead: number;
  /** Pressure head required at delivery point in meters */
  pressureHead: number;
  /** Flow rate in m³/h (for power calculation) */
  flowRate: number;
  /** Pump efficiency (0.5-0.9, default 0.7) */
  efficiency?: number;
}

export interface BoilerCapacityInput {
  /** Steam demand in kg/h */
  steamDemand: number;
  /** Feed water temperature in °C */
  feedWaterTemp: number;
  /** Steam pressure in bar (gauge) */
  steamPressure: number;
  /** Blowdown rate as fraction (0-0.1, default 0.05) */
  blowdownRate?: number;
  /** Boiler efficiency (0.7-0.95, default 0.85) */
  boilerEfficiency?: number;
}

export interface HVACLoadInput {
  /** Floor area in m² */
  floorArea: number;
  /** Load type: cooling or heating */
  loadType: 'cooling' | 'heating';
  /** Building type for load factor lookup */
  buildingType: 'office' | 'retail' | 'hospital' | 'residential' | 'industrial';
  /** Number of occupants (optional, for internal gains) */
  occupants?: number;
  /** Lighting power density in W/m² (optional) */
  lightingDensity?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Pipe Sizing (배관 구경, ASME B31)
// ═══════════════════════════════════════════════════════════════════════════════

/** Standard pipe nominal diameters in mm (ASME B36.10) */
const STANDARD_PIPE_SIZES = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600];

/**
 * Calculate pipe diameter using velocity method.
 *
 * A = Q / v  →  d = sqrt(4A / π)
 *
 * Standard: ASME B31.1 / B31.3
 */
export function calculatePipeSizing(input: PipeSizingInput): DetailedCalcResult {
  assertPositive(input.flowRate, 'flowRate');
  assertPositive(input.velocity, 'velocity');

  const { flowRate: Q_m3h, velocity: v } = input;

  const steps: CalcStep[] = [];

  // Step 1: Convert flow to m³/s
  const Q = Q_m3h / 3600;
  steps.push({
    step: 1,
    title: '유량 단위 환산 (Convert flow to m³/s)',
    formula: 'Q = Q_{m^3/h} / 3600',
    value: round(Q, 6),
    unit: 'm³/s',
  });

  // Step 2: Required cross-sectional area
  const A = Q / v;
  steps.push({
    step: 2,
    title: '필요 단면적 (Required cross-sectional area)',
    formula: 'A = Q / v',
    value: round(A, 6),
    unit: 'm²',
    standardRef: 'ASME B31',
  });

  // Step 3: Calculated diameter
  const d = Math.sqrt((4 * A) / Math.PI) * 1000; // convert to mm
  steps.push({
    step: 3,
    title: '계산 직경 (Calculated diameter)',
    formula: 'd = \\sqrt{\\frac{4A}{\\pi}} \\times 1000',
    value: round(d, 1),
    unit: 'mm',
  });

  // Step 4: Select standard size
  const selectedSize = STANDARD_PIPE_SIZES.find((s) => s >= d) ?? STANDARD_PIPE_SIZES[STANDARD_PIPE_SIZES.length - 1];
  steps.push({
    step: 4,
    title: '표준 관경 선정 (Select standard pipe size)',
    formula: `d_{std} \\geq ${round(d, 1)}\\; mm`,
    value: selectedSize,
    unit: 'mm (nominal)',
  });

  // Step 5: Actual velocity with selected size
  const dSelected_m = selectedSize / 1000;
  const aSelected = Math.PI * (dSelected_m / 2) ** 2;
  const vActual = Q / aSelected;
  steps.push({
    step: 5,
    title: '실제 유속 확인 (Actual velocity check)',
    formula: 'v_{actual} = Q / A_{selected}',
    value: round(vActual, 2),
    unit: 'm/s',
  });

  return {
    value: selectedSize,
    unit: 'mm',
    formula: 'd = \\sqrt{\\frac{4Q}{\\pi v}}',
    steps,
    source: [createSource('ASME', 'B31.1', { edition: '2020' })],
    judgment: createJudgment(
      true,
      `배관 구경 DN${selectedSize} 선정 (계산 ${round(d, 1)}mm, 실제유속 ${round(vActual, 2)} m/s)`,
      'info',
    ),
    additionalOutputs: {
      calculatedDiameter: { value: round(d, 1), unit: 'mm' },
      actualVelocity: { value: round(vActual, 2), unit: 'm/s' },
      crossSectionArea: { value: round(A * 1e6, 2), unit: 'mm²' },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Heat Loss (열손실, ASHRAE)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate heat loss through a building envelope element.
 *
 * Q = U x A x ΔT [W]
 *
 * Standard: ASHRAE Fundamentals
 */
export function calculateHeatLoss(input: HeatLossInput): DetailedCalcResult {
  assertPositive(input.uValue, 'uValue');
  assertPositive(input.area, 'area');

  const sf = input.safetyFactor ?? 1.1;
  assertRange(sf, 1.0, 2.0, 'safetyFactor');

  const { uValue: U, area: A, indoorTemp: Ti, outdoorTemp: To } = input;

  const steps: CalcStep[] = [];

  // Step 1: Temperature difference
  const deltaT = Math.abs(Ti - To);
  steps.push({
    step: 1,
    title: '실내외 온도차 (Temperature difference)',
    formula: '\\Delta T = |T_i - T_o|',
    value: round(deltaT, 1),
    unit: '°C',
  });

  // Step 2: Base heat loss
  const qBase = U * A * deltaT;
  steps.push({
    step: 2,
    title: '기본 열손실 (Base heat loss)',
    formula: 'Q = U \\times A \\times \\Delta T',
    value: round(qBase, 2),
    unit: 'W',
    standardRef: 'ASHRAE Fundamentals',
  });

  // Step 3: Design heat loss with safety factor
  const qDesign = qBase * sf;
  steps.push({
    step: 3,
    title: '설계 열손실 (Design heat loss with safety factor)',
    formula: `Q_d = Q \\times ${sf}`,
    value: round(qDesign, 2),
    unit: 'W',
  });

  // Step 4: Convert to kW
  const qKw = qDesign / 1000;
  steps.push({
    step: 4,
    title: 'kW 환산 (Convert to kW)',
    formula: 'Q_{kW} = Q_d / 1000',
    value: round(qKw, 3),
    unit: 'kW',
  });

  return {
    value: round(qDesign, 2),
    unit: 'W',
    formula: 'Q = U \\times A \\times \\Delta T',
    steps,
    source: [createSource('ASHRAE', 'Fundamentals Ch.18', { edition: '2021' })],
    judgment: createJudgment(
      true,
      `열손실 = ${round(qKw, 3)} kW (U=${U}, A=${A}m², ΔT=${deltaT}°C)`,
      'info',
    ),
    additionalOutputs: {
      baseHeatLoss: { value: round(qBase, 2), unit: 'W' },
      designHeatLossKw: { value: round(qKw, 3), unit: 'kW' },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Pump Head (펌프 양정)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate total pump head and motor power.
 *
 * H = Hs + Hf + Hp
 * P = (ρ x g x Q x H) / (η x 3.6e6) [kW]
 */
export function calculatePumpHead(input: PumpHeadInput): DetailedCalcResult {
  assertPositive(input.flowRate, 'flowRate');
  // staticHead can be 0 if pump is at same level
  if (input.staticHead < 0) {
    // negative static head is valid (suction lift scenario), but we validate finite
    if (!Number.isFinite(input.staticHead)) {
      throw new Error('staticHead must be a finite number');
    }
  }
  assertPositive(input.frictionHead, 'frictionHead');

  const eta = input.efficiency ?? 0.7;
  assertRange(eta, 0.3, 0.95, 'efficiency');

  const { staticHead: Hs, frictionHead: Hf, pressureHead: Hp, flowRate: Q_m3h } = input;

  const steps: CalcStep[] = [];

  // Step 1: Total head
  const H = Hs + Hf + Hp;
  steps.push({
    step: 1,
    title: '총 양정 (Total pump head)',
    formula: 'H = H_s + H_f + H_p',
    value: round(H, 2),
    unit: 'm',
  });

  // Step 2: Motor power
  const rho = 998; // kg/m³ water at 20°C
  const g = 9.81;
  const Q_m3s = Q_m3h / 3600;
  const power = (rho * g * Q_m3s * H) / (eta * 1000); // kW
  steps.push({
    step: 2,
    title: '펌프 동력 (Pump motor power)',
    formula: 'P = \\frac{\\rho g Q H}{\\eta \\times 1000}',
    value: round(power, 2),
    unit: 'kW',
  });

  // Step 3: Select standard motor size
  const MOTOR_SIZES = [0.75, 1.1, 1.5, 2.2, 3.0, 4.0, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110];
  const selectedMotor = MOTOR_SIZES.find((s) => s >= power) ?? MOTOR_SIZES[MOTOR_SIZES.length - 1];
  steps.push({
    step: 3,
    title: '표준 전동기 선정 (Select standard motor)',
    formula: `P_{motor} \\geq ${round(power, 2)}\\; kW`,
    value: selectedMotor,
    unit: 'kW',
  });

  return {
    value: round(H, 2),
    unit: 'm',
    formula: 'H = H_s + H_f + H_p',
    steps,
    source: [createSource('KS B', '6301', { edition: '2020' })],
    judgment: createJudgment(
      true,
      `총 양정 = ${round(H, 2)}m, 펌프 동력 = ${round(power, 2)}kW → ${selectedMotor}kW 전동기`,
      'info',
    ),
    additionalOutputs: {
      pumpPower: { value: round(power, 2), unit: 'kW' },
      selectedMotor: { value: selectedMotor, unit: 'kW' },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Boiler Capacity (보일러 용량, ASME BPVC)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enthalpy lookup (simplified) for saturated steam at given pressure.
 * Returns { hf: feedwater enthalpy at 100°C ref, hg: steam enthalpy } in kJ/kg.
 */
function steamEnthalpy(pressureBar: number): { hf: number; hg: number } {
  // Simplified lookup — linear interpolation between common values
  // 1 bar: hf=417, hg=2675; 5 bar: hf=640, hg=2749; 10 bar: hf=763, hg=2778
  if (pressureBar <= 1) return { hf: 417, hg: 2675 };
  if (pressureBar <= 5) {
    const t = (pressureBar - 1) / 4;
    return { hf: 417 + t * (640 - 417), hg: 2675 + t * (2749 - 2675) };
  }
  if (pressureBar <= 10) {
    const t = (pressureBar - 5) / 5;
    return { hf: 640 + t * (763 - 640), hg: 2749 + t * (2778 - 2749) };
  }
  // > 10 bar extrapolation
  return { hf: 763, hg: 2778 };
}

function feedWaterEnthalpy(tempC: number): number {
  // cp of water ~ 4.186 kJ/(kg·°C), reference 0°C
  return tempC * 4.186;
}

/**
 * Calculate boiler capacity (heat input required).
 *
 * Q = ms x (hg - hfw) / η_boiler [kW]
 *
 * Standard: ASME BPVC Section I
 */
export function calculateBoilerCapacity(input: BoilerCapacityInput): DetailedCalcResult {
  assertPositive(input.steamDemand, 'steamDemand');
  assertRange(input.feedWaterTemp, 0, 200, 'feedWaterTemp');
  assertPositive(input.steamPressure, 'steamPressure');

  const bd = input.blowdownRate ?? 0.05;
  assertRange(bd, 0, 0.2, 'blowdownRate');
  const eta = input.boilerEfficiency ?? 0.85;
  assertRange(eta, 0.5, 0.99, 'boilerEfficiency');

  const { steamDemand: ms, feedWaterTemp, steamPressure } = input;

  const steps: CalcStep[] = [];

  // Step 1: Steam enthalpy
  const { hg } = steamEnthalpy(steamPressure);
  steps.push({
    step: 1,
    title: '증기 엔탈피 (Steam enthalpy at pressure)',
    formula: `h_g(${steamPressure}\\; bar)`,
    value: round(hg, 1),
    unit: 'kJ/kg',
    standardRef: 'ASME BPVC Section I',
  });

  // Step 2: Feed water enthalpy
  const hfw = feedWaterEnthalpy(feedWaterTemp);
  steps.push({
    step: 2,
    title: '급수 엔탈피 (Feed water enthalpy)',
    formula: `h_{fw} = T_{fw} \\times c_p`,
    value: round(hfw, 1),
    unit: 'kJ/kg',
  });

  // Step 3: Required steam with blowdown
  const msTotal = ms * (1 + bd);
  steps.push({
    step: 3,
    title: '블로다운 포함 증기량 (Steam with blowdown)',
    formula: `m_{total} = m_s \\times (1 + ${bd})`,
    value: round(msTotal, 2),
    unit: 'kg/h',
  });

  // Step 4: Heat output
  const qOutput = msTotal * (hg - hfw) / 3600; // kW
  steps.push({
    step: 4,
    title: '필요 열출력 (Required heat output)',
    formula: 'Q_{out} = m_{total} \\times (h_g - h_{fw}) / 3600',
    value: round(qOutput, 2),
    unit: 'kW',
  });

  // Step 5: Required boiler capacity (input)
  const qInput = qOutput / eta;
  steps.push({
    step: 5,
    title: '보일러 용량 (Boiler capacity with efficiency)',
    formula: `Q_{boiler} = Q_{out} / \\eta\\;(\\eta=${eta})`,
    value: round(qInput, 2),
    unit: 'kW',
  });

  return {
    value: round(qInput, 2),
    unit: 'kW',
    formula: 'Q = \\frac{m_s (h_g - h_{fw})}{\\eta \\times 3600}',
    steps,
    source: [createSource('ASME', 'BPVC Section I', { edition: '2021' })],
    judgment: createJudgment(
      true,
      `보일러 용량 = ${round(qInput, 2)} kW (증기 ${ms} kg/h, ${steamPressure} bar)`,
      'info',
    ),
    additionalOutputs: {
      heatOutput: { value: round(qOutput, 2), unit: 'kW' },
      totalSteam: { value: round(msTotal, 2), unit: 'kg/h' },
      enthalpyDiff: { value: round(hg - hfw, 1), unit: 'kJ/kg' },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6 — HVAC Load (냉난방 부하, ASHRAE)
// ═══════════════════════════════════════════════════════════════════════════════

/** Simplified load factors in W/m² by building type */
const COOLING_LOAD_FACTORS: Record<string, number> = {
  office: 120,
  retail: 150,
  hospital: 180,
  residential: 80,
  industrial: 100,
};

const HEATING_LOAD_FACTORS: Record<string, number> = {
  office: 80,
  retail: 90,
  hospital: 120,
  residential: 60,
  industrial: 70,
};

const OCCUPANT_HEAT_GAIN = 75; // W per person (sensible, ASHRAE)
const DEFAULT_LIGHTING = 15; // W/m² default

/**
 * Calculate simplified HVAC cooling/heating load.
 *
 * Q = A x loadFactor + occupants x 75 + lighting [W]
 *
 * Standard: ASHRAE Fundamentals (simplified method)
 */
export function calculateHVACLoad(input: HVACLoadInput): DetailedCalcResult {
  assertPositive(input.floorArea, 'floorArea');
  assertOneOf(input.loadType, ['cooling', 'heating'] as const, 'loadType');
  assertOneOf(
    input.buildingType,
    ['office', 'retail', 'hospital', 'residential', 'industrial'] as const,
    'buildingType',
  );

  const { floorArea: A, loadType, buildingType } = input;
  const occupants = input.occupants ?? 0;
  const lightingDensity = input.lightingDensity ?? DEFAULT_LIGHTING;

  const factors = loadType === 'cooling' ? COOLING_LOAD_FACTORS : HEATING_LOAD_FACTORS;
  const factor = factors[buildingType];

  const steps: CalcStep[] = [];

  // Step 1: Envelope/transmission load
  const envelopeLoad = A * factor;
  steps.push({
    step: 1,
    title: `외피 부하 (Envelope ${loadType} load)`,
    formula: `Q_{env} = A \\times ${factor}\\; W/m^2`,
    value: round(envelopeLoad, 0),
    unit: 'W',
    standardRef: 'ASHRAE Fundamentals',
  });

  // Step 2: Internal gains (cooling only adds; heating subtracts)
  const occupantGain = occupants * OCCUPANT_HEAT_GAIN;
  const lightingGain = A * lightingDensity;
  const internalGain = occupantGain + lightingGain;
  steps.push({
    step: 2,
    title: '내부 발열 (Internal heat gains)',
    formula: `Q_{int} = N \\times ${OCCUPANT_HEAT_GAIN} + A \\times ${lightingDensity}`,
    value: round(internalGain, 0),
    unit: 'W',
  });

  // Step 3: Total load
  let totalLoad: number;
  if (loadType === 'cooling') {
    totalLoad = envelopeLoad + internalGain;
  } else {
    // Heating: envelope load minus internal gains (internal gains help)
    totalLoad = Math.max(envelopeLoad - internalGain, 0);
  }
  steps.push({
    step: 3,
    title: `총 ${loadType === 'cooling' ? '냉방' : '난방'} 부하 (Total load)`,
    formula: loadType === 'cooling'
      ? 'Q_{total} = Q_{env} + Q_{int}'
      : 'Q_{total} = \\max(Q_{env} - Q_{int}, 0)',
    value: round(totalLoad, 0),
    unit: 'W',
  });

  // Step 4: Convert to kW and RT (refrigeration tons)
  const totalKw = totalLoad / 1000;
  const totalRT = totalLoad / 3517; // 1 RT = 3517 W
  steps.push({
    step: 4,
    title: '단위 환산 (Convert units)',
    formula: '1\\; RT = 3517\\; W',
    value: round(totalKw, 2),
    unit: 'kW',
  });

  return {
    value: round(totalLoad, 0),
    unit: 'W',
    formula: loadType === 'cooling'
      ? 'Q = A \\times f + Q_{int}'
      : 'Q = A \\times f - Q_{int}',
    steps,
    source: [createSource('ASHRAE', 'Fundamentals Ch.18', { edition: '2021' })],
    judgment: createJudgment(
      true,
      `${loadType === 'cooling' ? '냉방' : '난방'} 부하 = ${round(totalKw, 2)} kW (${round(totalRT, 1)} RT)`,
      'info',
    ),
    additionalOutputs: {
      loadKw: { value: round(totalKw, 2), unit: 'kW' },
      loadRT: { value: round(totalRT, 1), unit: 'RT' },
      envelopeLoad: { value: round(envelopeLoad, 0), unit: 'W' },
      internalGain: { value: round(internalGain, 0), unit: 'W' },
    },
  };
}
