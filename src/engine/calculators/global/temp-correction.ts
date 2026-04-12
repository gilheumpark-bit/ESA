/**
 * Temperature Correction Factor Calculator
 *
 * Formula:
 *   CF = sqrt((T_max - T_actual) / (T_max - T_ref))
 *   I_corrected = I_base x CF
 *
 * Covers extreme environments:
 *   Middle East: 50~55 C ambient
 *   Nordic/Arctic: -20~-40 C ambient
 *   Tropical: 35~45 C ambient
 *   Standard: 25~30 C ambient
 *
 * Standards: IEC 60364-5-52 Table B.52.14, NEC 310.15(B)(1)
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  round,
} from '../types';

// -- Input / Output ----------------------------------------------------------

export interface TempCorrectionInput {
  /** Base ampacity at reference temperature in Amps */
  baseAmpacity: number;
  /** Reference ambient temperature in Celsius (usually 30 or 40) */
  referenceTemp: number;
  /** Actual ambient temperature in Celsius */
  actualTemp: number;
  /** Maximum conductor operating temperature in Celsius */
  maxConductorTemp: number;
}

// -- Calculator --------------------------------------------------------------

export function calculateTempCorrection(input: TempCorrectionInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.baseAmpacity, 'baseAmpacity');
  // referenceTemp and actualTemp can be negative (Nordic)
  if (!Number.isFinite(input.referenceTemp)) {
    throw new Error('referenceTemp must be a finite number');
  }
  if (!Number.isFinite(input.actualTemp)) {
    throw new Error('actualTemp must be a finite number');
  }
  assertPositive(input.maxConductorTemp, 'maxConductorTemp');

  const { baseAmpacity: Ibase, referenceTemp: Tref, actualTemp: Tactual, maxConductorTemp: Tmax } = input;

  if (Tactual >= Tmax) {
    return {
      value: 0,
      unit: 'A',
      formula: 'CF = \\sqrt{(T_{max} - T_{actual}) / (T_{max} - T_{ref})}',
      steps: [],
      source: [createSource('IEC', '60364-5-52 Table B.52.14', { edition: '2009' })],
      judgment: createJudgment(false, `주변 온도 ${Tactual}C >= 최대 도체 온도 ${Tmax}C: 케이블 사용 불가`, 'error'),
    };
  }

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];

  // Step 1: Temperature differential numerator
  const numerator = Tmax - Tactual;
  steps.push({
    step: 1,
    title: '온도 여유 (Temperature margin)',
    formula: 'T_{max} - T_{actual}',
    value: round(numerator, 1),
    unit: 'K',
  });

  // Step 2: Temperature differential denominator
  const denominator = Tmax - Tref;
  steps.push({
    step: 2,
    title: '기준 온도차 (Reference temperature rise)',
    formula: 'T_{max} - T_{ref}',
    value: round(denominator, 1),
    unit: 'K',
  });

  // Step 3: Correction factor
  const CF = Math.sqrt(numerator / denominator);
  steps.push({
    step: 3,
    title: '온도 보정 계수 (Correction factor)',
    formula: 'CF = \\sqrt{\\frac{T_{max} - T_{actual}}{T_{max} - T_{ref}}}',
    value: round(CF, 4),
    unit: '',
    standardRef: 'IEC 60364-5-52 Table B.52.14',
  });

  // Step 4: Corrected ampacity
  const Icorrected = Ibase * CF;
  steps.push({
    step: 4,
    title: '보정 허용전류 (Corrected ampacity)',
    formula: 'I_{corrected} = I_{base} \\times CF',
    value: round(Icorrected, 1),
    unit: 'A',
  });

  // Step 5: Environment classification
  let envClass: string;
  if (Tactual >= 50) envClass = 'Extreme Hot (Middle East/Desert)';
  else if (Tactual >= 40) envClass = 'Tropical/Hot';
  else if (Tactual >= 30) envClass = 'Standard';
  else if (Tactual >= 15) envClass = 'Temperate';
  else if (Tactual >= 0) envClass = 'Cold';
  else envClass = 'Arctic/Nordic';

  steps.push({
    step: 5,
    title: '환경 분류 (Environment classification)',
    formula: '\\text{Based on ambient temperature}',
    value: round(Tactual, 1),
    unit: `C (${envClass})`,
  });

  // PART 3 -- Result assembly
  const cfDirection = CF > 1 ? '증가 (boost)' : CF < 1 ? '감소 (derate)' : '변동 없음';

  return {
    value: round(CF, 4),
    unit: '',
    formula: 'CF = \\sqrt{(T_{max} - T_{actual}) / (T_{max} - T_{ref})}',
    steps,
    source: [
      createSource('IEC', '60364-5-52 Table B.52.14', { edition: '2009' }),
      createSource('NEC', '310.15(B)(1)', { edition: '2023' }),
    ],
    judgment: createJudgment(
      CF > 0,
      `CF=${round(CF, 4)} (${cfDirection}), ${Ibase}A -> ${round(Icorrected, 1)}A @ ${Tactual}C [${envClass}]`,
      CF < 0.7 ? 'warning' : 'info',
    ),
    additionalOutputs: {
      correctedAmpacity: { value: round(Icorrected, 1), unit: 'A', formula: 'I_{corrected} = I_{base} \\times CF' },
      correctionFactor: { value: round(CF, 4), unit: '' },
    },
  };
}
