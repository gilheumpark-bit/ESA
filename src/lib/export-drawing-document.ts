/**
 * Drawing V3 work product: equipment, complete routes, rated values, receipts,
 * findings and actions. Exports retain uncertainty and original evidence IDs.
 * No model calls or network requests; the document stays in this browser.
 */
import { SYMBOL_CLASSIFICATION_REASONS } from '@/lib/symbol-classification';
import { summarizeDrawingReadState } from '@/lib/drawing-read-summary';
import { escapeHtml } from '@/lib/security-hardening';
import type { DrawingDocumentV3, EvidenceRef } from '@/agent/drawing/types-v3';

const MAX_ROWS = 50_000;
const MAX_CELL = 32_000;
const OMITTED = ' … [표시 길이 초과: 원본 근거에서 확인]';

function cell(value: unknown, fallback = '미기재'): string {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string') return value.length <= MAX_CELL ? value : `${value.slice(0, MAX_CELL - OMITTED.length)}${OMITTED}`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}
function certaintyLabel(certainty: string | undefined): string {
  if (certainty === 'confirmed') return '확정';
  if (certainty === 'ambiguous') return 'ESA 잠정 판독';
  if (certainty === 'unread') return '미판독';
  return '미기재';
}
function sourceColumns(evidence: EvidenceRef[] = []): Pick<DrawingExportRow, 'pages' | 'evidenceIds'> {
  return {
    pages: [...new Set(evidence.map((ref) => ref.pageIndex).filter((page) => Number.isInteger(page) && page >= 0))]
      .sort((a, b) => a - b).map((page) => String(page + 1)).join(', ') || '미기재',
    evidenceIds: cell([...new Set(evidence.map((ref) => ref.evidenceId).filter(Boolean))].join(' / '), '미기재'),
  };
}

export interface DrawingExportRow {
  section: string;
  displayId: string;
  kind: string;
  detail: string;
  certainty: string;
  pages: string;
  evidenceIds: string;
}

/** Never return a silently truncated partial report as though it were complete. */
export function drawingDocumentRows(document: DrawingDocumentV3): DrawingExportRow[] {
  const rows: DrawingExportRow[] = [];
  const add = (row: DrawingExportRow): void => {
    if (rows.length >= MAX_ROWS) throw new Error('반출 항목이 50,000행을 초과했습니다. 보고서를 생략해 만들지 않았습니다. 분석 대상 페이지를 나누어 다시 반출하세요.');
    rows.push({ ...row, detail: cell(row.detail) });
  };
  const symbols = document.evidenceGraph?.symbols ?? [];
  const symbolNames = new Map<string, string>();
  for (const symbol of symbols) {
    const name = `${cell(symbol.displayId)}${symbol.rawLabel ? ` (${cell(symbol.rawLabel)})` : ''}`;
    symbolNames.set(symbol.id, name);
    symbolNames.set(symbol.displayId, name);
    if (symbol.equipmentId) symbolNames.set(symbol.equipmentId, name);
  }
  const lineNames = new Map((document.evidenceGraph?.lines ?? []).map((line) => [line.id, line.displayId]));
  const equipment = (id: string | undefined): string => id ? symbolNames.get(id) ?? cell(id) : '소속 미확정';

  for (const symbol of symbols) {
    const classification = symbol.classification;
    if (classification) add({ section: '심볼 분류', displayId: cell(symbol.displayId),
      kind: cell(classification.selectedType, classification.candidates.map((candidate) => candidate.type).join('/') || '미판독'),
      detail: `${classification.method} · ${classification.reasons.map((reason) => SYMBOL_CLASSIFICATION_REASONS[reason]).join(' / ')} · 형상 유사도(확률 아님): ${classification.candidates.map((candidate) => `${candidate.type}=${candidate.similarity.toFixed(3)}`).join(' / ')} · 대조 사례: ${classification.referenceKeys.join(' / ')} · 정격·결선 확정과 별개`,
      certainty: classification.status === 'classified' ? classification.method === 'family-context' ? '자동 분류' : '분류됨' : classification.status === 'review' ? '예외 검토' : '미판독',
      ...sourceColumns(symbol.evidence) });
    add({ section: '기기', displayId: cell(symbol.displayId),
      kind: cell(symbol.confirmedType ?? symbol.typeCandidates?.[0]),
      detail: symbol.confirmedType ? cell(symbol.rawLabel, '라벨 없음')
        : `${cell(symbol.rawLabel, '라벨 없음')} · 후보: ${(symbol.typeCandidates ?? []).join('/') || '없음'}`,
      certainty: certaintyLabel(symbol.certainty), ...sourceColumns(symbol.evidence) });
  }
  for (const relation of document.evidenceGraph?.relations ?? []) {
    const ids = relation.lineIds?.length ? relation.lineIds : relation.lineId ? [relation.lineId] : [];
    const route = ids.length ? ` · 선로: ${ids.map((id) => lineNames.get(id) ?? id).join(' → ')}` : '';
    add({ section: '연결', displayId: cell(relation.displayId), kind: ids.length ? '선 연결' : '연결',
      detail: `${equipment(relation.from)} ↔ ${equipment(relation.to)}${route}${relation.terminalPath ? ' · 단자 경로 확인' : ''}`,
      certainty: certaintyLabel(relation.certainty), ...sourceColumns(relation.evidence) });
  }
  for (const relation of document.crossPageRelations ?? []) {
    add({ section: '페이지 연결', displayId: cell(relation.displayId), kind: '페이지 간 참조',
      detail: `P${relation.fromPage + 1} ${cell(relation.fromRef)} ↔ P${relation.toPage + 1} ${cell(relation.toRef)} · ${cell(relation.reason, '별도 사유 없음')}`,
      certainty: relation.status === 'confirmed' ? '확정' : 'ESA 잠정 보류', ...sourceColumns(relation.evidence) });
  }
  for (const value of document.ratedValues ?? []) {
    add({ section: '정격', displayId: cell(value.displayId), kind: cell(value.field),
      detail: `${equipment(value.equipmentId)} · ${value.normalized ? `${value.normalized.value} ${value.normalized.unit}` : cell(value.raw)}${value.ownership ? ` · 귀속 ${certaintyLabel(value.ownership.status)} · 후보: ${value.ownership.candidates.map(equipment).join(' / ') || '없음'}` : ' · 귀속 상태 미기록'}`,
      certainty: certaintyLabel(value.certainty), ...sourceColumns(value.evidence) });
  }
  for (const calculation of document.calculations ?? []) {
    add({ section: '계산', displayId: cell(calculation.id), kind: cell(calculation.calculatorId),
      detail: `${cell(calculation.label)} · ${calculation.value === undefined ? '재계산 필요' : `${calculation.value} ${calculation.unit ?? ''}`} · 영수증: ${cell(calculation.receiptHash, '없음')}${calculation.note ? ` · ${cell(calculation.note)}` : ''}`,
      certainty: calculation.compliant === true ? '적합' : calculation.compliant === false ? '부적합' : '판정 보류',
      pages: '근거 참조', evidenceIds: cell((calculation.evidenceIds ?? []).join(' / ')) });
  }
  for (const item of document.unresolvedItems ?? []) {
    add({ section: '잠정 보류', displayId: cell(item.displayId, cell(item.id)), kind: cell(item.code),
      detail: cell(item.note, '사유 미기재'), certainty: 'ESA 잠정 보류',
      pages: Number.isInteger(item.pageIndex) && item.pageIndex >= 0 ? String(item.pageIndex + 1) : '미기재',
      evidenceIds: cell(item.regionId, cell(item.displayId, cell(item.id))) });
  }
  for (const recommendation of document.recommendations ?? []) {
    const conditions = recommendation.requiredInputs?.length > 0
      ? ` · 결론 변경 조건: ${recommendation.requiredInputs.map((item) => cell(item)).join(' / ')}` : '';
    add({ section: '제안', displayId: cell(recommendation.id), kind: cell(recommendation.severity ?? recommendation.status),
      detail: `${cell(recommendation.aiDecision, 'ESA 판단 미기재')} · 권장 조치: ${cell(recommendation.recommendedAction, '권장 조치 미기재')}${conditions}`,
      certainty: cell(recommendation.status), pages: '근거 참조', evidenceIds: cell((recommendation.evidenceIds ?? []).join(' / ')) });
  }
  return rows;
}

export function drawingDocumentSummary(document: DrawingDocumentV3): Array<[string, string]> {
  const symbols = document.evidenceGraph?.symbols ?? [];
  const relations = document.evidenceGraph?.relations ?? [];
  const ledger = document.coverageLedger;
  const summary = summarizeDrawingReadState(document);
  return [
    ['도면명', cell(document.title)], ['문서 해시', cell(document.documentHash)],
    ['분석 갱신 시각', cell(document.updatedAt)], ['문서 형식 버전', cell(document.schemaVersion)],
    ['작업 상태', cell(document.jobStatus)], ['페이지 수', String(document.pages?.length ?? 0)],
    ['기기(확정/전체)', `${symbols.filter((s) => s.certainty === 'confirmed').length} / ${symbols.length}`],
    ['연결(확정/전체)', `${relations.filter((r) => r.certainty === 'confirmed').length} / ${relations.length}`],
    ['단자 경로 확인', String(relations.filter((r) => r.certainty === 'confirmed' && r.terminalPath).length)],
    ['잠정 보류 항목', String(document.unresolvedItems?.length ?? 0)],
    ['구획 완료/계획', `${cell(ledger?.regionsComplete, '0')} / ${cell(ledger?.plannedRegionCount, '0')}`],
    ['미해결 재검사', cell(ledger?.unresolvedRescans, '0')],
    ['집계 범위', '검출 항목만 집계. 전체 정답률·자동화율 아님. 범주 간 중복은 합산하지 않음.'],
    ['사람 정정 확정(종류·문자)', summary.humanConfirmed === undefined ? '정정 이력 미기록' : String(summary.humanConfirmed)],
    ...(summary.missingGroups.length ? [['판독 범주 미기록', summary.missingGroups.join(' / ')] as [string, string]] : []),
    ...summary.groups.map((group): [string, string] => [`${group.label}(확정/검토/미판독)`, `${group.counts.confirmed} / ${group.counts.ambiguous} / ${group.counts.unread}`]),
    ...summary.unresolvedCauses.map((item): [string, string] => [`미확정 원인 ${item.code}`, String(item.count)]),
  ];
}

function csvCell(value: string): string {
  // Quoting commas is not formula neutralization. Treat these cells as text,
  // including full-width prefixes and invisible/whitespace prefix variants.
  // This export is a review checklist, not an executable spreadsheet formula.
  const normalized = value.normalize('NFKC');
  const formula = /^[\s\p{Cf}\p{Cc}]*[=+\-@]/u.test(normalized) || /^[\t\r\n]/.test(value);
  const safe = formula ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
const HEADERS = ['구분', '표시 ID', '종류', '내용', '판독 상태', '페이지', '근거 ID'];
function rowValues(row: DrawingExportRow): string[] {
  return [row.section, row.displayId, row.kind, row.detail, row.certainty, row.pages, row.evidenceIds];
}
export function drawingDocumentCsv(document: DrawingDocumentV3): string {
  const rows = drawingDocumentRows(document); // Validate before emitting anything.
  const lines = drawingDocumentSummary(document).map(([label, value]) =>
    ['요약', label, '', value, '', '', ''].map(csvCell).join(','));
  lines.push(HEADERS.map(csvCell).join(','));
  for (const row of rows) lines.push(rowValues(row).map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function drawingDocumentPrintableHtml(document: DrawingDocumentV3): string {
  const rows = drawingDocumentRows(document);
  const summaryRows = drawingDocumentSummary(document)
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('\n');
  const bodyRows = rows.map((row) => `<tr>${rowValues(row).map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('\n');
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"/>
<meta name="referrer" content="no-referrer"/>
<title>ESA 도면 판독 보고서</title>
<style>
body { font-family: -apple-system, sans-serif; max-width: 1100px; margin: 0 auto; padding: 32px; color: #111827; }
h1 { font-size: 1.45rem; border-bottom: 2px solid #1e40af; padding-bottom: 8px; }
h2 { font-size: 1rem; margin: 24px 0 8px; }
.meta { color: #6b7280; font-size: .82rem; overflow-wrap: anywhere; }
.notice { margin: 16px 0; padding: 12px; border-left: 3px solid #b45309; background: #fffbeb; font-size: .85rem; }
table { width: 100%; border-collapse: collapse; font-size: .8rem; }
th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
thead th, .summary th { background: #f9fafb; }
.summary th { width: 28%; }
@media print { @page { size: landscape; margin: 12mm; } body { padding: 0; } thead { display: table-header-group; } tr { break-inside: avoid; } }
</style></head><body>
<h1>ESA 도면 판독 보고서</h1>
<p class="meta">출력 시각(UTC): ${escapeHtml(new Date().toISOString())} · 반출 항목 ${rows.length}행</p>
<div class="notice">이 표는 AI 판독 결과이며 설계 승인이나 법적 적합성 인증서가 아닙니다.
같은 도면을 다시 판독하면 결과가 달라질 수 있으므로, 잠정·미판독 항목은 결론 변경 조건과 원본 도면을 대조한 뒤 사용하십시오.
단자 경로 확인은 원본 좌표의 연결 근거이며 전류 방향이나 설계 적합성을 뜻하지 않습니다.</div>
<h2>판독 상태 요약</h2><table class="summary"><tbody>${summaryRows}</tbody></table>
<h2>판독 항목</h2><table><thead><tr>${HEADERS.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${bodyRows}</tbody></table>
<script>window.addEventListener('load', function () { window.print(); });</script>
</body></html>`;
}
