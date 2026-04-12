/** ESVA 리포트 PDF (HTML 인쇄용) 생성 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportData = Record<string, any>;

export function generatePDFResponse(report: ReportData): string {
  const title = String(report?.title || 'ESVA Report');
  const id = String(report?.reportId || 'N/A');
  const timestamp = new Date().toISOString().slice(0, 19);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <title>${title} — ESVA</title>
  <style>
    body { font-family: 'Pretendard', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #1e40af; padding-bottom: 8px; }
    .meta { color: #6b7280; font-size: 0.85rem; margin-bottom: 24px; }
    .content { line-height: 1.8; }
    .footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 0.75rem; color: #9ca3af; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">Report ID: ${id} | Generated: ${timestamp}</div>
  <div class="content"><pre>${JSON.stringify(report, null, 2)}</pre></div>
  <div class="footer">ESVA — The Engineer's Search Engine | This report is for reference only. PE review required for safety-critical applications.</div>
</body>
</html>`;
}
