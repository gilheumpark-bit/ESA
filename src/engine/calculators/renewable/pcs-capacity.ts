/**
 * PCS (Power Conversion System) Capacity Calculator for ESS
 *
 * Formulae:
 *   PCS capacity:    Ppcs = batteryCapacity x maxRate / efficiency  [kW]
 *   Charge current:  Ich = Ppcs x 1000 / (sqrt(3) x Vgrid)        [A]
 *   Discharge current: Idis = same formula                         [A]
 *
 * Standards: KEC 502 (ESS Installations), IEC 62933
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export interface PCSCapacityInput {
  /** Battery capacity in kWh */
  batteryCapacity: number;
  /** Maximum charge rate (C-rate, e.g. 0.5 = 0.5C) */
  maxChargeRate: number;
  /** Maximum discharge rate (C-rate) */
  maxDischargeRate: number;
  /** PCS conversion efficiency (0 < eta <= 1) */
  efficiency: number;
  /** Grid-side voltage in Volts (default 380V) */
  gridVoltage?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculatePCSCapacity(input: PCSCapacityInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.batteryCapacity, 'batteryCapacity');
  assertPositive(input.maxChargeRate, 'maxChargeRate');
  assertPositive(input.maxDischargeRate, 'maxDischargeRate');
  assertRange(input.efficiency, 0.01, 1.0, 'efficiency');

  const { batteryCapacity, maxChargeRate, maxDischargeRate, efficiency: eta } = input;
  const gridVoltage = input.gridVoltage ?? 380;

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];
  const sqrt3 = Math.sqrt(3);

  // Step 1: Max charge power
  const PmaxCharge = batteryCapacity * maxChargeRate;
  steps.push({
    step: 1,
    title: '최대 충전전력 (Max charge power)',
    formula: 'P_{charge} = E_{batt} \\times C_{charge}',
    value: round(PmaxCharge, 2),
    unit: 'kW',
  });

  // Step 2: Max discharge power
  const PmaxDischarge = batteryCapacity * maxDischargeRate;
  steps.push({
    step: 2,
    title: '최대 방전전력 (Max discharge power)',
    formula: 'P_{discharge} = E_{batt} \\times C_{discharge}',
    value: round(PmaxDischarge, 2),
    unit: 'kW',
  });

  // Step 3: Required PCS capacity (take the greater of charge/discharge, derate by efficiency)
  const PmaxBoth = Math.max(PmaxCharge, PmaxDischarge);
  const Ppcs = PmaxBoth / eta;
  steps.push({
    step: 3,
    title: 'PCS 필요용량 (Required PCS capacity)',
    formula: 'P_{pcs} = \\frac{\\max(P_{charge}, P_{discharge})}{\\eta}',
    value: round(Ppcs, 2),
    unit: 'kW',
  });

  // Step 4: Charge current (grid side)
  const Icharge = (PmaxCharge * 1000) / (sqrt3 * gridVoltage);
  steps.push({
    step: 4,
    title: '충전전류 (Charge current, grid side)',
    formula: 'I_{charge} = \\frac{P_{charge} \\times 1000}{\\sqrt{3} \\times V_{grid}}',
    value: round(Icharge, 2),
    unit: 'A',
  });

  // Step 5: Discharge current (grid side)
  const Idischarge = (PmaxDischarge * 1000) / (sqrt3 * gridVoltage);
  steps.push({
    step: 5,
    title: '방전전류 (Discharge current, grid side)',
    formula: 'I_{discharge} = \\frac{P_{discharge} \\times 1000}{\\sqrt{3} \\times V_{grid}}',
    value: round(Idischarge, 2),
    unit: 'A',
  });

  // PART 3 -- Result assembly
  return {
    value: round(Ppcs, 2),
    unit: 'kW',
    formula: 'P_{pcs} = \\frac{P_{max}}{\\eta}',
    steps,
    source: [
      createSource('KEC', '502', { edition: '2021' }),
      createSource('IEC', '62933', { edition: '2018' }),
    ],
    judgment: createJudgment(
      true,
      `PCS 용량 ${round(Ppcs, 2)} kW (배터리 ${batteryCapacity} kWh, 최대 ${maxDischargeRate}C 방전)`,
      'info',
    ),
    additionalOutputs: {
      pcsCapacity:      { value: round(Ppcs, 2),       unit: 'kW',  formula: 'P_{pcs}' },
      chargeCurrent:    { value: round(Icharge, 2),    unit: 'A',   formula: 'I_{charge}' },
      dischargeCurrent: { value: round(Idischarge, 2), unit: 'A',   formula: 'I_{discharge}' },
    },
  };
}
