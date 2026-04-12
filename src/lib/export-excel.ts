/**
 * ESVA 계산서 Excel/CSV 내보내기
 *
 * PART 1: Excel 생성 (exceljs — 실제 OpenXML .xlsx)
 * PART 2: CSV 생성
 * PART 3: Receipt → Excel 데이터 변환 유틸
 */

import ExcelJS from 'exceljs';

interface ExportOptions {
  liveFormulas?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReceiptData = Record<string, any>;

// ---------------------------------------------------------------------------
// PART 1 — Excel 생성
// ---------------------------------------------------------------------------

const HEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E40AF' }, // 파란 배경
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
};
const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  bottom: { style: 'thin' },
  left: { style: 'thin' },
  right: { style: 'thin' },
};

export async function generateReceiptExcel(
  receipt: ReceiptData,
  options?: ExportOptions
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ESVA — The Engineer\'s Search Engine';
  wb.created = new Date();

  // ── Sheet 1: 계산서 ──
  const ws1 = wb.addWorksheet('계산서', {
    properties: { defaultColWidth: 18 },
  });

  // 제목 행
  ws1.mergeCells('A1:D1');
  const titleCell = ws1.getCell('A1');
  titleCell.value = `ESVA 계산서 — ${receipt.calcId || 'N/A'}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF1E40AF' } };
  titleCell.alignment = { horizontal: 'center' };

  // 기본 정보
  ws1.getCell('A2').value = '생성일시';
  ws1.getCell('B2').value = receipt.calculatedAt || new Date().toISOString();
  ws1.getCell('C2').value = '기준서';
  ws1.getCell('D2').value = receipt.appliedStandard || 'N/A';

  // ── 입력값 테이블 ──
  let row = 4;
  ws1.getCell(`A${row}`).value = '입력값';
  ws1.getCell(`A${row}`).font = { bold: true, size: 12 };
  row++;

  const inputHeader = ws1.getRow(row);
  ['항목', '값', '단위'].forEach((h, i) => {
    const cell = inputHeader.getCell(i + 1);
    cell.value = h;
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = BORDER_THIN;
  });
  row++;

  const inputs = receipt.inputs || {};
  const inputStartRow = row;
  for (const [key, value] of Object.entries(inputs)) {
    const r = ws1.getRow(row);
    r.getCell(1).value = key;
    r.getCell(2).value = typeof value === 'number' ? value : String(value ?? '');
    r.getCell(3).value = '';
    [1, 2, 3].forEach((c) => { r.getCell(c).border = BORDER_THIN; });
    row++;
  }

  // ── 계산 단계 테이블 ──
  row++;
  ws1.getCell(`A${row}`).value = '계산 단계';
  ws1.getCell(`A${row}`).font = { bold: true, size: 12 };
  row++;

  const stepHeader = ws1.getRow(row);
  ['단계', '제목', '수식', '값', '단위', '기준서'].forEach((h, i) => {
    const cell = stepHeader.getCell(i + 1);
    cell.value = h;
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = BORDER_THIN;
  });
  row++;

  const steps: Array<{ step: number; title: string; formula: string; value: number; unit: string; standardRef?: string }> = receipt.steps || [];
  for (const s of steps) {
    const r = ws1.getRow(row);
    r.getCell(1).value = s.step;
    r.getCell(2).value = s.title;
    r.getCell(3).value = s.formula;
    r.getCell(4).value = s.value;
    r.getCell(5).value = s.unit;
    r.getCell(6).value = s.standardRef || '';
    [1, 2, 3, 4, 5, 6].forEach((c) => { r.getCell(c).border = BORDER_THIN; });
    row++;
  }

  // ── 최종 결과 ──
  row++;
  const resultRow = ws1.getRow(row);
  resultRow.getCell(1).value = '최종 결과';
  resultRow.getCell(1).font = { bold: true, size: 12 };

  const result = receipt.result || {};
  if (options?.liveFormulas && steps.length > 0 && typeof inputStartRow === 'number') {
    // 라이브 수식: 마지막 단계의 값을 참조
    const lastStepRow = row - 2; // 마지막 step 행
    resultRow.getCell(2).value = { formula: `D${lastStepRow}` } as ExcelJS.CellFormulaValue;
  } else {
    resultRow.getCell(2).value = result.value ?? 'N/A';
  }
  resultRow.getCell(3).value = result.unit || '';
  resultRow.getCell(4).value = result.judgment || '';
  resultRow.getCell(1).border = BORDER_THIN;
  resultRow.getCell(2).border = BORDER_THIN;
  resultRow.getCell(2).font = { bold: true, size: 13, color: { argb: 'FF16A34A' } };
  resultRow.getCell(3).border = BORDER_THIN;

  // 열 너비 조정
  ws1.getColumn(1).width = 16;
  ws1.getColumn(2).width = 28;
  ws1.getColumn(3).width = 36;
  ws1.getColumn(4).width = 14;
  ws1.getColumn(5).width = 10;
  ws1.getColumn(6).width = 14;

  // ── Sheet 2: 메타정보 ──
  const ws2 = wb.addWorksheet('메타정보');

  const metaPairs: [string, string][] = [
    ['Receipt ID', receipt.id || 'N/A'],
    ['Calculator', receipt.calcId || 'N/A'],
    ['기준서', receipt.appliedStandard || 'N/A'],
    ['기준서 버전', receipt.standardVersion || 'N/A'],
    ['국가', receipt.countryCode || 'N/A'],
    ['단위계', receipt.unitSystem || 'SI'],
    ['난이도', receipt.difficultyLevel || 'N/A'],
    ['엔진 버전', receipt.engineVersion || 'N/A'],
    ['기준서 현행', receipt.isStandardCurrent ? '예' : '아니오'],
    ['생성일시', receipt.calculatedAt || new Date().toISOString()],
    ['SHA-256 해시', receipt.receiptHash || 'N/A'],
  ];

  const metaHeader = ws2.getRow(1);
  ['항목', '값'].forEach((h, i) => {
    const cell = metaHeader.getCell(i + 1);
    cell.value = h;
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = BORDER_THIN;
  });

  metaPairs.forEach(([key, value], i) => {
    const r = ws2.getRow(i + 2);
    r.getCell(1).value = key;
    r.getCell(2).value = value;
    [1, 2].forEach((c) => { r.getCell(c).border = BORDER_THIN; });
  });

  // 면책조항
  const disclaimerRow = metaPairs.length + 3;
  ws2.getCell(`A${disclaimerRow}`).value = '면책조항';
  ws2.getCell(`A${disclaimerRow}`).font = { bold: true };
  ws2.mergeCells(`A${disclaimerRow + 1}:B${disclaimerRow + 3}`);
  ws2.getCell(`A${disclaimerRow + 1}`).value = receipt.disclaimerText || 'PE 검토 필요. 본 계산서는 참고용이며 안전 관련 최종 결정에 사용할 수 없습니다.';
  ws2.getCell(`A${disclaimerRow + 1}`).alignment = { wrapText: true, vertical: 'top' };

  // 경고 및 권고
  const warnings: string[] = receipt.warnings || [];
  const recommendations: string[] = receipt.recommendations || [];
  if (warnings.length > 0 || recommendations.length > 0) {
    let wRow = disclaimerRow + 5;
    if (warnings.length > 0) {
      ws2.getCell(`A${wRow}`).value = '경고';
      ws2.getCell(`A${wRow}`).font = { bold: true, color: { argb: 'FFDC2626' } };
      wRow++;
      for (const w of warnings) {
        ws2.getCell(`A${wRow}`).value = w;
        wRow++;
      }
    }
    if (recommendations.length > 0) {
      ws2.getCell(`A${wRow}`).value = '권고사항';
      ws2.getCell(`A${wRow}`).font = { bold: true, color: { argb: 'FFF59E0B' } };
      wRow++;
      for (const rec of recommendations) {
        ws2.getCell(`A${wRow}`).value = rec;
        wRow++;
      }
    }
  }

  ws2.getColumn(1).width = 20;
  ws2.getColumn(2).width = 50;

  // Buffer → Blob
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ---------------------------------------------------------------------------
// PART 2 — CSV 생성
// ---------------------------------------------------------------------------

export async function generateReceiptCSVBlob(
  receipt: ReceiptData,
  _options?: ExportOptions
): Promise<Blob> {
  const csv = receiptToCSV(receipt);
  return new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
}

function receiptToCSV(receipt: ReceiptData): string {
  const rows: string[] = ['구분,항목,값,단위'];

  // 입력값
  const inputs = receipt.inputs || {};
  for (const [key, value] of Object.entries(inputs)) {
    rows.push(`"입력","${key}","${String(value ?? '').replace(/"/g, '""')}",""`);
  }

  // 계산 단계
  const steps = receipt.steps || [];
  for (const s of steps) {
    rows.push(`"단계 ${s.step}","${s.title}","${s.value}","${s.unit}"`);
  }

  // 최종 결과
  const result = receipt.result || {};
  rows.push(`"결과","최종값","${result.value ?? ''}","${result.unit ?? ''}"`);

  // 메타
  rows.push(`"메타","기준서","${receipt.appliedStandard ?? ''}",""`);
  rows.push(`"메타","SHA-256","${receipt.receiptHash ?? ''}",""`);
  rows.push(`"메타","생성일","${receipt.calculatedAt ?? ''}",""`);

  return rows.join('\n');
}
