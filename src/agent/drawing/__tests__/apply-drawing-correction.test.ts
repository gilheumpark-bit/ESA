import type { DrawingDocumentV3 } from '../types-v3';
import { applyDrawingCorrection } from '../apply-drawing-correction';

function documentFixture(): DrawingDocumentV3 {
  return {
    schemaVersion: 3,
    documentHash: 'a'.repeat(64),
    pageCount: 1,
    requestedPages: 'all',
    jobStatus: 'COMPLETE',
    pages: [{ pageIndex: 0, status: 'complete', drawingKind: 'sld', vlmCalls: 18 }],
    coverageLedger: {
      plannedRegionCount: 1, regionsComplete: 1, regionsFailed: 0, regionsSkippedEmpty: 0,
      rolesPresent: ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'],
      unresolvedRescans: 0, allPlannedFinished: true,
      regions: [{ regionId: 'p0-full', pageIndex: 0, kind: 'full-page', bounds: { x: 0, y: 0, w: 100, h: 80 }, requiredRoles: ['symbols'], roleCalls: { symbols: [{ callId: 'call', success: true }] }, status: 'complete' }],
    },
    evidenceGraph: {
      symbols: [{ id: 'sym-0-1', displayId: 'P01-S001', typeCandidates: ['vcb'], confirmedType: 'vcb', rawLabel: 'VCB-1', certainty: 'confirmed', evidence: [{ evidenceId: 'sym-e', pageIndex: 0, bounds: { x: 10, y: 10, w: 10, h: 10 }, confidence: 0.95 }] }],
      lines: [],
      texts: [{ id: 'txt-0-1', displayId: 'P01-T001', rawText: '1OOA', candidates: ['100A', '1OOA'], certainty: 'ambiguous', holdCode: 'AMBIGUOUS_OCR', evidence: [{ evidenceId: 'text-e', pageIndex: 0, bounds: { x: 20, y: 10, w: 20, h: 8 }, confidence: 0.8 }] }],
      relations: [],
    },
    crossPageRelations: [],
    equipmentCounts: [],
    ratedValues: [],
    calculations: [{ id: 'P01-calc-1', calculatorId: 'breaker-sizing', label: '차단기 용량', value: 100, unit: 'A', compliant: null, receiptHash: 'b'.repeat(64), evidenceIds: ['text-e'] }],
    recommendations: [],
    unresolvedItems: [{ id: 'ocr-0-1', code: 'AMBIGUOUS_OCR', displayId: 'P01-T001', pageIndex: 0, bounds: { x: 20, y: 10, w: 20, h: 8 }, note: '후보 확인' }],
    userCorrections: [],
    verification: { claimsComplete: true, documentStatus: 'COMPLETE', holdReasons: [], evidenceTraceRate: 1, verified95: true, productionFingerprint: { engineVersion: 'e', promptVersion: 'p', preprocessVersion: 'x' } },
    title: '전체 도면 판독표',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('applyDrawingCorrection', () => {
  it('recomputes derived fields and invalidates calculations that used corrected evidence', () => {
    const corrected = applyDrawingCorrection(documentFixture(), {
      targetDisplayId: 'P01-T001', selectedValue: '100A', correctedBy: 'authenticated-user',
    });

    expect(corrected.evidenceGraph.texts[0]).toMatchObject({ confirmedText: '100A', certainty: 'confirmed', holdCode: undefined });
    expect(corrected.ratedValues[0]).toMatchObject({ normalized: { value: 100, unit: 'A' } });
    expect(corrected.calculations[0]).toMatchObject({ value: undefined, receiptHash: undefined, compliant: null });
    expect(corrected.unresolvedItems).toEqual([expect.objectContaining({ code: 'CORRECTION_REANALYSIS_REQUIRED', pageIndex: 0 })]);
    expect(corrected.pages[0]).toMatchObject({ status: 'failed', error: 'CORRECTION_REANALYSIS_REQUIRED' });
    expect(corrected.jobStatus).toBe('PARTIAL');
    expect(corrected.verification.verified95).toBe(false);
    expect(corrected.userCorrections[0].affectedEntityIds).toEqual(expect.arrayContaining(['P01-T001', 'P01-calc-1']));
    expect(corrected.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
