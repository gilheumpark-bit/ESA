/**
 * Three-Phase Voltage Drop Calculator
 *
 * Formulae:
 *   Steady-state: VD = √3 × I × L × (R·cosφ + X·sinφ)
 *   Motor starting: VDs = √3 × Is × L × (R·cosφs + X·sinφs)
 *     where Is = starting current multiplier × rated current
 *     and cosφs = starting power factor (typically 0.2-0.4)
 *
 * KEC 232.51 limits:
 *   - General branch circuit: 3%
 *   - Feeder + branch total: 5%
 *   - Motor starting: 15% at terminals (momentary)
 *
 * Standards: KEC 232.51, IEC 60364-5-52, NEMA MG-1
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import { SQRT3 } from '@engine/constants/physical';
import { activeDefaults } from '@/engine/calculators/country-defaults';
import { DEFAULT_MOTOR_STARTING_VD_LIMIT } from '@engine/constants/calc-thresholds';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export interface ThreePhaseVDInput {
  /** Line-to-line voltage in Volts */
  voltage: number;
  /** Rated line current in Amperes */
  current: number;
  /** Cable length in meters */
  length: number;
  /** Cable resistance per km (Ω/km) */
  resistance: number;
  /** Cable reactance per km (Ω/km) */
  reactance: number;
  /** Power factor at normal operation */
  powerFactor: number;
  /** Allowable voltage drop % (default 3%) */
  allowableDropPercent?: number;
  /** Motor starting analysis */
  motorStarting?: {
    /** Starting current multiplier (e.g. 6 for DOL) */
    startingCurrentMultiplier: number;
    /** Power factor during starting (typically 0.2-0.4) */
    startingPowerFactor: number;
    /** Allowable starting voltage drop % (default 15%) */
    allowableStartingDropPercent?: number;
  };
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateThreePhaseVD(input: ThreePhaseVDInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.voltage, 'voltage');
  assertPositive(input.current, 'current');
  assertPositive(input.length, 'length');
  assertPositive(input.resistance, 'resistance');
  assertRange(input.powerFactor, 0.01, 1.0, 'powerFactor');

  const { voltage: V, current: I, length, resistance: R, reactance: X, powerFactor: pf } = input;
  const allowable = input.allowableDropPercent ?? activeDefaults().vdBranch;
  const L_km = length / 1000;
  const cosPhi = pf;
  const sinPhi = Math.sqrt(1 - pf * pf);
  const steps: CalcStep[] = [];

  // PART 2 — Steady-state voltage drop

  // Step 1: Impedance voltage drop factor
  const zFactor = R * cosPhi + (X ?? 0) * sinPhi;
  steps.push({
    step: 1,
    title: 'Effective impedance factor per km',
    formula: 'z_{eff} = R\\cos\\varphi + X\\sin\\varphi',
    value: round(zFactor, 4),
    unit: 'Ω/km',
  });

  // Step 2: Steady-state voltage drop
  const vdSteady = SQRT3 * I * L_km * zFactor;
  steps.push({
    step: 2,
    title: 'Three-phase voltage drop (steady-state)',
    formula: 'VD = \\sqrt{3} \\times I \\times L \\times z_{eff}',
    value: round(vdSteady, 2),
    unit: 'V',
    standardRef: 'KEC 232.51',
  });

  // Step 3: Percentage
  const vdPercent = (vdSteady / V) * 100;
  steps.push({
    step: 3,
    title: 'Steady-state voltage drop percentage',
    formula: 'VD\\% = \\frac{VD}{V} \\times 100',
    value: round(vdPercent, 2),
    unit: '%',
    standardRef: 'KEC 232.51',
  });

  // Step 4: Receiving end voltage
  const vReceiving = V - vdSteady;
  steps.push({
    step: 4,
    title: 'Receiving-end voltage',
    formula: 'V_r = V - VD',
    value: round(vReceiving, 2),
    unit: 'V',
  });

  // PART 3 — Motor starting voltage drop (if applicable)
  let vdStartPercent = 0;
  let startingPass = true;
  const allowableStart = input.motorStarting?.allowableStartingDropPercent ?? DEFAULT_MOTOR_STARTING_VD_LIMIT;

  if (input.motorStarting) {
    const ms = input.motorStarting;
    assertPositive(ms.startingCurrentMultiplier, 'startingCurrentMultiplier');
    assertRange(ms.startingPowerFactor, 0.05, 1.0, 'startingPowerFactor');

    const Is = I * ms.startingCurrentMultiplier;
    const cosPhiS = ms.startingPowerFactor;
    const sinPhiS = Math.sqrt(1 - cosPhiS * cosPhiS);

    const zFactorStart = R * cosPhiS + (X ?? 0) * sinPhiS;
    const vdStart = SQRT3 * Is * L_km * zFactorStart;
    vdStartPercent = (vdStart / V) * 100;

    steps.push({
      step: 5,
      title: 'Motor starting current',
      formula: 'I_s = k_{start} \\times I_{rated}',
      value: round(Is, 2),
      unit: 'A',
      standardRef: 'NEMA MG-1',
    });

    steps.push({
      step: 6,
      title: 'Motor starting voltage drop',
      formula: 'VD_s = \\sqrt{3} \\times I_s \\times L \\times (R\\cos\\varphi_s + X\\sin\\varphi_s)',
      value: round(vdStart, 2),
      unit: 'V',
    });

    steps.push({
      step: 7,
      title: 'Motor starting voltage drop percentage',
      formula: 'VD_s\\% = \\frac{VD_s}{V} \\times 100',
      value: round(vdStartPercent, 2),
      unit: '%',
      standardRef: 'KEC 232.51',
    });

    startingPass = vdStartPercent <= allowableStart;
  }

  // PART 4 — Result assembly
  const steadyPass = vdPercent <= allowable;
  const overallPass = steadyPass && startingPass;

  let message = `Steady-state VD = ${round(vdPercent, 2)}% (limit ${allowable}%)`;
  if (input.motorStarting) {
    message += `, Starting VD = ${round(vdStartPercent, 2)}% (limit ${allowableStart}%)`;
  }

  const severity = overallPass ? 'info' : 'error';

  const result: DetailedCalcResult = {
    value: round(vdPercent, 2),
    unit: '%',
    formula: 'VD = \\sqrt{3} \\times I \\times L \\times (R\\cos\\varphi + X\\sin\\varphi)',
    steps,
    source: [
      createSource('KEC', '232.51', { edition: '2021' }),
      createSource('IEC', '60364-5-52', { edition: '2009' }),
    ],
    judgment: createJudgment(overallPass, message, severity, 'KEC 232.51'),
    additionalOutputs: {
      steadyStateDropVolts: { value: round(vdSteady, 2), unit: 'V' },
      steadyStateDropPercent: { value: round(vdPercent, 2), unit: '%' },
      receivingEndVoltage: { value: round(vReceiving, 2), unit: 'V' },
    },
  };

  if (input.motorStarting) {
    result.additionalOutputs!.motorStartingDropPercent = {
      value: round(vdStartPercent, 2),
      unit: '%',
    };
  }

  return result;
}
