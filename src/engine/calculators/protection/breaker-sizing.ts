/**
 * Circuit Breaker Sizing Calculator
 *
 * Selection criteria:
 *   1. Rated current (In) >= load current (Ib)
 *   2. Breaking capacity (Icu) >= prospective short-circuit current (Isc)
 *   3. In <= cable ampacity (Iz) — coordination with cable
 *
 * Standard MCCB ratings (A):
 *   [15, 20, 30, 40, 50, 60, 75, 100, 125, 150, 175, 200,
 *    225, 250, 300, 350, 400, 500, 600, 700, 800]
 *
 * Standard breaking capacities (kA at 380/400V):
 *   [10, 16, 25, 36, 50, 65, 85, 100]
 *
 * Standards: KEC 212.3 (Overcurrent protection), IEC 60947-2
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  round,
} from '../types';

// ── Constants ───────────────────────────────────────────────────────────────

export const MCCB_RATINGS_A = [
  15, 20, 30, 40, 50, 60, 75, 100, 125, 150, 175, 200,
  225, 250, 300, 350, 400, 500, 600, 700, 800,
] as const;

export const STANDARD_BREAKING_CAPACITIES_KA = [
  10, 16, 25, 36, 50, 65, 85, 100,
] as const;

// ── Input ───────────────────────────────────────────────────────────────────

export interface BreakerSizingInput {
  /** Load current (A) */
  loadCurrent: number;
  /** Prospective short-circuit current at breaker location (kA) */
  shortCircuitCurrent: number;
  /** System voltage (V) */
  voltage: number;
  /** Cable ampacity Iz (A) — optional, for Ib <= In <= Iz coordination */
  cableAmpacity?: number;
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateBreakerSizing(input: BreakerSizingInput): DetailedCalcResult {
  // PART 1 — Validation
  assertPositive(input.loadCurrent, 'loadCurrent');
  assertPositive(input.shortCircuitCurrent, 'shortCircuitCurrent');
  assertPositive(input.voltage, 'voltage');
  if (input.cableAmpacity !== undefined) {
    assertPositive(input.cableAmpacity, 'cableAmpacity');
  }

  const {
    loadCurrent: Ib,
    shortCircuitCurrent: Isc_kA,
    voltage: V,
    cableAmpacity: Iz,
  } = input;

  const steps: CalcStep[] = [];

  // PART 2 — Derivation

  // Step 1: Minimum rated current
  steps.push({
    step: 1,
    title: 'Determine minimum breaker rating',
    formula: 'I_n \\geq I_b',
    value: round(Ib, 2),
    unit: 'A',
    standardRef: 'KEC 212.3',
  });

  // Step 2: Select standard rating (next size up)
  let selectedRating: number = MCCB_RATINGS_A[MCCB_RATINGS_A.length - 1];
  for (const rating of MCCB_RATINGS_A) {
    if (rating >= Ib) {
      selectedRating = rating;
      break;
    }
  }

  // If cable ampacity is provided, check In <= Iz
  let coordinationOk = true;
  if (Iz !== undefined && selectedRating > Iz) {
    coordinationOk = false;
  }

  steps.push({
    step: 2,
    title: 'Select standard MCCB rating',
    formula: 'I_n = \\text{next\\_standard} \\geq I_b',
    value: selectedRating,
    unit: 'A',
  });

  // Step 3: Cable coordination check
  if (Iz !== undefined) {
    steps.push({
      step: 3,
      title: 'Check cable coordination (Ib <= In <= Iz)',
      formula: 'I_b \\leq I_n \\leq I_z',
      value: Iz,
      unit: 'A',
      standardRef: 'KEC 212.3',
    });
  }

  // Step 4: Required breaking capacity
  steps.push({
    step: Iz !== undefined ? 4 : 3,
    title: 'Required breaking capacity',
    formula: 'I_{cu} \\geq I_{sc}',
    value: round(Isc_kA, 2),
    unit: 'kA',
    standardRef: 'IEC 60947-2',
  });

  // Step 5: Select standard breaking capacity
  let selectedBreaking: number = STANDARD_BREAKING_CAPACITIES_KA[STANDARD_BREAKING_CAPACITIES_KA.length - 1];
  for (const bc of STANDARD_BREAKING_CAPACITIES_KA) {
    if (bc >= Isc_kA) {
      selectedBreaking = bc;
      break;
    }
  }

  const breakingOk = selectedBreaking >= Isc_kA;
  const stepNum = Iz !== undefined ? 5 : 4;
  steps.push({
    step: stepNum,
    title: 'Select standard breaking capacity',
    formula: 'I_{cu} = \\text{next\\_standard} \\geq I_{sc}',
    value: selectedBreaking,
    unit: 'kA',
    standardRef: 'IEC 60947-2',
  });

  // PART 3 — Judgment
  const ratingOk = selectedRating >= Ib;
  const allOk = ratingOk && breakingOk && coordinationOk;

  const msgs: string[] = [];
  if (!ratingOk) msgs.push(`Rating ${selectedRating}A < load ${round(Ib, 2)}A`);
  if (!breakingOk) msgs.push(`Breaking capacity ${selectedBreaking}kA < Isc ${round(Isc_kA, 2)}kA`);
  if (!coordinationOk) msgs.push(`Rating ${selectedRating}A > cable ampacity ${Iz}A (coordination failure)`);

  const judgment = createJudgment(
    allOk,
    allOk
      ? `MCCB ${selectedRating}A / ${selectedBreaking}kA at ${V}V — all criteria satisfied`
      : `Selection issues: ${msgs.join('; ')}`,
    allOk ? 'info' : 'error',
    'KEC 212.3',
  );

  return {
    value: selectedRating,
    unit: 'A',
    formula: 'I_b \\leq I_n \\leq I_z, \\quad I_{cu} \\geq I_{sc}',
    steps,
    source: [
      createSource('KEC', '212.3', { edition: '2021' }),
      createSource('IEC', '60947-2', { edition: '2020' }),
    ],
    judgment,
    additionalOutputs: {
      minimumRating: { value: round(Ib, 2), unit: 'A' },
      selectedRating: { value: selectedRating, unit: 'A' },
      requiredBreakingCapacity: { value: round(Isc_kA, 2), unit: 'kA' },
      selectedBreakingCapacity: { value: selectedBreaking, unit: 'kA' },
    },
  };
}
