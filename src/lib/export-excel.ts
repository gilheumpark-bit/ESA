/**
 * Excel / CSV Receipt Generator (Browser-compatible)
 *
 * Two output modes:
 *   1. CSV with formulas (lightweight, universal)
 *   2. XLSX via simple XML Spreadsheet (no external libs)
 *
 * PART 1: Types
 * PART 2: CSV generator
 * PART 3: XML Spreadsheet (XLSX-compatible) generator
 * PART 4: Public API
 */

import type { Receipt } from '@/engine/receipt/types';
import { buildExcelData } from '@/engine/receipt/export-pdf';

// ---------------------------------------------------------------------------
// PART 1 -- Types
// ---------------------------------------------------------------------------

interface ExcelGeneratorOptions {
  /** Include live Excel formulas instead of static values */
  liveFormulas?: boolean;
}

// ---------------------------------------------------------------------------
// PART 2 -- CSV generator
// ---------------------------------------------------------------------------

function escapeCsvCell(val: string | number): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsvContent(receipt: Receipt, opts: ExcelGeneratorOptions = {}): string {
  const data = buildExcelData(receipt);
  const lines: string[] = [];

  // Title row
  lines.push(escapeCsvCell(data.calculationSheet.title));
  lines.push('');

  // Input parameters header
  lines.push(['Parameter', 'Value', 'Unit', 'Cell Ref'].map(escapeCsvCell).join(','));

  // Input rows
  for (const row of data.calculationSheet.inputRows) {
    lines.push(
      [row.label, row.value, row.unit, row.cellRef].map((v) => escapeCsvCell(String(v))).join(','),
    );
  }

  lines.push('');

  // Steps header
  lines.push(['Step', 'Title', 'Formula', 'Value', 'Unit'].map(escapeCsvCell).join(','));

  // Step rows
  for (const row of data.calculationSheet.formulaRows) {
    const formulaOrValue = opts.liveFormulas ? row.excelFormula : String(row.displayValue);
    lines.push(
      [row.step, row.title, formulaOrValue, row.displayValue, row.unit]
        .map((v) => escapeCsvCell(String(v)))
        .join(','),
    );
  }

  lines.push('');

  // Result row
  const resultFormula = opts.liveFormulas
    ? data.calculationSheet.resultRow.excelFormula
    : String(data.calculationSheet.resultRow.displayValue);
  lines.push(
    ['RESULT', resultFormula, data.calculationSheet.resultRow.unit]
      .map((v) => escapeCsvCell(String(v)))
      .join(','),
  );

  lines.push('');
  lines.push('');

  // Meta sheet
  lines.push('--- Meta ---');
  for (const pair of data.metaSheet.pairs) {
    lines.push([pair.key, pair.value].map(escapeCsvCell).join(','));
  }

  lines.push('');
  lines.push('--- Disclaimer ---');
  lines.push(escapeCsvCell(data.metaSheet.disclaimerText));
  lines.push('');
  lines.push(escapeCsvCell(data.metaSheet.copyrightNotice));

  return lines.join('\r\n');
}

