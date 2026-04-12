/**
 * Receipt Data Types
 *
 * PART 1: Core receipt types for calculation audit trail
 * PART 2: Lightweight meta type for list views
 * PART 3: Export data structures (PDF / Excel)
 */

import type { CalcStep, DifficultyLevel } from '@engine/calculators/types';
import type { CalcResult } from '@engine/standards/types';

// ---------------------------------------------------------------------------
// PART 1 — Unit system enum (SI / Imperial)
// ---------------------------------------------------------------------------
export type UnitSystem = 'SI' | 'Imperial';

// ---------------------------------------------------------------------------
// PART 2 — Full Receipt
// ---------------------------------------------------------------------------
export interface Receipt {
  /** UUIDv4 receipt identifier */
  id: string;
  /** Calculator ID that produced this result */
  calcId: string;
  /** Authenticated user (optional for anonymous calcs) */
  userId?: string;
  /** Project grouping (optional) */
  projectId?: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "KR", "US" */
  countryCode: string;
  /** Primary standard applied, e.g. "KEC", "NEC 2023" */
  appliedStandard: string;
  /** SI or Imperial */
  unitSystem: UnitSystem;
  /** Calculator difficulty tier */
  difficultyLevel: DifficultyLevel;

  /** Raw input parameters snapshot */
  inputs: Record<string, unknown>;
  /** Primary calculation result */
  result: CalcResult;
  /** Ordered derivation steps */
  steps: CalcStep[];
  /** LaTeX formula string for the primary result */
  formulaUsed: string;
  /** All standards/clauses referenced during calculation */
  standardsUsed: string[];

  /** 0-1 confidence for unit-converted values (undefined if no conversion) */
  conversionConfidence?: number;

  /** Non-blocking caution messages */
  warnings: string[];
  /** Actionable suggestions */
  recommendations: string[];

  /** Localized disclaimer body text */
  disclaimerText: string;
  /** Disclaimer template version, e.g. "v3.1" */
  disclaimerVersion: string;

  /** ISO-8601 timestamp of calculation */
  calculatedAt: string;
  /** Standard edition string, e.g. "KEC 2021" */
  standardVersion: string;
  /** ISO-8601 date when standard mapping was last verified */
  standardVerifiedAt?: string;
  /** ESVA engine semver */
  engineVersion: string;
  /** Whether the applied standard edition is still current */
  isStandardCurrent: boolean;

  /** SHA-256 hex digest of canonical(inputs + result) */
  receiptHash: string;
  /** Short token for shareable links */
  shareToken?: string;
  /** Whether this receipt is publicly accessible */
  isPublic: boolean;
}

// ---------------------------------------------------------------------------
// PART 3 — Lightweight meta for list views / search indexes
// ---------------------------------------------------------------------------
export interface ReceiptMeta {
  id: string;
  calcId: string;
  countryCode: string;
  appliedStandard: string;
  difficultyLevel: DifficultyLevel;
  calculatedAt: string;
  engineVersion: string;
  isStandardCurrent: boolean;
  /** One-line summary, e.g. "Single-phase power: 2.3 kW" */
  summary: string;
}

// ---------------------------------------------------------------------------
// PART 4 — PDF export data structure
// ---------------------------------------------------------------------------
export interface PdfReceiptData {
  header: {
    logoUrl: string;
    title: string;
    subtitle: string;
    dateFormatted: string;
    receiptHash: string;
    receiptId: string;
  };
  meta: {
    calcId: string;
    standard: string;
    standardVersion: string;
    countryCode: string;
    unitSystem: UnitSystem;
    difficulty: DifficultyLevel;
    engineVersion: string;
    isStandardCurrent: boolean;
  };
  formulaLatex: string;
  inputsTable: Array<{ label: string; value: string; unit: string }>;
  stepsTable: Array<{
    step: number;
    title: string;
    formula: string;
    value: string;
    unit: string;
    standardRef?: string;
  }>;
  result: {
    value: string;
    unit: string;
    judgment?: string;
  };
  globalComparison?: {
    country: string;
    standard: string;
    resultValue: string;
    difference: string;
  }[];
  warnings: string[];
  recommendations: string[];
  disclaimer: string;
  copyrightNotice: string;
  watermarkText: string;
}

// ---------------------------------------------------------------------------
// PART 5 — Excel export data structure
// ---------------------------------------------------------------------------
export interface ExcelReceiptData {
  /** Sheet1: calculation data with live formulas */
  calculationSheet: {
    title: string;
    inputRows: Array<{ label: string; value: number | string; unit: string; cellRef: string }>;
    formulaRows: Array<{
      step: number;
      title: string;
      /** Excel formula string, e.g. "=B3*B4" */
      excelFormula: string;
      displayValue: number;
      unit: string;
    }>;
    resultRow: { label: string; excelFormula: string; displayValue: number; unit: string };
  };
  /** Sheet2: metadata and disclaimer */
  metaSheet: {
    pairs: Array<{ key: string; value: string }>;
    disclaimerText: string;
    copyrightNotice: string;
  };
}
