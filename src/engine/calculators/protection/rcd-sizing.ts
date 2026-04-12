/**
 * Residual Current Device (RCD) Sizing Calculator
 *
 * Selection criteria:
 *   - Circuit type determines sensitivity (30/100/300/500 mA)
 *   - RCD rating ≥ circuit load current
 *   - Touch voltage: Vt = I_dn × Re ≤ 50V (general) / 25V (wet)
 *   - Break time per IEC 61008: ≤ 300ms (general), ≤ 40ms (30mA personal)
 *
 * Standards: KEC 212.4 (누전차단기), IEC 61008-1
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

export type CircuitType = 'lighting' | 'socket' | 'motor' | 'outdoor' | 'bathroom';

export interface RCDSizingInput {
  /** Circuit type */
  circuitType: CircuitType;
  /** Load current in Amperes */
  loadCurrent: number;
  /** Earth resistance in Ohms */
  earthResistance: number;
}

const VALID_CIRCUITS: readonly CircuitType[] = ['lighting', 'socket', 'motor', 'outdoor', 'bathroom'];

// ── Lookup tables ───────────────────────────────────────────────────────────

interface RCDSpec {
  sensitivity: number;   // mA
  breakTime: number;     // ms
  touchLimit: number;    // V
}

const RCD_SPECS: Record<CircuitType, RCDSpec> = {
  'lighting':  { sensitivity: 30,  breakTime: 40,  touchLimit: 50 },
  'socket':    { sensitivity: 30,  breakTime: 40,  touchLimit: 50 },
  'motor':     { sensitivity: 100, breakTime: 300, touchLimit: 50 },
  'outdoor':   { sensitivity: 30,  breakTime: 40,  touchLimit: 25 },
  'bathroom':  { sensitivity: 30,  breakTime: 40,  touchLimit: 25 },
};

// Standard RCD current ratings (A)
const STANDARD_RATINGS = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125] as const;

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateRCDSizing(input: RCDSizingInput): DetailedCalcResult {
  // PART 1 — Validation
  assertOneOf(input.circuitType, VALID_CIRCUITS, 'circuitType');
  assertPositive(input.loadCurrent, 'loadCurrent');
  assertPositive(input.earthResistance, 'earthResistance');

  const { circuitType, loadCurrent, earthResistance: Re } = input;
  const spec = RCD_SPECS[circuitType];

  // PART 2 — Derivation
  const steps: CalcStep[] = [];

  // Step 1: 감도 전류 결정
  steps.push({
    step: 1,
    title: `Determine RCD sensitivity for ${circuitType} circuit`,
    formula: `I_{\\Delta n} = ${spec.sensitivity}\\text{ mA}`,
    value: spec.sensitivity,
    unit: 'mA',
  });

  // Step 2: RCD 정격 전류 선정 (부하 전류 이상의 표준 정격)
  const selectedRating = STANDARD_RATINGS.find(r => r >= loadCurrent) ?? STANDARD_RATINGS[STANDARD_RATINGS.length - 1];
  steps.push({
    step: 2,
    title: 'Select RCD current rating (≥ load current)',
    formula: 'I_{rated} \\geq I_{load}',
    value: selectedRating,
    unit: 'A',
  });

  // Step 3: 접촉 전압 확인
  const touchVoltage = (spec.sensitivity / 1000) * Re;
  steps.push({
    step: 3,
    title: 'Verify touch voltage within limit',
    formula: 'V_t = I_{\\Delta n} \\times R_e',
    value: round(touchVoltage, 2),
    unit: 'V',
  });

  // Step 4: 최대 허용 접지 저항 계산
  const maxEarthResistance = spec.touchLimit / (spec.sensitivity / 1000);
  steps.push({
    step: 4,
    title: 'Calculate maximum allowable earth resistance',
    formula: 'R_{e,max} = \\frac{V_{t,limit}}{I_{\\Delta n}}',
    value: round(maxEarthResistance, 2),
    unit: 'Ω',
  });

  // PART 3 — Judgment
  const pass = touchVoltage <= spec.touchLimit;
  const judgmentMsg = pass
    ? `RCD ${selectedRating}A / ${spec.sensitivity}mA suitable. Touch voltage ${round(touchVoltage, 2)}V ≤ ${spec.touchLimit}V.`
    : `Touch voltage ${round(touchVoltage, 2)}V exceeds ${spec.touchLimit}V limit. Reduce earth resistance below ${round(maxEarthResistance, 2)}Ω.`;

  // PART 4 — Result assembly
  return {
    value: selectedRating,
    unit: 'A',
    formula: 'I_{rated} \\geq I_{load},\\; V_t = I_{\\Delta n} \\times R_e \\leq V_{limit}',
    steps,
    source: [
      createSource('KEC', '212.4', { edition: '2021' }),
      createSource('IEC', '61008-1', { edition: '2018' }),
    ],
    judgment: createJudgment(pass, judgmentMsg, pass ? 'info' : 'error'),
    additionalOutputs: {
      sensitivity: { value: spec.sensitivity, unit: 'mA' },
      breakTime: { value: spec.breakTime, unit: 'ms' },
      touchVoltage: { value: round(touchVoltage, 2), unit: 'V' },
      maxEarthResistance: { value: round(maxEarthResistance, 2), unit: 'Ω' },
    },
  };
}
