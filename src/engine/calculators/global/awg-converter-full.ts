/**
 * Full AWG / mm2 / kcmil Converter
 *
 * Formulae:
 *   AWG -> mm2:   d(mm) = 0.127 x 92^((36-AWG)/39), A = pi/4 x d^2
 *   AWG -> kcmil: kcmil = (d_mil)^2 / 1000, d_mil = d(mm) / 0.0254
 *   mm2 -> AWG:   AWG = -39 x log2(d/0.127) / log2(92) + 36 (nearest)
 *
 * Reference: ASTM B258 (Standard Specification for Standard Nominal
 *            Diameters and Cross-Sectional Areas of AWG Sizes)
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

export type WireUnit = 'awg' | 'mm2' | 'kcmil';

export interface AwgConverterInput {
  /** Numeric value to convert */
  value: number;
  /** Source unit */
  fromUnit: WireUnit;
}

// -- Reference table: AWG -> diameter(mm) -> mm2 -> kcmil ----

interface WireEntry {
  awg: number | string;  // number for 0-40, string for '00','000','0000'
  awgDisplay: string;
  diameterMm: number;
  mm2: number;
  kcmil: number;
}

function buildReferenceTable(): WireEntry[] {
  const table: WireEntry[] = [];

  // AWG 0000 (4/0) to 0 (1/0)
  const largeGauges = [
    { awg: -3, awgDisplay: '4/0 (0000)', diameterMm: 11.684 },
    { awg: -2, awgDisplay: '3/0 (000)', diameterMm: 10.405 },
    { awg: -1, awgDisplay: '2/0 (00)', diameterMm: 9.266 },
    { awg: 0, awgDisplay: '1/0 (0)', diameterMm: 8.251 },
  ];
  for (const lg of largeGauges) {
    const mm2 = Math.PI / 4 * lg.diameterMm * lg.diameterMm;
    const dMil = lg.diameterMm / 0.0254;
    const kcmil = (dMil * dMil) / 1000;
    table.push({ awg: lg.awg, awgDisplay: lg.awgDisplay, diameterMm: lg.diameterMm, mm2, kcmil });
  }

  // AWG 1 through 40
  for (let awg = 1; awg <= 40; awg++) {
    const d = 0.127 * Math.pow(92, (36 - awg) / 39);
    const mm2 = Math.PI / 4 * d * d;
    const dMil = d / 0.0254;
    const kcmil = (dMil * dMil) / 1000;
    table.push({ awg, awgDisplay: `${awg}`, diameterMm: d, mm2, kcmil });
  }

  return table;
}

const REFERENCE_TABLE = buildReferenceTable();

// -- Standard IEC mm2 sizes ----
const STANDARD_MM2 = [0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];

function findNearest(value: number, standards: number[]): number {
  let best = standards[0];
  let bestDiff = Math.abs(value - best);
  for (const s of standards) {
    const diff = Math.abs(value - s);
    if (diff < bestDiff) { best = s; bestDiff = diff; }
  }
  return best;
}

function findNearestAwgEntry(mm2: number): WireEntry {
  let best = REFERENCE_TABLE[0];
  let bestDiff = Math.abs(mm2 - best.mm2);
  for (const entry of REFERENCE_TABLE) {
    const diff = Math.abs(mm2 - entry.mm2);
    if (diff < bestDiff) { best = entry; bestDiff = diff; }
  }
  return best;
}

// -- Calculator --------------------------------------------------------------

