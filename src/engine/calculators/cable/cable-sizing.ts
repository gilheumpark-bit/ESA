/**
 * Cable Sizing Calculator
 *
 * Determines minimum cable size that satisfies BOTH:
 *   1. Ampacity (current-carrying capacity after derating)
 *   2. Voltage drop limit (KEC 232.51)
 *
 * Method:
 *   - Look up base ampacity from KEC tables
 *   - Apply temperature and grouping correction factors
 *   - Check voltage drop with calculateVoltageDrop
 *   - Select smallest size that passes both criteria
 *
 * Standards: KEC 232.3, KEC 232.51, IEC 60364-5-52
 */

import { SQRT3, RESISTIVITY_CU, RESISTIVITY_AL } from '@engine/constants/physical';
import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertOneOf,
  round,
} from '../types';

// ── Ampacity lookup tables (simplified KEC / IEC 60364-5-52 Table B.52-1) ──

/** Standard cable sizes in mm^2 */
export const CABLE_SIZES_MM2 = [
  1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630,
] as const;

/**
 * Base ampacity (A) for XLPE insulated Cu cables, installation method C
 * (single-layer on wall/tray, 30 deg C ambient, 90 deg C conductor)
 * Reference: KEC Table 232-3 / IEC 60364-5-52 Table B.52-4
 */
const XLPE_CU_AMPACITY: Record<number, number> = {
  1.5: 23, 2.5: 31, 4: 42, 6: 54, 10: 73, 16: 98,
  25: 129, 35: 158, 50: 190, 70: 243, 95: 295, 120: 340,
  150: 387, 185: 440, 240: 514, 300: 586, 400: 671, 500: 760, 630: 865,
};

const XLPE_AL_AMPACITY: Record<number, number> = {
  2.5: 24, 4: 32, 6: 42, 10: 57, 16: 76,
  25: 100, 35: 123, 50: 148, 70: 189, 95: 230, 120: 265,
  150: 302, 185: 343, 240: 400, 300: 456, 400: 523, 500: 590, 630: 673,
};

const PVC_CU_AMPACITY: Record<number, number> = {
  1.5: 19, 2.5: 26, 4: 35, 6: 45, 10: 61, 16: 81,
  25: 106, 35: 131, 50: 158, 70: 200, 95: 241, 120: 278,
  150: 318, 185: 362, 240: 424, 300: 486, 400: 560, 500: 636, 630: 730,
};

const PVC_AL_AMPACITY: Record<number, number> = {
  2.5: 20, 4: 27, 6: 35, 10: 47, 16: 63,
  25: 83, 35: 102, 50: 123, 70: 156, 95: 188, 120: 217,
  150: 248, 185: 283, 240: 330, 300: 378, 400: 437, 500: 497, 630: 570,
};

type InsulationType = 'XLPE' | 'PVC';
type ConductorMaterial = 'Cu' | 'Al';
type InstallationMethod = 'A1' | 'A2' | 'B1' | 'B2' | 'C' | 'D' | 'E' | 'F';

function getAmpacityTable(conductor: ConductorMaterial, insulation: InsulationType): Record<number, number> {
  if (insulation === 'XLPE') {
    return conductor === 'Cu' ? XLPE_CU_AMPACITY : XLPE_AL_AMPACITY;
  }
  return conductor === 'Cu' ? PVC_CU_AMPACITY : PVC_AL_AMPACITY;
}

/**
 * Temperature correction factor (simplified KEC Table 232-3 note)
 * Base: 30 deg C for XLPE (90 deg C rated), 30 deg C for PVC (70 deg C rated)
 */
