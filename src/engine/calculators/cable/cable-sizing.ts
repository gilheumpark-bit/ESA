/**
 * Cable Sizing Calculator
 *
 * Determines minimum cable size that satisfies BOTH:
 *   1. Ampacity (current-carrying capacity after derating)
 *   2. Voltage drop limit (KEC 232.52)
 *
 * Method:
 *   - Look up base ampacity from KEC tables
 *   - Apply temperature and grouping correction factors
 *   - Check voltage drop with calculateVoltageDrop
 *   - Select smallest size that passes both criteria
 *
 * Standards: KEC 232.3, KEC 232.52, IEC 60364-5-52
 */

import { SQRT3, RESISTIVITY_CU, RESISTIVITY_AL } from '@engine/constants/physical';
import { createSource, createJudgment } from '@engine/sjc/types';
import { DEFAULT_REACTANCE_OHM_PER_KM } from '@engine/constants/calc-thresholds';
import { activeDefaults } from '@/engine/calculators/country-defaults';
import {
  getIecAmpacity,
  IEC_CABLE_SIZES,
  type IecAmpacityResult,
} from '@/data/ampacity-tables/iec-ampacity';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertOneOf,
  round,
} from '../types';

/** Standard cable sizes in mm^2 */
export const CABLE_SIZES_MM2 = IEC_CABLE_SIZES;

type InsulationType = 'XLPE' | 'PVC';
type ConductorMaterial = 'Cu' | 'Al';
type InstallationMethod = 'A1' | 'A2' | 'B1' | 'B2' | 'C' | 'D' | 'E' | 'F';

function isUnavailableSize(error: unknown): boolean {
  return error instanceof Error && /not available/i.test(error.message);
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
    installation = 'C',
    ambientTemp = 30,
    groupCount = 1,
    powerFactor: pf = 0.85,
    phase = 3,
    dropLimitPercent = activeDefaults().vdBranch,
  } = input;

  const steps: CalcStep[] = [];
  // PART 2 — Correction factors

  let correctionProbe: IecAmpacityResult | null = null;
  for (const size of CABLE_SIZES_MM2) {
    try {
      correctionProbe = getIecAmpacity({
        size,
        conductor,
        insulation,
        method: installation,
        ambientTemp,
        groupCount,
      });
      break;
    } catch (error) {
      if (isUnavailableSize(error)) continue;
      throw error;
    }
  }
  if (!correctionProbe) {
    throw new Error(`No IEC ampacity entries are available for ${conductor}/${insulation}/${installation}.`);
  }

  const Kt = correctionProbe.factors.find((factor) => factor.type === 'temperature')?.factor ?? 1;
  steps.push({
    step: 1,
    title: 'Temperature correction factor',
    formula: 'K_t = \\sqrt{\\frac{\\theta_{max} - \\theta_{amb}}{\\theta_{max} - 30}}',
    value: Kt,
    unit: '-',
    standardRef: 'KEC 232.3',
  });

  const Kg = correctionProbe.factors.find((factor) => factor.type === 'grouping')?.factor ?? 1;
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
  const X = DEFAULT_REACTANCE_OHM_PER_KM;

  let selectedSize: number | null = null;
  let selectedAmpacity = 0;
  let correctedAmpacity = 0;
  let vdPct = Infinity;
  let largestAvailable: { size: number; result: IecAmpacityResult } | null = null;

  for (const size of CABLE_SIZES_MM2) {
    let ampacity: IecAmpacityResult;
    try {
      ampacity = getIecAmpacity({
        size,
        conductor,
        insulation,
        method: installation,
        ambientTemp,
        groupCount,
      });
    } catch (error) {
      if (isUnavailableSize(error)) continue;
      throw error;
    }
    largestAvailable = { size, result: ampacity };

    // Ampacity check
    if (ampacity.corrected < I) continue;

    // Voltage drop check
    const R = (rho * 1000) / size; // Ohm/km
    const sinPhi = Math.sqrt(1 - pf * pf);
    const multiplier = phase === 3 ? SQRT3 : 2;
    const e = multiplier * I * (L / 1000) * (R * pf + X * sinPhi);
    const pct = (e / V) * 100;

    if (pct <= dropLimitPercent) {
      selectedSize = size;
      selectedAmpacity = ampacity.ampacity;
      correctedAmpacity = ampacity.corrected;
      vdPct = round(pct, 2);
      break;
    }

    // Ampacity passes but VD fails — update to current best candidate and keep looking
    selectedSize = size;
    selectedAmpacity = ampacity.ampacity;
    correctedAmpacity = ampacity.corrected;
    vdPct = round(pct, 2);
  }

  // If we iterated all and none passed VD, select the last one tried
  if (selectedSize === null) {
    if (!largestAvailable) {
      throw new Error(`No IEC ampacity entries are available for ${conductor}/${insulation}/${installation}.`);
    }
    selectedSize = largestAvailable.size;
    selectedAmpacity = largestAvailable.result.ampacity;
    correctedAmpacity = largestAvailable.result.corrected;
    const R = (rho * 1000) / selectedSize;
    const sinPhi = Math.sqrt(1 - pf * pf);
    const multiplier = phase === 3 ? SQRT3 : 2;
    const e = multiplier * I * (L / 1000) * (R * pf + X * sinPhi);
    vdPct = round((e / V) * 100, 2);
  }

  steps.push({
    step: 4,
    title: `Select minimum cable size (IEC Method ${installation})`,
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
    standardRef: 'KEC 232.52',
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
      createSource('KEC', '232.52', { edition: '2021' }),
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