export function convertAwgFull(input: AwgConverterInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertOneOf(input.fromUnit, ['awg', 'mm2', 'kcmil'] as const, 'fromUnit');
  // value can be 0 for AWG 1/0, or negative for 2/0, 3/0, 4/0
  if (input.fromUnit !== 'awg') {
    assertPositive(input.value, 'value');
  }

  const { value, fromUnit } = input;
  const steps: CalcStep[] = [];

  let mm2Val: number;
  let awgEntry: WireEntry;
  let kcmilVal: number;

  // PART 2 -- Derivation
  if (fromUnit === 'awg') {
    // Find entry or calculate
    const entry = REFERENCE_TABLE.find(e => e.awg === value);
    if (entry) {
      awgEntry = entry;
    } else {
      // Calculate for arbitrary AWG value
      const d = 0.127 * Math.pow(92, (36 - value) / 39);
      const calcMm2 = Math.PI / 4 * d * d;
      const dMil = d / 0.0254;
      const calcKcmil = (dMil * dMil) / 1000;
      awgEntry = { awg: value, awgDisplay: `${value}`, diameterMm: d, mm2: calcMm2, kcmil: calcKcmil };
    }
    mm2Val = awgEntry.mm2;
    kcmilVal = awgEntry.kcmil;

    steps.push({
      step: 1,
      title: 'AWG 직경 계산 (Diameter from AWG)',
      formula: 'd = 0.127 \\times 92^{(36 - AWG) / 39}',
      value: round(awgEntry.diameterMm, 3),
      unit: 'mm',
    });
  } else if (fromUnit === 'mm2') {
    mm2Val = value;
    awgEntry = findNearestAwgEntry(value);
    kcmilVal = awgEntry.kcmil;
    // Recalculate kcmil from actual mm2
    const dMm = Math.sqrt(4 * value / Math.PI);
    const dMil = dMm / 0.0254;
    kcmilVal = (dMil * dMil) / 1000;

    steps.push({
      step: 1,
      title: 'mm2 -> 직경 변환 (Diameter from mm2)',
      formula: 'd = \\sqrt{4 \\times A / \\pi}',
      value: round(dMm, 3),
      unit: 'mm',
    });
  } else {
    // kcmil
    kcmilVal = value;
    const dMil = Math.sqrt(value * 1000);
    const dMm = dMil * 0.0254;
    mm2Val = Math.PI / 4 * dMm * dMm;
    awgEntry = findNearestAwgEntry(mm2Val);

    steps.push({
      step: 1,
      title: 'kcmil -> 직경 변환 (Diameter from kcmil)',
      formula: 'd_{mil} = \\sqrt{kcmil \\times 1000}',
      value: round(dMm, 3),
      unit: 'mm',
    });
  }

  // Step 2: Show all conversions
  steps.push({
    step: 2,
    title: 'AWG 환산 (AWG equivalent)',
    formula: 'AWG = -39 \\times \\log_2(d/0.127) / \\log_2(92) + 36',
    value: typeof awgEntry.awg === 'number' ? awgEntry.awg : 0,
    unit: `AWG ${awgEntry.awgDisplay}`,
  });

  steps.push({
    step: 3,
    title: 'mm2 환산 (mm2 equivalent)',
    formula: 'A = \\pi / 4 \\times d^2',
    value: round(mm2Val, 3),
    unit: 'mm2',
  });

  const nearestStdMm2 = findNearest(mm2Val, STANDARD_MM2);
  steps.push({
    step: 4,
    title: '최근접 IEC 표준 사이즈 (Nearest standard mm2)',
    formula: '\\text{IEC standard sizes}',
    value: nearestStdMm2,
    unit: 'mm2',
  });

  steps.push({
    step: 5,
    title: 'kcmil 환산 (kcmil equivalent)',
    formula: 'kcmil = d_{mil}^2 / 1000',
    value: round(kcmilVal, 2),
    unit: 'kcmil',
  });

  // PART 3 -- Result assembly
  return {
    value: round(mm2Val, 3),
    unit: 'mm2',
    formula: 'A = \\pi / 4 \\times d^2',
    steps,
    source: [createSource('ASTM', 'B258', { edition: '2018' })],
    judgment: createJudgment(
      true,
      `AWG ${awgEntry.awgDisplay} = ${round(mm2Val, 3)} mm2 = ${round(kcmilVal, 2)} kcmil (표준 ${nearestStdMm2} mm2)`,
      'info',
    ),
    additionalOutputs: {
      awg: { value: typeof awgEntry.awg === 'number' ? awgEntry.awg : 0, unit: `AWG ${awgEntry.awgDisplay}` },
      kcmil: { value: round(kcmilVal, 2), unit: 'kcmil' },
      nearestStandardMm2: { value: nearestStdMm2, unit: 'mm2' },
    },
  };
}
