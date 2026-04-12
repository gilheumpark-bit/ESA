/**
 * Surge Arrester Sizing Calculator
 *
 * Formulae:
 *   Grounded neutral:      Uc >= 1.05 x Us / sqrt(3)
 *   Impedance grounded:    Uc >= 1.25 x Us / sqrt(3)
 *   Ungrounded (isolated): Uc >= 1.05 x Us
 *   Rated Voltage:         Ur >= Uc x 1.25 (typical margin)
 *
 * Standards: IEC 60099-4 (Surge Arresters), IEC 60099-5 (Selection Guide)
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

export type NeutralGrounding = 'solid' | 'impedance' | 'ungrounded';
export type PollutionLevel = 'light' | 'medium' | 'heavy' | 'very-heavy';

export interface SurgeArresterInput {
  /** System voltage (line-to-line) in Volts */
  systemVoltage: number;
  /** Neutral grounding type */
  neutralGrounding: NeutralGrounding;
  /** Environmental pollution level */
  pollutionLevel: PollutionLevel;
  /** System BIL (Basic Insulation Level) in kV, optional */
  bil?: number;
}

// -- Pollution level -> creepage factor (mm/kV) per IEC 60815 ----
const CREEPAGE_FACTORS: Record<PollutionLevel, number> = {
  'light': 16,
  'medium': 20,
  'heavy': 25,
  'very-heavy': 31,
};

// -- MCOV multiplier by grounding type ----
const MCOV_MULTIPLIERS: Record<NeutralGrounding, number> = {
  'solid': 1.05,
  'impedance': 1.25,
  'ungrounded': 1.05,
};

// -- Standard nominal discharge currents ----
const NOMINAL_DISCHARGE_TABLE: { maxVoltage: number; nominalDischarge: number }[] = [
  { maxVoltage: 36, nominalDischarge: 5 },
  { maxVoltage: 145, nominalDischarge: 10 },
  { maxVoltage: 362, nominalDischarge: 10 },
  { maxVoltage: 800, nominalDischarge: 20 },
];

// -- Calculator --------------------------------------------------------------

export function calculateSurgeArrester(input: SurgeArresterInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.systemVoltage, 'systemVoltage');
  assertOneOf(input.neutralGrounding, ['solid', 'impedance', 'ungrounded'] as const, 'neutralGrounding');
  assertOneOf(input.pollutionLevel, ['light', 'medium', 'heavy', 'very-heavy'] as const, 'pollutionLevel');

  const { systemVoltage: Us, neutralGrounding, pollutionLevel } = input;
  const UsKV = Us / 1000;

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];

  // Step 1: MCOV (Maximum Continuous Operating Voltage)
  const mcovMultiplier = MCOV_MULTIPLIERS[neutralGrounding];
  const mcov = neutralGrounding === 'ungrounded'
    ? mcovMultiplier * UsKV
    : mcovMultiplier * UsKV / Math.sqrt(3);
  steps.push({
    step: 1,
    title: 'MCOV 산정 (Maximum Continuous Operating Voltage)',
    formula: neutralGrounding === 'ungrounded'
      ? 'U_c \\geq 1.05 \\times U_s'
      : `U_c \\geq ${mcovMultiplier} \\times U_s / \\sqrt{3}`,
    value: round(mcov, 2),
    unit: 'kV',
    standardRef: 'IEC 60099-5 Clause 5',
  });

  // Step 2: Rated voltage (Ur >= Uc x 1.25 for standard margin)
  const Ur = mcov * 1.25;
  steps.push({
    step: 2,
    title: '정격 전압 (Rated voltage)',
    formula: 'U_r \\geq U_c \\times 1.25',
    value: round(Ur, 2),
    unit: 'kV',
  });

  // Step 3: Nominal discharge current
  const nomEntry = NOMINAL_DISCHARGE_TABLE.find(e => UsKV <= e.maxVoltage)
    ?? NOMINAL_DISCHARGE_TABLE[NOMINAL_DISCHARGE_TABLE.length - 1];
  const nominalDischarge = nomEntry.nominalDischarge;
  steps.push({
    step: 3,
    title: '공칭 방전 전류 (Nominal discharge current)',
    formula: 'I_n \\text{ per IEC 60099-4 Table}',
    value: nominalDischarge,
    unit: 'kA',
    standardRef: 'IEC 60099-4',
  });

  // Step 4: Housing type determination
  const creepageFactor = CREEPAGE_FACTORS[pollutionLevel];
  const housingType = pollutionLevel === 'heavy' || pollutionLevel === 'very-heavy'
    ? 'polymer'
    : 'porcelain';
  steps.push({
    step: 4,
    title: '외함 종류 결정 (Housing type)',
    formula: `\\text{Creepage} = ${creepageFactor} \\text{ mm/kV (${pollutionLevel})}`,
    value: creepageFactor,
    unit: 'mm/kV',
    standardRef: 'IEC 60815',
  });

  // Step 5: Minimum creepage distance
  const minCreepage = creepageFactor * Ur;
  steps.push({
    step: 5,
    title: '최소 연면거리 (Minimum creepage distance)',
    formula: 'd_{creep} = CF \\times U_r',
    value: round(minCreepage, 0),
    unit: 'mm',
  });

  // PART 3 -- Result assembly
  return {
    value: round(Ur, 2),
    unit: 'kV',
    formula: 'U_r \\geq U_c \\times 1.25',
    steps,
    source: [
      createSource('IEC', '60099-4', { edition: '2014' }),
      createSource('IEC', '60099-5', { edition: '2018' }),
    ],
    judgment: createJudgment(
      true,
      `피뢰기 Ur=${round(Ur, 2)} kV, MCOV=${round(mcov, 2)} kV, ${nominalDischarge} kA, ${housingType} 외함`,
      'info',
    ),
    additionalOutputs: {
      mcov: { value: round(mcov, 2), unit: 'kV', formula: 'U_c \\geq k \\times U_s / \\sqrt{3}' },
      nominalDischarge: { value: nominalDischarge, unit: 'kA' },
      housingType: { value: housingType === 'polymer' ? 1 : 0, unit: '' },
      minCreepage: { value: round(minCreepage, 0), unit: 'mm' },
    },
  };
}
