/**
 * Power Factor Calculator
 *
 * Formulae:
 *   cos(phi) = P / S
 *   tan(phi) = Q / P
 *   Q = sqrt(S^2 - P^2)
 *   phi = arccos(pf)
 *
 * Standards: 한전 전기공급약관(역률 기준). KEC 는 역률 목표치를 규정하지 않는다.
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import { CalcValidationError } from '../types';
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
    throw new CalcValidationError('apparentPower','Either apparentPower or reactivePower must be provided');
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
      throw new CalcValidationError('activePower','activePower cannot exceed apparentPower');
    }

    // Step 1: Power factor from P/S
    const pf = P / S;
    steps.push({
      step: 1,
      title: 'Calculate power factor from P and S',
      formula: '\\cos\\varphi = \\frac{P}{S}',
      value: round(pf, 4),
      unit: '',
      standardRef: '한전 전기공급약관',
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
        ? `Power factor ${round(pf, 4)} meets the 0.9 threshold (한전 전기공급약관 역률 요금)`
        : pf >= 0.85
          ? `Power factor ${round(pf, 4)} is below 0.9 — 한전 전기공급약관 역률 요금 기준 미달`
          : `Power factor ${round(pf, 4)} is below 0.85 — 역률 개선 필요 (한전 전기공급약관)`;

    return {
      value: round(pf, 4),
      unit: '',
      formula: '\\cos\\varphi = \\frac{P}{S}',
      steps,
      source: [
        // KEC 232 는 「배선설비」다. 역률을 규정하지 않는다 — 공표 전문 전체에서
        // 역률 표제는 441.4「전기철도차량의 역률」하나뿐이고 일반 수용가와 무관하다
        // (2026-07-31 원문 색인 대조). 0.9 기준의 실제 출처는 한전 전기공급약관
        // 역률 요금이다. 조항 번호는 원문 대조 전이라 달지 않는다.
        createSource('KEPCO', '전기공급약관 (역률 요금)'),
      ],
      judgment: createJudgment(pass, message, severity, '한전 전기공급약관'),
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
      standardRef: '한전 전기공급약관',
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
        ? `Power factor ${round(pf, 4)} meets the 0.9 threshold (한전 전기공급약관 역률 요금)`
        : pf >= 0.85
          ? `Power factor ${round(pf, 4)} is below 0.9 — 한전 전기공급약관 역률 요금 기준 미달`
          : `Power factor ${round(pf, 4)} is below 0.85 — 역률 개선 필요 (한전 전기공급약관)`;

    return {
      value: round(pf, 4),
      unit: '',
      formula: '\\cos\\varphi = \\frac{P}{\\sqrt{P^2 + Q^2}}',
      steps,
      source: [
        // KEC 232 는 「배선설비」다. 역률을 규정하지 않는다 — 공표 전문 전체에서
        // 역률 표제는 441.4「전기철도차량의 역률」하나뿐이고 일반 수용가와 무관하다
        // (2026-07-31 원문 색인 대조). 0.9 기준의 실제 출처는 한전 전기공급약관
        // 역률 요금이다. 조항 번호는 원문 대조 전이라 달지 않는다.
        createSource('KEPCO', '전기공급약관 (역률 요금)'),
      ],
      judgment: createJudgment(pass, message, severity, '한전 전기공급약관'),
      additionalOutputs: {
        powerFactor: { value: round(pf, 4), unit: '' },
        phaseAngle: { value: round(phiDeg, 2), unit: 'deg' },
        apparentPower: { value: round(S, 2), unit: 'kVA' },
      },
    };
  }
}
