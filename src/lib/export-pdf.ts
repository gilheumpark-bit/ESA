/**
 * PDF Receipt Generator (Browser-compatible)
 *
 * Generates a printable HTML document that can be opened in a new window
 * and printed to PDF via window.print(). No external PDF library required.
 *
 * PART 1: Types & constants
 * PART 2: HTML template builder
 * PART 3: Public API (generateReceiptPDF)
 */

import type { Receipt } from '@/engine/receipt/types';
import { buildPdfData } from '@/engine/receipt/export-pdf';
import type { DisclaimerLang } from '@/engine/receipt/disclaimer';

// ---------------------------------------------------------------------------
// PART 1 -- Types & constants
// ---------------------------------------------------------------------------

type Lang = 'ko' | 'en' | 'ja' | 'zh';

const LABEL: Record<Lang, {
  meta: string;
  country: string;
  standard: string;
  difficulty: string;
  engine: string;
  formula: string;
  inputs: string;
  param: string;
  value: string;
  unit: string;
  steps: string;
  step: string;
  title: string;
  result: string;
  warnings: string;
  recommendations: string;
  disclaimer: string;
  copyright: string;
  stdRef: string;
  judgment: string;
  unitSystem: string;
  stdVersion: string;
  stdCurrent: string;
  yes: string;
  no: string;
}> = {
  ko: {
    meta: '계산 정보', country: '국가', standard: '규격', difficulty: '난이도',
    engine: '엔진 버전', formula: '적용 공식', inputs: '입력 파라미터',
    param: '파라미터', value: '값', unit: '단위', steps: '계산 과정',
    step: '단계', title: '항목', result: '계산 결과', warnings: '경고',
    recommendations: '권장 사항', disclaimer: '면책 조항', copyright: '저작권 안내',
    stdRef: '규격 조항', judgment: '판정', unitSystem: '단위계',
    stdVersion: '규격 버전', stdCurrent: '최신 규격 여부', yes: '예', no: '아니오',
  },
  en: {
    meta: 'Calculation Info', country: 'Country', standard: 'Standard',
    difficulty: 'Difficulty', engine: 'Engine Version', formula: 'Formula Applied',
    inputs: 'Input Parameters', param: 'Parameter', value: 'Value', unit: 'Unit',
    steps: 'Step-by-Step Calculation', step: 'Step', title: 'Title',
    result: 'Result', warnings: 'Warnings', recommendations: 'Recommendations',
    disclaimer: 'Disclaimer', copyright: 'Copyright Notice', stdRef: 'Standard Ref',
    judgment: 'Judgment', unitSystem: 'Unit System', stdVersion: 'Standard Version',
    stdCurrent: 'Standard Current', yes: 'Yes', no: 'No',
  },
  ja: {
    meta: '計算情報', country: '国', standard: '規格', difficulty: '難易度',
    engine: 'エンジンバージョン', formula: '適用公式', inputs: '入力パラメータ',
    param: 'パラメータ', value: '値', unit: '単位', steps: '計算過程',
    step: 'ステップ', title: '項目', result: '計算結果', warnings: '警告',
    recommendations: '推奨事項', disclaimer: '免責事項', copyright: '著作権表示',
    stdRef: '規格条項', judgment: '判定', unitSystem: '単位系',
    stdVersion: '規格バージョン', stdCurrent: '最新規格', yes: 'はい', no: 'いいえ',
  },
  zh: {
    meta: '计算信息', country: '国家', standard: '标准', difficulty: '难度',
    engine: '引擎版本', formula: '应用公式', inputs: '输入参数',
    param: '参数', value: '值', unit: '单位', steps: '计算过程',
    step: '步骤', title: '项目', result: '计算结果', warnings: '警告',
    recommendations: '建议', disclaimer: '免责声明', copyright: '版权声明',
    stdRef: '标准条款', judgment: '判定', unitSystem: '单位制',
    stdVersion: '标准版本', stdCurrent: '最新标准', yes: '是', no: '否',
  },
};

