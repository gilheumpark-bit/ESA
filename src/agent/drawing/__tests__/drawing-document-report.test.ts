import { buildDocumentReadReceipt } from '../drawing-document-report';

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
});
