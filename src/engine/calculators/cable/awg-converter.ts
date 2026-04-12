/**
 * AWG ↔ mm² Bidirectional Converter
 *
 * Formulae:
 *   AWG → mm²: d(mm) = 0.127 × 92^((36-AWG)/39), A = π/4 × d²
 *   mm² → AWG: AWG = -39 × log₉₂(d/0.127) + 36
 *   kcmil = (d in mils)² / 1000, 1 kcmil = 0.5067 mm²
 *
 * Includes nearest standard size lookup for both systems.
 *
 * Reference: ASTM B258 (Standard wire gauges), NEC Chapter 9 Table 8
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  round,
} from '../types';

// ── AWG/kcmil Reference Table ───────────────────────────────────────────────

interface WireEntry {
  awg: string;       // AWG designation or kcmil
  mm2: number;       // Cross-sectional area in mm²
  diamMm: number;    // Diameter in mm
  isKcmil: boolean;
}

const WIRE_TABLE: WireEntry[] = [
  { awg: '4/0 (0000)', mm2: 107.2, diamMm: 11.684, isKcmil: false },
  { awg: '3/0 (000)',  mm2: 85.01, diamMm: 10.404, isKcmil: false },
  { awg: '2/0 (00)',   mm2: 67.43, diamMm: 9.266,  isKcmil: false },
  { awg: '1/0 (0)',    mm2: 53.49, diamMm: 8.252,  isKcmil: false },
  { awg: '1',          mm2: 42.41, diamMm: 7.348,  isKcmil: false },
  { awg: '2',          mm2: 33.63, diamMm: 6.544,  isKcmil: false },
  { awg: '3',          mm2: 26.67, diamMm: 5.827,  isKcmil: false },
  { awg: '4',          mm2: 21.15, diamMm: 5.189,  isKcmil: false },
  { awg: '6',          mm2: 13.30, diamMm: 4.115,  isKcmil: false },
  { awg: '8',          mm2: 8.366, diamMm: 3.264,  isKcmil: false },
  { awg: '10',         mm2: 5.261, diamMm: 2.588,  isKcmil: false },
  { awg: '12',         mm2: 3.309, diamMm: 2.053,  isKcmil: false },
  { awg: '14',         mm2: 2.081, diamMm: 1.628,  isKcmil: false },
  { awg: '16',         mm2: 1.309, diamMm: 1.291,  isKcmil: false },
  { awg: '18',         mm2: 0.823, diamMm: 1.024,  isKcmil: false },
  { awg: '20',         mm2: 0.518, diamMm: 0.812,  isKcmil: false },
  // kcmil sizes
  { awg: '250 kcmil',  mm2: 126.7, diamMm: 12.70, isKcmil: true },
  { awg: '300 kcmil',  mm2: 152.0, diamMm: 13.91, isKcmil: true },
  { awg: '350 kcmil',  mm2: 177.3, diamMm: 15.03, isKcmil: true },
  { awg: '400 kcmil',  mm2: 202.7, diamMm: 16.07, isKcmil: true },
  { awg: '500 kcmil',  mm2: 253.4, diamMm: 17.96, isKcmil: true },
  { awg: '600 kcmil',  mm2: 304.0, diamMm: 19.67, isKcmil: true },
  { awg: '750 kcmil',  mm2: 380.0, diamMm: 22.00, isKcmil: true },
  { awg: '1000 kcmil', mm2: 506.7, diamMm: 25.40, isKcmil: true },
];

// IEC standard mm² sizes
const STANDARD_MM2 = [
  0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95,
  120, 150, 185, 240, 300, 400, 500, 630, 800, 1000,
];

// ── Input / Output ──────────────────────────────────────────────────────────

export interface AwgConverterInput {
  /** Conversion direction */
  direction: 'awg-to-mm2' | 'mm2-to-awg';
  /** AWG number (for awg-to-mm2). Use -1=1/0, -2=2/0, -3=3/0, -4=4/0 */
  awg?: number;
  /** Cross-sectional area in mm² (for mm2-to-awg) */
  mm2?: number;
  /** kcmil value (alternative input for large conductors) */
  kcmil?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function convertAwgMm2(input: AwgConverterInput): DetailedCalcResult {
  const steps: CalcStep[] = [];

  if (input.direction === 'awg-to-mm2') {
    // PART 1 — AWG → mm² conversion
    if (input.kcmil !== undefined) {
      // kcmil to mm²
      assertPositive(input.kcmil, 'kcmil');
      const mm2 = input.kcmil * 0.5067;
      steps.push({
        step: 1,
        title: 'Convert kcmil to mm²',
        formula: 'A_{mm^2} = kcmil \\times 0.5067',
        value: round(mm2, 2),
        unit: 'mm²',
        standardRef: 'ASTM B258',
      });

      const nearest = findNearestMm2(mm2);
      steps.push({
        step: 2,
        title: 'Nearest IEC standard size',
        formula: 'A_{std} \\approx A_{calc}',
        value: nearest,
        unit: 'mm²',
      });

      return {
        value: round(mm2, 2),
        unit: 'mm²',
        formula: 'A_{mm^2} = kcmil \\times 0.5067',
        steps,
        source: [createSource('ASTM', 'B258', { edition: '2018' })],
        judgment: createJudgment(true, `${input.kcmil} kcmil = ${round(mm2, 2)} mm² (nearest std: ${nearest} mm²)`, 'info'),
        additionalOutputs: {
          exactMm2: { value: round(mm2, 2), unit: 'mm²' },
          nearestStandard: { value: nearest, unit: 'mm²' },
        },
      };
    }

    // Standard AWG conversion
    if (input.awg === undefined) {
      throw new Error('awg or kcmil is required for awg-to-mm2 direction');
    }

    const awgNum = input.awg;

    // Step 1: Diameter from AWG formula
    // For AWG 0000(-3) through 36
    const effectiveAwg = awgNum; // -1=1/0, -2=2/0, -3=3/0, -4=4/0 convention not used; lookup instead
    const dMm = 0.127 * Math.pow(92, (36 - effectiveAwg) / 39);
    steps.push({
      step: 1,
      title: 'Wire diameter from AWG number',
      formula: 'd = 0.127 \\times 92^{(36-n)/39}',
      value: round(dMm, 3),
      unit: 'mm',
      standardRef: 'ASTM B258',
    });

    // Step 2: Cross-sectional area
    const mm2 = (Math.PI / 4) * dMm * dMm;
    steps.push({
      step: 2,
      title: 'Cross-sectional area',
      formula: 'A = \\frac{\\pi}{4} d^2',
      value: round(mm2, 2),
      unit: 'mm²',
    });

    // Step 3: Nearest IEC standard
    const nearest = findNearestMm2(mm2);
    steps.push({
      step: 3,
      title: 'Nearest IEC standard size',
      formula: 'A_{std} \\approx A_{calc}',
      value: nearest,
      unit: 'mm²',
    });

    // Step 4: kcmil equivalent
    const dMils = dMm / 0.0254;
    const kcmil = (dMils * dMils) / 1000;
    steps.push({
      step: 4,
      title: 'kcmil equivalent',
      formula: 'kcmil = \\frac{d_{mils}^2}{1000}',
      value: round(kcmil, 1),
      unit: 'kcmil',
    });

    return {
      value: round(mm2, 2),
      unit: 'mm²',
      formula: 'A = \\frac{\\pi}{4} \\left(0.127 \\times 92^{(36-n)/39}\\right)^2',
      steps,
      source: [
        createSource('ASTM', 'B258', { edition: '2018' }),
        createSource('NEC', 'Chapter 9 Table 8', { edition: '2023' }),
      ],
      judgment: createJudgment(true, `AWG ${awgNum} = ${round(mm2, 2)} mm² (nearest IEC: ${nearest} mm²)`, 'info'),
      additionalOutputs: {
        exactMm2: { value: round(mm2, 2), unit: 'mm²' },
        nearestStandard: { value: nearest, unit: 'mm²' },
        diameterMm: { value: round(dMm, 3), unit: 'mm' },
        kcmil: { value: round(kcmil, 1), unit: 'kcmil' },
      },
    };
  } else {
    // PART 2 — mm² → AWG conversion
    if (input.mm2 === undefined) {
      throw new Error('mm2 is required for mm2-to-awg direction');
    }
    assertPositive(input.mm2, 'mm2');

    const mm2 = input.mm2;

    // Step 1: Diameter from area
    const dMm = Math.sqrt((4 * mm2) / Math.PI);
    steps.push({
      step: 1,
      title: 'Diameter from cross-sectional area',
      formula: 'd = \\sqrt{\\frac{4A}{\\pi}}',
      value: round(dMm, 3),
      unit: 'mm',
    });

    // Step 2: AWG from diameter (inverse formula)
    const awgExact = 36 - 39 * Math.log(dMm / 0.127) / Math.log(92);
    const awgRounded = Math.round(awgExact);
    steps.push({
      step: 2,
      title: 'AWG number from diameter',
      formula: 'n = 36 - 39 \\times \\log_{92}\\left(\\frac{d}{0.127}\\right)',
      value: round(awgExact, 2),
      unit: 'AWG',
      standardRef: 'ASTM B258',
    });

    // Step 3: Nearest standard AWG
    const nearestEntry = findNearestAwgEntry(mm2);
    steps.push({
      step: 3,
      title: 'Nearest standard AWG size',
      formula: 'AWG_{nearest}',
      value: round(nearestEntry.mm2, 2),
      unit: `mm² (${nearestEntry.awg})`,
    });

    // Step 4: kcmil equivalent
    const dMils = dMm / 0.0254;
    const kcmil = (dMils * dMils) / 1000;
    steps.push({
      step: 4,
      title: 'kcmil equivalent',
      formula: 'kcmil = \\frac{d_{mils}^2}{1000}',
      value: round(kcmil, 1),
      unit: 'kcmil',
    });

    return {
      value: awgRounded,
      unit: 'AWG',
      formula: 'n = 36 - 39 \\times \\log_{92}\\left(\\frac{d}{0.127}\\right)',
      steps,
      source: [
        createSource('ASTM', 'B258', { edition: '2018' }),
        createSource('NEC', 'Chapter 9 Table 8', { edition: '2023' }),
      ],
      judgment: createJudgment(true, `${mm2} mm² ≈ AWG ${nearestEntry.awg} (${nearestEntry.mm2} mm²)`, 'info'),
      additionalOutputs: {
        exactAwg: { value: round(awgExact, 2), unit: 'AWG' },
        nearestAwg: { value: nearestEntry.mm2, unit: `mm² (${nearestEntry.awg})` },
        diameterMm: { value: round(dMm, 3), unit: 'mm' },
        kcmil: { value: round(kcmil, 1), unit: 'kcmil' },
      },
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function findNearestMm2(value: number): number {
  let nearest = STANDARD_MM2[0];
  let minDiff = Math.abs(value - nearest);
  for (const s of STANDARD_MM2) {
    const diff = Math.abs(value - s);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = s;
    }
  }
  return nearest;
}

function findNearestAwgEntry(mm2: number): WireEntry {
  let nearest = WIRE_TABLE[0];
  let minDiff = Math.abs(mm2 - nearest.mm2);
  for (const entry of WIRE_TABLE) {
    const diff = Math.abs(mm2 - entry.mm2);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = entry;
    }
  }
  return nearest;
}
