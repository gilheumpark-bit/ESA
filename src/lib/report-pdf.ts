/** ESVA 리포트 PDF (HTML 인쇄용) 생성 */

import { escapeHtml } from '@/lib/security-hardening';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportData = Record<string, any>;

export function generatePDFResponse(report: ReportData): string {
  // 리포트에는 검색어/파일명/LLM 생성 텍스트 등 신뢰할 수 없는 필드가 포함될 수 있으므로
  // HTML 문서에 삽입하기 전 모든 값을 이스케이프하여 XSS(마크업/스크립트 주입)를 차단한다.
  const title = escapeHtml(String(report?.title || 'ESVA Report'));
  const id = escapeHtml(String(report?.reportId || 'N/A'));
  const body = escapeHtml(JSON.stringify(report, null, 2));
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
  <div class="content"><pre>${body}</pre></div>
  <div class="footer">ESVA — The Engineer's Search Engine | This report is for reference only. PE review required for safety-critical applications.</div>
</body>
</html>`;
}
