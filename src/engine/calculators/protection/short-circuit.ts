/**
 * Short-Circuit Current Calculator (IEC 60909 simplified)
 *
 * 3-Phase Symmetrical Short-Circuit:
 *   Isc = V / (sqrt(3) x Zt)
 *
 * Total impedance:
 *   Zt = Zsource + Zcable
 *   Zsource = (V^2 / S_tr) x (Zk% / 100)
 *   Zcable  = sqrt(Rcable^2 + Xcable^2) x L / 1000
 *
 * Standards: IEC 60909 (Short-circuit currents in AC systems)
 */

import { SQRT3, RESISTIVITY_CU, RESISTIVITY_AL } from '@engine/constants/physical';
import { getCableImpedance } from '@/data/transformer/transformer-db';
import { createSource, createJudgment } from '@engine/sjc/types';
import { DEFAULT_REACTANCE_OHM_PER_KM, getKappaFactor } from '@engine/constants/calc-thresholds';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  assertOneOf,
  round,
} from '../types';

// ── Input ───────────────────────────────────────────────────────────────────

export interface ShortCircuitInput {
  /** System voltage, line-to-line (V) */
  systemVoltage: number;
  /** Transformer rated capacity (kVA) */
  transformerCapacity: number;
  /** Transformer impedance (%) — typically 4-6% */
  impedancePercent: number;
  /** Cable length from transformer to fault point (m) */
  cableLength: number;
  /** Cable cross-section (mm^2) */
  cableSize: number;
  /** Conductor material */
  conductor: 'Cu' | 'Al';
  /** Cable reactance Ohm/km (default 0.08) */
  reactance?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateShortCircuit(input: ShortCircuitInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.systemVoltage, 'systemVoltage');
  assertPositive(input.transformerCapacity, 'transformerCapacity');
  assertRange(input.impedancePercent, 0.1, 30, 'impedancePercent');
  assertPositive(input.cableLength, 'cableLength');
  assertPositive(input.cableSize, 'cableSize');
  assertOneOf(input.conductor, ['Cu', 'Al'] as const, 'conductor');

  const {
    systemVoltage: V,
    transformerCapacity: S_kVA,
    impedancePercent: Zk_pct,
    cableLength: L,
    cableSize: A,
    conductor,
    reactance: X_input,
  } = input;

  const rho = conductor === 'Cu' ? RESISTIVITY_CU : RESISTIVITY_AL;
  const X_per_km = X_input ?? DEFAULT_REACTANCE_OHM_PER_KM;
  const S_VA = S_kVA * 1000;

  const steps: CalcStep[] = [];

  // PART 2 — Derivation

  // Step 1: Source impedance (referred to secondary)
  const Z_source = (V * V / S_VA) * (Zk_pct / 100);
  steps.push({
    step: 1,
    title: 'Calculate source (transformer) impedance',
    formula: 'Z_{source} = \\frac{V^2}{S_{tr}} \\times \\frac{Z_k\\%}{100}',
    value: round(Z_source, 6),
    unit: '\u03A9',
    standardRef: 'IEC 60909',
  });

  // Step 2: Cable impedance
  const R_cable_per_km = (rho * 1000) / A; // Ohm/km
  const R_cable = R_cable_per_km * (L / 1000);
  const X_cable = X_per_km * (L / 1000);
  const Z_cable = Math.sqrt(R_cable * R_cable + X_cable * X_cable);
  steps.push({
    step: 2,
    title: 'Calculate cable impedance',
    formula: 'Z_{cable} = \\sqrt{R_{cable}^2 + X_{cable}^2} \\times \\frac{L}{1000}',
    value: round(Z_cable, 6),
    unit: '\u03A9',
  });

  // Step 3: Total impedance
  const Z_total = Z_source + Z_cable;
  steps.push({
    step: 3,
    title: 'Calculate total impedance',
    formula: 'Z_t = Z_{source} + Z_{cable}',
    value: round(Z_total, 6),
    unit: '\u03A9',
  });

  // Step 4: 3-phase short-circuit current
  const Isc = V / (SQRT3 * Z_total);
  const Isc_kA = Isc / 1000;
  steps.push({
    step: 4,
    title: 'Calculate 3-phase symmetrical short-circuit current',
    formula: 'I_{sc} = \\frac{V}{\\sqrt{3} \\times Z_t}',
    value: round(Isc, 1),
    unit: 'A',
    standardRef: 'IEC 60909',
  });

  steps.push({
    step: 5,
    title: 'Convert to kA',
    formula: 'I_{sc(kA)} = I_{sc} / 1000',
    value: round(Isc_kA, 2),
    unit: 'kA',
  });

  // Step 6: Peak short-circuit current (IEC 60909 κ factor)
  const kPeak = getKappaFactor(V);
  const _Ipeak_kA = kPeak * SQRT3 / 2 * Isc_kA; // simplified: ip = kappa * sqrt(2) * Ik
  // More accurate: ip = kappa * sqrt(2) * Ik"
  const Ipeak_accurate = kPeak * Math.SQRT2 * Isc_kA;
  steps.push({
    step: 6,
    title: 'Calculate peak short-circuit current',
    formula: 'i_p = \\kappa \\times \\sqrt{2} \\times I_{sc}',
    value: round(Ipeak_accurate, 2),
    unit: 'kA',
    standardRef: 'IEC 60909',
  });

  // PART 3 — Judgment
  const judgment = createJudgment(
    true,
    `Symmetrical Isc = ${round(Isc_kA, 2)} kA, Peak = ${round(Ipeak_accurate, 2)} kA. Protective device must have breaking capacity >= ${round(Isc_kA, 2)} kA.`,
    'info',
    'IEC 60909',
  );

  return {
    value: round(Isc_kA, 2),
    unit: 'kA',
    formula: 'I_{sc} = \\frac{V}{\\sqrt{3} \\times Z_t}',
    steps,
    source: [
      createSource('IEC', '60909', { edition: '2016' }),
      createSource('KEC', '213', { edition: '2021' }),
    ],
    judgment,
    additionalOutputs: {
      shortCircuitCurrent_A: { value: round(Isc, 1), unit: 'A' },
      shortCircuitCurrent_kA: { value: round(Isc_kA, 2), unit: 'kA' },
      peakCurrent_kA: { value: round(Ipeak_accurate, 2), unit: 'kA' },
      sourceImpedance: { value: round(Z_source, 6), unit: '\u03A9' },
      cableImpedance: { value: round(Z_cable, 6), unit: '\u03A9' },
      totalImpedance: { value: round(Z_total, 6), unit: '\u03A9' },
    },
  };
}
