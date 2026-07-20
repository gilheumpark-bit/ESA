/**
 * DrawingDocument V3 full-document orchestrator.
 *
 * Source preparation and specialist review are delegated to the production
 * PDF/image/DXF stack. This module owns page state, budgets, coverage receipts,
 * deterministic reconciliation and the V3 report contract.
 */

import { executeSLDTeam, type SLDTeamDeps } from '@/agent/teams/sld-team';
import type { TeamInput, TeamResult } from '@/agent/teams/types';
import { planAdaptiveBounds } from '@/agent/vision/adaptive-regions';
import { resolveVlmModel } from '@/agent/vision/vlm-client';

import {
  buildCoverageLedger,
  createCoverageRegions,
  recordRoleCall,
  type CoverageRegionPlan,
} from './coverage-ledger';
import { adaptDrawingCalculations } from './calculation-adapter';
import { assignPhysicalEquipmentIds, buildEquipmentCounts } from './count-register';
import { extractPageRefHits, reconcileCrossPage } from './cross-page-graph';
import { buildDrawingDocumentV3 } from './drawing-document-report';
import { applyConfiguredEvaluationSuiteBadge } from './drawing-evaluation-gate';
import { prepareDrawingSource, type PreparedDrawingPage, type PreparedDrawingSource } from './drawing-source';
import {
  assignDisplayIdsForTexts,
  buildPageRelations,
  deduplicateLines,
  deduplicateSymbols,
  findUnboundLineItems,
  type RawLineHit,
  type RawSymbolHit,
} from './evidence-deduplicator';
import { canReusePage, createJob, getJob, getOwnedJob, updateJob, type DrawingJobRecord } from './drawing-job-store';
import { surveyPageKind } from './page-classifier';
import { adjudicateOcr } from './ocr-adjudicator';
import { buildRecommendations } from './recommendation-engine';
import { extractRatedValues } from './rated-value-extractor';
import { adaptTeamResult, type RawTextSeed } from './team-result-adapter';
import type {
  CoverageRegionRecord,
  DocumentBudget,
  DrawingDocumentV3,
  PageAnalysisState,
  RoleId,
  TextNode,
  UnresolvedItem,
} from './types-v3';
import {
  ENGINE_VERSION,
  GRAPH_ASSEMBLY_VERSION,
  PREPROCESS_VERSION,
  PROMPT_VERSION,
} from './types-v3';

export interface OrchestrateInput {
  bytes: ArrayBuffer;
  mimeType: string;
  fileName?: string;
  requestedPages?: 'all' | number[];
  budget?: Partial<DocumentBudget>;
  vision?: {
    provider: 'gemini' | 'openai' | 'claude';
    apiKey: string;
    model?: string;
  };
  signal?: AbortSignal;
  seedDetections?: {
    symbols?: RawSymbolHit[];
    lines?: RawLineHit[];
    texts?: RawTextSeed[];
  };
  jobId?: string;
  ownerId?: string;
}

export interface DocumentAnalysisDependencies {
  prepareSource?: typeof prepareDrawingSource;
  executeTeam?: typeof executeSLDTeam;
  teamDeps?: SLDTeamDeps;
}

const DEFAULT_BUDGET: DocumentBudget = {
  maxPages: 50,
  maxVlmCalls: 120,
  maxPixels: 40_000_000,
  deadlineMs: 10 * 60_000,
};

const ALL_ROLES: RoleId[] = ['symbols', 'connections', 'text', 'logic', 'coverage-auditor'];
const REGION_ROLES: RoleId[] = ['symbols', 'connections', 'text'];

function normalizeBudget(input: Partial<DocumentBudget> | undefined): DocumentBudget {
  const budget = { ...DEFAULT_BUDGET, ...input };
  const limits: Array<[keyof DocumentBudget, number, number]> = [
    ['maxPages', 1, 500],
    ['maxVlmCalls', 0, 10_000],
    ['maxPixels', 1, 1_000_000_000],
    ['deadlineMs', 1, 60 * 60_000],
  ];
  for (const [key, min, max] of limits) {
    const value = budget[key];
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`DRAWING_BUDGET_INVALID:${key}`);
    }
  }
  return budget;
}

function requestedPageIndexes(source: PreparedDrawingSource, requested: OrchestrateInput['requestedPages']): number[] {
  const available = new Set(source.pages.map((page) => page.pageIndex));
  if (requested === undefined || requested === 'all') return [...available].sort((a, b) => a - b);
  return [...new Set(requested)].filter((page) => available.has(page)).sort((a, b) => a - b);
}