// ---------------------------------------------------------------------------
// PART 2 -- HTML template builder
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReceiptHtml(receipt: Receipt, lang: Lang): string {
  const data = buildPdfData(receipt, lang as DisclaimerLang);
  const L = LABEL[lang] ?? LABEL.en;

  // --- Meta table rows
  const metaRows = [
    [L.country, data.meta.countryCode],
    [L.standard, data.meta.standard],
    [L.stdVersion, data.meta.standardVersion],
    [L.unitSystem, data.meta.unitSystem],
    [L.difficulty, data.meta.difficulty],
    [L.engine, data.meta.engineVersion],
    [L.stdCurrent, data.meta.isStandardCurrent ? L.yes : L.no],
  ]
    .map(([k, v]) => `<tr><td class="meta-key">${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
    .join('');

  // --- Inputs table
  const inputRows = data.inputsTable
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.label)}</td><td class="val">${escapeHtml(r.value)}</td><td>${escapeHtml(r.unit)}</td></tr>`,
    )
    .join('');

  // --- Steps table
  const stepRows = data.stepsTable
    .map(
      (s) =>
        `<tr>` +
        `<td class="center">${s.step}</td>` +
        `<td>${escapeHtml(s.title)}</td>` +
        `<td class="mono">${escapeHtml(s.formula)}</td>` +
        `<td class="val">${escapeHtml(s.value)}</td>` +
        `<td>${escapeHtml(s.unit)}</td>` +
        `<td class="small">${escapeHtml(s.standardRef ?? '')}</td>` +
        `</tr>`,
    )
    .join('');

  // --- Warnings
  const warningsHtml =
    data.warnings.length > 0
      ? `<div class="section warnings">
           <h3>${escapeHtml(L.warnings)}</h3>
           <ul>${data.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
         </div>`
      : '';

  // --- Recommendations
  const recsHtml =
    data.recommendations.length > 0
      ? `<div class="section">
           <h3>${escapeHtml(L.recommendations)}</h3>
           <ul>${data.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
         </div>`
      : '';

  // --- Judgment
  const judgmentHtml = data.result.judgment
    ? `<p class="judgment">${escapeHtml(L.judgment)}: ${escapeHtml(data.result.judgment)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(data.header.title)}</title>
<style>
  @page { size: A4; margin: 15mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Pretendard', 'Noto Sans KR', 'Noto Sans JP', 'Noto Sans SC', -apple-system, sans-serif;
    font-size: 10pt; color: #1a1a1a; line-height: 1.5;
    padding: 12mm;
    position: relative;
  }
  /* Watermark */
  body::before {
    content: '${data.watermarkText.replace(/'/g, "\\'")}';
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-35deg);
    font-size: 48pt; font-weight: 700; color: rgba(200,200,200,0.18);
    white-space: nowrap; pointer-events: none; z-index: 0;
  }
  .container { position: relative; z-index: 1; max-width: 720px; margin: 0 auto; }

  /* Header */
  .header { border-bottom: 3px solid #2563eb; padding-bottom: 8px; margin-bottom: 16px; }
  .header h1 { font-size: 18pt; color: #2563eb; margin-bottom: 2px; }
  .header .subtitle { font-size: 10pt; color: #666; }
  .header .hash { font-family: monospace; font-size: 7pt; color: #999; margin-top: 4px; word-break: break-all; }
  .header .date { font-size: 9pt; color: #444; float: right; margin-top: -32px; }

  /* Section */
  .section { margin-bottom: 14px; }
  .section h3 { font-size: 11pt; color: #2563eb; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; margin-bottom: 6px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 8px; }
  th, td { border: 1px solid #d1d5db; padding: 4px 6px; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; color: #374151; }
  .meta-key { font-weight: 600; width: 140px; background: #f9fafb; }
  .val { font-family: 'JetBrains Mono', 'Consolas', monospace; text-align: right; }
  .mono { font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 8pt; }
  .center { text-align: center; }
  .small { font-size: 7.5pt; color: #6b7280; }

  /* Result box */
  .result-box {
    background: #eff6ff; border: 2px solid #2563eb; border-radius: 8px;
    padding: 12px 16px; text-align: center; margin: 14px 0;
  }
  .result-box .label { font-size: 10pt; color: #2563eb; font-weight: 600; }
  .result-box .value { font-size: 22pt; font-weight: 700; color: #1e40af; }
  .result-box .unit { font-size: 12pt; color: #3b82f6; margin-left: 6px; }
  .judgment { text-align: center; font-size: 9pt; color: #4b5563; margin-top: 4px; }

  /* Warnings */
  .warnings { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 8px 12px; border-radius: 4px; }
  .warnings h3 { color: #b45309; border-bottom-color: #fde68a; }
  .warnings ul { padding-left: 18px; }
  .warnings li { color: #92400e; margin-bottom: 2px; }

  /* Formula */
  .formula-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 12px; font-family: monospace; font-size: 9pt; white-space: pre-wrap; word-break: break-all; }

  /* Footer */
  .disclaimer { font-size: 7.5pt; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 16px; }
  .copyright { font-size: 7pt; color: #9ca3af; margin-top: 6px; }

  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="container">

  <!-- HEADER -->
  <div class="header">
    <h1>${escapeHtml(data.header.title)}</h1>
    <div class="subtitle">${escapeHtml(data.header.subtitle)}</div>
    <div class="date">${escapeHtml(data.header.dateFormatted)}</div>
    <div class="hash">ID: ${escapeHtml(data.header.receiptId)} | Hash: ${escapeHtml(data.header.receiptHash)}</div>
  </div>

  <!-- META -->
  <div class="section">
    <h3>${escapeHtml(L.meta)}</h3>
    <table><tbody>${metaRows}</tbody></table>
  </div>

  <!-- FORMULA -->
  <div class="section">
    <h3>${escapeHtml(L.formula)}</h3>
    <div class="formula-block">${escapeHtml(data.formulaLatex)}</div>
  </div>

  <!-- INPUT PARAMETERS -->
  <div class="section">
    <h3>${escapeHtml(L.inputs)}</h3>
    <table>
      <thead><tr><th>${escapeHtml(L.param)}</th><th>${escapeHtml(L.value)}</th><th>${escapeHtml(L.unit)}</th></tr></thead>
      <tbody>${inputRows}</tbody>
    </table>
  </div>

  <!-- STEPS -->
  <div class="section">
    <h3>${escapeHtml(L.steps)}</h3>
    <table>
      <thead>
        <tr>
          <th style="width:40px">${escapeHtml(L.step)}</th>
          <th>${escapeHtml(L.title)}</th>
          <th>${escapeHtml(L.formula)}</th>
          <th>${escapeHtml(L.value)}</th>
          <th>${escapeHtml(L.unit)}</th>
          <th>${escapeHtml(L.stdRef)}</th>
        </tr>
      </thead>
      <tbody>${stepRows}</tbody>
    </table>
  </div>

  <!-- RESULT -->
  <div class="result-box">
    <div class="label">${escapeHtml(L.result)}</div>
    <span class="value">${escapeHtml(data.result.value)}</span>
    <span class="unit">${escapeHtml(data.result.unit)}</span>
  </div>
  ${judgmentHtml}

  <!-- WARNINGS -->
  ${warningsHtml}

  <!-- RECOMMENDATIONS -->
  ${recsHtml}

  <!-- DISCLAIMER -->
  <div class="disclaimer">
    <strong>${escapeHtml(L.disclaimer)}</strong><br/>
    ${escapeHtml(data.disclaimer)}
  </div>

  <!-- COPYRIGHT -->
  <div class="copyright">
    <strong>${escapeHtml(L.copyright)}</strong><br/>
    ${escapeHtml(data.copyrightNotice)}
  </div>

</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// PART 3 -- Public API
// ---------------------------------------------------------------------------

/**
 * Generate a PDF-ready HTML string for the given receipt.
 *
 * Usage in browser:
 *   const html = generateReceiptHTML(receipt, 'ko');
 *   const win = window.open('', '_blank');
 *   win.document.write(html);
 *   win.document.close();
 *   win.print();
 *
 * Usage server-side (returns Blob for download):
 *   const blob = await generateReceiptPDF(receipt, 'ko');
 */
export function generateReceiptHTML(receipt: Receipt, lang: Lang = 'ko'): string {
  return buildReceiptHtml(receipt, lang);
}

/**
 * Generate a Blob containing the HTML document (Content-Type text/html).
 * The caller can stream this as a downloadable .html file that opens
 * in any browser and can be printed to PDF.
 */
export async function generateReceiptPDF(
  receipt: Receipt,
  lang: Lang = 'ko',
): Promise<Blob> {
  const html = buildReceiptHtml(receipt, lang);
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

/**
 * Trigger browser print dialog for the receipt.
 * Only call this from client-side code.
 */
export function printReceipt(receipt: Receipt, lang: Lang = 'ko'): void {
  if (typeof window === 'undefined') {
    throw new Error('printReceipt() can only be called in a browser environment');
  }
  const html = buildReceiptHtml(receipt, lang);
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Popup blocked. Please allow popups to print the receipt.');
  }
  printWindow.document.write(html);
  printWindow.document.close();
  // 약간의 지연 후 인쇄 대화상자 호출
  setTimeout(() => printWindow.print(), 300);
}
