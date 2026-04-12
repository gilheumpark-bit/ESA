/**
 * Frequency Comparison Calculator (50 Hz vs 60 Hz)
 *
 * Analyses the impact of operating equipment at a different frequency:
 *   Motor:       speed = 120 x f / poles, flux change, torque impact
 *   Transformer: V/f ratio, core flux density change
 *   Capacitor:   Xc = 1/(2*pi*f*C), reactive power change
 *   Impedance:   XL = 2*pi*f*L, general impedance shift
 *
 * Standards: IEC 60034-1 (Motors), IEC 60076-1 (Transformers)
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

export type EquipmentType = 'motor' | 'transformer' | 'capacitor' | 'impedance';

export interface FrequencyCompareInput {
  /** Equipment type */
  equipmentType: EquipmentType;
  /** Rated power in kW (or kVA for transformer) */
  ratedPower: number;
  /** Original rated frequency in Hz */
  ratedFreq: number;
  /** Target operating frequency in Hz */
  targetFreq: number;
  /** Number of motor poles (for motor type, default 4) */
  motorPoles?: number;
}

// -- Calculator --------------------------------------------------------------

export function compareFrequency50vs60(input: FrequencyCompareInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertOneOf(input.equipmentType, ['motor', 'transformer', 'capacitor', 'impedance'] as const, 'equipmentType');
  assertPositive(input.ratedPower, 'ratedPower');
  assertPositive(input.ratedFreq, 'ratedFreq');
  assertPositive(input.targetFreq, 'targetFreq');

  const { equipmentType, ratedPower: _ratedPower, ratedFreq: f1, targetFreq: f2 } = input;
  const poles = input.motorPoles ?? 4;
  const freqRatio = f2 / f1;

  const steps: CalcStep[] = [];

  // PART 2 -- Derivation
  // Step 1: Frequency ratio
  steps.push({
    step: 1,
    title: '주파수 비 (Frequency ratio)',
    formula: 'k_f = f_{target} / f_{rated}',
    value: round(freqRatio, 4),
    unit: '',
  });

  let speedChangePct = 0;
  let coreFluxChangePct = 0;
  let ratingChangePct = 0;
  let deratingNeeded = false;

  if (equipmentType === 'motor') {
    // Step 2: Synchronous speed change
    const n1 = (120 * f1) / poles;
    const n2 = (120 * f2) / poles;
    speedChangePct = ((n2 - n1) / n1) * 100;
    steps.push({
      step: 2,
      title: '동기 속도 변화 (Synchronous speed change)',
      formula: 'n = 120 \\times f / p',
      value: round(n2, 0),
      unit: 'rpm',
    });

    // Step 3: Core flux change (V/f ratio must be maintained)
    // If voltage stays same but freq changes, flux = V/(4.44*f*N*A) changes
    coreFluxChangePct = ((1 / freqRatio) - 1) * 100;
    steps.push({
      step: 3,
      title: '자속 밀도 변화 (Core flux density change)',
      formula: '\\Delta\\Phi = (1/k_f - 1) \\times 100\\%',
      value: round(coreFluxChangePct, 2),
      unit: '%',
    });

    // Step 4: Power/torque impact
    // At same voltage, power roughly proportional to frequency
    ratingChangePct = (freqRatio - 1) * 100;
    deratingNeeded = f2 < f1;
    steps.push({
      step: 4,
      title: '출력 변화 (Rating change)',
      formula: '\\Delta P \\approx (k_f - 1) \\times 100\\%',
      value: round(ratingChangePct, 2),
      unit: '%',
      standardRef: 'IEC 60034-1',
    });
  } else if (equipmentType === 'transformer') {
    // Core flux: Phi = V / (4.44 * f * N * A)
    // At same voltage, flux inversely proportional to frequency
    coreFluxChangePct = ((1 / freqRatio) - 1) * 100;
    steps.push({
      step: 2,
      title: '철심 자속 변화 (Core flux change)',
      formula: '\\Phi \\propto V / (4.44 \\times f \\times N \\times A)',
      value: round(coreFluxChangePct, 2),
      unit: '%',
    });

    // Rating impact: transformer can handle more power at higher freq
    ratingChangePct = (freqRatio - 1) * 100;
    deratingNeeded = f2 < f1;  // Lower freq = higher flux = saturation risk
    steps.push({
      step: 3,
      title: '정격 용량 변화 (Rating change)',
      formula: '\\Delta S \\approx (k_f - 1) \\times 100\\%',
      value: round(ratingChangePct, 2),
      unit: '%',
      standardRef: 'IEC 60076-1',
    });

    // Saturation warning
    if (f2 < f1) {
      steps.push({
        step: 4,
        title: '포화 위험 (Saturation risk)',
        formula: '\\Phi_{new} / \\Phi_{rated} = f_{rated} / f_{target}',
        value: round(f1 / f2, 3),
        unit: 'p.u.',
      });
    }
  } else if (equipmentType === 'capacitor') {
    // Xc = 1 / (2*pi*f*C), reactive power Qc = V^2 / Xc = V^2 * 2*pi*f*C
    // Qc proportional to frequency
    ratingChangePct = (freqRatio - 1) * 100;
    steps.push({
      step: 2,
      title: '용량성 리액턴스 변화 (Capacitive reactance change)',
      formula: 'X_c = 1 / (2\\pi f C)',
      value: round((1 / freqRatio - 1) * 100, 2),
      unit: '%',
    });

    steps.push({
      step: 3,
      title: '무효 전력 변화 (Reactive power change)',
      formula: 'Q_c \\propto f',
      value: round(ratingChangePct, 2),
      unit: '%',
    });
    deratingNeeded = f2 > f1;  // Higher freq = more reactive power = possible overcurrent
  } else {
    // General impedance: XL = 2*pi*f*L
    const inductiveChangePct = (freqRatio - 1) * 100;
    const capacitiveChangePct = ((1 / freqRatio) - 1) * 100;
    steps.push({
      step: 2,
      title: '유도성 임피던스 변화 (Inductive impedance change)',
      formula: 'X_L = 2\\pi f L',
      value: round(inductiveChangePct, 2),
      unit: '%',
    });

    steps.push({
      step: 3,
      title: '용량성 임피던스 변화 (Capacitive impedance change)',
      formula: 'X_C = 1 / (2\\pi f C)',
      value: round(capacitiveChangePct, 2),
      unit: '%',
    });
    ratingChangePct = inductiveChangePct;
  }

  // PART 3 -- Result assembly
  return {
    value: round(freqRatio, 4),
    unit: '',
    formula: 'k_f = f_{target} / f_{rated}',
    steps,
    source: [
      createSource('IEC', '60034-1', { edition: '2022' }),
      createSource('IEC', '60076-1', { edition: '2011' }),
    ],
    judgment: createJudgment(
      !deratingNeeded,
      deratingNeeded
        ? `${equipmentType} ${f1}Hz->${f2}Hz: 디레이팅 필요, 정격변화 ${round(ratingChangePct, 1)}%`
        : `${equipmentType} ${f1}Hz->${f2}Hz: 정격변화 ${round(ratingChangePct, 1)}%, 추가 조치 불필요`,
      deratingNeeded ? 'warning' : 'info',
    ),
    additionalOutputs: {
      speedChange: { value: round(speedChangePct, 2), unit: '%' },
      coreFluxChange: { value: round(coreFluxChangePct, 2), unit: '%' },
      ratingChange: { value: round(ratingChangePct, 2), unit: '%' },
      deratingNeeded: { value: deratingNeeded ? 1 : 0, unit: '' },
    },
  };
}
