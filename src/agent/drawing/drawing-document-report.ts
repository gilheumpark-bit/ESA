/**
 * Build DrawingDocument V3 + DocumentReadReceipt.
 */

import type {
  CoverageLedger,
  DocumentReadReceipt,
  DocumentReadStatus,
  DrawingDocumentV3,
  JobStatus,
  PageAnalysisState,
  ReadFailureCode,
  RoleId,
  VerificationBlock,
} from './types-v3';
import {
  DRAWING_DOCUMENT_SCHEMA_VERSION,
  ENGINE_VERSION,
  PREPROCESS_VERSION,
  PROMPT_VERSION,
} from './types-v3';
import { assertCoverageAllowsComplete } from './coverage-ledger';

export function buildDocumentReadReceipt(input: {
  drawingHash: string;
  pageCount: number;
  pages: PageAnalysisState[];
  coverage: CoverageLedger;
  holdReasons: ReadFailureCode[];
  jobStatus: JobStatus;
  requiredRoles?: RoleId[];
}): DocumentReadReceipt {
  const required: RoleId[] = input.requiredRoles ?? [
    'symbols', 'connections', 'text', 'logic', 'coverage-auditor',
  ];
  const pagesCompleted = input.pages.filter((p) =>
    p.status === 'complete' || p.status === 'failed' || p.status === 'skipped-empty').length;
  const anyFailed = input.pages.some((p) => p.status === 'failed')
    || input.coverage.regionsFailed > 0;
  const allPagesIntentionallyEmpty = input.pages.length > 0
    && input.pages.every((page) => page.status === 'skipped-empty');
  const rolesOk = allPagesIntentionallyEmpty
    || required.every((r) => input.coverage.rolesPresent.includes(r));
  const coverageOk = assertCoverageAllowsComplete(input.coverage);

  let status: DocumentReadStatus = 'COMPLETE';
  if (input.holdReasons.length > 0 && !anyFailed && coverageOk && rolesOk
    && pagesCompleted === input.pageCount) {
    // all finished but holds remain
    status = 'HOLD';
  }
  if (!coverageOk || !rolesOk || pagesCompleted < input.pageCount || anyFailed) {
    status = 'PARTIAL';
  }
  if (input.holdReasons.includes('PARTIAL_BUDGET_EXCEEDED')) {
    status = 'PARTIAL';
  }
  if (input.jobStatus === 'FAILED') status = 'FAILED';
  if (input.jobStatus === 'CANCELLED') status = 'CANCELLED';

  const claimsComplete = status === 'COMPLETE'
    && input.holdReasons.length === 0
    && coverageOk
    && rolesOk;

  return {
    status: claimsComplete ? 'COMPLETE' : status === 'HOLD' ? 'HOLD' : status,
    drawingHash: input.drawingHash,
    pageCount: input.pageCount,
    pagesCompleted,
    plannedRegionCount: input.coverage.plannedRegionCount,
    regionsComplete: input.coverage.regionsComplete,
    regionsFailed: input.coverage.regionsFailed,
    regionsSkippedEmpty: input.coverage.regionsSkippedEmpty,
    rolesPresent: input.coverage.rolesPresent,
    unresolvedRescans: input.coverage.unresolvedRescans,
    holdReasons: input.holdReasons,
    claimsComplete,
  };
}

