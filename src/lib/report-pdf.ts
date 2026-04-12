/**
 * ESVA Report PDF Generator
 * ---------------------------
 * 검증 보고서 → 전문 PDF (ESVA 워터마크 + 서명란 + 날인).
 * HTML → PDF 렌더링. 서버사이드에서 실행.
 *
 * PART 1: HTML template
 * PART 2: PDF generation
 */

import type { ESVAVerifiedReport, VerificationMarking, MarkingSeverity } from '@/agent/teams/types';
import { getDisclaimer } from '@/engine/constants/disclaimer';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — HTML Template
// ═══════════════════════════════════════════════════════════════════════════════

const SEVERITY_LABELS: Record<MarkingSeverity, { label: string; color: string; bg: string }> = {
  error:   { label: '오류', color: '#dc2626', bg: '#fef2f2' },
  warning: { label: '경고', color: '#d97706', bg: '#fffbeb' },
  info:    { label: '정보', color: '#2563eb', bg: '#eff6ff' },
  success: { label: '적합', color: '#059669', bg: '#ecfdf5' },
};

const GRADE_COLORS: Record<string, string> = {
  'A+': '#059669', A: '#10b981', 'B+': '#3b82f6', B: '#60a5fa',
  C: '#f59e0b', D: '#ef4444', F: '#991b1b',
};

function markingRow(m: VerificationMarking): string {
  const s = SEVERITY_LABELS[m.severity];
  return `
    <tr>
      <td style="padding:6px 8px"><span style="background:${s.bg};color:${s.color};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">${s.label}</span></td>
      <td style="padding:6px 8px;font-size:12px">${m.location}</td>
      <td style="padding:6px 8px;font-size:12px">${m.message}</td>
      <td style="padding:6px 8px;font-size:11px;color:#666">${m.calculatedValue ?? '-'}</td>
      <td style="padding:6px 8px;font-size:11px;color:#666">${m.standardRef ?? '-'}</td>
      <td style="padding:6px 8px;font-size:11px;color:#2563eb">${m.suggestedFix ?? '-'}</td>
    </tr>`;
}

/**
 * 보고서 HTML 생성.
 * 인쇄 최적화 + ESVA 워터마크 + 서명란.
 */
