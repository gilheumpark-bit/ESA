/**
 * Energy Saving Calculator
 *
 * Formulae:
 *   Annual Savings:  E_save = (P_before - P_after) x hours x days   [kWh]
 *   Cost Savings:    C_save = E_save x rate                          [KRW]
 *   CO2 Reduction:   CO2 = E_save x emissionFactor                   [kg]
 *   Payback Period:  months = investmentCost / (C_save / 12)         [months]
 *
 * Standards: KEC 241 (Energy Efficiency), ISO 50001
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertNonNegative,
  round,
} from '../types';

// -- Input / Output ----------------------------------------------------------

export interface EnergySavingInput {
  /** Power consumption before retrofit in kW */
  beforePower: number;
  /** Power consumption after retrofit in kW */
  afterPower: number;
  /** Daily operating hours */
  dailyHours: number;
  /** Annual operating days */
  annualDays: number;
  /** Electricity rate in KRW/kWh */
  electricityRate: number;
  /** Investment cost in KRW (optional, for payback calculation) */
  investmentCost?: number;
  /** CO2 emission factor in kg-CO2/kWh, default 0.4594 (Korea 2023 grid) */
  emissionFactor?: number;
}

// -- Calculator --------------------------------------------------------------

export function calculateEnergySaving(input: EnergySavingInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.beforePower, 'beforePower');
  assertNonNegative(input.afterPower, 'afterPower');
  assertPositive(input.dailyHours, 'dailyHours');
  assertPositive(input.annualDays, 'annualDays');
  assertPositive(input.electricityRate, 'electricityRate');
  if (input.investmentCost !== undefined) assertNonNegative(input.investmentCost, 'investmentCost');

  const emissionFactor = input.emissionFactor ?? 0.4594;
  const { beforePower: Pb, afterPower: Pa, dailyHours: h, annualDays: d, electricityRate: rate } = input;

  if (Pa >= Pb) {
    return {
      value: 0,
      unit: 'kWh',
      formula: 'E_{save} = (P_{before} - P_{after}) \\times h \\times d',
      steps: [],
      source: [createSource('KEC', '241', { edition: '2021' })],
      judgment: createJudgment(false, '개선 후 전력이 개선 전보다 크거나 같음 (No saving)', 'warning'),
    };
  }

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];

  // Step 1: Power reduction
  const dP = Pb - Pa;
  steps.push({
    step: 1,
    title: '전력 절감량 (Power reduction)',
    formula: '\\Delta P = P_{before} - P_{after}',
    value: round(dP, 3),
    unit: 'kW',
  });

  // Step 2: Annual energy savings
  const annualSavings = dP * h * d;
  steps.push({
    step: 2,
    title: '연간 에너지 절감량 (Annual energy savings)',
    formula: 'E_{save} = \\Delta P \\times h \\times d',
    value: round(annualSavings, 1),
    unit: 'kWh',
  });

  // Step 3: Cost savings
  const costSavings = annualSavings * rate;
  steps.push({
    step: 3,
    title: '연간 비용 절감액 (Annual cost savings)',
    formula: 'C_{save} = E_{save} \\times rate',
    value: round(costSavings, 0),
    unit: 'KRW',
  });

  // Step 4: CO2 reduction
  const co2 = annualSavings * emissionFactor;
  steps.push({
    step: 4,
    title: 'CO2 감축량 (CO2 reduction)',
    formula: 'CO_2 = E_{save} \\times EF',
    value: round(co2, 1),
    unit: 'kg-CO2',
  });

  // Step 5: Payback period (if investment cost provided)
  let paybackMonths = 0;
  if (input.investmentCost !== undefined && input.investmentCost > 0 && costSavings > 0) {
    paybackMonths = (input.investmentCost / costSavings) * 12;
    steps.push({
      step: 5,
      title: '투자 회수 기간 (Payback period)',
      formula: 'T_{payback} = \\frac{C_{invest}}{C_{save}} \\times 12',
      value: round(paybackMonths, 1),
      unit: 'months',
    });
  }

  // PART 3 -- Result assembly
  const reductionPct = round((dP / Pb) * 100, 1);

  return {
    value: round(annualSavings, 1),
    unit: 'kWh',
    formula: 'E_{save} = (P_{before} - P_{after}) \\times h \\times d',
    steps,
    source: [
      createSource('KEC', '241', { edition: '2021' }),
      createSource('ISO', '50001', { edition: '2018' }),
    ],
    judgment: createJudgment(
      true,
      `연간 ${round(annualSavings, 1)} kWh 절감 (${reductionPct}%), 비용 ${round(costSavings, 0).toLocaleString()} 원, CO2 ${round(co2, 1)} kg 감축`,
      'info',
    ),
    additionalOutputs: {
      costSavings: { value: round(costSavings, 0), unit: 'KRW', formula: 'C_{save} = E_{save} \\times rate' },
      co2Reduction: { value: round(co2, 1), unit: 'kg-CO2', formula: 'CO_2 = E_{save} \\times EF' },
      paybackPeriod: { value: round(paybackMonths, 1), unit: 'months', formula: 'T = C_{invest} / C_{save} \\times 12' },
      reductionPercent: { value: reductionPct, unit: '%' },
    },
  };
}
