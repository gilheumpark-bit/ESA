/**
 * 도면 문서(V3) 반출 — CSV 체크리스트와 인쇄용 보고서.
 *
 * 계산 영수증·검토 보고서와 또 다른 계약이다. 도면 문서는 판정이 아니라
 * **판독 상태**의 기록이므로, 반출물은 확정과 모호를 반드시 구분해야 한다.
 * 확정만 뽑아 표로 만들면 검토자가 그 표를 완성된 목록으로 읽는다 —
 * 오늘 실측에서 같은 도면 3회에 퓨즈가 9/14/17개로 갈렸다.
 *
 * PART 1: 안전한 추출
 * PART 2: CSV 체크리스트
 * PART 3: 인쇄용 HTML
 */

import { escapeHtml } from '@/lib/security-hardening';
import type { DrawingDocumentV3 } from '@/agent/drawing/types-v3';

const MAX_ROWS = 5_000;
const MAX_CELL = 1_000;

function cell(value: unknown, fallback = '미기재'): string {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string') return value.slice(0, MAX_CELL);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function certaintyLabel(certainty: string | undefined): string {
  if (certainty === 'confirmed') return '확정';
  if (certainty === 'ambiguous') return 'ESA 잠정 판독';
  if (certainty === 'unread') return '미판독';
  return '미기재';
}

export interface DrawingExportRow {
  section: string;
  displayId: string;
  kind: string;
  detail: string;
  certainty: string;
}

/**
 * 기기·연결·미해결 항목을 한 표로 편다. 모호 항목을 빼지 않는다 —
 * 빼면 반출물이 원본보다 확정적으로 보인다.
 */
export function drawingDocumentRows(document: DrawingDocumentV3): DrawingExportRow[] {
  const rows: DrawingExportRow[] = [];

  for (const symbol of document.evidenceGraph?.symbols ?? []) {
    rows.push({
      section: '기기',
      displayId: cell(symbol.displayId),
      kind: cell(symbol.confirmedType ?? symbol.typeCandidates?.[0]),
      detail: symbol.confirmedType
        ? cell(symbol.rawLabel, '라벨 없음')
        : `${cell(symbol.rawLabel, '라벨 없음')} · 후보: ${(symbol.typeCandidates ?? []).join('/') || '없음'}`,
      certainty: certaintyLabel(symbol.certainty),
    });
  }

  for (const relation of document.evidenceGraph?.relations ?? []) {
    rows.push({
      section: '연결',
      displayId: cell(relation.displayId),
      kind: relation.lineId ? '선 연결' : '연결',
      detail: `${cell(relation.from)} → ${cell(relation.to)}`,
      certainty: certaintyLabel(relation.certainty),
    });
  }

  for (const item of document.unresolvedItems ?? []) {
    rows.push({
      section: '잠정 보류',
      displayId: cell(item.displayId, cell(item.id)),
      kind: cell(item.code),
      detail: cell(item.note, '사유 미기재'),
      certainty: 'ESA 잠정 보류',
    });
  }

  for (const recommendation of document.recommendations ?? []) {
    const decision = cell(recommendation.aiDecision, 'ESA 판단 미기재');
    const action = cell(recommendation.recommendedAction, '권장 조치 미기재');
    const conditions = recommendation.requiredInputs?.length > 0
      ? ` · 결론 변경 조건: ${recommendation.requiredInputs.map((item) => cell(item)).join(' / ')}`
      : '';
    rows.push({
      section: '제안',
      displayId: cell(recommendation.id),
      kind: cell(recommendation.severity ?? recommendation.status),
      detail: cell(`${decision} · 권장 조치: ${action}${conditions}`),
      certainty: cell(recommendation.status, '미기재'),
    });
  }

  return rows.slice(0, MAX_ROWS);
}

