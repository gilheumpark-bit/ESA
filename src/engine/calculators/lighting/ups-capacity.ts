/**
 * UPS Capacity Calculator
 *
 * Formulae:
 *   UPS Capacity:   S_ups = P_load / (PF x eta) x safetyFactor   [kVA]
 *   Battery Ah:     Ah = (S x backupMin) / (V x eta x DoD x 60)  [Ah]
 *   Battery Count:  N = ceil(batteryVoltage / cellVoltage)        [units]
 *
 * Standards: IEC 62040-3 (UPS Performance & Test Requirements)
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  round,
} from '../types';

// -- Input / Output ----------------------------------------------------------

export interface UPSCapacityInput {
  /** Total load power in kW */
  loadPower: number;
  /** Load power factor (0.01 ~ 1.0) */
  loadPF: number;
  /** Required backup time in minutes */
  backupMinutes: number;
  /** UPS input voltage in Volts */
  inputVoltage: number;
  /** Battery string voltage in Volts */
  batteryVoltage: number;
  /** UPS efficiency (0.01 ~ 1.0), typical 0.90 ~ 0.96 */
  efficiency: number;
  /** Safety / design margin factor (>= 1.0), typical 1.2 ~ 1.25 */
  safetyFactor: number;
  /** Depth of Discharge (0.01 ~ 1.0), typical 0.8 */
  depthOfDischarge?: number;
  /** Single cell voltage in V, default 12 */
  cellVoltage?: number;
}

// -- Calculator --------------------------------------------------------------

export function calculateUPSCapacity(input: UPSCapacityInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.loadPower, 'loadPower');
  assertRange(input.loadPF, 0.01, 1.0, 'loadPF');
  assertPositive(input.backupMinutes, 'backupMinutes');
  assertPositive(input.inputVoltage, 'inputVoltage');
  assertPositive(input.batteryVoltage, 'batteryVoltage');
  assertRange(input.efficiency, 0.01, 1.0, 'efficiency');
  assertRange(input.safetyFactor, 1.0, 3.0, 'safetyFactor');

  const DoD = input.depthOfDischarge ?? 0.8;
  const cellV = input.cellVoltage ?? 12;
  assertRange(DoD, 0.01, 1.0, 'depthOfDischarge');
  assertPositive(cellV, 'cellVoltage');

  const { loadPower: P, loadPF: pf, backupMinutes, inputVoltage: _Vin, batteryVoltage: Vbat, efficiency: eta, safetyFactor: sf } = input;

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];

  // Step 1: UPS capacity (kVA)
  const S_ups = (P / (pf * eta)) * sf;
  steps.push({
    step: 1,
    title: 'UPS 용량 산정 (UPS apparent power capacity)',
    formula: 'S_{ups} = \\frac{P_{load}}{PF \\times \\eta} \\times SF',
    value: round(S_ups, 2),
    unit: 'kVA',
  });

  // Step 2: Battery Ah requirement
  // S_ups(kVA) * 1000 = VA, backup in hours = backupMinutes / 60
  // Ah = (S_ups * 1000 * backupMinutes) / (Vbat * eta * DoD * 60)
  const Ah = (S_ups * 1000 * backupMinutes) / (Vbat * eta * DoD * 60);
  steps.push({
    step: 2,
    title: '배터리 용량 산정 (Battery Ah)',
    formula: 'Ah = \\frac{S_{ups} \\times 1000 \\times t_{min}}{V_{bat} \\times \\eta \\times DoD \\times 60}',
    value: round(Ah, 1),
    unit: 'Ah',
  });

  // Step 3: Battery count (standard 12V cells)
  const batteryCount = Math.ceil(Vbat / cellV);
  steps.push({
    step: 3,
    title: '배터리 직렬 수량 (Battery cell count)',
    formula: 'N = \\lceil V_{bat} / V_{cell} \\rceil',
    value: batteryCount,
    unit: 'units',
  });

  // Step 4: Runtime verification
  const actualRuntime = (Ah * Vbat * eta * DoD * 60) / (S_ups * 1000);
  steps.push({
    step: 4,
    title: '런타임 검증 (Runtime verification)',
    formula: 't_{actual} = \\frac{Ah \\times V_{bat} \\times \\eta \\times DoD \\times 60}{S_{ups} \\times 1000}',
    value: round(actualRuntime, 1),
    unit: 'min',
  });

  const runtimeOk = actualRuntime >= backupMinutes * 0.99;

  // PART 3 -- Result assembly
  return {
    value: round(S_ups, 2),
    unit: 'kVA',
    formula: 'S_{ups} = \\frac{P_{load}}{PF \\times \\eta} \\times SF',
    steps,
    source: [createSource('IEC', '62040-3', { edition: '2021' })],
    judgment: createJudgment(
      runtimeOk,
      runtimeOk
        ? `UPS ${round(S_ups, 2)} kVA, 배터리 ${round(Ah, 1)} Ah x ${batteryCount}ea, 런타임 ${round(actualRuntime, 1)} min OK`
        : `런타임 부족: ${round(actualRuntime, 1)} min < ${backupMinutes} min 요구`,
      runtimeOk ? 'info' : 'warning',
    ),
    additionalOutputs: {
      batteryAh: { value: round(Ah, 1), unit: 'Ah', formula: 'Ah = (S \\times t) / (V \\times \\eta \\times DoD \\times 60)' },
      batteryCount: { value: batteryCount, unit: 'units', formula: 'N = \\lceil V_{bat} / V_{cell} \\rceil' },
      actualRuntime: { value: round(actualRuntime, 1), unit: 'min' },
    },
  };
}