function tempCorrectionFactor(ambientTemp: number, insulation: InsulationType): number {
  const maxTemp = insulation === 'XLPE' ? 90 : 70;
  const baseAmbient = 30;
  if (ambientTemp >= maxTemp) {
    throw new Error(
      `Ambient temperature (${ambientTemp}°C) must be below maximum conductor temperature (${maxTemp}°C)`,
    );
  }
  if (ambientTemp <= baseAmbient) return 1.0;
  const factor = Math.sqrt((maxTemp - ambientTemp) / (maxTemp - baseAmbient));
  return factor > 0 ? round(factor, 4) : 0;
}

/**
 * Grouping correction factor (simplified IEC 60364-5-52 Table B.52-17)
 */
function groupCorrectionFactor(count: number): number {
  if (count <= 1) return 1.00;
  if (count === 2) return 0.80;
  if (count === 3) return 0.70;
  if (count <= 5) return 0.65;
  if (count <= 8) return 0.60;
  if (count <= 12) return 0.55;
  return 0.50;
}

// ── Input ───────────────────────────────────────────────────────────────────

export interface CableSizingInput {
  /** Load current (A) */
  current: number;
  /** One-way cable length (m) */
  length: number;
  /** System voltage (V) */
  voltage: number;
  /** Conductor material */
  conductor: ConductorMaterial;
  /** Insulation type */
  insulation: InsulationType;
  /** Installation method (default C) */
  installation?: InstallationMethod;
  /** Ambient temperature (deg C, default 30) */
  ambientTemp?: number;
  /** Number of grouped cables (default 1) */
  groupCount?: number;
  /** Power factor (default 0.85) */
  powerFactor?: number;
  /** Phase type (default 3) */
  phase?: 1 | 3;
  /** Voltage drop limit % (default 3) */
  dropLimitPercent?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateCableSizing(input: CableSizingInput): DetailedCalcResult {
  // PART 1 — Validation & defaults
  assertPositive(input.current, 'current');
  assertPositive(input.length, 'length');
  assertPositive(input.voltage, 'voltage');
  assertOneOf(input.conductor, ['Cu', 'Al'] as const, 'conductor');
  assertOneOf(input.insulation, ['XLPE', 'PVC'] as const, 'insulation');

  const {
    current: I,
    length: L,
    voltage: V,
    conductor,
    insulation,
    ambientTemp = 30,
    groupCount = 1,
    powerFactor: pf = 0.85,
    phase = 3,
    dropLimitPercent = 3,
  } = input;

  const steps: CalcStep[] = [];
  const ampacityTable = getAmpacityTable(conductor, insulation);

  // PART 2 — Correction factors

  // Step 1: Temperature correction
  const Kt = tempCorrectionFactor(ambientTemp, insulation);
  steps.push({
    step: 1,
    title: 'Temperature correction factor',
    formula: 'K_t = \\sqrt{\\frac{\\theta_{max} - \\theta_{amb}}{\\theta_{max} - 30}}',
    value: Kt,
    unit: '-',
    standardRef: 'KEC 232.3',
  });

  // Step 2: Grouping correction
  const Kg = groupCorrectionFactor(groupCount);
  steps.push({
    step: 2,
    title: 'Grouping correction factor',
    formula: 'K_g = f(n)',
    value: Kg,
    unit: '-',
    standardRef: 'IEC 60364-5-52 Table B.52-17',
  });

  // Step 3: Required ampacity before derating
  const correctionProduct = Kt * Kg;
  const I_required = correctionProduct > 0 ? I / correctionProduct : Infinity;
  steps.push({
    step: 3,
    title: 'Required cable ampacity (before correction)',
    formula: 'I_{req} = \\frac{I_{load}}{K_t \\times K_g}',
    value: round(I_required, 2),
    unit: 'A',
  });

  // PART 3 — Size selection (ampacity + voltage drop)
  const rho = conductor === 'Cu' ? RESISTIVITY_CU : RESISTIVITY_AL;
  const X = 0.08; // Ohm/km default reactance

  let selectedSize: number | null = null;
  let selectedAmpacity = 0;
  let correctedAmpacity = 0;
  let vdPct = Infinity;

  for (const size of CABLE_SIZES_MM2) {
    const baseAmp = ampacityTable[size];
    if (baseAmp === undefined) continue;

    // Ampacity check
    if (baseAmp < I_required) continue;

    // Voltage drop check
    const R = (rho * 1000) / size; // Ohm/km
    const sinPhi = Math.sqrt(1 - pf * pf);
    const multiplier = phase === 3 ? SQRT3 : 2;
    const e = multiplier * I * (L / 1000) * (R * pf + X * sinPhi);
    const pct = (e / V) * 100;

    if (pct <= dropLimitPercent) {
      selectedSize = size;
      selectedAmpacity = baseAmp;
      correctedAmpacity = round(baseAmp * correctionProduct, 2);
      vdPct = round(pct, 2);
      break;
    }

    // Ampacity passes but VD fails — update to current best candidate and keep looking
    selectedSize = size;
    selectedAmpacity = baseAmp;
    correctedAmpacity = round(baseAmp * correctionProduct, 2);
    vdPct = round(pct, 2);
  }

  // If we iterated all and none passed VD, select the last one tried
  if (selectedSize === null) {
    // Fallback: largest available
    const sizes = Object.keys(ampacityTable).map(Number).sort((a, b) => a - b);
    selectedSize = sizes[sizes.length - 1];
    selectedAmpacity = ampacityTable[selectedSize] ?? 0;
    correctedAmpacity = round(selectedAmpacity * correctionProduct, 2);
    const R = (rho * 1000) / selectedSize;
    const sinPhi = Math.sqrt(1 - pf * pf);
    const multiplier = phase === 3 ? SQRT3 : 2;
    const e = multiplier * I * (L / 1000) * (R * pf + X * sinPhi);
    vdPct = round((e / V) * 100, 2);
  }

  steps.push({
    step: 4,
    title: 'Select minimum cable size (ampacity)',
    formula: 'I_{base} \\geq I_{req}',
    value: selectedSize,
    unit: 'mm\u00B2',
    standardRef: 'KEC 232.3',
  });

  steps.push({
    step: 5,
    title: 'Verify voltage drop',
    formula: 'e\\% \\leq ' + dropLimitPercent + '\\%',
    value: vdPct,
    unit: '%',
    standardRef: 'KEC 232.51',
  });

  // PART 4 — Judgment
  const ampacityOk = correctedAmpacity >= I;
  const vdOk = vdPct <= dropLimitPercent;
  const pass = ampacityOk && vdOk;

  const msgs: string[] = [];
  if (!ampacityOk) msgs.push(`Corrected ampacity ${correctedAmpacity}A < load ${I}A`);
  if (!vdOk) msgs.push(`Voltage drop ${vdPct}% > ${dropLimitPercent}%`);

  const judgment = createJudgment(
    pass,
    pass
      ? `${selectedSize} mm\u00B2 ${conductor}/${insulation}: ampacity ${correctedAmpacity}A (OK), VD ${vdPct}% (OK)`
      : `${selectedSize} mm\u00B2 fails: ${msgs.join('; ')}`,
    pass ? 'info' : 'error',
    'KEC 232.3',
  );

  return {
    value: selectedSize,
    unit: 'mm\u00B2',
    formula: 'I_{z} \\times K_t \\times K_g \\geq I_{load}',
    steps,
    source: [
      createSource('KEC', '232.3', { edition: '2021' }),
      createSource('KEC', '232.51', { edition: '2021' }),
      createSource('IEC', '60364-5-52', { edition: '2009' }),
    ],
    judgment,
    additionalOutputs: {
      minimumSize: { value: selectedSize, unit: 'mm\u00B2' },
      baseAmpacity: { value: selectedAmpacity, unit: 'A' },
      correctedAmpacity: { value: correctedAmpacity, unit: 'A' },
      voltageDropPercent: { value: vdPct, unit: '%' },
    },
  };
}