export function generateReportHTML(report: ESVAVerifiedReport, language: string = 'ko'): string {
  const disclaimer = getDisclaimer(language);
  const gradeColor = GRADE_COLORS[report.grade] ?? '#666';
  const markings = report.markings ?? [];

  const errorCount = markings.filter(m => m.severity === 'error').length;
  const warnCount = markings.filter(m => m.severity === 'warning').length;
  const passCount = markings.filter(m => m.severity === 'success').length;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>ESVA Verified Report — ${report.projectName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Pretendard', 'Inter', -apple-system, sans-serif; color: #1a1a1a; line-height: 1.6; }
    .page { max-width: 210mm; margin: 0 auto; padding: 20mm 15mm; position: relative; }
    .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-30deg); font-size: 100px; color: rgba(37,99,235,0.03); font-weight: 900; pointer-events: none; z-index: 0; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1d4ed8; padding-bottom: 16px; margin-bottom: 24px; }
    .logo { font-size: 28px; font-weight: 900; color: #1d4ed8; }
    .badge { text-align: center; }
    .badge .grade { font-size: 48px; font-weight: 900; line-height: 1; }
    .badge .score { font-size: 16px; font-weight: 700; margin-top: 4px; }
    .badge .verdict { font-size: 12px; padding: 2px 12px; border-radius: 12px; margin-top: 6px; display: inline-block; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 14px; font-weight: 700; color: #1d4ed8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; border-left: 4px solid #1d4ed8; padding-left: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f1f5f9; text-align: left; padding: 8px; font-size: 11px; font-weight: 700; color: #475569; border-bottom: 2px solid #e2e8f0; }
    td { border-bottom: 1px solid #f1f5f9; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .info-item { display: flex; gap: 8px; font-size: 12px; }
    .info-label { color: #94a3b8; min-width: 80px; }
    .info-value { font-weight: 600; }
    .signature-area { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; text-align: center; }
    .signature-box { border-top: 2px solid #1a1a1a; padding-top: 8px; }
    .signature-box .role { font-size: 12px; font-weight: 700; margin-bottom: 4px; }
    .signature-box .name { font-size: 11px; color: #666; }
    .signature-box .seal { width: 60px; height: 60px; border: 2px dashed #ccc; border-radius: 50%; margin: 8px auto; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #ccc; }
    .disclaimer { margin-top: 32px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 10px; color: #64748b; line-height: 1.5; }
    .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
    @media print { .page { padding: 10mm; } .watermark { font-size: 80px; } }
  </style>
</head>
<body>
  <div class="watermark">ESVA</div>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div>
        <div class="logo">ESVA</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">Electrical Search Vertical AI</div>
        <div style="font-size:11px;color:#64748b">검증 보고서 ${report.version}</div>
      </div>
      <div class="badge">
        <div class="grade" style="color:${gradeColor}">${report.grade}</div>
        <div class="score" style="color:${gradeColor}">${report.compositeScore}점</div>
        <div class="verdict" style="background:${gradeColor}15;color:${gradeColor}">
          ${report.verdict === 'PASS' ? '적합' : report.verdict === 'CONDITIONAL' ? '조건부' : '부적합'}
        </div>
      </div>
    </div>

    <!-- Project Info -->
    <div class="section">
      <div class="section-title">프로젝트 정보</div>
      <div class="info-grid">
        <div class="info-item"><span class="info-label">프로젝트명</span><span class="info-value">${report.projectName}</span></div>
        <div class="info-item"><span class="info-label">설비 유형</span><span class="info-value">${report.projectType}</span></div>
        <div class="info-item"><span class="info-label">보고서 ID</span><span class="info-value">${report.reportId}</span></div>
        <div class="info-item"><span class="info-label">발행일</span><span class="info-value">${new Date(report.createdAt).toLocaleDateString('ko-KR')}</span></div>
        <div class="info-item"><span class="info-label">적용 기준</span><span class="info-value">${report.summary.appliedStandards.join(', ')}</span></div>
        <div class="info-item"><span class="info-label">검증 항목</span><span class="info-value">${report.summary.passedChecks + report.summary.failedChecks}건 (적합 ${report.summary.passedChecks} / 부적합 ${report.summary.failedChecks})</span></div>
      </div>
    </div>

    <!-- Summary -->
    <div class="section">
      <div class="section-title">종합 판정</div>
      <p style="font-size:13px;margin-bottom:8px">${report.summary.textKo}</p>
      <div style="display:flex;gap:12px;margin-top:8px">
        <span style="background:#fef2f2;color:#dc2626;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:700">${errorCount} 오류</span>
        <span style="background:#fffbeb;color:#d97706;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:700">${warnCount} 경고</span>
        <span style="background:#ecfdf5;color:#059669;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:700">${passCount} 적합</span>
      </div>
    </div>

    <!-- Markings Table -->
    <div class="section">
      <div class="section-title">검증 마킹 상세</div>
      <table>
        <thead>
          <tr><th>판정</th><th>위치</th><th>내용</th><th>계산값</th><th>기준</th><th>수정 제안</th></tr>
        </thead>
        <tbody>
          ${markings.map(markingRow).join('')}
        </tbody>
      </table>
    </div>

    <!-- Signature Area -->
    <div class="signature-area">
      <div class="signature-box">
        <div class="seal">날인</div>
        <div class="role">설계자</div>
        <div class="name">________________</div>
      </div>
      <div class="signature-box">
        <div class="seal">날인</div>
        <div class="role">검토자</div>
        <div class="name">________________</div>
      </div>
      <div class="signature-box">
        <div class="seal">날인</div>
        <div class="role">승인자 (PE)</div>
        <div class="name">________________</div>
      </div>
    </div>

    <!-- Disclaimer -->
    <div class="disclaimer">
      <strong>${disclaimer.title}</strong><br>
      ${disclaimer.body.join(' ')}<br><br>
      <strong>${disclaimer.peRequirement}</strong><br>
      ${disclaimer.legalNotice}
    </div>

    <!-- Footer -->
    <div class="footer">
      ESVA Verified Report | ${report.reportId} | Generated ${new Date(report.createdAt).toISOString()}<br>
      Hash: ${report.hash || 'pending'} | This document is computer-generated and does not require a physical signature for verification purposes.
    </div>
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — PDF Response (HTML → browser print)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 보고서 PDF용 HTML 응답 생성.
 * 브라우저에서 window.print()로 PDF 변환.
 * 서버사이드 PDF (puppeteer)는 Vercel Edge에서 미지원이므로 HTML 방식 사용.
 */
export function generatePDFResponse(report: ESVAVerifiedReport, language: string = 'ko'): string {
  const html = generateReportHTML(report, language);
  // 자동 인쇄 트리거 스크립트 삽입
  return html.replace('</body>', `
    <script>
      window.onload = function() {
        setTimeout(function() { window.print(); }, 500);
      };
    </script>
  </body>`);
}
