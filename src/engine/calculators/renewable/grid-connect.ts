/**
 * Grid Connection Capacity Check Calculator
 *
 * Determines connection type, CT ratio, max export power, and
 * protection relay settings for PV + ESS grid interconnection.
 *
 * Standards: KEC 502 (Distributed Generation), KEPCO Technical Standards
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export interface GridConnectInput {
  /** PV installed capacity in kWp */
  pvCapacity: number;
  /** Battery (ESS) capacity in kWh (0 if no ESS) */
  batteryCapacity: number;
  /** Grid voltage in Volts */
  gridVoltage: number;
  /** Contract demand in kW */
  contractDemand: number;
}

// ── Standard CT ratios ─────────────────────────────────────────────────────

const CT_RATIOS = [
  50, 75, 100, 150, 200, 300, 400, 500, 600, 750, 800, 1000,
  1200, 1500, 2000, 2500, 3000, 4000, 5000,
];

function selectCTRatio(maxCurrent: number): string {
  const primary = maxCurrent * 1.25;
  for (const ct of CT_RATIOS) {
    if (ct >= primary) return `${ct}/5`;
  }
  return `${CT_RATIOS[CT_RATIOS.length - 1]}/5`;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateGridConnect(input: GridConnectInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.pvCapacity, 'pvCapacity');
  assertPositive(input.gridVoltage, 'gridVoltage');
  assertPositive(input.contractDemand, 'contractDemand');

  const { pvCapacity, batteryCapacity, gridVoltage, contractDemand } = input;
  const sqrt3 = Math.sqrt(3);

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];

  // Step 1: Max export power (PV + ESS discharge, limited by contract)
  // KEPCO rule: max export = min(pvCapacity, contractDemand) for low voltage
  const essMaxPower = batteryCapacity > 0 ? batteryCapacity * 0.5 : 0; // assume 0.5C
  const totalGeneration = pvCapacity + essMaxPower;
  const maxExport = Math.min(totalGeneration, contractDemand);
  steps.push({
    step: 1,
    title: '최대 역송전력 (Max export power)',
    formula: 'P_{export} = \\min(P_{PV} + P_{ESS}, P_{contract})',
    value: round(maxExport, 2),
    unit: 'kW',
  });

  // Step 2: Connection type determination
  // Low voltage: <= 100kW at 380V, High voltage: > 100kW at 22.9kV
  const connectionType = maxExport <= 100 ? 'low' : 'high';
  const connectionVoltage = connectionType === 'low' ? gridVoltage : 22900;
  steps.push({
    step: 2,
    title: '연계 구분 (Connection type)',
    formula: `P_{export} ${maxExport <= 100 ? '\\leq' : '>'} 100 \\text{ kW}`,
    value: maxExport,
    unit: connectionType === 'low' ? 'kW (저압)' : 'kW (고압)',
    standardRef: 'KEPCO Technical Standards',
  });

  // Step 3: Max current at connection point
  const maxCurrent = (maxExport * 1000) / (sqrt3 * connectionVoltage);
  steps.push({
    step: 3,
    title: '최대 연계전류 (Max connection current)',
    formula: 'I_{max} = \\frac{P_{export} \\times 1000}{\\sqrt{3} \\times V}',
    value: round(maxCurrent, 2),
    unit: 'A',
  });

  // Step 4: CT ratio selection
  const ctRatio = selectCTRatio(maxCurrent);
  const ctPrimary = parseInt(ctRatio.split('/')[0]);
  steps.push({
    step: 4,
    title: 'CT 비 선정 (CT ratio selection)',
    formula: `CT_{primary} \\geq I_{max} \\times 1.25 = ${round(maxCurrent * 1.25, 1)}`,
    value: ctPrimary,
    unit: `A (${ctRatio})`,
  });

  // Step 5: Protection relay settings
  const ovrFreq = 60.5;    // Hz -- over-frequency trip
  const _undrFreq = 59.3;   // Hz -- under-frequency trip
  const _ovrVolt = 110;     // % -- over-voltage trip
  const _undrVolt = 80;     // % -- under-voltage trip
  steps.push({
    step: 5,
    title: '보호계전기 설정 (Protection relay settings)',
    formula: 'OFR/UFR/OVR/UVR',
    value: ovrFreq,
    unit: 'Hz (OFR)',
    standardRef: 'KEC 502',
  });

  // PART 3 -- Result assembly
  const pass = maxExport <= contractDemand;
  return {
    value: round(maxExport, 2),
    unit: 'kW',
    formula: 'P_{export} = \\min(P_{gen}, P_{contract})',
    steps,
    source: [
      createSource('KEC', '502', { edition: '2021' }),
      createSource('KEPCO', 'Technical Standards for DG Interconnection', { edition: '2022' }),
    ],
    judgment: createJudgment(
      pass,
      `${connectionType === 'low' ? '저압' : '고압'} 연계, 최대 역송 ${round(maxExport, 2)} kW, CT ${ctRatio}`,
      'info',
    ),
    additionalOutputs: {
      maxExportPower:  { value: round(maxExport, 2),   unit: 'kW' },
      connectionType:  { value: connectionType === 'low' ? 0 : 1, unit: connectionType },
      ctRatio:         { value: ctPrimary,             unit: ctRatio },
      protectionRelay: { value: ovrFreq,               unit: 'Hz (OFR/UFR/OVR/UVR)' },
    },
  };
}
