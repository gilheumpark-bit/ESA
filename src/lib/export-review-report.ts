/**
 * 팀 검토 보고서 반출.
 *
 * 계산 영수증 반출(`/api/export`의 receipt 경로)과 다른 계약이다. 계산
 * 영수증은 서버가 계산기를 재실행해 값을 대조할 수 있지만, 검토 보고서는
 * 재실행 대상이 아니라 판정·근거·미해결 항목의 기록이다. 이전 화면은
 * 보고서를 `calculatorId: 'team-review'` 형태의 가짜 영수증으로 감싸
 * 계산 영수증 검증기에 넘겼고, 검증기가 `calcId`·체크섬·계산기 재실행을
 * 요구해 422로 실패했다(2026-08-02 실측).
 *
 * PART 1: 안전한 필드 추출
 * PART 2: CSV/Excel 표
 * PART 3: 인쇄용 HTML
 */

import { escapeHtml } from '@/lib/security-hardening';

export interface ReviewReportExportRow {
  section: string;
  label: string;
  value: string;
}

interface ReportLike {
  reportId?: unknown;
  projectName?: unknown;
  projectType?: unknown;
  createdAt?: unknown;
  verdict?: unknown;
  grade?: unknown;
  compositeScore?: unknown;
  requiresHumanReview?: unknown;
  summary?: unknown;
  markings?: unknown;
  evidenceIds?: unknown;
  hash?: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 안전한 필드 추출
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_CELL_LENGTH = 2_000;
const MAX_ROWS = 5_000;

function text(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value.slice(0, MAX_CELL_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * 보고서를 표 행으로 편다. 값이 없는 항목은 지어내지 않고 `미기재`로 남긴다 —
 * 반출물이 원본보다 더 확정적으로 보이면 안 된다.
 */
export function reviewReportRows(report: unknown): ReviewReportExportRow[] {
  const r = record(report) as ReportLike;
  const summary = record(r.summary);
  const rows: ReviewReportExportRow[] = [
    { section: '보고서', label: '보고서 ID', value: text(r.reportId, '미기재') },
    { section: '보고서', label: '프로젝트', value: text(r.projectName, '미기재') },
    { section: '보고서', label: '종류', value: text(r.projectType, '미기재') },
    { section: '보고서', label: '생성 시각', value: text(r.createdAt, '미기재') },
    { section: '판정', label: '판정', value: text(r.verdict, '미기재') },
    { section: '판정', label: '등급', value: text(r.grade, '미기재') },
    { section: '판정', label: '종합 점수', value: text(r.compositeScore, '미기재') },
    {
      section: '판정',
      label: '사람(PE) 검토 필요',
      value: r.requiresHumanReview === true ? '필요' : r.requiresHumanReview === false ? '표시 없음' : '미기재',
    },
  ];

  for (const [label, key] of [
    ['기기 수', 'totalComponents'],
    ['연결 수', 'totalConnections'],
    ['계산 수', 'totalCalculations'],
    ['통과 검사', 'passedChecks'],
    ['실패 검사', 'failedChecks'],
  ] as const) {
    if (summary[key] !== undefined) {
      rows.push({ section: '요약', label, value: text(summary[key], '미기재') });
    }
  }

  for (const marking of list(r.markings).slice(0, MAX_ROWS)) {
    const m = record(marking);
    rows.push({
      section: '검증 마킹',
      label: text(m.severity ?? m.level, '표시'),
      value: text(m.message ?? m.title ?? m.description, '내용 미기재'),
    });
  }

  const evidence = list(r.evidenceIds).map((id) => text(id)).filter(Boolean);
  rows.push({
    section: '근거',
    label: '근거 ID 수',
    value: String(evidence.length),
  });
  if (evidence.length > 0) {
    rows.push({ section: '근거', label: '근거 ID', value: evidence.slice(0, 200).join(', ') });
  }
  rows.push({ section: '무결성', label: '보고서 해시', value: text(r.hash, '미기재') });

  return rows.slice(0, MAX_ROWS);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — CSV/Excel 표
// ═══════════════════════════════════════════════════════════════════════════════

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function reviewReportCsv(report: unknown): string {
  const rows = reviewReportRows(report);
  const lines = [['구분', '항목', '값'].join(',')];
  for (const row of rows) {
    lines.push([csvCell(row.section), csvCell(row.label), csvCell(row.value)].join(','));
  }
  // Excel 이 UTF-8 을 한글로 열도록 BOM 을 붙인다.
  return `﻿${lines.join('\r\n')}\r\n`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — 인쇄용 HTML
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 인쇄 대화상자를 자동으로 여는 인쇄용 HTML. 이전 구현은 보고서 JSON 전체를
 * `<pre>` 로 찍고 자동 인쇄도 없어서 "PDF 다운로드" 라는 표기가 사실과 달랐다.
 * 여기서도 진짜 PDF 바이너리를 만들지는 않으므로, 파일명과 UI 문구는
 * `인쇄용 보고서` 로 유지해야 한다.
 */
export function reviewReportPrintableHtml(report: unknown): string {
  const r = record(report) as ReportLike;
  const rows = reviewReportRows(report);
  const title = escapeHtml(text(r.projectName, 'ESA 검토 보고서'));
  const id = escapeHtml(text(r.reportId, 'N/A'));
  const generated = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const grouped = new Map<string, ReviewReportExportRow[]>();
  for (const row of rows) {
    if (!grouped.has(row.section)) grouped.set(row.section, []);
    grouped.get(row.section)!.push(row);
  }

  const sections = [...grouped.entries()].map(([section, items]) => `
    <section>
      <h2>${escapeHtml(section)}</h2>
      <table>
        <tbody>
${items.map((item) => `          <tr><th>${escapeHtml(item.label)}</th><td>${escapeHtml(item.value)}</td></tr>`).join('\n')}
        </tbody>
      </table>
    </section>`).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:"/>
  <title>${title} — ESA 검토 보고서</title>
  <style>
    body { font-family: 'Pretendard', -apple-system, sans-serif; max-width: 820px; margin: 0 auto; padding: 40px; color: #111827; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #1e40af; padding-bottom: 8px; margin-bottom: 4px; }
    h2 { font-size: 1rem; margin: 28px 0 8px; color: #1e40af; }
    .meta { color: #6b7280; font-size: 0.85rem; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; vertical-align: top; }
    th { width: 34%; background: #f9fafb; font-weight: 600; }
    td { word-break: break-word; }
    .footer { margin-top: 36px; border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 0.75rem; color: #6b7280; }
    @media print { body { padding: 12px; } h2 { page-break-after: avoid; } table { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">보고서 ID: ${id} · 출력 시각: ${escapeHtml(generated)}</div>
${sections}
  <div class="footer">
    이 문서는 ESA 검토 결과의 인쇄본입니다. 계산 결과와 판정은 설계 승인 또는
    법적 적합성 인증서가 아니며, 안전 중요 적용 전 책임 엔지니어와 현행 원문
    검토가 필요합니다.
  </div>
  <script>window.addEventListener('load', function () { window.print(); });</script>
</body>
</html>`;
}

// IDENTITY_SEAL: lib/export-review-report | role=팀 검토 보고서 전용 반출(CSV·인쇄 HTML) | inputs=검토 보고서 | outputs=표 행·CSV·HTML
