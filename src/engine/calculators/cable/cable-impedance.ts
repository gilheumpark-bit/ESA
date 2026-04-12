/**
 * Cable Impedance Calculator
 *
 * Formulae:
 *   R = ρ₂₀ × (1 + α(T - 20)) × L / A       [Ω] (DC resistance, temp corrected)
 *   X = 2πfL_inductance                        [Ω] (approximate from geometry)
 *   Z = √(R² + X²)                             [Ω]
 *   θ = arctan(X / R)                           [deg]
 *
 * Where:
 *   ρ₂₀ = resistivity at 20°C (Cu: 0.017241, Al: 0.028264 Ω·mm²/m)
 *   α = temperature coefficient (Cu: 0.00393, Al: 0.00403 /°C)
 *   L_inductance ≈ (μ₀/2π) × ln(2s/d) for single-core cables
 *
 * Standards: IEC 60228 (conductor resistance), IEC 60287-1-1 (cable impedance)
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  RESISTIVITY_CU,
  RESISTIVITY_AL,
  TEMPERATURE_COEFF_CU,
  TEMPERATURE_COEFF_AL,
  PI,
} from '@engine/constants/physical';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertOneOf,
  round,
} from '../types';

// ── Typical reactance values per km for common cable sizes ──────────────────
// (Approximate X values in Ω/km for 50Hz, trefoil touching arrangement)
const TYPICAL_REACTANCE: Record<number, number> = {
  1.5:  0.115,
  2.5:  0.110,
  4:    0.107,
  6:    0.100,
  10:   0.094,
  16:   0.087,
  25:   0.083,
  35:   0.080,
  50:   0.078,
  70:   0.075,
  95:   0.073,
  120:  0.071,
  150:  0.070,
  185:  0.068,
  240:  0.066,
  300:  0.065,
  400:  0.063,
  500:  0.062,
  630:  0.060,
};

// ── Input / Output ──────────────────────────────────────────────────────────

export interface CableImpedanceInput {
  /** Cable cross-sectional area in mm² */
  cableSize: number;
  /** Conductor material */
  conductor: 'Cu' | 'Al';
  /** Cable length in meters */
  length: number;
  /** System frequency in Hz (default 60) */
  frequency?: number;
  /** Operating temperature in °C (default 75) */
  temperature?: number;
  /** Reactance per km override (Ω/km). If not provided, uses typical value. */
  reactancePerKm?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateCableImpedance(input: CableImpedanceInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.cableSize, 'cableSize');
  assertOneOf(input.conductor, ['Cu', 'Al'] as const, 'conductor');
  assertPositive(input.length, 'length');

  const freq = input.frequency ?? 60;
  const temp = input.temperature ?? 75;
  assertPositive(freq, 'frequency');

  const { cableSize: A, conductor, length: L } = input;
  const L_km = L / 1000;

  const rho20 = conductor === 'Cu' ? RESISTIVITY_CU : RESISTIVITY_AL;
  const alpha = conductor === 'Cu' ? TEMPERATURE_COEFF_CU : TEMPERATURE_COEFF_AL;

  const steps: CalcStep[] = [];

  // PART 2 — Resistance calculation

  // Step 1: DC resistance at 20°C per km
  // R20 = ρ / A (Ω·mm²/m) → per km = ρ × 1000 / A
  const R20perKm = (rho20 * 1000) / A;
  steps.push({
    step: 1,
    title: `DC resistance at 20°C per km (${conductor})`,
    formula: 'R_{20} = \\frac{\\rho_{20} \\times 1000}{A}',
    value: round(R20perKm, 4),
    unit: 'Ω/km',
    standardRef: 'IEC 60228',
  });

  // Step 2: Temperature-corrected resistance per km
  const RtPerKm = R20perKm * (1 + alpha * (temp - 20));
  steps.push({
    step: 2,
    title: `Resistance at ${temp}°C per km`,
    formula: 'R_T = R_{20} \\times [1 + \\alpha(T - 20)]',
    value: round(RtPerKm, 4),
    unit: 'Ω/km',
  });

  // Step 3: Total resistance for cable length
  const Rtotal = RtPerKm * L_km;
  steps.push({
    step: 3,
    title: `Total resistance (${L} m)`,
    formula: 'R = R_T \\times L',
    value: round(Rtotal, 4),
    unit: 'Ω',
  });

  // PART 3 — Reactance calculation

  // Step 4: Reactance per km (from table or override)
  const XperKm = input.reactancePerKm ?? TYPICAL_REACTANCE[A] ?? 0.08;
  // Adjust for frequency (table values typically at 50Hz)
  const XperKmAdj = XperKm * (freq / 50);
  steps.push({
    step: 4,
    title: `Reactance per km at ${freq} Hz`,
    formula: 'X = X_{50} \\times \\frac{f}{50}',
    value: round(XperKmAdj, 4),
    unit: 'Ω/km',
    standardRef: 'IEC 60287-1-1',
  });

  // Step 5: Total reactance
  const Xtotal = XperKmAdj * L_km;
  steps.push({
    step: 5,
    title: `Total reactance (${L} m)`,
    formula: 'X_{total} = X \\times L',
    value: round(Xtotal, 4),
    unit: 'Ω',
  });

  // PART 4 — Impedance magnitude and angle

  // Step 6: Impedance magnitude
  const Ztotal = Math.sqrt(Rtotal * Rtotal + Xtotal * Xtotal);
  steps.push({
    step: 6,
    title: 'Total impedance magnitude',
    formula: 'Z = \\sqrt{R^2 + X^2}',
    value: round(Ztotal, 4),
    unit: 'Ω',
  });

  // Step 7: Impedance angle
  const angleRad = Math.atan2(Xtotal, Rtotal);
  const angleDeg = (angleRad * 180) / PI;
  steps.push({
    step: 7,
    title: 'Impedance angle',
    formula: '\\theta = \\arctan\\left(\\frac{X}{R}\\right)',
    value: round(angleDeg, 2),
    unit: 'deg',
  });

  // PART 5 — Result assembly
  return {
    value: round(Ztotal, 4),
    unit: 'Ω',
    formula: 'Z = \\sqrt{R^2 + X^2}',
    steps,
    source: [
      createSource('IEC', '60228', { edition: '2004' }),
      createSource('IEC', '60287-1-1', { edition: '2014' }),
    ],
    judgment: createJudgment(
      true,
      `Z = ${round(Ztotal, 4)} Ω (R = ${round(Rtotal, 4)}, X = ${round(Xtotal, 4)}) at ${temp}°C, ${freq} Hz`,
      'info',
    ),
    additionalOutputs: {
      resistance: { value: round(Rtotal, 4), unit: 'Ω', formula: 'R = R_T \\times L' },
      reactance: { value: round(Xtotal, 4), unit: 'Ω', formula: 'X = X_f \\times L' },
      impedance: { value: round(Ztotal, 4), unit: 'Ω', formula: 'Z = \\sqrt{R^2 + X^2}' },
      angle: { value: round(angleDeg, 2), unit: 'deg' },
      resistancePerKm: { value: round(RtPerKm, 4), unit: 'Ω/km' },
      reactancePerKm: { value: round(XperKmAdj, 4), unit: 'Ω/km' },
    },
  };
}
