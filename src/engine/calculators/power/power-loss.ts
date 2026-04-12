/**
 * Power Loss Calculator
 *
 * Formulae:
 *   Single-phase: Ploss = I² × R × L / 1000   [kW]  (2 conductors)
 *   Three-phase:  Ploss = 3 × I² × R × L / 1000  [kW]
 *   Loss percent: Ploss% = Ploss / Pload × 100
 *
 * Where:
 *   I = current (A)
 *   R = resistance per unit length (Ω/km)
 *   L = one-way cable length (km)
 *
 * Standards: KEC 232.51 (전압강하/손실 허용한도), IEC 60287 (cable losses)
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertOneOf,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export interface PowerLossInput {
  /** Line current in Amperes */
  current: number;
  /** Cable resistance per km (Ω/km) */
  resistance: number;
  /** One-way cable length in km */
  length: number;
  /** Number of phases: 1 or 3 */
  phase: 1 | 3;
  /** Load power in kW (optional, for loss % calculation) */
  loadPower?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculatePowerLoss(input: PowerLossInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.current, 'current');
  assertPositive(input.resistance, 'resistance');
  assertPositive(input.length, 'length');
  assertOneOf(input.phase, [1, 3] as const, 'phase');

  const { current: I, resistance: R, length: L, phase } = input;
  const steps: CalcStep[] = [];

  // PART 2 — Derivation

  // Step 1: I² × R per conductor
  const iSquaredR = I * I * R;
  steps.push({
    step: 1,
    title: 'Calculate I²R per conductor per km',
    formula: 'I^2 \\times R',
    value: round(iSquaredR, 4),
    unit: 'W/km',
  });

  // Step 2: Total power loss
  // Single-phase: 2 × I²RL (go + return), Three-phase: 3 × I²RL
  const multiplier = phase === 3 ? 3 : 2;
  const pLossW = multiplier * iSquaredR * L;
  const pLossKw = pLossW / 1000;
  steps.push({
    step: 2,
    title: `Calculate total ${phase}-phase power loss`,
    formula:
      phase === 3
        ? 'P_{loss} = 3 \\times I^2 \\times R \\times L'
        : 'P_{loss} = 2 \\times I^2 \\times R \\times L',
    value: round(pLossKw, 4),
    unit: 'kW',
    standardRef: 'IEC 60287',
  });

  // Step 3: Loss percentage (if loadPower provided)
  let lossPercent = 0;
  if (input.loadPower !== undefined && input.loadPower > 0) {
    lossPercent = (pLossKw / input.loadPower) * 100;
    steps.push({
      step: 3,
      title: 'Calculate loss percentage',
      formula: 'Loss\\% = \\frac{P_{loss}}{P_{load}} \\times 100',
      value: round(lossPercent, 2),
      unit: '%',
      standardRef: 'KEC 232.51',
    });
  }

  // PART 3 — Result assembly
  const highLoss = lossPercent > 5;
  const message =
    input.loadPower !== undefined
      ? `Power loss = ${round(pLossKw, 4)} kW (${round(lossPercent, 2)}% of load)${highLoss ? ' — exceeds 5% guideline' : ''}`
      : `Power loss = ${round(pLossKw, 4)} kW (${phase}-phase, ${round(L, 3)} km)`;

  const result: DetailedCalcResult = {
    value: round(pLossKw, 4),
    unit: 'kW',
    formula:
      phase === 3
        ? 'P_{loss} = 3 \\times I^2 \\times R \\times L'
        : 'P_{loss} = 2 \\times I^2 \\times R \\times L',
    steps,
    source: [
      createSource('IEC', '60287', { edition: '2020' }),
      createSource('KEC', '232.51', { edition: '2021' }),
    ],
    judgment: createJudgment(
      !highLoss,
      message,
      highLoss ? 'warning' : 'info',
    ),
    additionalOutputs: {
      powerLoss: { value: round(pLossKw, 4), unit: 'kW' },
    },
  };

  if (input.loadPower !== undefined) {
    result.additionalOutputs!.lossPercent = {
      value: round(lossPercent, 2),
      unit: '%',
      formula: 'Loss\\% = \\frac{P_{loss}}{P_{load}} \\times 100',
    };
  }

  return result;
}
