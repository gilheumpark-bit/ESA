/**
 * Ground Resistance Calculator — Vertical Rod Electrode
 *
 * Single rod (Dwight formula):
 *   R = (rho / (2 * pi * L)) * ln(4L / d)
 *
 * Multiple parallel rods with spacing S (simplified):
 *   R_total = R_single / (n * eta)
 *   where eta is a utilization factor depending on spacing/length ratio
 *
 * Standards: KEC 142 (Grounding Systems), IEEE Std 80
 *
 * KEC limits:
 *   - General: 100 Ohm
 *   - Low-voltage systems with ground-fault protection: 10 Ohm
 *   - Medium/High voltage: per design
 */

import { PI } from '@engine/constants/physical';
import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  round,
} from '../types';

// ── Utilization factor table (rods in a line) ──────────────────────────────

/**
 * Approximate parallel rod utilization factor (eta)
 * Based on spacing-to-length ratio (S/L) and rod count
 * Reference: IEEE Std 142 (Green Book)
 */
function rodUtilizationFactor(rodCount: number, spacingOverLength: number): number {
  if (rodCount <= 1) return 1.0;

  // Utilization improves as S/L increases
  // At S/L >= 6, rods are effectively independent (eta ~= 1)
  // At S/L = 1, significant mutual coupling reduces effectiveness
  if (spacingOverLength >= 6) return 1.0;
  if (spacingOverLength >= 4) return 0.95;
  if (spacingOverLength >= 3) return 0.90;
  if (spacingOverLength >= 2) return 0.85;
  if (spacingOverLength >= 1) {
    // Varies with rod count
    if (rodCount <= 2) return 0.82;
    if (rodCount <= 4) return 0.77;
    if (rodCount <= 8) return 0.72;
    return 0.65;
  }
  // S/L < 1 (rods very close together)
  if (rodCount <= 2) return 0.70;
  if (rodCount <= 4) return 0.60;
  return 0.50;
}

// ── Input ───────────────────────────────────────────────────────────────────

export interface GroundResistanceInput {
  /** Soil resistivity (Ohm*m) */
  soilResistivity: number;
  /** Rod length (m, typically 1.5-3.0) */
  rodLength: number;
  /** Rod diameter (mm, typically 14.2-19.1) */
  rodDiameter: number;
  /** Number of parallel rods (default 1) */
  rodCount?: number;
  /** Spacing between rods (m, default = rodLength) */
  spacing?: number;
  /** Target resistance limit (Ohm, default 10) */
  targetResistance?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateGroundResistance(input: GroundResistanceInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.soilResistivity, 'soilResistivity');
  assertPositive(input.rodLength, 'rodLength');
  assertPositive(input.rodDiameter, 'rodDiameter');

  const {
    soilResistivity: rho,
    rodLength: L,
    rodDiameter: d_mm,
    rodCount: n = 1,
    spacing: S_input,
    targetResistance = 10,
  } = input;

  if (n < 1 || !Number.isInteger(n)) {
    assertPositive(n, 'rodCount');
  }

  const d = d_mm / 1000; // convert mm to m
  const S = S_input ?? L; // default spacing = rod length

  if (n > 1) {
    assertPositive(S, 'spacing');
  }

  const steps: CalcStep[] = [];

  // PART 2 — Derivation

  // Step 1: Single rod resistance (Dwight formula)
  const R_single = (rho / (2 * PI * L)) * Math.log(4 * L / d);
  steps.push({
    step: 1,
    title: 'Calculate single rod resistance (Dwight)',
    formula: 'R = \\frac{\\rho}{2\\pi L} \\ln\\frac{4L}{d}',
    value: round(R_single, 2),
    unit: '\u03A9',
    standardRef: 'KEC 142',
  });

  // Step 2: Utilization factor
  const eta = rodUtilizationFactor(n, S / L);
  steps.push({
    step: 2,
    title: 'Determine rod utilization factor',
    formula: '\\eta = f(n, S/L)',
    value: round(eta, 3),
    unit: '-',
    standardRef: 'IEEE Std 142',
  });

  // Step 3: Total resistance
  const R_total = n > 1 ? R_single / (n * eta) : R_single;
  steps.push({
    step: 3,
    title: n > 1 ? 'Calculate total resistance (parallel rods)' : 'Total resistance (single rod)',
    formula: n > 1 ? 'R_{total} = \\frac{R_{single}}{n \\times \\eta}' : 'R_{total} = R_{single}',
    value: round(R_total, 2),
    unit: '\u03A9',
  });

  // Step 4: Compare with target
  steps.push({
    step: 4,
    title: 'Compare with target resistance',
    formula: `R_{total} ${R_total <= targetResistance ? '\\leq' : '>'} R_{limit}`,
    value: targetResistance,
    unit: '\u03A9',
    standardRef: 'KEC 142',
  });

  // PART 3 — If failing, suggest required rod count
  let suggestedRodCount: number | null = null;
  if (R_total > targetResistance) {
    // Estimate required rods: n_req = R_single / (target * eta_assumed)
    // Iterate to converge
    for (let tryN = 1; tryN <= 50; tryN++) {
      const tryEta = rodUtilizationFactor(tryN, S / L);
      const tryR = R_single / (tryN * tryEta);
      if (tryR <= targetResistance) {
        suggestedRodCount = tryN;
        break;
      }
    }
  }

  // PART 4 — Judgment
  const pass = R_total <= targetResistance;
  const judgment = createJudgment(
    pass,
    pass
      ? `Ground resistance ${round(R_total, 2)}\u03A9 <= ${targetResistance}\u03A9 limit (OK)`
      : suggestedRodCount !== null
        ? `Ground resistance ${round(R_total, 2)}\u03A9 > ${targetResistance}\u03A9. Consider using ${suggestedRodCount} rod(s) or soil treatment.`
        : `Ground resistance ${round(R_total, 2)}\u03A9 > ${targetResistance}\u03A9. Soil treatment or alternative electrode needed.`,
    pass ? 'info' : 'error',
    'KEC 142',
  );

  const result: DetailedCalcResult = {
    value: round(R_total, 2),
    unit: '\u03A9',
    formula: 'R = \\frac{\\rho}{2\\pi L} \\ln\\frac{4L}{d}',
    steps,
    source: [
      createSource('KEC', '142', { edition: '2021' }),
      createSource('IEEE', 'Std 80', { edition: '2015' }),
    ],
    judgment,
    additionalOutputs: {
      singleRodResistance: { value: round(R_single, 2), unit: '\u03A9' },
      totalResistance: { value: round(R_total, 2), unit: '\u03A9' },
      utilizationFactor: { value: round(eta, 3), unit: '-' },
    },
  };

  if (suggestedRodCount !== null) {
    result.additionalOutputs!.suggestedRodCount = { value: suggestedRodCount, unit: 'rods' };
  }

  return result;
}
