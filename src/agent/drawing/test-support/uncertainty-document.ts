import { buildDrawingDocumentV3 } from '../drawing-document-report';
import type { EvidenceRef, SymbolNode } from '../types-v3';

/** Synthetic contract data only: these counts are not measured drawing accuracy. */
export const readEvidence = (id: string): EvidenceRef[] => [{ evidenceId: `e-${id}`, pageIndex: 0,
  bounds: { x: 20, y: 20, w: 20, h: 10 }, confidence: 0.99 }];
export const readSymbol = (certainty: SymbolNode['certainty'], id = 's1'): SymbolNode => ({
  id, displayId: `P01-${id}`, typeCandidates: certainty === 'unread' ? ['unknown'] : ['breaker'],
  ...(certainty === 'confirmed' ? { confirmedType: 'breaker' } : {}), certainty, evidence: readEvidence(id),
});
export function uncertaintyDocument() {
  return buildDrawingDocumentV3({ documentHash: 'a'.repeat(64), documentPageCount: 1, jobStatus: 'COMPLETE', requestedPages: 'all',
    pages: [{ pageIndex: 0, status: 'complete', drawingKind: 'sld', vlmCalls: 0 }],
    coverageLedger: { plannedRegionCount: 1, regionsComplete: 1, regionsFailed: 0, regionsSkippedEmpty: 0,
      regions: [], rolesPresent: ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'], unresolvedRescans: 0, allPlannedFinished: true },
    evidenceGraph: { symbols: [readSymbol('confirmed')], lines: [], texts: [], relations: [] },
    crossPageRelations: [], equipmentCounts: [], ratedValues: [], calculations: [], recommendations: [], unresolvedItems: [],
  });
}
