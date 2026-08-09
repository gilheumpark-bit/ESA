import {
  drawingDocumentCsv,
  drawingDocumentPrintableHtml,
  drawingDocumentRows,
  drawingDocumentSummary,
} from '../export-drawing-document';
import type { DrawingDocumentV3 } from '@/agent/drawing/types-v3';

function doc(overrides: Partial<DrawingDocumentV3> = {}): DrawingDocumentV3 {
  return {
    documentHash: 'f'.repeat(64),
    jobStatus: 'PARTIAL',
    pages: [{ pageIndex: 0, status: 'complete', drawingKind: 'sld', vlmCalls: 34 }],
    evidenceGraph: {
      symbols: [
        { id: 's1', displayId: 'P01-S001', typeCandidates: ['fuse'], confirmedType: 'fuse', rawLabel: 'FU1', certainty: 'confirmed', evidence: [] },
        { id: 's2', displayId: 'P01-S002', typeCandidates: ['fuse', 'breaker'], rawLabel: null, certainty: 'ambiguous', evidence: [] },
      ],
      lines: [],
      texts: [],
      relations: [
        { id: 'r1', displayId: 'P01-R001', from: 'P01-S001', to: 'P01-S002', lineId: 'P01-L001', certainty: 'confirmed', evidence: [] },
      ],
    },
    unresolvedItems: [
      { id: 'u1', code: 'AMBIGUOUS_OCR', pageIndex: 0, bounds: { x: 0, y: 0, w: 1, h: 1 }, note: 'FU3 판독 후보 2개' },
    ],
    recommendations: [
      { id: 'rec-1', severity: 'critical', priority: 1, problem: '접지 경로가 확정 그래프에서 확인되지 않았습니다.', relatedDisplayIds: [], evidenceIds: [], calcReceiptIds: [], standardRefs: [], requiredInputs: [], aiDecision: 'ESA 잠정 판단: 접지 표기 누락 가능성이 있습니다.', recommendedAction: '접지 표기 보완 후보로 유지합니다.', status: 'HOLD' },
    ],
    coverageLedger: { regions: [], rolesPresent: [], plannedRegionCount: 10, regionsComplete: 9, regionsFailed: 1, unresolvedRescans: 1, allPlannedFinished: true },
    ...overrides,
  } as unknown as DrawingDocumentV3;
}

describe('도면 문서 반출', () => {
  it('모호 항목을 빼지 않는다', () => {
    // 확정만 뽑으면 검토자가 반출물을 완성된 목록으로 읽는다.
    const rows = drawingDocumentRows(doc());
    const ambiguous = rows.find((row) => row.displayId === 'P01-S002');
    expect(ambiguous?.certainty).toBe('ESA 잠정 판독');
    expect(ambiguous?.detail).toContain('후보: fuse/breaker');
  });

  it('잠정 보류 항목과 ESA 판단·조치를 함께 싣는다', () => {
    const rows = drawingDocumentRows(doc());
    expect(rows.some((row) => row.section === '잠정 보류' && row.detail === 'FU3 판독 후보 2개')).toBe(true);
    const recommendation = rows.find((row) => row.section === '제안' && row.certainty === 'HOLD');
    expect(recommendation?.detail).toContain('ESA 잠정 판단: 접지 표기 누락 가능성이 있습니다.');
    expect(recommendation?.detail).toContain('권장 조치: 접지 표기 보완 후보로 유지합니다.');
  });

  it('요약에 확정/전체를 분리해 적는다', () => {
    const summary = Object.fromEntries(drawingDocumentSummary(doc()));
    expect(summary['기기(확정/전체)']).toBe('1 / 2');
    expect(summary['연결(확정/전체)']).toBe('1 / 1');
    expect(summary['잠정 보류 항목']).toBe('1');
    expect(summary['구획 완료/계획']).toBe('9 / 10');
    expect(summary['미해결 재검사']).toBe('1');
  });

  it('CSV는 BOM·CRLF와 요약 머리를 포함한다', () => {
    const csv = drawingDocumentCsv(doc());
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('\r\n');
    expect(csv).toContain('요약,작업 상태');
    expect(csv).toContain('구분,표시 ID,종류,내용,판독 상태');
  });

  it('CSV 주입 문자를 이스케이프한다', () => {
    const injected = doc({
      unresolvedItems: [
        { id: 'u2', code: 'X', pageIndex: 0, bounds: { x: 0, y: 0, w: 1, h: 1 }, note: 'a,b "c"' },
      ] as never,
    });
    expect(drawingDocumentCsv(injected)).toContain('"a,b ""c"""');
  });

  it('인쇄본은 재판독 시 결과가 달라질 수 있음을 명시한다', () => {
    const html = drawingDocumentPrintableHtml(doc());
    expect(html).toContain('설계 승인');
    expect(html).toContain('다시 판독하면 결과가 달라질 수 있');
    expect(html).toContain('window.print()');
  });

  it('HTML 주입을 이스케이프한다', () => {
    const injected = doc({
      unresolvedItems: [
        { id: 'u3', code: 'X', pageIndex: 0, bounds: { x: 0, y: 0, w: 1, h: 1 }, note: '<img src=x onerror=alert(1)>' },
      ] as never,
    });
    const html = drawingDocumentPrintableHtml(injected);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});
