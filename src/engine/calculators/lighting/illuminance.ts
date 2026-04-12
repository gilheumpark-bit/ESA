/**
 * Illuminance (Lumen Method) Calculator
 *
 * Formulae:
 *   N = (E x A) / (phi x UF x MF)
 *   Achieved lux: E_actual = (N x phi x UF x MF) / A
 *   Power density: W/m^2 = (N x W_fixture) / A
 *
 * Standards: KS C 7612 (Indoor Lighting), IEC/CIE S 008
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export interface IlluminanceInput {
  /** Room area in m^2 */
  area: number;
  /** Required illuminance in lux */
  requiredLux: number;
  /** Luminous flux per fixture in lumens */
  luminousFlux: number;
  /** Utilization factor (0 < UF <= 1) */
  utilizationFactor: number;
  /** Maintenance factor (0 < MF <= 1) */
  maintenanceFactor: number;
  /** Power consumption per fixture in Watts (for W/m^2 calculation) */
  fixtureWattage?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateIlluminance(input: IlluminanceInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.area, 'area');
  assertPositive(input.requiredLux, 'requiredLux');
  assertPositive(input.luminousFlux, 'luminousFlux');
  assertRange(input.utilizationFactor, 0.01, 1.0, 'utilizationFactor');
  assertRange(input.maintenanceFactor, 0.01, 1.0, 'maintenanceFactor');

  const { area, requiredLux, luminousFlux: phi, utilizationFactor: UF, maintenanceFactor: MF } = input;
  const fixtureWattage = input.fixtureWattage ?? 40;

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];

  // Step 1: Calculate required number of fixtures
  const Nexact = (requiredLux * area) / (phi * UF * MF);
  const N = Math.ceil(Nexact);
  steps.push({
    step: 1,
    title: '필요 등기구 수량 (Number of fixtures)',
    formula: 'N = \\lceil \\frac{E \\times A}{\\Phi \\times UF \\times MF} \\rceil',
    value: N,
    unit: 'EA',
    standardRef: 'KS C 7612',
  });

  // Step 2: Achieved illuminance
  const achievedLux = (N * phi * UF * MF) / area;
  steps.push({
    step: 2,
    title: '달성 조도 (Achieved illuminance)',
    formula: 'E_{actual} = \\frac{N \\times \\Phi \\times UF \\times MF}{A}',
    value: round(achievedLux, 1),
    unit: 'lux',
  });

  // Step 3: Power density
  const totalPower = N * fixtureWattage;
  const powerDensity = totalPower / area;
  steps.push({
    step: 3,
    title: '조명전력밀도 (Lighting power density)',
    formula: 'LPD = \\frac{N \\times W_{fixture}}{A}',
    value: round(powerDensity, 2),
    unit: 'W/m\u00B2',
  });

  // Step 4: Efficacy check
  const efficacy = achievedLux / powerDensity;
  steps.push({
    step: 4,
    title: '조명 효율 (Luminous efficacy of installation)',
    formula: 'efficacy = E / LPD',
    value: round(efficacy, 1),
    unit: 'lux/(W/m\u00B2)',
  });

  // PART 3 -- Result assembly
  const pass = achievedLux >= requiredLux;
  return {
    value: N,
    unit: 'EA',
    formula: 'N = \\frac{E \\times A}{\\Phi \\times UF \\times MF}',
    steps,
    source: [
      createSource('KS', 'C 7612', { edition: '2020' }),
      createSource('IEC/CIE', 'S 008', { edition: '2001' }),
    ],
    judgment: createJudgment(
      pass,
      `등기구 ${N}개, 달성조도 ${round(achievedLux, 1)} lux (목표 ${requiredLux} lux), LPD ${round(powerDensity, 2)} W/m\u00B2`,
      'info',
    ),
    additionalOutputs: {
      numberOfFixtures: { value: N,                       unit: 'EA' },
      achievedLux:      { value: round(achievedLux, 1),   unit: 'lux' },
      powerDensity:     { value: round(powerDensity, 2),  unit: 'W/m\u00B2' },
    },
  };
}