function gridSizeFor(page: PreparedDrawingPage): 4 | 9 | 16 {
  if (page.quality.recommendedScale === 4) return 16;
  if (page.quality.recommendedScale === 2) return 9;
  return 4;
}

function pageDigestFingerprint(
  source: PreparedDrawingSource,
  page: PreparedDrawingPage,
  input: OrchestrateInput,
) {
  const usesVision = Boolean(input.vision && page.imageBuffer
    && source.formatClass !== 'dxf'
    && (page.renderMode === 'raster' || page.renderMode === 'hybrid' || source.formatClass === 'raster-image'));
  return {
    documentHash: source.documentHash,
    pageRenderHash: page.renderHash,
    promptVersion: PROMPT_VERSION,
    preprocessVersion: PREPROCESS_VERSION,
    graphVersion: GRAPH_ASSEMBLY_VERSION,
    provider: usesVision ? input.vision?.provider : undefined,
    model: usesVision && input.vision ? resolveVlmModel(input.vision.provider, input.vision.model) : undefined,
  };
}

function rasterCoveragePlans(page: PreparedDrawingPage): CoverageRegionPlan[] {
  const gridSize = gridSizeFor(page);
  const plans: CoverageRegionPlan[] = [{
    regionId: `p${page.pageIndex}-full`,
    pageIndex: page.pageIndex,
    kind: 'full-page',
    bounds: { x: 0, y: 0, w: page.width, h: page.height },
    requiredRoles: ALL_ROLES,
  }];
  const bounds = planAdaptiveBounds(page.width, page.height, gridSize, 0.18);
  bounds.forEach((item, index) => plans.push({
    regionId: `p${page.pageIndex}-r${index}`,
    pageIndex: page.pageIndex,
    kind: 'grid',
    bounds: item,
    requiredRoles: REGION_ROLES,
  }));
  return plans;
}

function vectorCoveragePlans(page: PreparedDrawingPage): CoverageRegionPlan[] {
  return [{
    regionId: `p${page.pageIndex}-vector-full`,
    pageIndex: page.pageIndex,
    kind: 'full-page',
    bounds: { x: 0, y: 0, w: page.width, h: page.height },
    requiredRoles: ALL_ROLES,
  }];
}

function markAllFailed(
  regions: CoverageRegionRecord[],
  error: string,
): CoverageRegionRecord[] {
  let next = regions;
  for (const region of regions) {
    for (const role of region.requiredRoles) {
      next = recordRoleCall(next, region.regionId, role, `${region.regionId}:${role}:failed`, false, error);
    }
  }
  return next;
}

function markVectorComplete(
  regions: CoverageRegionRecord[],
  receipt: string,
): CoverageRegionRecord[] {
  let next = regions;
  for (const region of regions) {
    for (const role of region.requiredRoles) {
      next = recordRoleCall(next, region.regionId, role, `${receipt}:${role}`, true);
    }
  }
  return next;
}

function councilEnvelope(result: TeamResult, role: Exclude<RoleId, 'coverage-auditor'>) {
  return result.drawingReview?.envelopes.find((envelope) => envelope.role === role);
}

function hasSourceFailure(result: TeamResult, role: RoleId, sourceId: string): boolean {
  return (result.drawingReview?.failures ?? []).some((failure) =>
    failure.role === role && failure.sourceId === sourceId);
}

function markCouncilCoverage(
  regions: CoverageRegionRecord[],
  page: PreparedDrawingPage,
  result: TeamResult,
): { regions: CoverageRegionRecord[]; roles: RoleId[]; unresolvedRescans: number } {
  let next = regions;
  const completedRoles: RoleId[] = [];
  const review = result.drawingReview;
  const fullId = `p${page.pageIndex}-full`;
  for (const role of ['symbols', 'connections', 'text', 'logic'] as const) {
    const envelope = councilEnvelope(result, role);
    const sourceId = review?.coverage.roles[role]?.variantId ?? 'missing-source';
    const success = Boolean(envelope) && !hasSourceFailure(result, role, sourceId);
    next = recordRoleCall(
      next,
      fullId,
      role,
      envelope ? `${envelope.outputHash}:${sourceId}` : `${fullId}:${role}:missing`,
      success,
      success ? undefined : `${role} full-page review failed`,
    );
    if (success) completedRoles.push(role);
  }

  const bounds = planAdaptiveBounds(page.width, page.height, gridSizeFor(page), 0.18);
  for (let index = 0; index < bounds.length; index += 1) {
    const regionId = `p${page.pageIndex}-r${index}`;
    for (const role of ['symbols', 'connections', 'text'] as const) {
      const envelope = councilEnvelope(result, role);
      const variantId = review?.coverage.roles[role]?.variantId ?? 'missing-source';
      const sourceId = `${variantId}:region:${index}`;
      const planned = (review?.coverage.roles[role]?.actualRegionCount ?? 0) > index;
      const success = Boolean(envelope) && planned && !hasSourceFailure(result, role, sourceId);
      next = recordRoleCall(
        next,
        regionId,
        role,
        envelope ? `${envelope.outputHash}:${sourceId}` : `${regionId}:${role}:missing`,
        success,
        success ? undefined : `${role} precision review failed`,
      );
    }
  }

  const graphConflicts = review?.graph?.conflicts ?? [];
  const coverageSuccess = Boolean(review?.coverage.complete)
    && review?.failures.length === 0
    && graphConflicts.every((conflict) => !/UNBOUND|AMBIGUOUS_LINE|SELF_LINE/.test(conflict));
  next = recordRoleCall(
    next,
    fullId,
    'coverage-auditor',
    `coverage:${review?.snapshot.drawingHash ?? page.renderHash}`,
    coverageSuccess,
    coverageSuccess ? undefined : 'coverage audit found unresolved regions or graph conflicts',
  );
  if (coverageSuccess) completedRoles.push('coverage-auditor');
  const unresolvedRescans = coverageSuccess ? 0 : 1;
  return { regions: next, roles: completedRoles, unresolvedRescans };
}

