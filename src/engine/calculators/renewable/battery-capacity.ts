/**
 * Battery Capacity Calculator (ESS / UPS sizing)
 *
 * Formula:
 *   C = (P x t) / (V x DoD x eta)
 *
 * Where:
 *   P    = load power (kW)
 *   t    = backup time (hours)
 *   V    = battery nominal voltage (V)
 *   DoD  = depth of discharge (0-1, typically 0.8 for LiFePO4, 0.5 for lead-acid)
 *   eta  = inverter/charger efficiency (0-1, typically 0.90-0.95)
 *
 * Recommended capacity includes 20% margin.
 *
 * Standards: KEC 502 (Distributed Energy Resources), IEC 62619
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

export interface BatteryCapacityInput {
  /** Load power (kW) */
  loadPower: number;
  /** Required backup time (hours) */
  backupTime: number;
  /** Battery nominal voltage (V, e.g. 48, 96, 192, 384) */
  batteryVoltage: number;
  /** Depth of discharge (0 < DoD <= 1) */
  depthOfDischarge: number;
  /** Inverter/charger round-trip efficiency (0 < eta <= 1) */
  inverterEfficiency: number;
  /** Safety margin (0-1, default 0.2 = 20%) */
  safetyMargin?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateBatteryCapacity(input: BatteryCapacityInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.loadPower, 'loadPower');
  assertPositive(input.backupTime, 'backupTime');
  assertPositive(input.batteryVoltage, 'batteryVoltage');
  assertRange(input.depthOfDischarge, 0.01, 1.0, 'depthOfDischarge');
  assertRange(input.inverterEfficiency, 0.01, 1.0, 'inverterEfficiency');

  const {
    loadPower: P,
    backupTime: t,
    batteryVoltage: V,
    depthOfDischarge: DoD,
    inverterEfficiency: eta,
    safetyMargin = 0.20,
  } = input;

  assertRange(safetyMargin, 0, 1, 'safetyMargin');

  const steps: CalcStep[] = [];

  // PART 2 — Derivation

  // Step 1: Required energy
  const E_required = P * t; // kWh
  steps.push({
    step: 1,
    title: 'Calculate required energy',
    formula: 'E = P \\times t',
    value: round(E_required, 2),
    unit: 'kWh',
  });

  // Step 2: Account for DoD and efficiency
  const E_battery = E_required / (DoD * eta);
  steps.push({
    step: 2,
    title: 'Account for DoD and inverter efficiency',
    formula: 'E_{battery} = \\frac{E}{DoD \\times \\eta}',
    value: round(E_battery, 2),
    unit: 'kWh',
    standardRef: 'IEC 62619',
  });

  // Step 3: Required Ah capacity
  const C_required = (E_battery * 1000) / V; // E in Wh / V = Ah
  steps.push({
    step: 3,
    title: 'Calculate required Ah capacity',
    formula: 'C = \\frac{E_{battery} \\times 1000}{V}',
    value: round(C_required, 1),
    unit: 'Ah',
  });

  // Step 4: Apply safety margin
  const C_recommended = C_required * (1 + safetyMargin);
  steps.push({
    step: 4,
    title: `Apply ${round(safetyMargin * 100, 0)}% safety margin`,
    formula: 'C_{rec} = C \\times (1 + m)',
    value: round(C_recommended, 1),
    unit: 'Ah',
  });

  // Step 5: Total energy with margin
  const E_recommended = (C_recommended * V) / 1000;
  steps.push({
    step: 5,
    title: 'Total battery energy (with margin)',
    formula: 'E_{rec} = \\frac{C_{rec} \\times V}{1000}',
    value: round(E_recommended, 2),
    unit: 'kWh',
  });

  // PART 3 — Judgment
  const judgment = createJudgment(
    true,
    `Battery: ${round(C_recommended, 1)} Ah / ${round(E_recommended, 2)} kWh at ${V}V for ${P} kW load x ${t} h backup (DoD=${DoD}, \u03B7=${eta})`,
    'info',
    'KEC 502',
  );

  return {
    value: round(C_required, 1),
    unit: 'Ah',
    formula: 'C = \\frac{P \\times t}{V \\times DoD \\times \\eta}',
    steps,
    source: [
      createSource('KEC', '502', { edition: '2021' }),
      createSource('IEC', '62619', { edition: '2022' }),
    ],
    judgment,
    additionalOutputs: {
      requiredCapacity: { value: round(C_required, 1), unit: 'Ah' },
      requiredEnergy: { value: round(E_battery, 2), unit: 'kWh' },
      recommendedCapacity: { value: round(C_recommended, 1), unit: 'Ah' },
      recommendedEnergy: { value: round(E_recommended, 2), unit: 'kWh' },
    },
  };
}
