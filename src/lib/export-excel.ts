/** ESVA 계산서 Excel/CSV 내보내기 */

interface ExportOptions {
  liveFormulas?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReceiptData = Record<string, any>;

/** Excel Blob 생성 (간이 CSV 기반 — 프로덕션에서는 exceljs 등 활용) */
export async function generateReceiptExcel(
  receipt: ReceiptData,
  _options?: ExportOptions
): Promise<Blob> {
  const csv = receiptToCSV(receipt);
  return new Blob([csv], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** CSV Blob 생성 */
export async function generateReceiptCSVBlob(
  receipt: ReceiptData,
  _options?: ExportOptions
): Promise<Blob> {
  const csv = receiptToCSV(receipt);
  return new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
}

function receiptToCSV(receipt: ReceiptData): string {
  const rows: string[] = ['Key,Value'];
  for (const [key, value] of Object.entries(receipt)) {
    const escaped = String(value ?? '').replace(/"/g, '""');
    rows.push(`"${key}","${escaped}"`);
  }
  return rows.join('\n');
}