function addUnresolved(
  target: UnresolvedItem[],
  page: PreparedDrawingPage,
  code: UnresolvedItem['code'],
  note: string,
  regionId?: string,
): void {
  target.push({
    id: `${code}-${page.pageIndex}-${target.length + 1}`,
    code,
    pageIndex: page.pageIndex,
    regionId,
    bounds: { x: 0, y: 0, w: page.width, h: page.height },
    note,
  });
}

function teamInputForVector(
  input: OrchestrateInput,
  source: PreparedDrawingSource,
  page: PreparedDrawingPage,
): TeamInput {
  const dxf = source.formatClass === 'dxf';
  return {
    sessionId: `drawing-vector-${source.documentHash.slice(0, 12)}-${page.pageIndex}`,
    classification: dxf ? 'sld_dxf' : 'sld_pdf',
    fileBuffer: input.bytes,
    fileName: input.fileName,
    mimeType: input.mimeType,
    params: dxf ? {} : { pageNumber: page.pageIndex + 1 },
    signal: input.signal,
  };
}

function teamInputForRaster(
  input: OrchestrateInput,
  source: PreparedDrawingSource,
  page: PreparedDrawingPage,
): TeamInput {
  return {
    sessionId: `drawing-raster-${source.documentHash.slice(0, 12)}-${page.pageIndex}`,
    classification: 'sld_image',
    fileBuffer: page.imageBuffer,
    fileName: `${input.fileName ?? 'drawing'}#page-${page.pageIndex + 1}.png`,
    mimeType: 'image/png',
    signal: input.signal,
    vision: input.vision,
  };
}

function mergeAdapted(
  result: TeamResult,
  page: PreparedDrawingPage,
  source: PreparedDrawingSource,
  symbolHits: RawSymbolHit[],
  lineHits: RawLineHit[],
  textSeeds: RawTextSeed[],
): void {
  const adapted = adaptTeamResult(result, {
    pageIndex: page.pageIndex,
    width: page.width,
    height: page.height,
    positionSpace: source.formatClass === 'dxf' ? 'source' : 'percent',
  });
  symbolHits.push(...adapted.symbols);
  lineHits.push(...adapted.lines);
  textSeeds.push(...adapted.texts);
}

function existingEvidenceSeeds(
  document: DrawingDocumentV3 | undefined,
  preservedPages: ReadonlySet<number>,
): { symbols: RawSymbolHit[]; lines: RawLineHit[]; texts: TextNode[] } {
  if (!document) return { symbols: [], lines: [], texts: [] };
  const symbols = document.evidenceGraph.symbols.flatMap((node) => {
    const evidence = node.evidence.filter((item) => preservedPages.has(item.pageIndex));
    return evidence.map((item) => ({
      localId: `${node.id}:${item.evidenceId}`,
      type: node.confirmedType ?? node.typeCandidates[0] ?? 'other',
      label: node.rawLabel,
      bounds: item.bounds,
      confidence: item.confidence,
      pageIndex: item.pageIndex,
      regionId: item.regionId ?? 'resume-preserved',
      certainty: node.certainty,
      sourceEvidenceIds: [item.evidenceId],
    }));
  });
  const lines = document.evidenceGraph.lines.flatMap((node) => {
    const evidence = node.evidence.filter((item) => preservedPages.has(item.pageIndex));
    const first = evidence[0];
    return first ? [{
      localId: node.id,
      lineKind: node.lineKind,
      path: node.path.map((point) => ({ ...point })),
      junctions: node.junctions.map((point) => ({ ...point })),
      crossovers: node.crossovers.map((point) => ({ ...point })),
      confidence: Math.max(...evidence.map((item) => item.confidence)),
      pageIndex: first.pageIndex,
      regionId: evidence.map((item) => item.regionId).filter(Boolean).join(',') || 'resume-preserved',
      certainty: node.certainty,
      sourceEvidenceIds: evidence.map((item) => item.evidenceId),
    }] : [];
  });
  const texts = document.evidenceGraph.texts.filter((node) =>
    node.evidence.some((item) => preservedPages.has(item.pageIndex)));
  return { symbols, lines, texts };
}

