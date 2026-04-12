/**
 * Solar PV Generation Calculator
 *
 * Formula:
 *   E_daily  = P_installed x H_peak x K_loss x PR
 *   E_month  = E_daily x 30
 *   E_annual = E_daily x 365
 *
 * Where:
 *   P_installed = installed capacity (kWp)
 *   H_peak      = peak sun hours (PSH, h/day)
 *   K_loss      = 1 - systemLoss (cable/soiling/mismatch)
 *   PR          = performance ratio (inverter efficiency, temp derating)
 *
 * Standards: KEC 502 (Distributed Energy Resources), IEC 61724
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  round,
} from '../types';

// ── Input ───────────────────────────────────────────────────────────────────

export interface SolarGenerationInput {
  /** Installed PV capacity (kWp) */
  installedCapacity: number;
  /** Peak sun hours for location (h/day, typically 3-6 for Korea) */
  peakSunHours: number;
  /** Performance ratio (0 < PR <= 1, typically 0.75-0.85) */
  performanceRatio: number;
  /** System loss excluding PR (%, 0-50, e.g. cable/soiling/mismatch, typically 5-15) */
  systemLoss: number;
  /** Days per month for monthly calc (default 30) */
  daysPerMonth?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateSolarGeneration(input: SolarGenerationInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.installedCapacity, 'installedCapacity');
  assertPositive(input.peakSunHours, 'peakSunHours');
  assertRange(input.performanceRatio, 0.01, 1.0, 'performanceRatio');
  assertRange(input.systemLoss, 0, 50, 'systemLoss');

  const {
    installedCapacity: P,
    peakSunHours: H,
    performanceRatio: PR,
    systemLoss: loss_pct,
    daysPerMonth = 30,
  } = input;

  const K = 1 - loss_pct / 100;

  const steps: CalcStep[] = [];

  // PART 2 — Derivation

  // Step 1: System loss factor
  steps.push({
    step: 1,
    title: 'Calculate system loss factor',
    formula: 'K = 1 - \\frac{\\text{loss\\%}}{100}',
    value: round(K, 4),
    unit: '-',
  });

  // Step 2: Daily generation
  const E_daily = P * H * K * PR;
  steps.push({
    step: 2,
    title: 'Calculate daily energy generation',
    formula: 'E_{daily} = P \\times H \\times K \\times PR',
    value: round(E_daily, 2),
    unit: 'kWh/day',
    standardRef: 'IEC 61724',
  });

  // Step 3: Monthly generation
  const E_monthly = E_daily * daysPerMonth;
  steps.push({
    step: 3,
    title: 'Calculate monthly energy generation',
    formula: 'E_{month} = E_{daily} \\times N_{days}',
    value: round(E_monthly, 1),
    unit: 'kWh/month',
  });

  // Step 4: Annual generation
  const E_annual = E_daily * 365;
  steps.push({
    step: 4,
    title: 'Calculate annual energy generation',
    formula: 'E_{annual} = E_{daily} \\times 365',
    value: round(E_annual, 0),
    unit: 'kWh/year',
  });

  // Step 5: Specific yield
  const specificYield = E_annual / P;
  steps.push({
    step: 5,
    title: 'Calculate specific yield',
    formula: 'Y = \\frac{E_{annual}}{P_{installed}}',
    value: round(specificYield, 0),
    unit: 'kWh/kWp/year',
  });

  // PART 3 — Judgment
  // Korea typical: 1000-1400 kWh/kWp/year
  const yieldOk = specificYield >= 800 && specificYield <= 2000;
  const judgment = createJudgment(
    yieldOk,
    yieldOk
      ? `Specific yield ${round(specificYield, 0)} kWh/kWp/year (within typical range)`
      : `Specific yield ${round(specificYield, 0)} kWh/kWp/year (outside typical 800-2000 range, check inputs)`,
    yieldOk ? 'info' : 'warning',
    'IEC 61724',
  );

  return {
    value: round(E_daily, 2),
    unit: 'kWh/day',
    formula: 'E = P \\times H \\times K \\times PR',
    steps,
    source: [
      createSource('KEC', '502', { edition: '2021' }),
      createSource('IEC', '61724', { edition: '2017' }),
    ],
    judgment,
    additionalOutputs: {
      dailyGeneration: { value: round(E_daily, 2), unit: 'kWh/day' },
      monthlyGeneration: { value: round(E_monthly, 1), unit: 'kWh/month' },
      annualGeneration: { value: round(E_annual, 0), unit: 'kWh/year' },
      specificYield: { value: round(specificYield, 0), unit: 'kWh/kWp/year' },
    },
  };
}