/** 판독 상태 요약. 반출물 첫 화면에 항상 붙인다. */
export function drawingDocumentSummary(document: DrawingDocumentV3): Array<[string, string]> {
  const symbols = document.evidenceGraph?.symbols ?? [];
  const relations = document.evidenceGraph?.relations ?? [];
  const confirmedSymbols = symbols.filter((s) => s.certainty === 'confirmed').length;
  const confirmedRelations = relations.filter((r) => r.certainty === 'confirmed').length;
  const ledger = document.coverageLedger;
  return [
    ['작업 상태', cell(document.jobStatus)],
    ['페이지 수', String(document.pages?.length ?? 0)],
    ['기기(확정/전체)', `${confirmedSymbols} / ${symbols.length}`],
    ['연결(확정/전체)', `${confirmedRelations} / ${relations.length}`],
    ['잠정 보류 항목', String(document.unresolvedItems?.length ?? 0)],
    ['구획 완료/계획', `${cell(ledger?.regionsComplete, '0')} / ${cell(ledger?.plannedRegionCount, '0')}`],
    ['미해결 재검사', cell(ledger?.unresolvedRescans, '0')],
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — CSV 체크리스트
// ═══════════════════════════════════════════════════════════════════════════════

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function drawingDocumentCsv(document: DrawingDocumentV3): string {
  const lines: string[] = [];
  for (const [label, value] of drawingDocumentSummary(document)) {
    lines.push([csvCell('요약'), csvCell(label), '', csvCell(value), ''].join(','));
  }
  lines.push(['구분', '표시 ID', '종류', '내용', '판독 상태'].map(csvCell).join(','));
  for (const row of drawingDocumentRows(document)) {
    lines.push([row.section, row.displayId, row.kind, row.detail, row.certainty].map(csvCell).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — 인쇄용 HTML
// ═══════════════════════════════════════════════════════════════════════════════

export function drawingDocumentPrintableHtml(document: DrawingDocumentV3): string {
  const rows = drawingDocumentRows(document);
  const summary = drawingDocumentSummary(document);
  const hash = escapeHtml(cell(document.documentHash, 'N/A'));
  const generated = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const summaryRows = summary
    .map(([label, value]) => `        <tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('\n');
  const bodyRows = rows
    .map((row) => `        <tr><td>${escapeHtml(row.section)}</td><td>${escapeHtml(row.displayId)}</td>`
      + `<td>${escapeHtml(row.kind)}</td><td>${escapeHtml(row.detail)}</td>`
      + `<td>${escapeHtml(row.certainty)}</td></tr>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"/>
  <title>ESA 도면 판독 보고서</title>
  <style>
    body { font-family: 'Pretendard', -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 36px; color: #111827; }
    h1 { font-size: 1.45rem; border-bottom: 2px solid #1e40af; padding-bottom: 8px; margin-bottom: 4px; }
    h2 { font-size: 1rem; margin: 24px 0 8px; color: #1e40af; }
    .meta { color: #6b7280; font-size: 0.82rem; margin-bottom: 4px; word-break: break-all; }
    .notice { margin: 16px 0; padding: 10px 12px; border-left: 3px solid #b45309; background: #fffbeb; font-size: 0.85rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { border: 1px solid #e5e7eb; padding: 5px 8px; text-align: left; vertical-align: top; }
    thead th { background: #f9fafb; }
    .summary th { width: 34%; background: #f9fafb; }
    @media print { body { padding: 12px; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>ESA 도면 판독 보고서</h1>
  <div class="meta">문서 해시: ${hash}</div>
  <div class="meta">출력 시각: ${escapeHtml(generated)}</div>
  <div class="notice">
    이 표는 AI 판독 결과이며 설계 승인이나 법적 적합성 인증서가 아닙니다.
    같은 도면을 다시 판독하면 결과가 달라질 수 있으므로, <strong>잠정·미판독
    항목은 결론 변경 조건과 원본 도면을 대조</strong>한 뒤 사용하십시오.
  </div>
  <h2>판독 상태 요약</h2>
  <table class="summary">
    <tbody>
${summaryRows}
    </tbody>
  </table>
  <h2>판독 항목</h2>
  <table>
    <thead><tr><th>구분</th><th>표시 ID</th><th>종류</th><th>내용</th><th>판독 상태</th></tr></thead>
    <tbody>
${bodyRows}
    </tbody>
  </table>
  <script>window.addEventListener('load', function () { window.print(); });</script>
</body>
</html>`;
}

// IDENTITY_SEAL: lib/export-drawing-document | role=도면 문서 반출(CSV 체크리스트·인쇄 HTML) | inputs=DrawingDocumentV3 | outputs=표 행·CSV·HTML
