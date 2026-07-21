import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('source-linked SLD report surface', () => {
  it('exposes numbered, keyboard-selectable symbols and lines', () => {
    const overlay = source('src/components/DrawingEvidenceOverlay.tsx');

    expect(overlay).toContain('도면 분석 근거 오버레이');
    expect(overlay).toContain('aria-pressed');
    expect(overlay).toContain('aria-label={`기기 ${number}:');
    expect(overlay).toContain('aria-label={`선로 ${number}:');
    expect(overlay).toContain('min-h-11 min-w-11');
    expect(overlay).toContain('onSelect');
  });

  it('shows quantities, relationships, calculations, dissent, proposals, and HOLD', () => {
    const report = source('src/components/DrawingIntelligenceReport.tsx');

    expect(report).toContain('기기 수량');
    expect(report).toContain('기기·선로 연결관계');
    expect(report).toContain('근거 기반 계산');
    expect(report).toContain('독립 심사 이견');
    expect(report).toContain('개선 제안');
    expect(report).toContain('미확인·보류');
    expect(report).toContain('report.verified95 ?');
  });

  it('loads only hash-matched local source bytes on the real report route', () => {
    const page = source('src/app/(with-nav)/report/[id]/page.tsx');
    const upload = source('src/app/(with-nav)/tools/sld/page.tsx');

    expect(upload).toContain('storeDrawingAsset');
    expect(page).toContain('loadDrawingAsset');
    expect(page).toContain('drawingIntelligence');
    expect(page).toContain('DrawingEvidenceOverlay');
    expect(page).toContain('DrawingIntelligenceReport');
  });

  it('contains wide evidence tables without widening the mobile page', () => {
    const page = source('src/app/(with-nav)/report/[id]/page.tsx');
    const report = source('src/components/DrawingIntelligenceReport.tsx');

    expect(page).toContain('min-w-0 xl:sticky');
    expect(report).toContain('min-w-0 border');
  });

  it('guards corrections, derives resume eligibility, and localizes V3 states', () => {
    const page = source('src/app/(with-nav)/tools/sld/page.tsx');
    const report = source('src/components/DrawingDocumentV3Report.tsx');

    expect(page).toContain('v3CorrectionInFlightRef.current.has(targetDisplayId)');
    expect(page).toContain("v3Doc?.jobStatus === 'PARTIAL'");
    expect(page).toContain('labelJobStatus(v3JobStatus)');
    expect(page).toContain('labelDocumentReadStatus(v3Doc.verification.documentStatus)');
    expect(report).toContain('labelReadFailureCode(item.code)');
    expect(report).toContain('correctingDisplayId === item.displayId');
  });

  it('uses semantic drawing tokens and a visible SVG keyboard focus target', () => {
    const legacyOverlay = source('src/components/DrawingEvidenceOverlay.tsx');
    const overlay = source('src/components/DrawingDocumentV3Overlay.tsx');

    expect(legacyOverlay).toContain("stroke={selected ? 'var(--color-error)' : 'var(--color-warning)'}");
    expect(legacyOverlay).not.toContain('#b42318');
    expect(overlay).toContain('drawing-overlay-target');
    expect(overlay).toContain('drawing-overlay-line-target');
    expect(overlay).not.toContain('#b42318');
  });
});
