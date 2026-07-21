import { buildDocumentReadReceipt, buildDrawingDocumentV3 } from '../drawing-document-report';

describe('drawing document completeness receipt', () => {
  it('allows an explicitly classified all-empty document without fake specialist calls', () => {
    const receipt = buildDocumentReadReceipt({
      drawingHash: 'a'.repeat(64), pageCount: 1,
      pages: [{ pageIndex: 0, status: 'skipped-empty', drawingKind: 'empty', vlmCalls: 0 }],
      coverage: { plannedRegionCount: 0, regionsComplete: 0, regionsFailed: 0, regionsSkippedEmpty: 0, regions: [], rolesPresent: [], unresolvedRescans: 0, allPlannedFinished: true },
      holdReasons: [],
      jobStatus: 'COMPLETE',
    });
    expect(receipt).toMatchObject({ status: 'COMPLETE', claimsComplete: true, pagesCompleted: 1 });
  });

  it('never presents a cancelled job as a complete reading', () => {
    const receipt = buildDocumentReadReceipt({
      drawingHash: 'b'.repeat(64), pageCount: 1,
      pages: [{ pageIndex: 0, status: 'complete', drawingKind: 'sld', vlmCalls: 0 }],
      coverage: { plannedRegionCount: 0, regionsComplete: 0, regionsFailed: 0, regionsSkippedEmpty: 0, regions: [], rolesPresent: ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'], unresolvedRescans: 0, allPlannedFinished: true },
      holdReasons: [],
      jobStatus: 'CANCELLED',
    });
    expect(receipt).toMatchObject({ status: 'CANCELLED', claimsComplete: false });
  });

  it('keeps a fully processed document on HOLD when relation claims remain ambiguous', () => {
    const document = buildDrawingDocumentV3({
      documentHash: 'c'.repeat(64),
      documentPageCount: 1,
      jobStatus: 'COMPLETE',
      requestedPages: 'all',
      pages: [{ pageIndex: 0, status: 'complete', drawingKind: 'sld', vlmCalls: 0 }],
      coverageLedger: {
        plannedRegionCount: 1,
        regionsComplete: 1,
        regionsFailed: 0,
        regionsSkippedEmpty: 0,
        regions: [],
        rolesPresent: ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'],
        unresolvedRescans: 0,
        allPlannedFinished: true,
      },
      evidenceGraph: {
        symbols: [],
        lines: [],
        texts: [],
        relations: [{
          id: 'r1', displayId: 'P01-R001', from: 's1', to: 's2', lineId: 'l1',
          certainty: 'ambiguous', evidence: [],
        }],
      },
      crossPageRelations: [],
      equipmentCounts: [],
      ratedValues: [],
      calculations: [],
      recommendations: [],
      unresolvedItems: [],
    });

    expect(document.verification).toMatchObject({
      documentStatus: 'HOLD',
      claimsComplete: false,
      holdReasons: expect.arrayContaining(['LINE_CONTINUITY_UNCERTAIN']),
    });
  });
});