// ---------------------------------------------------------------------------
// PART 3 -- XML Spreadsheet (Office Open XML-compatible)
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildXmlCell(value: string | number, isFormula = false): string {
  if (isFormula && typeof value === 'string' && value.startsWith('=')) {
    // XML Spreadsheet formula format
    return `<Cell ss:Formula="${escapeXml(value)}"><Data ss:Type="Number">0</Data></Cell>`;
  }
  if (typeof value === 'number') {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${escapeXml(String(value))}</Data></Cell>`;
}

function buildXmlRow(cells: Array<{ value: string | number; formula?: boolean }>): string {
  const cellsXml = cells.map((c) => buildXmlCell(c.value, c.formula)).join('');
  return `<Row>${cellsXml}</Row>`;
}

function buildXmlSpreadsheet(receipt: Receipt, opts: ExcelGeneratorOptions = {}): string {
  const data = buildExcelData(receipt);
  const _rows: string[] = [];

  // --- Sheet 1: Calculation ---
  const calcRows: string[] = [];

  // Title
  calcRows.push(buildXmlRow([{ value: data.calculationSheet.title }]));
  calcRows.push('<Row/>'); // blank row

  // Input header
  calcRows.push(
    buildXmlRow([
      { value: 'Parameter' },
      { value: 'Value' },
      { value: 'Unit' },
    ]),
  );

  // Input data
  for (const row of data.calculationSheet.inputRows) {
    calcRows.push(
      buildXmlRow([
        { value: row.label },
        { value: row.value },
        { value: row.unit },
      ]),
    );
  }

  calcRows.push('<Row/>');

  // Steps header
  calcRows.push(
    buildXmlRow([
      { value: 'Step' },
      { value: 'Title' },
      { value: 'Formula / Value' },
      { value: 'Display Value' },
      { value: 'Unit' },
    ]),
  );

  // Step data
  for (const row of data.calculationSheet.formulaRows) {
    calcRows.push(
      buildXmlRow([
        { value: row.step },
        { value: row.title },
        { value: opts.liveFormulas ? row.excelFormula : row.displayValue, formula: opts.liveFormulas },
        { value: row.displayValue },
        { value: row.unit },
      ]),
    );
  }

  calcRows.push('<Row/>');

  // Result
  calcRows.push(
    buildXmlRow([
      { value: 'RESULT' },
      {
        value: opts.liveFormulas
          ? data.calculationSheet.resultRow.excelFormula
          : data.calculationSheet.resultRow.displayValue,
        formula: opts.liveFormulas,
      },
      { value: data.calculationSheet.resultRow.unit },
    ]),
  );

  // --- Sheet 2: Meta ---
  const metaRows: string[] = [];
  metaRows.push(buildXmlRow([{ value: 'ESVA Calculation Metadata' }]));
  metaRows.push('<Row/>');

  for (const pair of data.metaSheet.pairs) {
    metaRows.push(buildXmlRow([{ value: pair.key }, { value: pair.value }]));
  }

  metaRows.push('<Row/>');
  metaRows.push(buildXmlRow([{ value: 'Disclaimer' }]));
  metaRows.push(buildXmlRow([{ value: data.metaSheet.disclaimerText }]));
  metaRows.push('<Row/>');
  metaRows.push(buildXmlRow([{ value: data.metaSheet.copyrightNotice }]));

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Font ss:FontName="Pretendard" ss:Size="10"/>
    </Style>
    <Style ss:ID="Header">
      <Font ss:FontName="Pretendard" ss:Size="10" ss:Bold="1"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Title">
      <Font ss:FontName="Pretendard" ss:Size="14" ss:Bold="1" ss:Color="#2563EB"/>
    </Style>
    <Style ss:ID="Result">
      <Font ss:FontName="Pretendard" ss:Size="16" ss:Bold="1" ss:Color="#1E40AF"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Calculation">
    <Table>
      ${calcRows.join('\n      ')}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="Meta">
    <Table>
      ${metaRows.join('\n      ')}
    </Table>
  </Worksheet>
</Workbook>`;
}

// ---------------------------------------------------------------------------
// PART 4 -- Public API
// ---------------------------------------------------------------------------

/**
 * Generate a CSV string with optional live Excel formulas.
 */
export function generateReceiptCSV(
  receipt: Receipt,
  opts: ExcelGeneratorOptions = {},
): string {
  return buildCsvContent(receipt, opts);
}

/**
 * Generate a CSV Blob for download.
 */
export async function generateReceiptCSVBlob(
  receipt: Receipt,
  opts: ExcelGeneratorOptions = {},
): Promise<Blob> {
  // UTF-8 BOM for Korean/CJK support in Excel
  const BOM = '\uFEFF';
  const csv = BOM + buildCsvContent(receipt, opts);
  return new Blob([csv], { type: 'text/csv;charset=utf-8' });
}

/**
 * Generate an XML Spreadsheet (.xls) that opens natively in Excel.
 * This is an Office Open XML format that Excel recognizes without additional libraries.
 */
export async function generateReceiptExcel(
  receipt: Receipt,
  opts: ExcelGeneratorOptions = { liveFormulas: true },
): Promise<Blob> {
  const xml = buildXmlSpreadsheet(receipt, opts);
  return new Blob([xml], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
}

/**
 * Return raw XML Spreadsheet string (for server-side streaming).
 */
export function generateReceiptExcelXML(
  receipt: Receipt,
  opts: ExcelGeneratorOptions = { liveFormulas: true },
): string {
  return buildXmlSpreadsheet(receipt, opts);
}
