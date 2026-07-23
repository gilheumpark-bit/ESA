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
    expect(report).toContain("node.rawLabel ? ` · ${node.rawLabel}` : ''");
  });

  it('routes every primary drawing upload through the V3 full-document analysis', () => {
    const page = source('src/app/(with-nav)/tools/sld/page.tsx');

    expect(page).toContain('const handlePrimaryDocumentUpload');
    expect(page.match(/handlePrimaryDocumentUpload\(file\)/g)).toHaveLength(3);
    expect(page).toContain('기본 분석은 전체 페이지·구획·독립 심사를 수행합니다.');
    expect(page).toContain("let endpoint: 'run' | 'resume' = 'run'");
    expect(page).toContain("endpoint = 'resume'");
    expect(page).toContain('settledPages <= previousSettledPages');
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

  it('shows numbered A regions, C continuation ports, and U holds without treating them as equipment', () => {
    const overlay = source('src/components/DrawingDocumentV3Overlay.tsx');
    const report = source('src/components/DrawingDocumentV3Report.tsx');

    expect(overlay).toContain('continuityRegions');
    expect(overlay).toContain('경계 연결점');
    expect(overlay).toContain('미해결 선 끝');
    expect(overlay).toContain('strokeDasharray="6 4"');
    expect(report).toContain("'continuity'");
    expect(report).toContain('경계 연결');
    expect(report).toContain('구획 번호는 기기 수량에 포함되지 않습니다.');
  });

  it('loads browser PDF binary assets and routes A/C/U selections to their source page', () => {
    const preview = source('src/components/DrawingSourcePreview.tsx');
    const page = source('src/app/(with-nav)/tools/sld/page.tsx');

    expect(preview).toContain("cMapUrl: '/vendor/pdfjs/cmaps/'");
    expect(preview).toContain("standardFontDataUrl: '/vendor/pdfjs/standard_fonts/'");
    expect(preview).toContain("wasmUrl: '/vendor/pdfjs/wasm/'");
    expect(page).toContain('continuity?.regions');
    expect(page).toContain('continuity?.continuations');
    expect(page).toContain('continuity?.unresolvedEndpoints');
  });

  it('reruns the retained drawing and labels model confidence without implying measured accuracy', () => {
    const page = source('src/app/(with-nav)/tools/sld/page.tsx');

    expect(page).toContain('onClick={() => void handleAnalyze()}');
    expect(page).toContain('모델 추정 확신도:');
    expect(page).toContain('정답률이 아닌 AI 자체 추정치');
    expect(page).not.toContain('정확도:');
    expect(page).toContain('compareSLDAnalysisRuns');
    expect(page).toContain('반복 판독 불일치 · HOLD');
    expect(page).toContain('기기 {runComparison.componentCounts[0]}→{runComparison.componentCounts[1]}');
  });
});
