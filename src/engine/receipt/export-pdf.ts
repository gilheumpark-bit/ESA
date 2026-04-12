/**
 * PDF / Excel Receipt Data Builders
 *
 * These functions transform a Receipt into structured data objects
 * that can be fed to a PDF renderer (e.g. pdfmake, puppeteer) or
 * an Excel writer (e.g. ExcelJS, SheetJS). They do NOT perform
 * actual file generation -- that is the responsibility of the caller.
 *
 * PART 1: buildPdfData
 * PART 2: buildExcelData
 */

import type { Receipt, PdfReceiptData, ExcelReceiptData } from './types';
import { getCopyrightNotice } from './disclaimer';
import type { DisclaimerLang } from './disclaimer';

// ---------------------------------------------------------------------------
// PART 1 — PDF data builder
// ---------------------------------------------------------------------------

const TITLE_MAP: Record<string, string> = {
  ko: 'ESVA 계산서',
  en: 'ESVA Calculation Report',
  ja: 'ESVA 計算書',
  zh: 'ESVA 计算报告',
};

const SUBTITLE_MAP: Record<string, string> = {
  ko: '전기 설계 자동 계산 결과',
  en: 'Automated Electrical Design Calculation',
  ja: '電気設計自動計算結果',
  zh: '电气设计自动计算结果',
};

const WATERMARK_MAP: Record<string, string> = {
  ko: '참고용 — 최종 검토 필요',
  en: 'FOR REFERENCE ONLY — REQUIRES FINAL REVIEW',
  ja: '参考用 — 最終レビュー必要',
  zh: '仅供参考 — 需最终审核',
};

function formatDate(iso: string, lang: DisclaimerLang): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');

  switch (lang) {
    case 'ko':
      return `${yyyy}년 ${mm}월 ${dd}일`;
    case 'ja':
      return `${yyyy}年${mm}月${dd}日`;
    case 'zh':
      return `${yyyy}年${mm}月${dd}日`;
    default:
      return `${yyyy}-${mm}-${dd}`;
  }
}

function formatInputValue(v: unknown): string {
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/**
 * Build a structured data object suitable for PDF generation.
 */
export function buildPdfData(
  receipt: Receipt,
  lang: DisclaimerLang = 'ko',
): PdfReceiptData {
  const inputsTable = Object.entries(receipt.inputs).map(([key, val]) => ({
    label: key,
    value: formatInputValue(val),
    unit: '', // caller can enrich from calculator metadata
  }));

  const stepsTable = receipt.steps.map((s) => ({
    step: s.step,
    title: s.title,
    formula: s.formula,
    value: String(s.value),
    unit: s.unit,
    standardRef: s.standardRef,
  }));

  const resultDisplay =
    receipt.result.value !== null && receipt.result.value !== undefined
      ? String(receipt.result.value)
      : 'N/A';

  return {
    header: {
      logoUrl: '/assets/esa-logo.svg',
      title: TITLE_MAP[lang] ?? TITLE_MAP.en,
      subtitle: SUBTITLE_MAP[lang] ?? SUBTITLE_MAP.en,
      dateFormatted: formatDate(receipt.calculatedAt, lang),
      receiptHash: receipt.receiptHash,
      receiptId: receipt.id,
    },
    meta: {
      calcId: receipt.calcId,
      standard: receipt.appliedStandard,
      standardVersion: receipt.standardVersion,
      countryCode: receipt.countryCode,
      unitSystem: receipt.unitSystem,
      difficulty: receipt.difficultyLevel,
      engineVersion: receipt.engineVersion,
      isStandardCurrent: receipt.isStandardCurrent,
    },
    formulaLatex: receipt.formulaUsed,
    inputsTable,
    stepsTable,
    result: {
      value: resultDisplay,
      unit: receipt.result.unit,
      judgment: receipt.result.judgment?.message,
    },
    globalComparison: undefined, // populated by caller when cross-country data is available
    warnings: receipt.warnings,
    recommendations: receipt.recommendations,
    disclaimer: receipt.disclaimerText,
    copyrightNotice: getCopyrightNotice(lang),
    watermarkText: WATERMARK_MAP[lang] ?? WATERMARK_MAP.en,
  };
}

// ---------------------------------------------------------------------------
// PART 2 — Excel data builder
// ---------------------------------------------------------------------------

/**
 * Build structured data for an Excel workbook with live formulas.
 *
 * Sheet1 (Calculation):
 *   - Input rows with cell references (B3, B4, ...)
 *   - Formula rows that reference input cells
 *   - Final result row
 *
 * Sheet2 (Meta / Disclaimer):
 *   - Key-value pairs of receipt metadata
 *   - Full disclaimer text
 */
export function buildExcelData(receipt: Receipt): ExcelReceiptData {
  // Map inputs to rows starting at row 3 (row 1 = title, row 2 = header)
  const inputEntries = Object.entries(receipt.inputs);
  const inputRows = inputEntries.map(([key, val], idx) => ({
    label: key,
    value: typeof val === 'number' ? val : String(val ?? ''),
    unit: '',
    cellRef: `B${idx + 3}`,
  }));

  // Formula rows reference input cells via Excel formulas
  const formulaStartRow = inputRows.length + 4; // gap row after inputs
  const formulaRows = receipt.steps.map((s, _idx) => ({
    step: s.step,
    title: s.title,
    // Placeholder Excel formula — caller should replace with real cell refs
    excelFormula: `=ROUND(${s.value},4)`,
    displayValue: s.value,
    unit: s.unit,
  }));

  const lastFormulaRow = formulaStartRow + formulaRows.length - 1;
  const resultValue =
    typeof receipt.result.value === 'number' ? receipt.result.value : 0;

  const resultRow = {
    label: 'Result',
    excelFormula: formulaRows.length > 0 ? `=B${lastFormulaRow}` : `=${resultValue}`,
    displayValue: resultValue,
    unit: receipt.result.unit,
  };

  // Meta pairs for Sheet2
  const pairs: Array<{ key: string; value: string }> = [
    { key: 'Receipt ID', value: receipt.id },
    { key: 'Calculator', value: receipt.calcId },
    { key: 'Standard', value: `${receipt.appliedStandard} (${receipt.standardVersion})` },
    { key: 'Country', value: receipt.countryCode },
    { key: 'Unit System', value: receipt.unitSystem },
    { key: 'Difficulty', value: receipt.difficultyLevel },
    { key: 'Calculated At', value: receipt.calculatedAt },
    { key: 'Engine Version', value: receipt.engineVersion },
    { key: 'Standard Current', value: receipt.isStandardCurrent ? 'Yes' : 'No' },
    { key: 'Receipt Hash', value: receipt.receiptHash },
    { key: 'Disclaimer Version', value: receipt.disclaimerVersion },
  ];

  return {
    calculationSheet: {
      title: `ESVA Calculation — ${receipt.calcId}`,
      inputRows,
      formulaRows,
      resultRow,
    },
    metaSheet: {
      pairs,
      disclaimerText: receipt.disclaimerText,
      copyrightNotice: getCopyrightNotice('en'),
    },
  };
}
