/**
 * Country-Comparison Voltage Drop Calculator
 *
 * Calculates voltage drop once, then compares results against limits from
 * multiple national/international standards:
 *   - KEC (한국전기설비기준): 3% branch, 5% total
 *   - NEC (National Electrical Code): 3% branch, 5% feeder+branch
 *   - IEC 60364: 4% general
 *   - JIS (Japan): 2% (100V), 3% (200V), 5% (400V+)
 *
 * Standards: KEC 232.51, NEC 210.19(A) FPN / 215.2(A) FPN, IEC 60364-5-52, JIS C 3307
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import { SQRT3 } from '@engine/constants/physical';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertRange,
  assertOneOf,
  round,
} from '../types';

// ── Country limit definitions ───────────────────────────────────────────────

interface CountryLimit {
  country: string;
  standard: string;
  clause: string;
  branchLimit: number;
  totalLimit: number;
  note: string;
}

function getCountryLimits(voltage: number): CountryLimit[] {
  // JIS limit varies by voltage class
  const jisLimit = voltage <= 100 ? 2 : voltage <= 200 ? 3 : 5;

  return [
    {
      country: 'Korea (KEC)',
      standard: 'KEC',
      clause: '232.51',
      branchLimit: 3,
      totalLimit: 5,
      note: '간선+분기 합계 5% 이내',
    },
    {
      country: 'USA (NEC)',
      standard: 'NEC',
      clause: '210.19(A) FPN',
      branchLimit: 3,
      totalLimit: 5,
      note: 'Recommendation, not mandatory',
    },
    {
      country: 'International (IEC)',
      standard: 'IEC 60364',
      clause: '5-52',
      branchLimit: 4,
      totalLimit: 4,
      note: 'General installations',
    },
    {
      country: 'Japan (JIS)',
      standard: 'JIS',
      clause: 'C 3307',
      branchLimit: jisLimit,
      totalLimit: jisLimit,
      note: `${voltage}V class: ${jisLimit}%`,
    },
  ];
}

// ── Input / Output ──────────────────────────────────────────────────────────

export interface CountryCompareVDInput {
  /** System voltage in Volts */
  voltage: number;
  /** Line current in Amperes */
  current: number;
  /** Cable length in meters */
  length: number;
  /** Cable resistance per km (Ω/km) */
  resistance: number;
  /** Cable reactance per km (Ω/km, default 0) */
  reactance?: number;
  /** Power factor */
  powerFactor: number;
  /** Number of phases: 1 or 3 */
  phase: 1 | 3;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateCountryCompareVD(input: CountryCompareVDInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.voltage, 'voltage');
  assertPositive(input.current, 'current');
  assertPositive(input.length, 'length');
  assertPositive(input.resistance, 'resistance');
  assertRange(input.powerFactor, 0.01, 1.0, 'powerFactor');
  assertOneOf(input.phase, [1, 3] as const, 'phase');

  const { voltage: V, current: I, length, resistance: R, powerFactor: pf, phase } = input;
  const X = input.reactance ?? 0;
  const L_km = length / 1000;
  const cosPhi = pf;
  const sinPhi = Math.sqrt(1 - pf * pf);
  const k = phase === 3 ? SQRT3 : 2;
  const steps: CalcStep[] = [];

  // PART 2 — Calculate voltage drop

  // Step 1: Voltage drop in Volts
  const vdV = k * I * L_km * (R * cosPhi + X * sinPhi);
  steps.push({
    step: 1,
    title: `Calculate ${phase}-phase voltage drop`,
    formula:
      phase === 3
        ? 'VD = \\sqrt{3} \\times I \\times L \\times (R\\cos\\varphi + X\\sin\\varphi)'
        : 'VD = 2 \\times I \\times L \\times (R\\cos\\varphi + X\\sin\\varphi)',
    value: round(vdV, 2),
    unit: 'V',
  });

  // Step 2: Voltage drop percentage
  const vdPercent = (vdV / V) * 100;
  steps.push({
    step: 2,
    title: 'Voltage drop percentage',
    formula: 'VD\\% = \\frac{VD}{V} \\times 100',
    value: round(vdPercent, 2),
    unit: '%',
  });

  // PART 3 — Compare against each country standard
  const limits = getCountryLimits(V);
  const perCountry: Array<{
    country: string;
    standard: string;
    branchLimit: number;
    actual: number;
    pass: boolean;
    note: string;
  }> = [];

  let anyFail = false;
  limits.forEach((lim, idx) => {
    const pass = vdPercent <= lim.branchLimit;
    if (!pass) anyFail = true;

    perCountry.push({
      country: lim.country,
      standard: `${lim.standard} ${lim.clause}`,
      branchLimit: lim.branchLimit,
      actual: round(vdPercent, 2),
      pass,
      note: lim.note,
    });

    steps.push({
      step: 3 + idx,
      title: `${lim.country}: ${round(vdPercent, 2)}% vs ${lim.branchLimit}% limit`,
      formula: `VD\\% ${pass ? '\\leq' : '>'} ${lim.branchLimit}\\%`,
      value: lim.branchLimit,
      unit: '%',
      standardRef: `${lim.standard} ${lim.clause}`,
    });
  });

  // PART 4 — Result assembly
  const passCount = perCountry.filter((c) => c.pass).length;
  const message = `VD = ${round(vdPercent, 2)}% — passes ${passCount}/${perCountry.length} country standards`;

  return {
    value: round(vdPercent, 2),
    unit: '%',
    formula: 'VD = k \\times I \\times L \\times (R\\cos\\varphi + X\\sin\\varphi)',
    steps,
    source: [
      createSource('KEC', '232.51', { edition: '2021' }),
      createSource('NEC', '210.19(A)', { edition: '2023' }),
      createSource('IEC', '60364-5-52', { edition: '2009' }),
      createSource('JIS', 'C 3307', { edition: '2020' }),
    ],
    judgment: createJudgment(
      !anyFail,
      message,
      anyFail ? 'warning' : 'info',
    ),
    additionalOutputs: {
      dropVolts: { value: round(vdV, 2), unit: 'V' },
      dropPercent: { value: round(vdPercent, 2), unit: '%' },
      countryResultCount: { value: passCount, unit: `of ${perCountry.length} pass` },
    },
  };
}
