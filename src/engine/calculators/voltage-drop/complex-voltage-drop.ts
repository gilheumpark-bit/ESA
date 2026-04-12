/**
 * Complex (Impedance-Based) Voltage Drop Calculator
 *
 * Formula:
 *   Single-phase: e = 2 × I × L × (R·cosφ + X·sinφ)
 *   Three-phase:  e = √3 × I × L × (R·cosφ + X·sinφ)
 *
 * Where R and X are per-unit-length resistance and reactance (Ω/km).
 * Supports multi-section cable runs with cumulative voltage drop.
 *
 * Standards: KEC 232.51 (전압강하 허용), IEC 60364-5-52 (케이블 임피던스)
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import { SQRT3 } from '@engine/constants/physical';
import { activeDefaults } from '@/engine/calculators/country-defaults';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  assertOneOf,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export interface CableSection {
  /** Section identifier */
  name?: string;
  /** Section length in meters */
  length: number;
  /** Resistance per km (Ω/km) */
  resistance: number;
  /** Reactance per km (Ω/km) */
  reactance: number;
}

export interface ComplexVoltageDropInput {
  /** System voltage in Volts */
  voltage: number;
  /** Line current in Amperes */
  current: number;
  /** Power factor (0 < pf <= 1) */
  powerFactor: number;
  /** Number of phases: 1 or 3 */
  phase: 1 | 3;
  /** Cable sections (multi-section support) */
  sections: CableSection[];
  /** Allowable voltage drop percentage (default 3% per KEC) */
  allowableDropPercent?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateComplexVoltageDrop(input: ComplexVoltageDropInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.voltage, 'voltage');
  assertPositive(input.current, 'current');
  assertRange(input.powerFactor, 0.01, 1.0, 'powerFactor');
  assertOneOf(input.phase, [1, 3] as const, 'phase');

  if (!input.sections || input.sections.length === 0) {
    throw new Error('At least one cable section is required');
  }
  for (let i = 0; i < input.sections.length; i++) {
    assertPositive(input.sections[i].length, `sections[${i}].length`);
    assertPositive(input.sections[i].resistance, `sections[${i}].resistance`);
  }

  const { voltage: V, current: I, powerFactor: pf, phase } = input;
  const allowable = input.allowableDropPercent ?? activeDefaults().vdBranch;
  const cosPhi = pf;
  const sinPhi = Math.sqrt(1 - pf * pf);
  const phaseFactor = phase === 3 ? SQRT3 : 2;

  const steps: CalcStep[] = [];

  // PART 2 — Derivation

  // Step 1: Phase factor
  steps.push({
    step: 1,
    title: `Phase multiplier (${phase}-phase)`,
    formula: phase === 3 ? 'k = \\sqrt{3}' : 'k = 2',
    value: round(phaseFactor, 4),
    unit: '',
  });

  // Step 2..N: Per-section voltage drop
  let totalDropV = 0;
  input.sections.forEach((sec, idx) => {
    const L_km = sec.length / 1000;
    const R = sec.resistance;
    const X = sec.reactance ?? 0;
    const dropV = phaseFactor * I * L_km * (R * cosPhi + X * sinPhi);
    totalDropV += dropV;

    const label = sec.name ?? `Section ${idx + 1}`;
    steps.push({
      step: idx + 2,
      title: `Voltage drop — ${label} (${sec.length} m)`,
      formula: 'e = k \\times I \\times L \\times (R\\cos\\varphi + X\\sin\\varphi)',
      value: round(dropV, 2),
      unit: 'V',
      standardRef: 'IEC 60364-5-52',
    });
  });

  const sectionCount = input.sections.length;

  // Cumulative step
  if (sectionCount > 1) {
    steps.push({
      step: sectionCount + 2,
      title: 'Total cumulative voltage drop',
      formula: 'e_{total} = \\sum e_i',
      value: round(totalDropV, 2),
      unit: 'V',
    });
  }

  // Drop percentage
  const dropPercent = (totalDropV / V) * 100;
  steps.push({
    step: steps.length + 1,
    title: 'Voltage drop percentage',
    formula: 'VD\\% = \\frac{e_{total}}{V} \\times 100',
    value: round(dropPercent, 2),
    unit: '%',
    standardRef: 'KEC 232.51',
  });

  // PART 3 — Result assembly
  const pass = dropPercent <= allowable;
  const severity = pass ? 'info' : dropPercent <= allowable * 1.2 ? 'warning' : 'error';
  const message = pass
    ? `Voltage drop ${round(dropPercent, 2)}% within ${allowable}% limit`
    : `Voltage drop ${round(dropPercent, 2)}% exceeds ${allowable}% limit`;

  return {
    value: round(dropPercent, 2),
    unit: '%',
    formula: 'e = k \\times I \\times L \\times (R\\cos\\varphi + X\\sin\\varphi)',
    steps,
    source: [
      createSource('KEC', '232.51', { edition: '2021' }),
      createSource('IEC', '60364-5-52', { edition: '2009' }),
    ],
    judgment: createJudgment(pass, message, severity, 'KEC 232.51'),
    additionalOutputs: {
      totalDropVolts: { value: round(totalDropV, 2), unit: 'V' },
      dropPercent: { value: round(dropPercent, 2), unit: '%' },
      receivingEndVoltage: { value: round(V - totalDropV, 2), unit: 'V' },
    },
  };
}
