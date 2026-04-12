/**
 * Voltage Transformer (VT / PT) Sizing Calculator
 *
 * Formulae:
 *   VT Ratio:       ratio = V_primary / V_secondary
 *   Total Burden:   B_total = B_meter + B_relay + B_wire   [VA]
 *   Accuracy Check: B_total <= B_rated for accuracy class
 *
 * Standards: IEC 61869-3 (Instrument Transformers - Voltage Transformers)
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertOneOf,
  round,
} from '../types';

// -- Input / Output ----------------------------------------------------------

export interface VTSizingInput {
  /** Primary system voltage in Volts (line-to-line) */
  systemVoltage: number;
  /** Secondary voltage in Volts, typically 110 */
  secondaryVoltage: number;
  /** Metering instrument burden in VA */
  meterBurden: number;
  /** Protection relay burden in VA */
  relayBurden: number;
  /** Accuracy class: 0.2, 0.5, 1.0, 3P */
  accuracyClass: '0.2' | '0.5' | '1.0' | '3P';
  /** Wire burden in VA (optional, default 2 VA) */
  wireBurden?: number;
  /** Connection type */
  connectionType?: 'line-to-line' | 'line-to-ground';
}

// -- Standard VT burden ratings by accuracy class (IEC 61869-3) ----------

const VT_BURDEN_LIMITS: Record<string, number> = {
  '0.2': 25,
  '0.5': 50,
  '1.0': 100,
  '3P': 200,
};

// -- Standard VT ratings (VA) ---
const STANDARD_VT_RATINGS = [10, 15, 25, 30, 50, 75, 100, 150, 200, 300, 500];

// -- Calculator --------------------------------------------------------------

export function calculateVTSizing(input: VTSizingInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.systemVoltage, 'systemVoltage');
  assertPositive(input.secondaryVoltage, 'secondaryVoltage');
  assertPositive(input.meterBurden, 'meterBurden');
  assertPositive(input.relayBurden, 'relayBurden');
  assertOneOf(input.accuracyClass, ['0.2', '0.5', '1.0', '3P'] as const, 'accuracyClass');

  const wireBurden = input.wireBurden ?? 2;
  const connType = input.connectionType ?? 'line-to-line';
  const { systemVoltage: Vp, secondaryVoltage: Vs, meterBurden: Bm, relayBurden: Br, accuracyClass } = input;

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];

  // Step 1: Primary voltage per VT (line-to-ground if applicable)
  const Vprimary = connType === 'line-to-ground' ? Vp / Math.sqrt(3) : Vp;
  const Vsecondary = connType === 'line-to-ground' ? Vs / Math.sqrt(3) : Vs;
  steps.push({
    step: 1,
    title: 'VT 1차 전압 결정 (Primary voltage)',
    formula: connType === 'line-to-ground'
      ? 'V_{1} = V_{sys} / \\sqrt{3}'
      : 'V_{1} = V_{sys}',
    value: round(Vprimary, 1),
    unit: 'V',
  });

  // Step 2: VT ratio
  const vtRatio = Vprimary / Vsecondary;
  steps.push({
    step: 2,
    title: 'VT 변성비 (VT ratio)',
    formula: 'n = V_{primary} / V_{secondary}',
    value: round(vtRatio, 2),
    unit: '',
  });

  // Step 3: Total burden
  const totalBurden = Bm + Br + wireBurden;
  steps.push({
    step: 3,
    title: '총 부담 (Total burden)',
    formula: 'B_{total} = B_{meter} + B_{relay} + B_{wire}',
    value: round(totalBurden, 1),
    unit: 'VA',
  });

  // Step 4: Select standard VT rating
  const selectedVT = STANDARD_VT_RATINGS.find(r => r >= totalBurden) ?? STANDARD_VT_RATINGS[STANDARD_VT_RATINGS.length - 1];
  steps.push({
    step: 4,
    title: '표준 VT 정격 선정 (Selected VT rating)',
    formula: 'VT_{rated} \\geq B_{total}',
    value: selectedVT,
    unit: 'VA',
  });

  // Step 5: Accuracy class check
  const burdenLimit = VT_BURDEN_LIMITS[accuracyClass] ?? 100;
  const accuracyOk = totalBurden <= burdenLimit;
  steps.push({
    step: 5,
    title: '정밀도 등급 확인 (Accuracy class check)',
    formula: 'B_{total} \\leq B_{limit}',
    value: round(burdenLimit, 0),
    unit: 'VA',
    standardRef: 'IEC 61869-3',
  });

  // PART 3 -- Result assembly
  return {
    value: round(vtRatio, 2),
    unit: '',
    formula: 'n = V_{primary} / V_{secondary}',
    steps,
    source: [createSource('IEC', '61869-3', { edition: '2011' })],
    judgment: createJudgment(
      accuracyOk,
      accuracyOk
        ? `VT ${round(Vprimary, 0)}/${round(Vsecondary, 0)} V, 비 ${round(vtRatio, 2)}, 부담 ${round(totalBurden, 1)} VA <= ${burdenLimit} VA (Class ${accuracyClass} OK)`
        : `부담 초과: ${round(totalBurden, 1)} VA > ${burdenLimit} VA (Class ${accuracyClass} 부적합)`,
      accuracyOk ? 'info' : 'error',
    ),
    additionalOutputs: {
      totalBurden: { value: round(totalBurden, 1), unit: 'VA', formula: 'B_{total} = B_m + B_r + B_w' },
      selectedVT: { value: selectedVT, unit: 'VA' },
      accuracyOk: { value: accuracyOk ? 1 : 0, unit: '' },
    },
  };
}
