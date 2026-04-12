/**
 * Voltage Drop Calculator (1-phase & 3-phase)
 *
 * Formulae:
 *   3-phase: e = (sqrt(3) x I x L x (R cos(phi) + X sin(phi))) / 1000
 *   1-phase: e = (2 x I x L x (R cos(phi) + X sin(phi))) / 1000
 *
 *   R = resistivity / area   [Ohm/km]
 *   X approximated at 0.08 Ohm/km for typical cables
 *
 * Standards: KEC 232.51 (voltage drop limits)
 *   - Branch circuits: 3%
 *   - Feeders: 3%
 *   - Total (feeder + branch): 5%
 */

import { SQRT3, RESISTIVITY_CU, RESISTIVITY_AL } from '@engine/constants/physical';
import { createSource, createJudgment } from '@engine/sjc/types';
import { activeDefaults } from '@/engine/calculators/country-defaults';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  assertOneOf,
  round,
} from '../types';

// ── Input ───────────────────────────────────────────────────────────────────

export type ConductorMaterial = 'Cu' | 'Al';
export type PhaseType = 1 | 3;

export interface VoltageDropInput {
  /** System voltage (V) */
  voltage: number;
  /** Load current (A) */
  current: number;
  /** One-way cable length (m) */
  length: number;
  /** Cable cross-section (mm^2) */
  cableSize: number;
  /** Conductor material */
  conductor: ConductorMaterial;
  /** Power factor (0 < pf <= 1) */
  powerFactor: number;
  /** Phase configuration */
  phase: PhaseType;
  /** Cable reactance Ohm/km (default 0.08) */
  reactance?: number;
  /** Voltage drop limit in percent (default 3) */
  dropLimitPercent?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateVoltageDrop(input: VoltageDropInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.voltage, 'voltage');
  assertPositive(input.current, 'current');
  assertPositive(input.length, 'length');
  assertPositive(input.cableSize, 'cableSize');
  assertRange(input.powerFactor, 0.01, 1.0, 'powerFactor');
  assertOneOf(input.conductor, ['Cu', 'Al'] as const, 'conductor');
  assertOneOf(input.phase, [1, 3] as const, 'phase');

  const {
    voltage: V,
    current: I,
    length: L,
    cableSize: A,
    conductor,
    powerFactor: pf,
    phase,
    reactance: X_input,
    dropLimitPercent = activeDefaults().vdBranch,
  } = input;

  const rho = conductor === 'Cu' ? RESISTIVITY_CU : RESISTIVITY_AL;
  const X = X_input ?? 0.08; // Ohm/km default

  const steps: CalcStep[] = [];

  // PART 2 — Derivation

  // Step 1: Cable resistance per km
  const R = (rho * 1000) / A; // rho is Ohm*mm^2/m => (rho*1000)/A = Ohm/km
  steps.push({
    step: 1,
    title: 'Calculate cable resistance',
    formula: 'R = \\frac{\\rho \\times 1000}{A}',
    value: round(R, 4),
    unit: '\u03A9/km',
    standardRef: 'KEC 232.51',
  });

  // Step 2: Impedance factor
  const sinPhi = Math.sqrt(1 - pf * pf);
  const Z_factor = R * pf + X * sinPhi;
  steps.push({
    step: 2,
    title: 'Calculate impedance drop factor',
    formula: 'Z = R \\cos\\varphi + X \\sin\\varphi',
    value: round(Z_factor, 4),
    unit: '\u03A9/km',
  });

  // Step 3: Voltage drop
  const multiplier = phase === 3 ? SQRT3 : 2;
  const e = (multiplier * I * (L / 1000) * Z_factor);
  const formulaStr = phase === 3
    ? 'e = \\frac{\\sqrt{3} \\times I \\times L \\times (R\\cos\\varphi + X\\sin\\varphi)}{1000}'
    : 'e = \\frac{2 \\times I \\times L \\times (R\\cos\\varphi + X\\sin\\varphi)}{1000}';
  steps.push({
    step: 3,
    title: `Calculate voltage drop (${phase}-phase)`,
    formula: formulaStr,
    value: round(e, 2),
    unit: 'V',
    standardRef: 'KEC 232.51',
  });

  // Step 4: Percentage
  const ePct = (e / V) * 100;
  steps.push({
    step: 4,
    title: 'Calculate voltage drop percentage',
    formula: 'e\\% = \\frac{e}{V} \\times 100',
    value: round(ePct, 2),
    unit: '%',
  });

  // PART 3 — Judgment
  const pass = ePct <= dropLimitPercent;
  const judgment = createJudgment(
    pass,
    pass
      ? `Voltage drop ${round(ePct, 2)}% <= ${dropLimitPercent}% limit (OK)`
      : `Voltage drop ${round(ePct, 2)}% EXCEEDS ${dropLimitPercent}% limit`,
    pass ? 'info' : 'error',
    'KEC 232.51',
  );

  return {
    value: round(e, 2),
    unit: 'V',
    formula: formulaStr,
    steps,
    source: [
      createSource('KEC', '232.51', { edition: '2021' }),
    ],
    judgment,
    additionalOutputs: {
      voltageDropPercent: { value: round(ePct, 2), unit: '%' },
      cableResistance: { value: round(R, 4), unit: '\u03A9/km' },
    },
  };
}
