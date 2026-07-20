/** ESVA 팀 검토 보고서의 인쇄용 HTML 생성. */

import { escapeHtml } from '@/lib/security-hardening';

export function generatePDFResponse(report: unknown): string {
  const record = report && typeof report === 'object'
    ? report as Record<string, unknown>
    : {};
  const title = escapeHtml(String(record.title ?? record.projectName ?? 'ESA 검토 보고서'));
  const id = escapeHtml(String(record.reportId ?? 'N/A'));
  const timestamp = new Date().toISOString().slice(0, 19);
  let serialized: string;
  try {
    serialized = JSON.stringify(record, null, 2) ?? '{}';
  } catch {
    serialized = '{"error":"보고서 내용을 직렬화할 수 없습니다."}';
  }
  const safeReport = escapeHtml(serialized);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"/>
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
  <div class="content"><pre>${safeReport}</pre></div>
  <div class="footer">ESA 검토 보고서 | 안전 중요 적용 전 책임 엔지니어와 현행 원문 검토가 필요합니다.</div>
</body>
</html>`;
}
