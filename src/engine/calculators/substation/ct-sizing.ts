/**
 * CT (Current Transformer) Sizing Calculator
 *
 * Formulae:
 *   CT primary >=  Imax x 1.25
 *   Lead burden:   VA_lead = I_sec^2 x 2 x rho x L / A
 *   Total burden:  VA_total = VA_relay + VA_lead + VA_contact
 *   Margin:        margin = (VA_rated - VA_total) / VA_rated x 100  [%]
 *
 * Standards: KEC 340 (계기용 변성기), IEC 61869-2
 */

import { createSource, createJudgment } from '@engine/sjc/types';
import {
  DetailedCalcResult,
  CalcStep,
  assertPositive,
  assertOneOf,
  round,
} from '../types';

// ── Input / Output ──────────────────────────────────────────────────────────

export type AccuracyClass = '0.2' | '0.5' | '1.0' | '5P' | '10P';

export interface CTSizingInput {
  /** Maximum load current in Amperes */
  maxLoadCurrent: number;
  /** Relay burden in VA */
  relayBurden: number;
  /** One-way lead length in meters */
  leadLength: number;
  /** Lead conductor size in mm^2 */
  leadSize: number;
  /** CT accuracy class */
  accuracyClass: AccuracyClass;
}

// ── Standard CT ratios ─────────────────────────────────────────────────────

const CT_PRIMARIES = [
  5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200, 250, 300,
  400, 500, 600, 750, 800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000,
];

// Standard CT burden ratings by accuracy class (VA)
const CT_BURDENS: Record<AccuracyClass, number[]> = {
  '0.2': [2.5, 5, 10, 15],
  '0.5': [2.5, 5, 10, 15, 30],
  '1.0': [2.5, 5, 10, 15, 30],
  '5P':  [5, 10, 15, 30, 45, 60],
  '10P': [5, 10, 15, 30, 45, 60],
};

// Copper resistivity [ohm.mm^2/m]
const RHO_CU = 0.0178;

function selectCTPrimary(minPrimary: number): number {
  for (const ct of CT_PRIMARIES) {
    if (ct >= minPrimary) return ct;
  }
  return CT_PRIMARIES[CT_PRIMARIES.length - 1];
}

function selectCTBurden(accuracyClass: AccuracyClass, minBurden: number): number {
  const burdens = CT_BURDENS[accuracyClass];
  for (const b of burdens) {
    if (b >= minBurden) return b;
  }
  return burdens[burdens.length - 1];
}

// ── Calculator ──────────────────────────────────────────────────────────────

export function calculateCTSizing(input: CTSizingInput): DetailedCalcResult {
  // PART 1 -- Validation
  assertPositive(input.maxLoadCurrent, 'maxLoadCurrent');
  assertPositive(input.relayBurden, 'relayBurden');
  assertPositive(input.leadLength, 'leadLength');
  assertPositive(input.leadSize, 'leadSize');
  assertOneOf(
    input.accuracyClass,
    ['0.2', '0.5', '1.0', '5P', '10P'] as const,
    'accuracyClass',
  );

  const { maxLoadCurrent, relayBurden, leadLength, leadSize, accuracyClass } = input;

  // PART 2 -- Derivation
  const steps: CalcStep[] = [];
  const Isec = 5; // Standard secondary current

  // Step 1: CT primary selection
  const minPrimary = maxLoadCurrent * 1.25;
  const ctPrimary = selectCTPrimary(minPrimary);
  const ctRatio = `${ctPrimary}/${Isec}`;
  steps.push({
    step: 1,
    title: 'CT 1차측 선정 (CT primary selection)',
    formula: `CT_{primary} \\geq I_{max} \\times 1.25 = ${round(minPrimary, 1)}`,
    value: ctPrimary,
    unit: `A (${ctRatio})`,
    standardRef: 'IEC 61869-2',
  });

  // Step 2: Lead wire burden (2-way length for single-phase CT circuit)
  const Rlead = (2 * RHO_CU * leadLength) / leadSize;
  const VALead = Isec * Isec * Rlead;
  steps.push({
    step: 2,
    title: '리드선 부담 (Lead wire burden)',
    formula: 'VA_{lead} = I_s^2 \\times \\frac{2 \\rho L}{A}',
    value: round(VALead, 2),
    unit: 'VA',
  });

  // Step 3: Contact resistance burden (estimated 0.1 ohm typical)
  const Rcontact = 0.1;
  const VAContact = Isec * Isec * Rcontact;
  steps.push({
    step: 3,
    title: '접촉저항 부담 (Contact resistance burden)',
    formula: 'VA_{contact} = I_s^2 \\times R_{contact}',
    value: round(VAContact, 2),
    unit: 'VA',
  });

  // Step 4: Total actual burden
  const totalBurden = relayBurden + VALead + VAContact;
  steps.push({
    step: 4,
    title: '총 실제 부담 (Total actual burden)',
    formula: 'VA_{total} = VA_{relay} + VA_{lead} + VA_{contact}',
    value: round(totalBurden, 2),
    unit: 'VA',
  });

  // Step 5: Select rated burden
  const ratedBurden = selectCTBurden(accuracyClass, totalBurden);
  steps.push({
    step: 5,
    title: 'CT 정격부담 선정 (Rated burden selection)',
    formula: `VA_{rated} \\geq VA_{total} = ${round(totalBurden, 2)}`,
    value: ratedBurden,
    unit: 'VA',
  });

  // Step 6: Margin
  const margin = ((ratedBurden - totalBurden) / ratedBurden) * 100;
  steps.push({
    step: 6,
    title: '여유율 (Burden margin)',
    formula: 'margin = \\frac{VA_{rated} - VA_{total}}{VA_{rated}} \\times 100',
    value: round(margin, 1),
    unit: '%',
  });

  // PART 3 -- Result assembly
  const pass = margin >= 0;
  return {
    value: ctPrimary,
    unit: ctRatio,
    formula: 'CT_{primary} \\geq I_{max} \\times 1.25',
    steps,
    source: [
      createSource('KEC', '340', { edition: '2021' }),
      createSource('IEC', '61869-2', { edition: '2012' }),
    ],
    judgment: createJudgment(
      pass,
      pass
        ? `CT ${ctRatio}, 정격부담 ${ratedBurden} VA, 실부담 ${round(totalBurden, 2)} VA (여유 ${round(margin, 1)}%)`
        : `CT ${ctRatio} -- 부담 초과! 실부담 ${round(totalBurden, 2)} VA > 정격 ${ratedBurden} VA`,
      pass ? 'info' : 'error',
    ),
    additionalOutputs: {
      ctRatio:       { value: ctPrimary,               unit: ctRatio },
      ratedBurden:   { value: ratedBurden,             unit: 'VA' },
      actualBurden:  { value: round(totalBurden, 2),   unit: 'VA' },
      marginPercent: { value: round(margin, 1),        unit: '%' },
    },
  };
}