export async function runDocumentAnalysis(
  input: OrchestrateInput,
  deps: DocumentAnalysisDependencies = {},
): Promise<{ job: DrawingJobRecord; document: DrawingDocumentV3 }> {
  const budget = normalizeBudget(input.budget);
  const source = await (deps.prepareSource ?? prepareDrawingSource)({
    bytes: input.bytes,
    mimeType: input.mimeType,
    fileName: input.fileName,
  });
  const ownerId = input.ownerId ?? 'internal';
  const previousJob = input.jobId ? getOwnedJob(input.jobId, ownerId) : undefined;
  if (input.jobId && !previousJob) throw new Error('DRAWING_JOB_NOT_FOUND');
  if (previousJob && previousJob.documentHash !== source.documentHash) {
    throw new Error('DRAWING_JOB_SOURCE_MISMATCH');
  }
  const requestedSpec = input.requestedPages ?? previousJob?.document?.requestedPages ?? 'all';
  const requested = requestedPageIndexes(source, requestedSpec);
  if (requested.length === 0) throw new Error('DRAWING_REQUESTED_PAGES_EMPTY');

  const job = previousJob ?? createJob({
      documentHash: source.documentHash,
      ownerId,
      budget,
      estimatedPages: requested.length,
    });
  if (previousJob) {
    updateJob(job.jobId, { budget, cancelRequested: false, error: undefined, status: 'QUEUED' });
  }
  updateJob(job.jobId, {
    estimated: {
      ...job.estimated,
      pages: requested.length,
      costRangeNote: `최대 ${budget.maxVlmCalls} VLM 호출 · ${requested.length} 페이지 · 예산 초과 시 PARTIAL`,
    },
  });
  updateJob(job.jobId, { status: 'ENUMERATING' });

  const previousPages = new Map(previousJob?.document?.pages.map((page) => [page.pageIndex, page]));
  const pageStates: PageAnalysisState[] = requested.map((pageIndex) => {
    const previous = previousPages.get(pageIndex);
    const sourcePage = source.pages.find((page) => page.pageIndex === pageIndex);
    const reusable = Boolean(previousJob && sourcePage && canReusePage(
      previousJob,
      pageIndex,
      pageDigestFingerprint(source, sourcePage, input),
    ));
    return (previous?.status === 'complete' || previous?.status === 'skipped-empty') && reusable
      ? { ...previous }
      : { pageIndex, status: 'pending', drawingKind: 'unknown', vlmCalls: 0 };
  });
  const preservedPages = new Set(pageStates
    .filter((page) => page.status === 'complete' || page.status === 'skipped-empty')
    .map((page) => page.pageIndex));
  const retryPages = new Set(requested.filter((pageIndex) => !preservedPages.has(pageIndex)));
  const previousSeeds = existingEvidenceSeeds(previousJob?.document, preservedPages);
  const symbolHits: RawSymbolHit[] = [...previousSeeds.symbols, ...(input.seedDetections?.symbols ?? [])];
  const lineHits: RawLineHit[] = [...previousSeeds.lines, ...(input.seedDetections?.lines ?? [])];
  const textSeeds: RawTextSeed[] = [...(input.seedDetections?.texts ?? [])];
  const calculationHits: DrawingDocumentV3['calculations'] = (previousJob?.document?.calculations ?? [])
    .filter((calculation) => {
      const pageMatch = calculation.id.match(/^P(\d+)-/);
      return pageMatch ? preservedPages.has(Number(pageMatch[1]) - 1) : retryPages.size === 0;
    });
  const unresolved: UnresolvedItem[] = (previousJob?.document?.unresolvedItems ?? [])
    .filter((item) => !retryPages.has(item.pageIndex));
  const rolesPresent = new Set<RoleId>(previousJob?.document?.coverageLedger.rolesPresent ?? []);
  let regionRecords: CoverageRegionRecord[] = (previousJob?.document?.coverageLedger.regions ?? [])
    .filter((region) => !retryPages.has(region.pageIndex));
  let unresolvedRescans = 0;
  let vlmCalls = 0;
  let pixelsUsed = 0;
  const deadline = Date.now() + budget.deadlineMs;
  const executeTeam = deps.executeTeam ?? executeSLDTeam;
  const providersUsed = new Set<string>();
  const modelsUsed = new Set<string>();

  updateJob(job.jobId, { status: 'SURVEYING' });
  for (const state of pageStates) {
    if (state.status === 'complete' || state.status === 'skipped-empty') continue;
    const page = source.pages.find((candidate) => candidate.pageIndex === state.pageIndex);
    if (!page) {
      state.status = 'failed';
      state.error = 'PAGE_NOT_FOUND';
      continue;
    }
    state.status = 'surveying';
    state.quality = page.quality;
    state.drawingKind = surveyPageKind({
      textSample: page.textSample,
      vectorOpCount: page.vectorOpCount,
      rasterCoverage: page.rasterOpCount > 0 ? 1 : 0,
    });
    if (state.drawingKind === 'empty') state.status = 'skipped-empty';
  }

  updateJob(job.jobId, { status: 'ANALYZING_PAGES' });
  let attemptedPages = 0;
  for (const state of pageStates) {
    if (state.status === 'complete' || state.status === 'skipped-empty') continue;
    const page = source.pages.find((candidate) => candidate.pageIndex === state.pageIndex)!;
    const rasterPlans = rasterCoveragePlans(page);
    const vectorPlans = vectorCoveragePlans(page);

    if (
      attemptedPages >= budget.maxPages
      || Date.now() >= deadline
      || pixelsUsed + page.width * page.height > budget.maxPixels
      || input.signal?.aborted
      || getJob(job.jobId)?.cancelRequested
    ) {
      state.status = 'failed';
      state.error = input.signal?.aborted || getJob(job.jobId)?.cancelRequested
        ? 'CANCELLED'
        : 'PARTIAL_BUDGET_EXCEEDED';
      const planned = createCoverageRegions(page.imageBuffer ? rasterPlans : vectorPlans);
      regionRecords.push(...markAllFailed(planned, state.error));
      addUnresolved(unresolved, page, 'PARTIAL_BUDGET_EXCEEDED', '페이지·시간·픽셀 예산 또는 취소 경계에서 분석을 중단했습니다.');
      continue;
    }

    attemptedPages += 1;
    state.status = 'analyzing';
    pixelsUsed += page.width * page.height;
    let pageHasUsableResult = false;
    let pageRegions = createCoverageRegions(page.imageBuffer ? rasterPlans : vectorPlans);

    const shouldRunVector = source.formatClass === 'dxf'
      || page.renderMode === 'vector'
      || page.renderMode === 'hybrid';
    if (shouldRunVector) {
      const vectorResult = await executeTeam(teamInputForVector(input, source, page), deps.teamDeps);
      for (const envelope of vectorResult.drawingReview?.envelopes ?? []) {
        providersUsed.add(envelope.provider);
        modelsUsed.add(envelope.model);
      }
      if (vectorResult.success && (vectorResult.components?.length ?? 0) > 0) {
        mergeAdapted(vectorResult, page, source, symbolHits, lineHits, textSeeds);
        pageHasUsableResult = true;
        if (!input.vision || source.formatClass === 'dxf') {
          pageRegions = markVectorComplete(createCoverageRegions(vectorPlans), `vector:${page.renderHash}`);
          ALL_ROLES.forEach((role) => rolesPresent.add(role));
        }
      } else if (!input.vision || source.formatClass === 'dxf') {
        addUnresolved(unresolved, page, 'ROLE_CALL_FAILED', '벡터 파서가 설비와 관계를 확정하지 못했습니다.');
      }
    }

    const shouldRunRaster = Boolean(page.imageBuffer)
      && source.formatClass !== 'dxf'
      && (page.renderMode === 'raster' || page.renderMode === 'hybrid' || source.formatClass === 'raster-image');
    if (shouldRunRaster && input.vision) {
      // symbols + connections + logic + three independent full-page text
      // reads, plus the three spatial-role precision grids.
      const plannedCalls = 6 + gridSizeFor(page) * 3;
      if (vlmCalls + plannedCalls > budget.maxVlmCalls) {
        pageRegions = markAllFailed(createCoverageRegions(rasterPlans), 'PARTIAL_BUDGET_EXCEEDED');
        addUnresolved(unresolved, page, 'PARTIAL_BUDGET_EXCEEDED', '페이지 독립 심사 예상 호출 수가 문서 호출 예산을 초과합니다.');
      } else {
        pageRegions = createCoverageRegions(rasterPlans);
        let rescanAttempt = 0;
        while (rescanAttempt <= 2) {
          const rasterResult = await executeTeam(teamInputForRaster(input, source, page), deps.teamDeps);
          for (const envelope of rasterResult.drawingReview?.envelopes ?? []) {
            providersUsed.add(envelope.provider);
            modelsUsed.add(envelope.model);
          }
          const actualCalls = rasterResult.drawingReview?.coverage.plannedCalls ?? plannedCalls;
          vlmCalls += actualCalls;
          state.vlmCalls += actualCalls;
          if (rasterResult.success && rasterResult.drawingReview) {
            mergeAdapted(rasterResult, page, source, symbolHits, lineHits, textSeeds);
            calculationHits.push(...adaptDrawingCalculations(rasterResult.drawingSynthesis).map((calculation) => ({
              ...calculation,
              id: `P${String(page.pageIndex + 1).padStart(2, '0')}-${calculation.id}`,
            })));
            pageHasUsableResult = true;
            const coverage = markCouncilCoverage(pageRegions, page, rasterResult);
            pageRegions = coverage.regions;
            coverage.roles.forEach((role) => rolesPresent.add(role));
          } else {
            pageRegions = markAllFailed(pageRegions, rasterResult.error ?? 'ROLE_CALL_FAILED');
          }

          const gapsRemain = pageRegions.some((region) => region.status !== 'complete' && region.status !== 'skipped-empty');
          if (!gapsRemain) break;
          rescanAttempt += 1;
          const canRetry = rescanAttempt <= 2
            && vlmCalls + plannedCalls <= budget.maxVlmCalls
            && Date.now() < deadline
            && !input.signal?.aborted
            && !getJob(job.jobId)?.cancelRequested;
          if (!canRetry) break;
        }
        const gapsRemain = pageRegions.some((region) => region.status !== 'complete' && region.status !== 'skipped-empty');
        if (gapsRemain) {
          unresolvedRescans += 1;
          addUnresolved(unresolved, page, 'HOLD_RESCAN_UNRESOLVED', '최대 2회 정밀 재스캔 후에도 공간 그래프 충돌 또는 구획 호출 실패가 남았습니다.');
        }
      }
    } else if (shouldRunRaster && !input.vision && !pageHasUsableResult) {
      pageRegions = markAllFailed(createCoverageRegions(rasterPlans), 'VISION_KEY_REQUIRED');
      addUnresolved(unresolved, page, 'ROLE_CALL_FAILED', '래스터 도면 정밀 판독에 사용할 Vision 키가 없습니다.');
    }

    if (!shouldRunRaster && !shouldRunVector && !pageHasUsableResult) {
      pageRegions = markAllFailed(pageRegions, 'UNSUPPORTED_PAGE_MODE');
      addUnresolved(unresolved, page, 'ROLE_CALL_FAILED', '지원되는 페이지 판독 경로가 없습니다.');
    }
    regionRecords.push(...pageRegions);
    const pageFailed = pageRegions.some((region) => region.status === 'failed' || region.status === 'planned' || region.status === 'running');
    state.status = pageHasUsableResult && !pageFailed ? 'complete' : 'failed';
    if (state.status === 'failed' && !state.error) state.error = 'PAGE_ANALYSIS_PARTIAL';
  }

  updateJob(job.jobId, { status: 'RESCANNING_GAPS', vlmCallsUsed: vlmCalls });
  const texts = [...previousSeeds.texts, ...adjudicateTextSeeds(textSeeds, unresolved)]
    .sort((left, right) => (left.evidence[0]?.pageIndex ?? 0) - (right.evidence[0]?.pageIndex ?? 0)
      || left.displayId.localeCompare(right.displayId));
  for (const page of source.pages) {
    const lowQuality = page.quality.recommendedScale === 4 || page.quality.blurry || page.quality.lowContrast;
    const hasPageReadGap = unresolved.some((item) => item.pageIndex === page.pageIndex
      && (item.code === 'AMBIGUOUS_OCR' || item.code === 'UNREADABLE_TEXT' || item.code === 'HOLD_RESCAN_UNRESOLVED'));
    if (!lowQuality || !hasPageReadGap || unresolved.some((item) => item.pageIndex === page.pageIndex && item.code === 'LOW_RESOLUTION_HOLD')) continue;
    unresolved.push({
      id: `low-resolution-${page.pageIndex}`,
      code: 'LOW_RESOLUTION_HOLD',
      pageIndex: page.pageIndex,
      bounds: { x: 0, y: 0, w: page.width, h: page.height },
      recommendedUpload: {
        minLongEdgePx: Math.max(2_400, Math.max(page.width, page.height) * 2),
        minCharHeightPx: 12,
        note: '긴 변 2400px 이상 또는 원본 벡터 PDF/DXF로 다시 올려주세요. 작은 문자는 높이 12px 이상이 필요합니다.',
      },
      note: `업스케일·대비 보정 뒤에도 판독 충돌이 남았습니다: ${page.quality.warnings.join(', ') || 'LOW_DETAIL'}`,
    });
  }

  updateJob(job.jobId, { status: 'RECONCILING_PAGES' });
  const symbols = deduplicateSymbols(symbolHits);
  const lines = deduplicateLines(lineHits);
  const relations = requested.flatMap((pageIndex) => buildPageRelations(symbols, lines, pageIndex));
  const pageRefs = extractPageRefHits(texts);
  const crossPageRelations = reconcileCrossPage(symbols, texts, pageRefs);
  unresolved.push(...findUnboundLineItems(lines, relations));
  for (const relation of crossPageRelations.filter((item) => item.status !== 'confirmed')) {
    const evidence = relation.evidence[0];
    unresolved.push({
      id: `cross-page-${relation.id}`,
      code: 'LINE_CONTINUITY_UNCERTAIN',
      displayId: relation.displayId,
      pageIndex: evidence?.pageIndex ?? relation.fromPage,
      bounds: evidence?.bounds ?? { x: 0, y: 0, w: 1, h: 1 },
      candidates: [relation.fromRef, relation.toRef],
      userConfirmItems: [{ question: `${relation.displayId} 페이지 간 연결 대상을 확인하십시오.`, options: [relation.fromRef, relation.toRef] }],
      note: `페이지 간 관계를 확정하지 못했습니다: ${relation.reason ?? relation.status}`,
    });
  }
  const equipmentLinks = assignPhysicalEquipmentIds(
    symbols,
    crossPageRelations.filter((relation) => relation.status === 'confirmed'),
  );
  for (const symbol of symbols) symbol.equipmentId = equipmentLinks.get(symbol.id);

  const coverageLedger = buildCoverageLedger(regionRecords, [...rolesPresent], unresolvedRescans);
  updateJob(job.jobId, { status: 'SYNTHESIZING' });
  const equipmentCounts = buildEquipmentCounts(symbols, equipmentLinks, crossPageRelations, unresolved);
  const ratedValues = extractRatedValues(texts, symbols);
  const calculations = [...new Map(calculationHits.map((calculation) => [
    calculation.receiptHash ?? calculation.id,
    calculation,
  ])).values()];
  const recommendations = buildRecommendations({
    symbols,
    relations,
    calculations,
    unresolved,
    hasGroundPath: lines.some((line) => line.lineKind === 'ground' && line.certainty === 'confirmed'),
    coverageEvidenceIds: coverageLedger.regions.flatMap((region) =>
      (region.roleCalls['coverage-auditor'] ?? []).filter((call) => call.success).map((call) => call.callId)),
  });

  const completePages = pageStates.every((page) => page.status === 'complete' || page.status === 'skipped-empty');
  const coverageComplete = coverageLedger.allPlannedFinished
    && coverageLedger.regionsFailed === 0
    && coverageLedger.unresolvedRescans === 0;
  const cancelled = Boolean(input.signal?.aborted || getJob(job.jobId)?.cancelRequested);
  const jobStatus: DrawingDocumentV3['jobStatus'] = cancelled
    ? 'CANCELLED'
    : completePages && coverageComplete
      ? 'COMPLETE'
      : 'PARTIAL';
  const builtDocument = buildDrawingDocumentV3({
    documentHash: source.documentHash,
    documentPageCount: source.pages.length,
    jobStatus,
    requestedPages: requestedSpec === 'all' ? 'all' : requested,
    pages: pageStates,
    coverageLedger,
    evidenceGraph: { symbols, lines, texts, relations },
    crossPageRelations,
    equipmentCounts,
    ratedValues,
    calculations,
    recommendations,
    unresolvedItems: unresolved,
    userCorrections: previousJob?.document?.userCorrections,
    verificationExtra: {
      productionFingerprint: {
        engineVersion: ENGINE_VERSION,
        promptVersion: PROMPT_VERSION,
        preprocessVersion: PREPROCESS_VERSION,
        provider: input.vision ? ([...providersUsed].sort().join(',') || input.vision.provider) : undefined,
        model: input.vision ? ([...modelsUsed].sort().join(',') || resolveVlmModel(input.vision.provider, input.vision.model)) : undefined,
      },
    },
  });
  const document = await applyConfiguredEvaluationSuiteBadge(builtDocument);
  const safeDocument = JSON.parse(JSON.stringify(document)) as DrawingDocumentV3;
  const pageDigests = { ...(previousJob?.pageDigests ?? {}) };
  for (const state of pageStates) {
    const page = source.pages.find((candidate) => candidate.pageIndex === state.pageIndex);
    if (!page) continue;
    const fingerprint = pageDigestFingerprint(source, page, input);
    pageDigests[state.pageIndex] = {
      pageRenderHash: fingerprint.pageRenderHash,
      promptVersion: fingerprint.promptVersion,
      preprocessVersion: fingerprint.preprocessVersion,
      graphVersion: fingerprint.graphVersion,
      provider: fingerprint.provider,
      model: fingerprint.model,
      complete: state.status === 'complete' || state.status === 'skipped-empty',
    };
  }
  const finalJob = updateJob(job.jobId, {
    status: jobStatus,
    document: safeDocument,
    vlmCallsUsed: (previousJob?.vlmCallsUsed ?? 0) + vlmCalls,
    pageDigests,
  })!;
  return { job: finalJob, document: safeDocument };
}

