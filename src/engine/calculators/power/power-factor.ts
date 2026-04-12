/**
 * Power Factor Calculator
 *
 * Formulae:
 *   cos(phi) = P / S
 *   tan(phi) = Q / P
 *   Q = sqrt(S^2 - P^2)
 *   phi = arccos(pf)
 *
 * Standards: KEC 130 (전력계통 기본), KEC 232 (역률 권장)
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export interface PowerFactorInput {
  /** Active power in kW */
  activePower: number;
  /** Apparent power in kVA (provide this OR reactivePower) */
  apparentPower?: number;
  /** Reactive power in kvar (provide this OR apparentPower) */
  reactivePower?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculatePowerFactor(input: PowerFactorInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.activePower, 'activePower');

  if (input.apparentPower === undefined && input.reactivePower === undefined) {
    throw new Error('Either apparentPower or reactivePower must be provided');
  }

  const P = input.activePower;
  const steps: CalcStep[] = [];
  let S: number;
  let Q: number;

  // PART 2 — Derivation
  if (input.apparentPower !== undefined) {
    // Mode A: Given P and S
    assertPositive(input.apparentPower, 'apparentPower');
    S = input.apparentPower;

    if (P > S) {
      throw new Error('activePower cannot exceed apparentPower');
    }

    // Step 1: Power factor from P/S
    const pf = P / S;
    steps.push({
      step: 1,
      title: 'Calculate power factor from P and S',
      formula: '\\cos\\varphi = \\frac{P}{S}',
      value: round(pf, 4),
      unit: '',
      standardRef: 'KEC 130',
    });

    // Step 2: Phase angle
    const phiRad = Math.acos(pf);
    const phiDeg = (phiRad * 180) / Math.PI;
    steps.push({
      step: 2,
      title: 'Calculate phase angle',
      formula: '\\varphi = \\arccos(\\cos\\varphi)',
      value: round(phiDeg, 2),
      unit: 'deg',
    });

    // Step 3: Reactive power
    Q = Math.sqrt(S * S - P * P);
    steps.push({
      step: 3,
      title: 'Calculate reactive power',
      formula: 'Q = \\sqrt{S^2 - P^2}',
      value: round(Q, 2),
      unit: 'kvar',
    });

    // PART 3 — Result assembly
    const pass = pf >= 0.9;
    const severity = pf >= 0.9 ? 'info' : pf >= 0.85 ? 'warning' : 'error';
    const message =
      pf >= 0.9
        ? `Power factor ${round(pf, 4)} meets KEC recommendation (>= 0.9)`
        : pf >= 0.85
          ? `Power factor ${round(pf, 4)} is below 0.9 — improvement recommended per KEC`
          : `Power factor ${round(pf, 4)} is below 0.85 — correction required per KEC`;

    return {
      value: round(pf, 4),
      unit: '',
      formula: '\\cos\\varphi = \\frac{P}{S}',
      steps,
      source: [
        createSource('KEC', '130', { edition: '2021' }),
        createSource('KEC', '232', { edition: '2021' }),
      ],
      judgment: createJudgment(pass, message, severity, 'KEC 232'),
      additionalOutputs: {
        powerFactor: { value: round(pf, 4), unit: '' },
        phaseAngle: { value: round(phiDeg, 2), unit: 'deg' },
        reactivePower: { value: round(Q, 2), unit: 'kvar' },
      },
    };
  } else {
    // Mode B: Given P and Q
    Q = input.reactivePower!;
    assertPositive(Q, 'reactivePower');

    // Step 1: Apparent power
    S = Math.sqrt(P * P + Q * Q);
    steps.push({
      step: 1,
      title: 'Calculate apparent power from P and Q',
      formula: 'S = \\sqrt{P^2 + Q^2}',
      value: round(S, 2),
      unit: 'kVA',
    });

    // Step 2: Power factor
    const pf = P / S;
    steps.push({
      step: 2,
      title: 'Calculate power factor',
      formula: '\\cos\\varphi = \\frac{P}{S} = \\frac{P}{\\sqrt{P^2 + Q^2}}',
      value: round(pf, 4),
      unit: '',
      standardRef: 'KEC 130',
    });

    // Step 3: Phase angle
    const phiRad = Math.atan(Q / P);
    const phiDeg = (phiRad * 180) / Math.PI;
    steps.push({
      step: 3,
      title: 'Calculate phase angle',
      formula: '\\varphi = \\arctan\\left(\\frac{Q}{P}\\right)',
      value: round(phiDeg, 2),
      unit: 'deg',
    });

    const pass = pf >= 0.9;
    const severity = pf >= 0.9 ? 'info' : pf >= 0.85 ? 'warning' : 'error';
    const message =
      pf >= 0.9
        ? `Power factor ${round(pf, 4)} meets KEC recommendation (>= 0.9)`
        : pf >= 0.85
          ? `Power factor ${round(pf, 4)} is below 0.9 — improvement recommended per KEC`
          : `Power factor ${round(pf, 4)} is below 0.85 — correction required per KEC`;

    return {
      value: round(pf, 4),
      unit: '',
      formula: '\\cos\\varphi = \\frac{P}{\\sqrt{P^2 + Q^2}}',
      steps,
      source: [
        createSource('KEC', '130', { edition: '2021' }),
        createSource('KEC', '232', { edition: '2021' }),
      ],
      judgment: createJudgment(pass, message, severity, 'KEC 232'),
      additionalOutputs: {
        powerFactor: { value: round(pf, 4), unit: '' },
        phaseAngle: { value: round(phiDeg, 2), unit: 'deg' },
        apparentPower: { value: round(S, 2), unit: 'kVA' },
      },
    };
  }
}
