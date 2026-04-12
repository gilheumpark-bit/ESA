/**
 * Basic Overcurrent Relay Setting Calculator
 *
 * Formulae:
 *   Pickup current:     Ip = I_load × multiplier (1.25~1.5)       [A]
 *   Pickup (CT secondary): Ip_sec = Ip / CTR                      [A]
 *   IEC trip time (SI): t = TDS × 0.14 / ((I/Ip)^0.02 - 1)      [s]
 *   IEC trip time (VI): t = TDS × 13.5 / ((I/Ip)^1.0 - 1)       [s]
 *   IEC trip time (EI): t = TDS × 80.0 / ((I/Ip)^2.0 - 1)       [s]
 *
 * Standards: IEC 60255 (Measuring Relays and Protection Equipment)
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

export type CurveType = 'SI' | 'VI' | 'EI';

export interface RelayBasicInput {
  /** Load current in Amperes */
  loadCurrent: number;
  /** Maximum fault current in Amperes */
  faultCurrent: number;
  /** CT ratio (primary:secondary), e.g. 400 means 400/5 */
  ctRatio: number;
  /** IEC inverse time curve type */
  curveType: CurveType;
}

const VALID_CURVES: readonly CurveType[] = ['SI', 'VI', 'EI'];

// IEC 60255 curve constants: t = TDS × A / ((I/Ip)^B - 1)
const CURVE_PARAMS: Record<CurveType, { A: number; B: number; name: string }> = {
  'SI': { A: 0.14,  B: 0.02, name: 'Standard Inverse' },
  'VI': { A: 13.5,  B: 1.0,  name: 'Very Inverse' },
  'EI': { A: 80.0,  B: 2.0,  name: 'Extremely Inverse' },
};

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateRelayBasic(input: RelayBasicInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.loadCurrent, 'loadCurrent');
  assertPositive(input.faultCurrent, 'faultCurrent');
  assertPositive(input.ctRatio, 'ctRatio');
  assertOneOf(input.curveType, VALID_CURVES, 'curveType');

  if (input.faultCurrent <= input.loadCurrent) {
    throw new Error('faultCurrent must be greater than loadCurrent');
  }

  const { loadCurrent: Iload, faultCurrent: Ifault, ctRatio: CTR, curveType } = input;
  const curve = CURVE_PARAMS[curveType];

  // PART 2 — Derivation
  const steps: CalcStep[] = [];

  // Step 1: 픽업 전류 설정 (부하 전류의 1.3배)
  const pickupMultiplier = 1.3;
  const Ip = Iload * pickupMultiplier;
  steps.push({
    step: 1,
    title: 'Calculate pickup current (1.3× load current)',
    formula: 'I_p = I_{load} \\times 1.3',
    value: round(Ip, 2),
    unit: 'A',
  });

  // Step 2: CT 2차측 환산
  const IpSec = Ip / CTR * 5; // assuming 5A secondary
  steps.push({
    step: 2,
    title: 'Convert to CT secondary value (5A base)',
    formula: 'I_{p,sec} = \\frac{I_p}{CTR} \\times 5',
    value: round(IpSec, 2),
    unit: 'A',
  });

  // Step 3: 고장 전류 배수 계산
  const faultMultiple = Ifault / Ip;
  steps.push({
    step: 3,
    title: 'Calculate fault current multiple',
    formula: 'M = \\frac{I_{fault}}{I_p}',
    value: round(faultMultiple, 2),
    unit: '×',
  });

  // Step 4: TDS (Time Dial Setting) — target 0.3s at fault, solve for TDS
  // t = TDS × A / (M^B - 1)  →  TDS = t × (M^B - 1) / A
  const targetTripTime = 0.3; // target 300ms at fault current
  const denominator = Math.pow(faultMultiple, curve.B) - 1;
  const TDS = denominator > 0 ? targetTripTime * denominator / curve.A : 0.05;
  const clampedTDS = Math.max(0.05, Math.min(TDS, 1.0));

  steps.push({
    step: 4,
    title: `Calculate time dial setting (${curve.name})`,
    formula: 'TDS = \\frac{t_{target} \\times (M^B - 1)}{A}',
    value: round(clampedTDS, 3),
    unit: '',
  });

  // Step 5: 실제 트립 시간 (fault current 기준)
  const actualTripTime = clampedTDS * curve.A / denominator;
  steps.push({
    step: 5,
    title: 'Calculate actual trip time at fault current',
    formula: 't = \\frac{TDS \\times A}{(M^B - 1)}',
    value: round(actualTripTime, 3),
    unit: 's',
  });

  // PART 3 — Judgment
  const pass = actualTripTime > 0 && actualTripTime < 2.0;
  const judgmentMsg = pass
    ? `Relay settings: Pickup ${round(Ip, 2)}A, TDS=${round(clampedTDS, 3)}, Trip at fault = ${round(actualTripTime, 3)}s (${curve.name})`
    : `Trip time ${round(actualTripTime, 3)}s may be too slow — review coordination`;

  // PART 4 — Result assembly
  return {
    value: round(Ip, 2),
    unit: 'A',
    formula: 't = \\frac{TDS \\times A}{(I/I_p)^B - 1}',
    steps,
    source: [createSource('IEC', '60255', { edition: '2014' })],
    judgment: createJudgment(pass, judgmentMsg, pass ? 'info' : 'warning'),
    additionalOutputs: {
      pickupCurrent: { value: round(Ip, 2), unit: 'A' },
      timeDial: { value: round(clampedTDS, 3), unit: '' },
      tripTime: { value: round(actualTripTime, 3), unit: 's' },
      faultMultiple: { value: round(faultMultiple, 2), unit: '×' },
    },
  };
}