export function buildDrawingDocumentV3(input: {
  documentHash: string;
  /** Total pages in the source document, including pages outside a requested subset. */
  documentPageCount: number;
  jobStatus: JobStatus;
  requestedPages: number[] | 'all';
  pages: PageAnalysisState[];
  coverageLedger: CoverageLedger;
  evidenceGraph: DrawingDocumentV3['evidenceGraph'];
  crossPageRelations: DrawingDocumentV3['crossPageRelations'];
  equipmentCounts: DrawingDocumentV3['equipmentCounts'];
  ratedValues: DrawingDocumentV3['ratedValues'];
  calculations: DrawingDocumentV3['calculations'];
  recommendations: DrawingDocumentV3['recommendations'];
  unresolvedItems: DrawingDocumentV3['unresolvedItems'];
  userCorrections?: DrawingDocumentV3['userCorrections'];
  verificationExtra?: Partial<VerificationBlock>;
}): DrawingDocumentV3 {
  const holdReasons = collectHoldReasons(input.unresolvedItems, input.jobStatus);
  if (input.evidenceGraph.symbols.some((item) => item.certainty !== 'confirmed')) {
    addHoldReason(holdReasons, 'UNREADABLE_SYMBOL');
  }
  if (input.evidenceGraph.lines.some((item) => item.certainty === 'unread')) {
    addHoldReason(holdReasons, 'UNREADABLE_LINE');
  }
  if (input.evidenceGraph.lines.some((item) => item.certainty === 'ambiguous')
    || input.evidenceGraph.relations.some((item) => item.certainty !== 'confirmed')) {
    addHoldReason(holdReasons, 'LINE_CONTINUITY_UNCERTAIN');
  }
  if (input.evidenceGraph.texts.some((item) => item.certainty === 'ambiguous')) {
    addHoldReason(holdReasons, 'AMBIGUOUS_OCR');
  }
  if (input.evidenceGraph.texts.some((item) => item.certainty === 'unread')) {
    addHoldReason(holdReasons, 'UNREADABLE_TEXT');
  }
  const receipt = buildDocumentReadReceipt({
    drawingHash: input.documentHash,
    // Completeness is evaluated against the requested page set. The source's
    // total page count remains separately visible on DrawingDocumentV3.
    pageCount: input.pages.length,
    pages: input.pages,
    coverage: input.coverageLedger,
    holdReasons,
    jobStatus: input.jobStatus,
  });

  const evidenceIds = countEvidenceIds(input.evidenceGraph);
  const linked = countLinkedClaims(input.evidenceGraph, input.recommendations);
  const evidenceTraceRate = evidenceIds === 0 ? 1 : linked / Math.max(1, evidenceIds);

  const title = input.jobStatus === 'CANCELLED'
    ? '분석 취소 결과'
    : input.jobStatus === 'FAILED'
      ? '분석 실패 결과'
      : receipt.claimsComplete
        ? '전체 도면 판독표'
        : '부분 분석 결과';

  const now = new Date().toISOString();
  const verification: VerificationBlock = {
    claimsComplete: receipt.claimsComplete,
    documentStatus: receipt.status,
    holdReasons,
    evidenceTraceRate,
    verified95: false,
    productionFingerprint: {
      engineVersion: ENGINE_VERSION,
      promptVersion: PROMPT_VERSION,
      preprocessVersion: PREPROCESS_VERSION,
    },
    ...input.verificationExtra,
  };

  // Never allow verified95 without external signed receipt matching fingerprint
  if (verification.verified95 && !verification.verified95Receipt) {
    verification.verified95 = false;
  }

  return {
    schemaVersion: DRAWING_DOCUMENT_SCHEMA_VERSION,
    documentHash: input.documentHash,
    pageCount: input.documentPageCount,
    requestedPages: input.requestedPages,
    jobStatus: input.jobStatus,
    pages: input.pages,
    coverageLedger: input.coverageLedger,
    evidenceGraph: input.evidenceGraph,
    crossPageRelations: input.crossPageRelations,
    equipmentCounts: input.equipmentCounts,
    ratedValues: input.ratedValues,
    calculations: input.calculations,
    recommendations: input.recommendations,
    unresolvedItems: input.unresolvedItems,
    userCorrections: input.userCorrections ?? [],
    verification,
    title,
    createdAt: now,
    updatedAt: now,
  };
}

/** Read-only V2 quantities → V3 equipmentCounts adapter (does not mutate V2). */
export function adaptV2QuantitiesToV3(
  quantities: Record<string, number> | undefined,
): DrawingDocumentV3['equipmentCounts'] {
  if (!quantities) return [];
  return Object.entries(quantities).map(([equipmentKind, n]) => ({
    equipmentKind,
    confirmed: 0,
    ambiguous: n,
    missingSuspected: 0,
    physicalEquipmentCount: null,
    symbolOccurrences: n,
    countStatus: 'HOLD' as const,
  }));
}

function collectHoldReasons(
  unresolved: DrawingDocumentV3['unresolvedItems'],
  jobStatus: JobStatus,
): ReadFailureCode[] {
  const codes = new Set<ReadFailureCode>();
  for (const u of unresolved) codes.add(u.code);
  if (jobStatus === 'PARTIAL') {
    /* keep unresolved only */
  }
  return [...codes];
}

function addHoldReason(reasons: ReadFailureCode[], reason: ReadFailureCode): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function countEvidenceIds(graph: DrawingDocumentV3['evidenceGraph']): number {
  let n = 0;
  for (const s of graph.symbols) n += s.evidence.length;
  for (const l of graph.lines) n += l.evidence.length;
  for (const t of graph.texts) n += t.evidence.length;
  return n;
}

function countLinkedClaims(
  graph: DrawingDocumentV3['evidenceGraph'],
  recs: DrawingDocumentV3['recommendations'],
): number {
  const all = new Set<string>();
  for (const s of graph.symbols) s.evidence.forEach((e) => all.add(e.evidenceId));
  for (const l of graph.lines) l.evidence.forEach((e) => all.add(e.evidenceId));
  for (const t of graph.texts) t.evidence.forEach((e) => all.add(e.evidenceId));
  let linked = 0;
  for (const id of all) {
    const used = graph.symbols.some((s) => s.evidence.some((e) => e.evidenceId === id) && s.certainty === 'confirmed')
      || graph.lines.some((l) => l.evidence.some((e) => e.evidenceId === id) && l.certainty === 'confirmed')
      || graph.texts.some((t) => t.evidence.some((e) => e.evidenceId === id) && t.certainty === 'confirmed')
      || recs.some((r) => r.evidenceIds.includes(id));
    if (used) linked++;
  }
  return linked;
}