function adjudicateTextSeeds(textSeeds: RawTextSeed[], unresolved: UnresolvedItem[]): TextNode[] {
  const ordered = [...textSeeds].sort((left, right) =>
    left.pageIndex - right.pageIndex
    || left.bounds.y - right.bounds.y
    || left.bounds.x - right.bounds.x);
  if (ordered.length === 0) return assignDisplayIdsForTexts([]);
  const pageCounters = new Map<number, number>();
  const output: TextNode[] = [];
  for (const seed of ordered) {
    const seq = (pageCounters.get(seed.pageIndex) ?? 0) + 1;
    pageCounters.set(seed.pageIndex, seq);
    const displayId = `P${String(seed.pageIndex + 1).padStart(2, '0')}-T${String(seq).padStart(3, '0')}`;
    const result = adjudicateOcr({
      displayId,
      pageIndex: seed.pageIndex,
      bounds: seed.bounds,
      readings: seed.readings ?? [],
      adjacentSymbolTypes: seed.adjacentSymbolTypes,
      legendTerms: seed.legendTerms,
      standardTerms: ['PT', 'PPT', 'VCB', 'VGB', 'TR', 'ACB', 'MCCB', 'CT', 'ATS', 'UPS'],
    });
    const directVectorText = seed.readings?.length === 0 && seed.candidates?.length === 1;
    const certainty = directVectorText || result.status === 'CONFIRMED_BY_MAJORITY_AND_CONTEXT'
      ? 'confirmed' as const
      : result.status === 'UNREADABLE_TEXT'
        ? 'unread' as const
        : 'ambiguous' as const;
    const candidates = result.candidates ?? seed.candidates ?? [...new Set((seed.readings ?? []).map((reading) => reading.text))];
    const confirmedText = directVectorText ? seed.text : result.confirmedText;
    if (certainty !== 'confirmed') {
      unresolved.push({
        id: `ocr-${seed.pageIndex}-${seq}`,
        code: certainty === 'unread' ? 'UNREADABLE_TEXT' : 'AMBIGUOUS_OCR',
        displayId,
        pageIndex: seed.pageIndex,
        bounds: seed.bounds,
        candidates,
        userConfirmItems: [{ question: '표기 후보를 선택하십시오.', options: candidates }],
        note: candidates.length > 0 ? `표기 후보: ${candidates.join(' | ')}` : '문자를 판독하지 못했습니다.',
      });
    }
    const confidence = (seed.readings?.length ?? 0) > 0
      ? Math.min(...(seed.readings ?? []).map((reading) => reading.confidence))
      : directVectorText ? 0.95 : 0;
    output.push({
      id: `txt-${seed.pageIndex}-${seq}`,
      displayId,
      rawText: seed.text,
      confirmedText,
      candidates,
      certainty,
      evidence: (seed.sourceEvidenceIds?.length ? [...new Set(seed.sourceEvidenceIds)] : [`txt-${seed.pageIndex}-${seq}-e0`]).map((evidenceId) => ({
        evidenceId,
        pageIndex: seed.pageIndex,
        bounds: seed.bounds,
        confidence,
      })),
      holdCode: certainty === 'confirmed' ? undefined : certainty === 'unread' ? 'UNREADABLE_TEXT' : 'AMBIGUOUS_OCR',
    });
  }
  return output;
}

export { ENGINE_VERSION };
