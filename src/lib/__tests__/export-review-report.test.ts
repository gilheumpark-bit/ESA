import {
  reviewReportCsv,
  reviewReportPrintableHtml,
  reviewReportRows,
} from '../export-review-report';

const report = {
  reportId: 'RPT-1',
  projectName: '변전소 A',
  projectType: '수배전반',
  createdAt: '2026-08-04T00:00:00.000Z',
  verdict: 'CONDITIONAL',
  grade: 'B',
  compositeScore: 78,
  requiresHumanReview: true,
  summary: { totalComponents: 12, totalConnections: 11, totalCalculations: 3, passedChecks: 2, failedChecks: 1 },
  markings: [{ severity: 'critical', message: '접지 경로 미확인' }],
  evidenceIds: ['ev-1', 'ev-2'],
  hash: 'a'.repeat(64),
};

describe('검토 보고서 반출', () => {
  it('판정·요약·근거·해시를 표로 편다', () => {
    const rows = reviewReportRows(report);
    const find = (label: string) => rows.find((row) => row.label === label)?.value;
    expect(find('보고서 ID')).toBe('RPT-1');
    expect(find('판정')).toBe('CONDITIONAL');
    expect(find('종합 점수')).toBe('78');
    expect(find('사람(PE) 검토 필요')).toBe('필요');
    expect(find('실패 검사')).toBe('1');
    expect(find('근거 ID 수')).toBe('2');
    expect(find('보고서 해시')).toBe('a'.repeat(64));
  });

  it('없는 값을 지어내지 않고 미기재로 남긴다', () => {
    const rows = reviewReportRows({ reportId: 'RPT-2' });
    expect(rows.find((row) => row.label === '판정')?.value).toBe('미기재');
    expect(rows.find((row) => row.label === '프로젝트')?.value).toBe('미기재');
  });

  it('검증 마킹을 빠뜨리지 않는다', () => {
    const rows = reviewReportRows(report);
    expect(rows.some((row) => row.section === '검증 마킹' && row.value === '접지 경로 미확인')).toBe(true);
  });

  it('CSV는 BOM과 CRLF로 Excel 한글을 보장한다', () => {
    const csv = reviewReportCsv(report);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('\r\n');
    expect(csv).toContain('변전소 A');
  });

  it('CSV 주입 문자를 이스케이프한다', () => {
    const csv = reviewReportCsv({ ...report, projectName: '변전소, "A"\n2층' });
    expect(csv).toContain('"변전소, ""A""\n2층"');
  });

  it('인쇄용 HTML은 자동 인쇄와 면책 문구를 포함한다', () => {
    const html = reviewReportPrintableHtml(report);
    expect(html).toContain('window.print()');
    expect(html).toContain('설계 승인');
    expect(html).toContain('RPT-1');
  });

  it('HTML 주입을 이스케이프한다', () => {
    const html = reviewReportPrintableHtml({ ...report, projectName: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
