/**
 * Receipt Module — Barrel Export
 */

// Types
export type {
  Receipt,
  ReceiptMeta,
  UnitSystem,
  PdfReceiptData,
  ExcelReceiptData,
} from './types';

// Receipt generation
export { generateReceipt, ENGINE_VERSION } from './receipt-generator';
export type { GenerateReceiptOpts } from './receipt-generator';

// Hash / integrity
export { hashReceipt, verifyReceipt, canonicalize } from './receipt-hash';

// Disclaimer system
export {
  getDisclaimer,
  getCopyrightNotice,
  getLegalVerifiedAt,
  DISCLAIMER_VERSION,
} from './disclaimer';
export type { DisclaimerLang } from './disclaimer';

// Export data builders
export { buildPdfData, buildExcelData } from './export-pdf';
