/**
 * DrawingDocument V3 full-document orchestrator.
 *
 * Source preparation and specialist review are delegated to the production
 * PDF/image/DXF stack. This module owns page state, budgets, coverage receipts,
 * deterministic reconciliation and the V3 report contract.
 */

import { isBlockingGraphConflict } from '@/agent/electrical/electrical-invariants';
import type { LogicConflict } from '@/agent/electrical/logic-conflicts';
import { executeSLDTeam, type SLDTeamDeps } from '@/agent/teams/sld-team';
import type { TeamInput, TeamResult } from '@/agent/teams/types';
import { planAdaptiveBounds } from '@/agent/vision/adaptive-regions';
import type { RescanTargetEvidence, RoleReviewEnvelope } from '@/agent/vision/review-types';
import { precisionGridSize } from '@/agent/vision/vision-splitter';
import { resolveVlmModel } from '@/agent/vision/vlm-client';
import { drawingEffortProfileKey, drawingRoleTimeoutMs } from '@/lib/drawing-reasoning-effort';

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
import { stitchBoundaryLines } from './boundary-line-stitcher';
import { applyConfiguredEvaluationSuiteBadge } from './drawing-evaluation-gate';
import { prepareDrawingSource, type PreparedDrawingPage, type PreparedDrawingSource } from './drawing-source';
import {
  assignDisplayIdsForTexts,
  buildPageRelations,
  deduplicateLines,
  deduplicateSymbols,
  demoteContainedMarkings,
  findUnboundLineItems,
  type RawLineHit,
  type RawSymbolHit,
} from './evidence-deduplicator';
import { detectRasterLineHits } from './raster-line-detector';
import { equipmentExclusionBounds } from './raster-line-exclusions';
import { canReusePage, createJob, getJob, getOwnedJob, updateJob, type DrawingJobRecord } from './drawing-job-store';
import { surveyPageKind } from './page-classifier';
import { OCR_STANDARD_TERMS } from './ocr-standard-terms';
import { adjudicateOcr } from './ocr-adjudicator';
import { buildRecommendations } from './recommendation-engine';
import { extractRatedValues } from './rated-value-extractor';
import { adaptTeamResult, deduplicateTextSeeds, type AdaptedTeamResult, type RawTextSeed } from './team-result-adapter';
import type {
  CoverageRegionRecord,
  DocumentBudget,
  DrawingDocumentV3,
  PageAnalysisState,
  RoleId,
  SymbolNode,
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
  /** 전체 결과 정책은 유지하면서 이번 호출에서 렌더할 페이지. */
  preparationPages?: number[];
  budget?: Partial<DocumentBudget>;
  vision?:
    | {
        provider: 'gemini' | 'google-agent-platform' | 'openai' | 'claude';
        apiKey: string;
        model?: string;
        effort?: import('@/lib/drawing-reasoning-effort').DrawingReasoningEffort;
        /** 역할별 추론 단계. 지정한 역할만 `effort` 를 덮는다. */
        effortProfile?: import('@/lib/drawing-reasoning-effort').DrawingEffortProfile;
      }
    | {
        provider: 'chatgpt-local' | 'claude-local';
        apiKey?: never;
        model?: string;
        effort?: import('@/lib/drawing-reasoning-effort').DrawingReasoningEffort;
        effortProfile?: import('@/lib/drawing-reasoning-effort').DrawingEffortProfile;
      };
  signal?: AbortSignal;
  seedDetections?: {
    symbols?: RawSymbolHit[];
    lines?: RawLineHit[];
    texts?: RawTextSeed[];
  };
  jobId?: string;
  ownerId?: string;
  /** HTTP 실행 한 번에 새로 처리할 페이지 수. 전체 작업 예산과 별개다. */
  maxPagesPerRun?: number;
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
const RESCAN_SETTLE_MARGIN_MS = 10_000;
const MAX_PRECISION_REGION_CALLS_PER_ROLE = 16;

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
  const pageCount = source.totalPageCount ?? (source.pages.length === 0 ? 0 : Math.max(...source.pages.map((page) => page.pageIndex)) + 1);
  const available = new Set(Array.from({ length: pageCount }, (_, index) => index));
  if (requested === undefined || requested === 'all') return [...available].sort((a, b) => a - b);
  const unique = [...new Set(requested)];
  if (unique.some((page) => !available.has(page))) throw new Error('DRAWING_REQUESTED_PAGE_OUT_OF_RANGE');
  return unique.sort((a, b) => a - b);
}

function gridSizeFor(page: PreparedDrawingPage): 4 | 9 | 16 {
  return precisionGridSize(page.quality.recommendedScale, page.quality.edgeDensity);
}

function pageDigestFingerprint(
  source: PreparedDrawingSource,
  page: PreparedDrawingPage,
  input: OrchestrateInput,
) {
  const usesVision = Boolean(input.vision && page.imageBuffer
    && source.formatClass !== 'dxf'
    && (page.renderMode === 'raster'
      || page.renderMode === 'hybrid'
      || page.renderMode === 'vector'
      || source.formatClass === 'raster-image'));
  return {
    documentHash: source.documentHash,
    pageRenderHash: page.renderHash,
    promptVersion: PROMPT_VERSION,
    preprocessVersion: PREPROCESS_VERSION,
    graphVersion: GRAPH_ASSEMBLY_VERSION,
    provider: usesVision ? input.vision?.provider : undefined,
    model: usesVision && input.vision ? resolveVlmModel(input.vision.provider, input.vision.model) : undefined,
    effort: usesVision ? input.vision?.effort : undefined,
    // 프로필을 지문에 넣지 않으면 역할별 단계를 바꿔도 이전 봉투를 재사용해
    // A/B 자체가 성립하지 않는다. 프로필이 없으면 undefined 라 기존 지문과
    // 같은 값이 된다.
    effortProfile: usesVision ? drawingEffortProfileKey(input.vision?.effortProfile) : undefined,
  };
}

function rasterCoveragePlans(page: PreparedDrawingPage): CoverageRegionPlan[] {
  return [{
    regionId: `p${page.pageIndex}-full`,
    pageIndex: page.pageIndex,
    kind: 'full-page',
    bounds: { x: 0, y: 0, w: page.width, h: page.height },
    requiredRoles: ALL_ROLES,
  }];
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

function markVectorCoverage(
  regions: CoverageRegionRecord[],
  audit: TeamResult['vectorAudit'],
  receipt: string,
): { regions: CoverageRegionRecord[]; roles: RoleId[] } {
  let next = regions;
  const completedRoles: RoleId[] = [];
  for (const region of regions) {
    for (const role of region.requiredRoles) {
      const success = Boolean(audit?.roles.includes(role));
      next = recordRoleCall(
        next,
        region.regionId,
        role,
        `${receipt}:${role}`,
        success,
        success ? undefined : `vector ${role} audit receipt missing`,
      );
      if (success && !completedRoles.includes(role)) completedRoles.push(role);
    }
  }
  return { regions: next, roles: completedRoles };
}

function councilEnvelope(result: TeamResult, role: RoleId) {
  return result.drawingReview?.envelopes.find((envelope) => envelope.role === role);
}

function hasSourceFailure(result: TeamResult, role: RoleId, sourceId: string): boolean {
  return (result.drawingReview?.failures ?? []).some((failure) =>
    failure.role === role && failure.sourceId === sourceId);
}

/**
 * Council failures are already bounded and API-key-redacted before they reach
 * the orchestrator. Preserve the matching diagnostic in the coverage receipt;
 * replacing it with only "precision review failed" made live provider/schema
 * failures impossible to distinguish from an empty region.
 */
function sourceFailureMessage(
  result: TeamResult,
  role: RoleId,
  sourceId: string,
  fallback: string,
): string {
  const failures = result.drawingReview?.failures ?? [];
  const exact = failures.find((failure) => failure.role === role && failure.sourceId === sourceId);
  if (exact?.error) return `${fallback}: ${exact.error}`;
  const roleFailure = failures.find((failure) => failure.role === role && failure.sourceId === 'role');
  return roleFailure?.error ? `${fallback}: ${roleFailure.error}` : fallback;
}

function hasReviewedSource(result: TeamResult, role: RoleId, sourceId: string): boolean {
  const envelope = councilEnvelope(result, role);
  if (!envelope) return false;
  return envelope.reviewedSourceIds === undefined || envelope.reviewedSourceIds.includes(sourceId);
}

function markCouncilCoverage(
  regions: CoverageRegionRecord[],
  page: PreparedDrawingPage,
  result: TeamResult,
): { regions: CoverageRegionRecord[]; roles: RoleId[]; unresolvedRescans: number; rescanTargets: RescanTargetEvidence[] } {
  const bounds = planAdaptiveBounds(page.width, page.height, gridSizeFor(page), 0.18);
  const selectedRolesByRegion = new Map<number, Set<RoleId>>();
  for (const role of ['symbols', 'connections', 'text'] as const) {
    const coverage = result.drawingReview?.coverage.roles[role];
    const selectedIds = coverage?.regionIds
      ?? Array.from({ length: coverage?.expectedRegionCount ?? 0 }, (_, index) => `${coverage?.variantId}:region:${index}`);
    for (const sourceId of selectedIds) {
      const match = sourceId.match(/:region:(\d+)$/);
      const index = match ? Number(match[1]) : -1;
      if (!Number.isSafeInteger(index) || index < 0 || index >= bounds.length) continue;
      const roles = selectedRolesByRegion.get(index) ?? new Set<RoleId>();
      roles.add(role);
      selectedRolesByRegion.set(index, roles);
    }
  }
  const selectedLedgerIds = new Set([...selectedRolesByRegion.keys()].map((index) => `p${page.pageIndex}-r${index}`));
  let next = regions.filter((region) => region.kind !== 'grid' || selectedLedgerIds.has(region.regionId));
  for (const [index, roles] of selectedRolesByRegion) {
    const regionId = `p${page.pageIndex}-r${index}`;
    const existingIndex = next.findIndex((region) => region.regionId === regionId);
    if (existingIndex >= 0) {
      next[existingIndex] = {
        ...next[existingIndex],
        requiredRoles: [...new Set([...next[existingIndex].requiredRoles, ...roles])],
      };
    } else {
      next.push(...createCoverageRegions([{
        regionId,
        pageIndex: page.pageIndex,
        kind: 'grid',
        bounds: bounds[index],
        requiredRoles: [...roles],
      }]));
    }
  }
  const completedRoles: RoleId[] = [];
  const review = result.drawingReview;
  const fullId = `p${page.pageIndex}-full`;
  for (const role of ['symbols', 'connections', 'text', 'logic'] as const) {
    const envelope = councilEnvelope(result, role);
    const sourceId = review?.coverage.roles[role]?.variantId ?? 'missing-source';
    const success = hasReviewedSource(result, role, sourceId) && !hasSourceFailure(result, role, sourceId);
    next = recordRoleCall(
      next,
      fullId,
      role,
      envelope ? `${envelope.outputHash}:${sourceId}` : `${fullId}:${role}:missing`,
      success,
      success ? undefined : sourceFailureMessage(result, role, sourceId, `${role} full-page review failed`),
    );
    if (success) completedRoles.push(role);
  }

  for (let index = 0; index < bounds.length; index += 1) {
    const regionId = `p${page.pageIndex}-r${index}`;
    for (const role of ['symbols', 'connections', 'text'] as const) {
      const envelope = councilEnvelope(result, role);
      const variantId = review?.coverage.roles[role]?.variantId ?? 'missing-source';
      const sourceId = `${variantId}:region:${index}`;
      const selectedRegionIds = review?.coverage.roles[role]?.regionIds;
      const planned = selectedRegionIds
        ? selectedRegionIds.includes(sourceId)
        : (review?.coverage.roles[role]?.actualRegionCount ?? 0) > index;
      if (!planned) continue;
      const success = planned && hasReviewedSource(result, role, sourceId) && !hasSourceFailure(result, role, sourceId);
      next = recordRoleCall(
        next,
        regionId,
        role,
        envelope ? `${envelope.outputHash}:${sourceId}` : `${regionId}:${role}:missing`,
        success,
        success ? undefined : sourceFailureMessage(result, role, sourceId, `${role} precision review failed`),
      );
    }
  }

  const graphConflicts = review?.graph?.conflicts ?? [];
  const coverageEnvelope = councilEnvelope(result, 'coverage-auditor');
  const rescanTargets = coverageEnvelope?.data.rescanTargets ?? [];
  // 정본은 `electrical-invariants` 의 집합이다. 여기서 정규식으로 다시 판정하지
  // 않는다 — 그렇게 했을 때 모호성(AMBIGUOUS_*)이 차단으로 분류돼, 실질 역할이
  // 모두 성공한 전면 판독이 통째로 버려졌다.
  const blockingGraphConflicts = graphConflicts.filter(isBlockingGraphConflict);
  const coverageSuccess = Boolean(review?.coverage.complete)
    && Boolean(coverageEnvelope)
    && rescanTargets.length === 0
    && !review?.failures.some((failure) => failure.fatal)
    && blockingGraphConflicts.length === 0;
  next = recordRoleCall(
    next,
    fullId,
    'coverage-auditor',
    coverageEnvelope?.outputHash ?? `coverage:${review?.snapshot.drawingHash ?? page.renderHash}:missing`,
    coverageSuccess,
    coverageSuccess ? undefined : sourceFailureMessage(
      result,
      'coverage-auditor',
      review?.coverage.roles['coverage-auditor']?.variantId ?? 'missing-source',
      blockingGraphConflicts.length > 0
        ? `coverage audit found graph conflicts: ${blockingGraphConflicts.slice(0, 3).join('; ').slice(0, 240)}`
        : 'coverage audit found unresolved regions or graph conflicts',
    ),
  );
  if (coverageSuccess) completedRoles.push('coverage-auditor');
  const unresolvedRescans = coverageSuccess ? 0 : 1;
  return { regions: next, roles: completedRoles, unresolvedRescans, rescanTargets };
}

/** 재스캔이 더 필요한가. 계획·실행 중·실패 구획이 하나라도 남으면 참이다. */
function hasCoverageGaps(regions: readonly CoverageRegionRecord[]): boolean {
  return regions.some((region) => region.status !== 'complete' && region.status !== 'skipped-empty');
}

function boundsIntersect(
  left: { x: number; y: number; w: number; h: number },
  right: { x: number; y: number; w: number; h: number },
): boolean {
  return left.x < right.x + right.w
    && left.x + left.w > right.x
    && left.y < right.y + right.h
    && left.y + left.h > right.y;
}

function targetedRetryFullSourceCalls(targets: readonly RescanTargetEvidence[]): number {
  const fullSourceRoles = new Set(targets
    .filter((target) => target.retryScope === 'full-source')
    .flatMap((target) => target.suggestedRoles));
  return [...fullSourceRoles].reduce((total, role) => total + (role === 'text' ? 3 : 1), 0);
}

function plannedTargetedRetryCalls(page: PreparedDrawingPage, targets: RescanTargetEvidence[]): number {
  if (targets.length === 0) return 7 + gridSizeFor(page) * 3;
  const regions = planAdaptiveBounds(page.width, page.height, gridSizeFor(page), 0.18);
  const roles = ['symbols', 'connections', 'text'] as const;
  const fullSourceCalls = targetedRetryFullSourceCalls(targets);
  const precisionCalls = roles.reduce((total, role) => total + regions.filter((region) =>
    targets.some((target) => target.retryScope !== 'full-source'
      && target.suggestedRoles.includes(role)
      && boundsIntersect(region, target.bounds))).length, 0);
  // 재검사는 봉인된 이전 축을 재사용한다. 전체 소스 실패 축 + 선택 구획 + 감사만 호출한다.
  return 1 + fullSourceCalls + precisionCalls;
}

/**
 * 재검사 대상의 `bounds.page` 는 **문서 페이지 번호가 아니라 팀 스냅샷의 페이지**다.
 *
 * 팀에는 페이지 한 장을 래스터로 넘긴다. `createDrawingSnapshot` 은 페이지 인자
 * 없이 불려 항상 `page = 1` 이므로, 그 스냅샷 좌표계 안에서 페이지는 1 이다.
 * 여기에 문서 페이지 번호(`pageIndex + 1`)를 넣으면 sld-team 의 검증이
 * `bounds.page !== snapshot.page` 로 걸러 **"현재 도면 범위를 벗어났습니다"** 를 낸다.
 *
 * 실측(2026-08-05, KIMM 83p 설계세트의 p5 를 PDF 로 직접 투입): 구획 17개 중
 * 3개가 이 사유로 실패했다. 즉 **1페이지가 아닌 모든 페이지에서 오케스트레이터가
 * 만든 재스캔 대상이 전부 거부되고 있었다.** 단일 페이지 업로드(pageIndex 0 →
 * page 1)로만 재던 이번 세션의 다른 측정에서는 우연히 일치해 드러나지 않았다.
 *
 * 판독 결과의 페이지는 `team-result-adapter` 가 `context.pageIndex` 로 다시
 * 찍으므로, 팀 안에서 1 을 쓰는 것이 문서 페이지 정보를 잃는 것은 아니다.
 */
const TEAM_SNAPSHOT_PAGE = 1;

function failedRoleRescanTargets(page: PreparedDrawingPage, result: TeamResult): RescanTargetEvidence[] {
  const targetableRoles = new Set<RoleId>(['symbols', 'connections', 'text']);
  const regions = planAdaptiveBounds(page.width, page.height, gridSizeFor(page), 0.18);
  const failures = result.drawingReview?.failures ?? [];
  const concreteFailureRoles = new Set(failures.filter((failure) => failure.sourceId !== 'role').map((failure) => failure.role));
  return failures.flatMap((failure, index) => {
    if (!targetableRoles.has(failure.role as RoleId)) return [];
    if (failure.sourceId === 'role' && concreteFailureRoles.has(failure.role)) return [];
    const regionMatch = failure.sourceId.match(/:region:(\d+)$/);
    const regionIndex = regionMatch ? Number(regionMatch[1]) : -1;
    const bounds = regionIndex >= 0 && regions[regionIndex]
      ? regions[regionIndex]
      : { x: 0, y: 0, w: page.width, h: page.height };
    return [{
      id: `role-failure-${page.pageIndex}-${failure.role}-${index + 1}`,
      sourceId: failure.sourceId,
      retryScope: regionMatch ? 'precision-region' as const : 'full-source' as const,
      reason: 'low-coverage' as const,
      bounds: { ...bounds, page: TEAM_SNAPSHOT_PAGE },
      suggestedRoles: [failure.role as 'symbols' | 'connections' | 'text'],
      confidence: 1,
    }];
  });
}

/** 조립기가 위치까지 아는 차단 충돌은 해당 축만 재검사할 수 있는 대상으로 바꾼다. */
function graphConflictRescanTargets(page: PreparedDrawingPage, result: TeamResult): RescanTargetEvidence[] {
  const graph = result.drawingReview?.graph;
  if (!graph) return [];
  const padding = Math.max(8, Math.min(page.width, page.height) * 0.02);
  return graph.conflicts.filter(isBlockingGraphConflict).flatMap((conflict, index) => {
    const lineId = conflict.split(':').at(-1);
    const line = graph.lines.find((candidate) => candidate.id === lineId);
    if (!line || line.path.length === 0) return [];
    const xs = line.path.map((point) => point.x);
    const ys = line.path.map((point) => point.y);
    const x = Math.max(0, Math.min(...xs) - padding);
    const y = Math.max(0, Math.min(...ys) - padding);
    const right = Math.min(page.width, Math.max(...xs) + padding);
    const bottom = Math.min(page.height, Math.max(...ys) + padding);
    if (right <= x || bottom <= y) return [];
    const suggestedRoles: Array<'symbols' | 'connections' | 'text'> = conflict.startsWith('UNBOUND_LINE_ENDPOINT:')
      ? ['connections', 'symbols']
      : ['connections'];
    return [{
      id: `graph-conflict-${page.pageIndex}-${index + 1}`,
      sourceId: line.id,
      retryScope: 'precision-region' as const,
      reason: 'low-coverage' as const,
      bounds: { x, y, w: right - x, h: bottom - y, page: TEAM_SNAPSHOT_PAGE },
      suggestedRoles,
      confidence: 1,
    }];
  });
}

function addUnresolved(
  target: UnresolvedItem[],
  page: PreparedDrawingPage,
  code: UnresolvedItem['code'],
  note: string,
  regionId?: string,
  bounds?: UnresolvedItem['bounds'],
): void {
  target.push({
    id: `${code}-${page.pageIndex}-${target.length + 1}`,
    code,
    pageIndex: page.pageIndex,
    regionId,
    bounds: bounds ?? { x: 0, y: 0, w: page.width, h: page.height },
    note,
  });
}

function teamInputForVector(
  input: OrchestrateInput,
  source: PreparedDrawingSource,
  page: PreparedDrawingPage,
  signal: AbortSignal | undefined = input.signal,
): TeamInput {
  const dxf = source.formatClass === 'dxf';
  return {
    sessionId: `drawing-vector-${source.documentHash.slice(0, 12)}-${page.pageIndex}`,
    classification: dxf ? 'sld_dxf' : 'sld_pdf',
    fileBuffer: input.bytes,
    fileName: input.fileName,
    mimeType: input.mimeType,
    params: dxf ? {} : { pageNumber: page.pageIndex + 1 },
    signal,
    settleOnAbort: true,
  };
}

function teamInputForRaster(
  input: OrchestrateInput,
  source: PreparedDrawingSource,
  page: PreparedDrawingPage,
  rescanTargets: RescanTargetEvidence[] = [],
  priorDrawingReviewEnvelopes: RoleReviewEnvelope[] = [],
  maxPrecisionRegionCallsPerRole = MAX_PRECISION_REGION_CALLS_PER_ROLE,
  signal: AbortSignal | undefined = input.signal,
): TeamInput {
  return {
    sessionId: `drawing-raster-${source.documentHash.slice(0, 12)}-${page.pageIndex}`,
    classification: 'sld_image',
    fileBuffer: page.imageBuffer,
    fileName: `${input.fileName ?? 'drawing'}#page-${page.pageIndex + 1}.png`,
    mimeType: 'image/png',
    ...(rescanTargets.length === 0 ? {} : { params: { rescanTargets } }),
    ...(priorDrawingReviewEnvelopes.length === 0 ? {} : { priorDrawingReviewEnvelopes }),
    maxPrecisionRegionCallsPerRole,
    signal,
    settleOnAbort: true,
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
  continuityByPage: Map<number, NonNullable<AdaptedTeamResult['continuity']>>,
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
  if (adapted.continuity) continuityByPage.set(page.pageIndex, adapted.continuity);
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

// ═══════════════════════════════════════════════════════════════════════════════
// 페이지 분석 — 문서 단위 문맥과 벡터·래스터 경로
// ═══════════════════════════════════════════════════════════════════════════════

/** 페이지들이 함께 채우는 증거 누산기. 참조로 공유한다. */
interface EvidenceAccumulator {
  symbolHits: RawSymbolHit[];
  lineHits: RawLineHit[];
  textSeeds: RawTextSeed[];
  continuityByPage: Map<number, NonNullable<AdaptedTeamResult['continuity']>>;
  calculations: DrawingDocumentV3['calculations'];
  logicConflictsByPage: Map<number, LogicConflict[]>;
  unresolved: UnresolvedItem[];
  rolesPresent: Set<RoleId>;
  regionRecords: CoverageRegionRecord[];
  providersUsed: Set<string>;
  modelsUsed: Set<string>;
}

/** 소비된 예산. 값 타입이므로 객체에 담아야 페이지 간에 공유된다. */
interface SpentBudget {
  attemptedPages: number;
  vlmCalls: number;
  pixelsUsed: number;
  unresolvedRescans: number;
}

interface DocumentRun {
  readonly input: OrchestrateInput;
  readonly deps: DocumentAnalysisDependencies;
  readonly source: PreparedDrawingSource;
  readonly budget: DocumentBudget;
  readonly jobId: string;
  readonly maxPagesPerRun: number;
  readonly previousVlmCalls: number;
  readonly deadline: number;
  readonly analysisSignal: AbortSignal;
  readonly executeTeam: typeof executeSLDTeam;
  readonly evidence: EvidenceAccumulator;
  readonly spent: SpentBudget;
}

type PageVision = NonNullable<OrchestrateInput['vision']>;

const MAX_RESCAN_ATTEMPTS = 2;
/** 폴백 대상 상한. 구획 전체가 실패해도 호출 예산을 한 번에 태우지 않는다. */
const MAX_GAP_FALLBACK_TARGETS = 6;

/** 페이지·시간·픽셀 예산 또는 취소 경계에 닿았는가. */
function exceedsRunBoundary(run: DocumentRun, page: PreparedDrawingPage): boolean {
  return run.spent.attemptedPages >= run.maxPagesPerRun
    || Date.now() >= run.deadline
    || run.spent.pixelsUsed + page.width * page.height > run.budget.maxPixels
    || run.analysisSignal.aborted
    || Boolean(getJob(run.jobId)?.cancelRequested);
}

function recordEnvelopeOrigins(run: DocumentRun, result: TeamResult): void {
  for (const envelope of result.drawingReview?.envelopes ?? []) {
    run.evidence.providersUsed.add(envelope.provider);
    run.evidence.modelsUsed.add(envelope.model);
  }
}

/**
 * 벡터 파서 경로. 구획 영수증은 DXF이거나 Vision 키가 없을 때만 이 결과로
 * 확정한다 — Vision이 있으면 아래 래스터 심사가 같은 페이지를 다시 덮는다.
 */
async function runVectorPass(
  run: DocumentRun,
  page: PreparedDrawingPage,
  vectorPlans: CoverageRegionPlan[],
): Promise<{ usable: boolean; regions?: CoverageRegionRecord[] }> {
  const { input, source, evidence } = run;
  const result = await run.executeTeam(
    teamInputForVector(input, source, page, run.analysisSignal),
    run.deps.teamDeps,
  );
  recordEnvelopeOrigins(run, result);
  const ownsCoverage = !input.vision || source.formatClass === 'dxf';

  if (!result.success || (result.components?.length ?? 0) === 0) {
    if (ownsCoverage) {
      addUnresolved(evidence.unresolved, page, 'ROLE_CALL_FAILED', '벡터 파서가 설비와 관계를 확정하지 못했습니다.');
    }
    return { usable: false };
  }

  mergeAdapted(
    result,
    page,
    source,
    evidence.symbolHits,
    evidence.lineHits,
    evidence.textSeeds,
    evidence.continuityByPage,
  );
  if (!ownsCoverage) return { usable: true };

  const coverage = markVectorCoverage(
    createCoverageRegions(vectorPlans),
    result.vectorAudit,
    `vector:${page.renderHash}`,
  );
  coverage.roles.forEach((role) => evidence.rolesPresent.add(role));
  if (!result.vectorAudit?.complete) {
    addUnresolved(evidence.unresolved, page, 'ROLE_CALL_FAILED', '벡터 파서의 역할별 분석·검증 영수증이 완전하지 않습니다.');
  }
  return { usable: true, regions: coverage.regions };
}

/**
 * 구획이 남았는데 감사기가 대상을 하나도 내지 않은 경우의 결정론적 폴백.
 *
 * `failedRoleRescanTargets` 는 **역할 호출 실패**만 대상으로 만든다. 구획
 * 자체가 미완료인데 역할 실패가 없으면 대상이 0이 되고, 재스캔 조건
 * `targets.length > 0` 에 걸려 한 번도 돌지 못한 채 HOLD_RESCAN_UNRESOLVED
 * 로 끝난다. 2026-08-04 중급 3회에서 이 경로가 회차 편차의 실제 출처였다 —
 * 재스캔이 돈 회차는 99%, 전체 페이지 구획이 실패했는데 대상이 없어 그냥
 * 포기한 회차는 80%였다. 재스캔은 편차를 키우는 게 아니라 줄인다.
 *
 * 미완료 구획의 경계를 그대로 대상으로 삼으므로 모델 응답과 무관하게
 * 결정론적이다.
 *
 * 다만 **판독 역할 호출이 실제로 실패한 구획**만 고른다. 그래프 충돌이나
 * 감사 미해결로 미완료인 구획은 같은 입력을 다시 보내도 같은 결과가 나와
 * 호출 예산만 3배로 태운다 — 재시도로 달라질 수 있는 것은 실패한 호출뿐이다.
 */
function gapRegionRescanTargets(
  page: PreparedDrawingPage,
  regions: readonly CoverageRegionRecord[],
): RescanTargetEvidence[] {
  const retryableRoles = new Set<RoleId>(['symbols', 'connections', 'text']);
  return regions
    .filter((region) => region.status === 'failed'
      && Object.entries(region.roleCalls).some(([role, calls]) =>
        retryableRoles.has(role as RoleId)
        && (calls ?? []).length > 0
        && (calls ?? []).every((call) => !call.success)))
    .slice(0, MAX_GAP_FALLBACK_TARGETS)
    .map((region, index) => ({
      id: `gap-region-${page.pageIndex}-${index + 1}`,
      sourceId: region.regionId,
      retryScope: region.kind === 'full-page' ? 'full-source' as const : 'precision-region' as const,
      reason: 'low-coverage' as const,
      bounds: { ...region.bounds, page: TEAM_SNAPSHOT_PAGE },
      suggestedRoles: ['symbols', 'connections', 'text'] as Array<'symbols' | 'connections' | 'text'>,
      confidence: 1,
    }));
}

/**
 * 감사기·그래프 충돌이 낸 세부 대상을 실제 호출 단위인 후보 구획으로 접는다.
 * 한 구획은 역할을 합쳐 한 번만 전달하므로 16구획+전체 소스 1건을 넘지 않는다.
 */
function compactRescanTargets(
  page: PreparedDrawingPage,
  targets: RescanTargetEvidence[],
): RescanTargetEvidence[] {
  const roles = ['symbols', 'connections', 'text'] as const;
  const deduped = [...new Map(targets.map((target) =>
    [`${target.sourceId ?? target.id}:${target.suggestedRoles.join(',')}`, target])).values()];
  const compacted: RescanTargetEvidence[] = [];
  const fullTargets = deduped.filter((target) => target.retryScope === 'full-source');
  if (fullTargets.length > 0) {
    const suggestedRoles = roles.filter((role) =>
      fullTargets.some((target) => target.suggestedRoles.includes(role)));
    compacted.push({
      id: `full-source-${page.pageIndex}`,
      sourceId: `p${page.pageIndex}-full`,
      retryScope: 'full-source',
      reason: fullTargets[0].reason,
      bounds: { x: 0, y: 0, w: page.width, h: page.height, page: TEAM_SNAPSHOT_PAGE },
      suggestedRoles,
      confidence: Math.max(...fullTargets.map((target) => target.confidence)),
    });
  }

  const precisionTargets = deduped.filter((target) => target.retryScope !== 'full-source');
  const regions = planAdaptiveBounds(page.width, page.height, gridSizeFor(page), 0.18);
  const matchesByRegion = regions.map(() => [] as RescanTargetEvidence[]);
  for (const target of precisionTargets) {
    const sourceRegion = target.sourceId?.match(/(?::region:|^p\d+-r)(\d+)$/);
    const sourceRegionIndex = sourceRegion ? Number(sourceRegion[1]) : -1;
    if (Number.isSafeInteger(sourceRegionIndex) && matchesByRegion[sourceRegionIndex]) {
      matchesByRegion[sourceRegionIndex].push(target);
      continue;
    }
    regions.forEach((bounds, index) => {
      if (boundsIntersect(bounds, target.bounds)) matchesByRegion[index].push(target);
    });
  }
  regions.forEach((bounds, index) => {
    const matches = matchesByRegion[index];
    if (matches.length === 0) return;
    const suggestedRoles = roles.filter((role) =>
      matches.some((target) => target.suggestedRoles.includes(role)));
    const mergedBounds = matches.length === 1 ? matches[0].bounds : {
      x: Math.min(...matches.map((target) => target.bounds.x)),
      y: Math.min(...matches.map((target) => target.bounds.y)),
      w: Math.max(...matches.map((target) => target.bounds.x + target.bounds.w))
        - Math.min(...matches.map((target) => target.bounds.x)),
      h: Math.max(...matches.map((target) => target.bounds.y + target.bounds.h))
        - Math.min(...matches.map((target) => target.bounds.y)),
      page: TEAM_SNAPSHOT_PAGE,
    };
    compacted.push({
      id: `precision-region-${page.pageIndex}-${index}`,
      sourceId: `p${page.pageIndex}-r${index}`,
      retryScope: 'precision-region',
      reason: matches[0].reason,
      bounds: { ...mergedBounds, page: TEAM_SNAPSHOT_PAGE },
      suggestedRoles,
      confidence: Math.max(...matches.map((target) => target.confidence)),
    });
  });
  return compacted;
}

/** 재스캔을 한 번 더 돌릴 호출·시간 여유가 있는가. */
function canRescan(
  run: DocumentRun,
  vision: PageVision,
  page: PreparedDrawingPage,
  attempt: number,
  targets: RescanTargetEvidence[],
): boolean {
  return attempt <= MAX_RESCAN_ATTEMPTS
    && targets.length > 0
    && run.previousVlmCalls + run.spent.vlmCalls + plannedTargetedRetryCalls(page, targets)
      <= run.budget.maxVlmCalls
    && Date.now() + drawingRoleTimeoutMs(vision.provider, vision.effort)
      + RESCAN_SETTLE_MARGIN_MS < run.deadline
    && !run.analysisSignal.aborted
    && !getJob(run.jobId)?.cancelRequested;
}

function recordUnresolvedRescans(
  run: DocumentRun,
  page: PreparedDrawingPage,
  targets: RescanTargetEvidence[],
): void {
  run.spent.unresolvedRescans += 1;
  if (targets.length === 0) {
    addUnresolved(run.evidence.unresolved, page, 'HOLD_RESCAN_UNRESOLVED', '최대 2회 정밀 재스캔 후에도 공간 그래프 충돌 또는 구획 호출 실패가 남았습니다.');
    return;
  }
  for (const target of targets) {
    const code: UnresolvedItem['code'] = target.reason === 'boundary-clip'
      ? 'BOUNDARY_CLIP'
      : target.reason === 'empty-result'
        ? 'EMPTY_REGION_RESULT'
        : 'HOLD_RESCAN_UNRESOLVED';
    addUnresolved(
      run.evidence.unresolved,
      page,
      code,
      `coverage-auditor가 ${target.reason} 누락 가능성을 지적했습니다. 재검사 역할: ${target.suggestedRoles.join(', ')}.`,
      target.sourceId,
      { x: target.bounds.x, y: target.bounds.y, w: target.bounds.w, h: target.bounds.h },
    );
  }
}

/** 래스터 독립 심사 경로. 구획 공백이 남으면 최대 2회까지 표적 재스캔한다. */
async function runRasterPass(
  run: DocumentRun,
  state: PageAnalysisState,
  page: PreparedDrawingPage,
  vision: PageVision,
  rasterPlans: CoverageRegionPlan[],
): Promise<{ usable: boolean; regions: CoverageRegionRecord[] }> {
  const { evidence } = run;
  // 전체 판독 4역할 + text 보조 원본 2회 + 조립 후 coverage audit.
  // 정밀 구획은 전체 판독 결과가 선택하므로 여기서 선결제하지 않는다.
  const plannedCalls = 7;
  if (run.previousVlmCalls + run.spent.vlmCalls + plannedCalls > run.budget.maxVlmCalls) {
    addUnresolved(evidence.unresolved, page, 'PARTIAL_BUDGET_EXCEEDED', '페이지 독립 심사 예상 호출 수가 문서 호출 예산을 초과합니다.');
    return {
      usable: false,
      regions: markAllFailed(createCoverageRegions(rasterPlans), 'PARTIAL_BUDGET_EXCEEDED'),
    };
  }

  let regions = createCoverageRegions(rasterPlans);
  let usable = false;
  let attempt = 0;
  let targets: RescanTargetEvidence[] = [];
  let priorEnvelopes: RoleReviewEnvelope[] = [];

  while (attempt <= MAX_RESCAN_ATTEMPTS) {
    const remainingCalls = run.budget.maxVlmCalls - run.previousVlmCalls - run.spent.vlmCalls;
    const attemptBaseCalls = targets.length === 0
      ? plannedCalls
      : 1 + targetedRetryFullSourceCalls(targets);
    const maxPrecisionRegionCallsPerRole = Math.min(
      MAX_PRECISION_REGION_CALLS_PER_ROLE,
      Math.max(0, Math.floor((remainingCalls - attemptBaseCalls) / 3)),
    );
    const result = await run.executeTeam(
      teamInputForRaster(
        run.input,
        run.source,
        page,
        targets,
        priorEnvelopes,
        maxPrecisionRegionCallsPerRole,
        run.analysisSignal,
      ),
      run.deps.teamDeps,
    );
    recordEnvelopeOrigins(run, result);
    const actualCalls = result.drawingReview?.coverage.actualCalls
      ?? result.drawingReview?.coverage.plannedCalls
      ?? plannedCalls;
    run.spent.vlmCalls += actualCalls;
    state.vlmCalls += actualCalls;
    // 쓴 즉시 적는다. 이 경로엔 try/catch 가 없어서 아래에서 예외가 나면
    // 다음 체크포인트까지의 호출이 잊혔고, `/run` 은 실패 시 상태를 QUEUED
    // 로 되돌려 재시도를 허용한다 — 잊힌 만큼 문서 예산(`maxVlmCalls`)을
    // 매번 넘어설 수 있었다. 예산 검사는 `previousVlmCalls`(= 저장된 값)에서
    // 출발하므로 저장이 늦으면 상한이 늦게 걸린다.
    updateJob(run.jobId, { vlmCallsUsed: run.previousVlmCalls + run.spent.vlmCalls });

    if (result.success && result.drawingReview) {
      mergeAdapted(
        result,
        page,
        run.source,
        evidence.symbolHits,
        evidence.lineHits,
        evidence.textSeeds,
        evidence.continuityByPage,
      );
      evidence.calculations.push(...adaptDrawingCalculations(result.drawingSynthesis).map((calculation) => ({
        ...calculation,
        id: `P${String(page.pageIndex + 1).padStart(2, '0')}-${calculation.id}`,
      })));
      evidence.logicConflictsByPage.set(page.pageIndex, [...(result.drawingSynthesis?.conflicts ?? [])]);
      usable = true;
      const coverage = markCouncilCoverage(regions, page, result);
      regions = coverage.regions;
      targets = compactRescanTargets(page, [
        ...coverage.rescanTargets,
        ...graphConflictRescanTargets(page, result),
        ...failedRoleRescanTargets(page, result),
      ]);
      // 감사기·역할 실패 어느 쪽도 대상을 내지 않았는데 구획이 남아 있으면
      // 미완료 구획 자체를 대상으로 삼는다. 없으면 재스캔이 한 번도 못 돈다.
      if (targets.length === 0 && hasCoverageGaps(regions)) {
        targets = gapRegionRescanTargets(page, regions);
      }
      coverage.roles.forEach((role) => evidence.rolesPresent.add(role));
      priorEnvelopes = [
        ...priorEnvelopes,
        ...result.drawingReview.envelopes.filter((envelope) => envelope.role !== 'coverage-auditor'),
      ];
    } else {
      regions = markAllFailed(regions, result.error ?? 'ROLE_CALL_FAILED');
    }

    if (!hasCoverageGaps(regions)) break;
    attempt += 1;
    if (!canRescan(run, vision, page, attempt, targets)) break;
  }

  if (hasCoverageGaps(regions)) recordUnresolvedRescans(run, page, targets);
  return { usable, regions };
}

/** 한 페이지의 준비 오류·예산 경계·판독 경로·최종 상태를 모두 확정한다. */
async function analyzePage(
  run: DocumentRun,
  state: PageAnalysisState,
  page: PreparedDrawingPage,
): Promise<void> {
  const { input, source, evidence } = run;
  const rasterPlans = rasterCoveragePlans(page);
  const vectorPlans = vectorCoveragePlans(page);

  if (page.preparationError) {
    state.status = 'failed';
    state.error = page.preparationError;
    evidence.regionRecords.push(
      ...markAllFailed(createCoverageRegions(vectorPlans), page.preparationError),
    );
    addUnresolved(
      evidence.unresolved,
      page,
      'PARTIAL_BUDGET_EXCEEDED',
      page.preparationError === 'CANCELLED'
        ? '사용자 취소로 페이지 준비를 중단했습니다.'
        : '페이지 렌더 준비가 페이지·픽셀·시간 예산을 초과했습니다.',
    );
    return;
  }

  if (exceedsRunBoundary(run, page)) {
    state.status = 'failed';
    state.error = input.signal?.aborted || getJob(run.jobId)?.cancelRequested
      ? 'CANCELLED'
      : 'PARTIAL_BUDGET_EXCEEDED';
    evidence.regionRecords.push(...markAllFailed(
      createCoverageRegions(page.imageBuffer ? rasterPlans : vectorPlans),
      state.error,
    ));
    addUnresolved(evidence.unresolved, page, 'PARTIAL_BUDGET_EXCEEDED', '페이지·시간·픽셀 예산 또는 취소 경계에서 분석을 중단했습니다.');
    return;
  }

  run.spent.attemptedPages += 1;
  run.spent.pixelsUsed += page.width * page.height;
  state.status = 'analyzing';

  let usable = false;
  let regions = createCoverageRegions(page.imageBuffer ? rasterPlans : vectorPlans);

  const shouldRunVector = source.formatClass === 'dxf'
    || page.renderMode === 'vector'
    || page.renderMode === 'hybrid';
  if (shouldRunVector) {
    const vector = await runVectorPass(run, page, vectorPlans);
    usable = vector.usable;
    if (vector.regions) regions = vector.regions;
  }

  const shouldRunRaster = Boolean(page.imageBuffer)
    && source.formatClass !== 'dxf'
    && (page.renderMode === 'raster'
      || page.renderMode === 'hybrid'
      || source.formatClass === 'raster-image'
      || (page.renderMode === 'vector' && Boolean(input.vision)));

  if (shouldRunRaster && input.vision) {
    const raster = await runRasterPass(run, state, page, input.vision, rasterPlans);
    usable = usable || raster.usable;
    regions = raster.regions;
  } else if (shouldRunRaster && !input.vision && !usable) {
    regions = markAllFailed(createCoverageRegions(rasterPlans), 'VISION_KEY_REQUIRED');
    addUnresolved(evidence.unresolved, page, 'ROLE_CALL_FAILED', '래스터 도면 정밀 판독에 사용할 Vision 키가 없습니다.');
  }

  if (!shouldRunRaster && !shouldRunVector && !usable) {
    regions = markAllFailed(regions, 'UNSUPPORTED_PAGE_MODE');
    addUnresolved(evidence.unresolved, page, 'ROLE_CALL_FAILED', '지원되는 페이지 판독 경로가 없습니다.');
  }

  evidence.regionRecords.push(...regions);
  const pageFailed = regions.some((region) =>
    region.status === 'failed' || region.status === 'planned' || region.status === 'running');
  state.status = usable && !pageFailed ? 'complete' : 'failed';
  if (state.status === 'failed' && !state.error) state.error = 'PAGE_ANALYSIS_PARTIAL';
}

// ═══════════════════════════════════════════════════════════════════════════════
// 페이지 간 정합 — 경계 봉합·직선 보조·확인 항목
// ═══════════════════════════════════════════════════════════════════════════════

/** 이전 실행에서 보존된 페이지의 경계 연속성 결과만 되살린다. */
function restoredContinuity(
  previous: DrawingDocumentV3 | undefined,
  preservedPages: ReadonlySet<number>,
): NonNullable<DrawingDocumentV3['continuity']> {
  const kept = <T extends { pageIndex: number }>(items: T[] | undefined) =>
    (items ?? []).filter((item) => preservedPages.has(item.pageIndex));
  return {
    regions: kept(previous?.continuity?.regions),
    continuations: kept(previous?.continuity?.continuations),
    unresolvedEndpoints: kept(previous?.continuity?.unresolvedEndpoints),
    stitchReceipts: (previous?.continuity?.stitchReceipts ?? []).filter((item) => {
      const page = item.continuationIds[0]?.match(/^P(\d+)-C/);
      return page ? preservedPages.has(Number(page[1]) - 1) : false;
    }),
  };
}

/** 구획 경계에서 끊긴 선을 전역 선망과 봉합하고, 실패한 끝점은 확인 항목으로 남긴다. */
function stitchPageBoundaries(
  continuity: NonNullable<DrawingDocumentV3['continuity']>,
  continuityByPage: ReadonlyMap<number, NonNullable<AdaptedTeamResult['continuity']>>,
  lineHits: RawLineHit[],
  unresolved: UnresolvedItem[],
): void {
  const ordered = [...continuityByPage.entries()].sort(([left], [right]) => left - right);
  for (const [pageIndex, pageContinuity] of ordered) {
    const stitched = stitchBoundaryLines({
      continuations: pageContinuity.plan.continuations,
      localLines: pageContinuity.localLines,
      globalLines: pageContinuity.globalLines,
    });
    lineHits.push(...pageContinuity.globalLines, ...stitched.lines);
    continuity.regions.push(...pageContinuity.plan.regions);
    continuity.continuations.push(...stitched.continuations);
    continuity.unresolvedEndpoints.push(...stitched.unresolvedEndpoints);
    continuity.stitchReceipts.push(...stitched.receipts);
    for (const endpoint of stitched.unresolvedEndpoints) {
      unresolved.push({
        id: endpoint.id,
        code: 'LINE_CONTINUITY_UNCERTAIN',
        displayId: endpoint.displayId,
        pageIndex,
        regionId: endpoint.regionId,
        bounds: { x: endpoint.point.x - 6, y: endpoint.point.y - 6, w: 12, h: 12 },
        candidates: endpoint.continuationId ? [endpoint.continuationId] : undefined,
        verificationItems: [{
          target: `${endpoint.displayId} 경계 선로의 반대편 연결 장치와 선종`,
          options: endpoint.continuationId ? [endpoint.continuationId] : undefined,
        }],
        note: `${endpoint.continuationId ?? '경계점'}을 전체 도면과 구획 결과로 합치지 못했습니다: ${endpoint.reason}`,
      });
    }
  }
}

/**
 * VLM 선 판독은 반복 래스터 망에서 회차마다 크게 흔들린다. 같은 페이지 픽셀에서
 * 결정론적 직선을 보조 근거로 더하되 기기 내부는 제외한다. 이 히트는 영구히
 * ambiguous 이므로 추측 관계를 confirmed 로 승격하지 못한다.
 */
async function appendRasterLineFallback(
  source: PreparedDrawingSource,
  requested: readonly number[],
  symbols: readonly SymbolNode[],
  textSeeds: readonly RawTextSeed[],
  lineHits: RawLineHit[],
): Promise<void> {
  for (const page of source.pages) {
    if (!requested.includes(page.pageIndex) || !page.imageBuffer) continue;
    const pageSymbols = symbols.filter((symbol) =>
      symbol.evidence.some((evidence) => evidence.pageIndex === page.pageIndex));
    // 직선 픽셀만으로는 도체와 표 테두리·표제란·기호 내부 획을 구분하지 못한다.
    // 이 보조는 살아남은 기호 근거의 보완이지 단독 인식기가 아니다.
    if (pageSymbols.length === 0) continue;
    const textBounds = textSeeds
      .filter((text) => text.pageIndex === page.pageIndex)
      .map((text) => text.bounds);
    lineHits.push(...await detectRasterLineHits(
      page.imageBuffer,
      page.pageIndex,
      equipmentExclusionBounds(page, pageSymbols),
      textBounds,
    ));
  }
}

/** 독립 논리 판독과 공간 그래프가 어긋난 관계를 확인 항목으로 남긴다. */
function appendLogicConflictItems(
  source: PreparedDrawingSource,
  logicConflictsByPage: ReadonlyMap<number, LogicConflict[]>,
  unresolved: UnresolvedItem[],
): void {
  const unique = [...new Map([...logicConflictsByPage.entries()].flatMap(([pageIndex, conflicts]) =>
    conflicts.map((conflict) => [`${pageIndex}:${conflict.id}`, { pageIndex, conflict }] as const))).values()];
  for (const { pageIndex, conflict } of unique) {
    const conflictPage = source.pages.find((page) => page.pageIndex === pageIndex);
    const evidenceBounds = conflict.logicEvidenceBounds[0]
      ?? conflict.graphEvidenceBounds[0]
      ?? { x: 0, y: 0, w: conflictPage?.width ?? 1, h: conflictPage?.height ?? 1, page: pageIndex + 1 };
    const candidates = [...new Set([...conflict.graphEvidenceIds, ...conflict.logicEvidenceIds])];
    unresolved.push({
      id: `logic-conflict-${pageIndex}-${conflict.id}`,
      code: 'ELECTRICAL_LOGIC_CONFLICT',
      displayId: `P${String(pageIndex + 1).padStart(2, '0')}-LC${String(unresolved.length + 1).padStart(3, '0')}`,
      pageIndex,
      bounds: { x: evidenceBounds.x, y: evidenceBounds.y, w: evidenceBounds.w, h: evidenceBounds.h },
      candidates,
      verificationItems: [{
        target: `${conflict.topic} 관계의 공간 그래프·독립 논리 근거 우선순위`,
        options: candidates,
      }],
      note: `${conflict.message} (${conflict.reasonCode})`,
    });
  }
}

/** 확정하지 못한 페이지 간 관계를 확인 항목으로 남긴다. */
function appendCrossPageItems(
  crossPageRelations: ReturnType<typeof reconcileCrossPage>,
  unresolved: UnresolvedItem[],
): void {
  for (const relation of crossPageRelations.filter((item) => item.status !== 'confirmed')) {
    const evidence = relation.evidence[0];
    unresolved.push({
      id: `cross-page-${relation.id}`,
      code: 'LINE_CONTINUITY_UNCERTAIN',
      displayId: relation.displayId,
      pageIndex: evidence?.pageIndex ?? relation.fromPage,
      bounds: evidence?.bounds ?? { x: 0, y: 0, w: 1, h: 1 },
      candidates: [relation.fromRef, relation.toRef],
      verificationItems: [{
        target: `${relation.displayId} 페이지 간 연결 대상`,
        options: [relation.fromRef, relation.toRef],
      }],
      note: `페이지 간 관계를 확정하지 못했습니다: ${relation.reason ?? relation.status}`,
    });
  }
}

export async function runDocumentAnalysis(
  input: OrchestrateInput,
  deps: DocumentAnalysisDependencies = {},
): Promise<{ job: DrawingJobRecord; document: DrawingDocumentV3 }> {
  const budget = normalizeBudget(input.budget);
  const maxPagesPerRun = input.maxPagesPerRun ?? budget.maxPages;
  if (!Number.isSafeInteger(maxPagesPerRun) || maxPagesPerRun < 1 || maxPagesPerRun > budget.maxPages) {
    throw new Error('DRAWING_RUN_PAGE_LIMIT_INVALID');
  }
  const ownerId = input.ownerId ?? 'internal';
  const jobBeforePreparation = input.jobId ? getOwnedJob(input.jobId, ownerId) : undefined;
  if (input.jobId && !jobBeforePreparation) throw new Error('DRAWING_JOB_NOT_FOUND');
  const requestedSpec = input.requestedPages ?? jobBeforePreparation?.document?.requestedPages ?? 'all';
  const source = await (deps.prepareSource ?? prepareDrawingSource)({
    bytes: input.bytes,
    mimeType: input.mimeType,
    fileName: input.fileName,
    requestedPages: input.preparationPages ?? requestedSpec,
    budget,
    signal: input.signal,
    shouldCancel: () => Boolean(input.jobId && getOwnedJob(input.jobId, ownerId)?.cancelRequested),
  });
  const previousJob = input.jobId ? getOwnedJob(input.jobId, ownerId) : undefined;
  if (input.jobId && !previousJob) throw new Error('DRAWING_JOB_NOT_FOUND');
  if (previousJob && previousJob.documentHash !== source.documentHash) {
    throw new Error('DRAWING_JOB_SOURCE_MISMATCH');
  }
  const requested = requestedPageIndexes(source, requestedSpec);
  if (requested.length === 0) throw new Error('DRAWING_REQUESTED_PAGES_EMPTY');

  const job = previousJob ?? createJob({
      documentHash: source.documentHash,
      ownerId,
      budget,
      estimatedPages: requested.length,
    });
  const previousVlmCalls = previousJob?.vlmCallsUsed ?? 0;
  if (previousJob) {
    updateJob(job.jobId, { budget, error: undefined });
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
    const previousDigest = previousJob?.pageDigests[pageIndex];
    const reusable = Boolean(previousJob && (sourcePage
      ? canReusePage(previousJob, pageIndex, pageDigestFingerprint(source, sourcePage, input))
      : previousDigest?.complete
        && previousDigest.promptVersion === PROMPT_VERSION
        && previousDigest.preprocessVersion === PREPROCESS_VERSION
        && previousDigest.graphVersion === GRAPH_ASSEMBLY_VERSION
        && previousDigest.provider === input.vision?.provider
        && previousDigest.model === (input.vision ? resolveVlmModel(input.vision.provider, input.vision.model) : undefined)
        && previousDigest.effort === input.vision?.effort
        && previousDigest.effortProfile === drawingEffortProfileKey(input.vision?.effortProfile)));
    return (previous?.status === 'complete' || previous?.status === 'skipped-empty') && reusable
      ? { ...previous }
      : !sourcePage && previous
        ? { ...previous }
        : { pageIndex, status: 'pending', drawingKind: 'unknown', vlmCalls: 0 };
  });
  const preservedPages = new Set(pageStates
    .filter((page) => page.status === 'complete' || page.status === 'skipped-empty')
    .map((page) => page.pageIndex));
  const retryPages = new Set(requested.filter((pageIndex) => !preservedPages.has(pageIndex)));
  const activeRetryPages = new Set(source.pages.map((page) => page.pageIndex).filter((pageIndex) => retryPages.has(pageIndex)));
  const previousSeeds = existingEvidenceSeeds(previousJob?.document, preservedPages);
  const symbolHits: RawSymbolHit[] = [...previousSeeds.symbols, ...(input.seedDetections?.symbols ?? [])];
  const lineHits: RawLineHit[] = [...previousSeeds.lines, ...(input.seedDetections?.lines ?? [])];
  const textSeeds: RawTextSeed[] = [...(input.seedDetections?.texts ?? [])];
  const continuityByPage = new Map<number, NonNullable<AdaptedTeamResult['continuity']>>();
  const calculationHits: DrawingDocumentV3['calculations'] = (previousJob?.document?.calculations ?? [])
    .filter((calculation) => {
      const pageMatch = calculation.id.match(/^P(\d+)-/);
      return pageMatch ? !activeRetryPages.has(Number(pageMatch[1]) - 1) : activeRetryPages.size === 0;
    });
  const finalLogicConflictsByPage = new Map<number, LogicConflict[]>();
  const unresolved: UnresolvedItem[] = (previousJob?.document?.unresolvedItems ?? [])
    .filter((item) => !activeRetryPages.has(item.pageIndex));
  const rolesPresent = new Set<RoleId>(previousJob?.document?.coverageLedger.rolesPresent ?? []);
  const regionRecords: CoverageRegionRecord[] = (previousJob?.document?.coverageLedger.regions ?? [])
    .filter((region) => !activeRetryPages.has(region.pageIndex));
  const spent: SpentBudget = { attemptedPages: 0, vlmCalls: 0, pixelsUsed: 0, unresolvedRescans: 0 };
  const deadline = Date.now() + budget.deadlineMs;
  const deadlineSignal = AbortSignal.timeout(budget.deadlineMs);
  const analysisSignal = input.signal
    ? AbortSignal.any([input.signal, deadlineSignal])
    : deadlineSignal;
  const executeTeam = deps.executeTeam ?? executeSLDTeam;
  const providersUsed = new Set<string>();
  const modelsUsed = new Set<string>();
  const run: DocumentRun = {
    input,
    deps,
    source,
    budget,
    jobId: job.jobId,
    maxPagesPerRun,
    previousVlmCalls,
    deadline,
    analysisSignal,
    executeTeam,
    evidence: {
      symbolHits,
      lineHits,
      textSeeds,
      continuityByPage,
      calculations: calculationHits,
      logicConflictsByPage: finalLogicConflictsByPage,
      unresolved,
      rolesPresent,
      regionRecords,
      providersUsed,
      modelsUsed,
    },
    spent,
  };

  updateJob(job.jobId, { status: 'SURVEYING' });
  for (const state of pageStates) {
    if (state.status === 'complete' || state.status === 'skipped-empty') continue;
    const page = source.pages.find((candidate) => candidate.pageIndex === state.pageIndex);
    if (!page) continue;
    state.status = 'surveying';
    state.quality = page.quality;
    if (page.preparationError) {
      // A budget/cancellation sentinel deliberately has no rendered content.
      // It is not an empty source page; the analysis phase must preserve the
      // preparation failure and its recovery guidance.
      state.drawingKind = 'unknown';
      continue;
    }
    state.drawingKind = surveyPageKind({
      textSample: page.textSample,
      vectorOpCount: page.vectorOpCount,
      rasterCoverage: page.rasterOpCount > 0 ? 1 : 0,
    });
    if (state.drawingKind === 'empty') state.status = 'skipped-empty';
  }

  updateJob(job.jobId, { status: 'ANALYZING_PAGES' });
  for (const state of pageStates) {
    if (state.status === 'complete' || state.status === 'skipped-empty') continue;
    const page = source.pages.find((candidate) => candidate.pageIndex === state.pageIndex);
    if (!page) continue;
    await analyzePage(run, state, page);
  }

  updateJob(job.jobId, { status: 'RESCANNING_GAPS', vlmCallsUsed: previousVlmCalls + spent.vlmCalls });
  const texts = [...previousSeeds.texts, ...adjudicateTextSeeds(deduplicateTextSeeds(textSeeds), unresolved)]
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
  const continuity = restoredContinuity(previousJob?.document, preservedPages);
  stitchPageBoundaries(continuity, continuityByPage, lineHits, unresolved);
  // 라스터 원본에는 벡터 앵커가 없다. 판독된 문자 층을 넘겨 명판 다중도를
  // 세게 한다 — 도면이 한 번만 적은 이름은 몇 번을 읽어도 한 대다.
  const symbols = deduplicateSymbols(symbolHits, undefined, textSeeds);
  // 관계·선 조립 전에 강등한다. 조립은 확정 여부를 보고 판단하므로 순서가 곧 결과다.
  const containedMarkingItems = demoteContainedMarkings(symbols);
  await appendRasterLineFallback(source, requested, symbols, textSeeds, lineHits);
  const lines = deduplicateLines(lineHits);
  const relations = requested.flatMap((pageIndex) => buildPageRelations(symbols, lines, pageIndex));
  const crossPageRelations = reconcileCrossPage(symbols, texts, extractPageRefHits(texts));
  // 순서가 곧 displayId 다. 미결속 선 → 논리 충돌 → 페이지 간 관계 순서를 바꾸면
  // 같은 도면의 확인 항목 번호가 달라진다.
  unresolved.push(...containedMarkingItems);
  unresolved.push(...findUnboundLineItems(lines, relations));
  appendLogicConflictItems(source, finalLogicConflictsByPage, unresolved);
  appendCrossPageItems(crossPageRelations, unresolved);
  const equipmentLinks = assignPhysicalEquipmentIds(
    symbols,
    crossPageRelations.filter((relation) => relation.status === 'confirmed'),
  );
  for (const symbol of symbols) symbol.equipmentId = equipmentLinks.get(symbol.id);

  const coverageLedger = buildCoverageLedger(regionRecords, [...rolesPresent], spent.unresolvedRescans);
  const coverageComplete = coverageLedger.allPlannedFinished
    && coverageLedger.regionsFailed === 0
    && coverageLedger.unresolvedRescans === 0;
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
    groundLineIds: lines.filter((line) => line.lineKind === 'ground' && line.certainty === 'confirmed')
      .map((line) => line.id),
    coverageComplete,
    coverageEvidenceIds: coverageLedger.regions.flatMap((region) =>
      (region.roleCalls['coverage-auditor'] ?? []).filter((call) => call.success).map((call) => call.callId)),
  });

  const completePages = pageStates.every((page) => page.status === 'complete' || page.status === 'skipped-empty');
  const cancelled = Boolean(input.signal?.aborted || getJob(job.jobId)?.cancelRequested);
  const jobStatus: DrawingDocumentV3['jobStatus'] = cancelled
    ? 'CANCELLED'
    : completePages && coverageComplete
      ? 'COMPLETE'
      : 'PARTIAL';
  const builtDocument = buildDrawingDocumentV3({
    documentHash: source.documentHash,
    documentPageCount: source.totalPageCount ?? source.pages.length,
    jobStatus,
    requestedPages: requestedSpec === 'all' ? 'all' : requested,
    pages: pageStates,
    coverageLedger,
    evidenceGraph: { symbols, lines, texts, relations },
    continuity,
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
        effort: input.vision?.effort,
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
      effort: fingerprint.effort,
      effortProfile: fingerprint.effortProfile,
      complete: state.status === 'complete' || state.status === 'skipped-empty',
    };
  }
  const finalJob = updateJob(job.jobId, {
    status: jobStatus,
    document: safeDocument,
    vlmCallsUsed: previousVlmCalls + spent.vlmCalls,
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
      standardTerms: OCR_STANDARD_TERMS,
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
        verificationItems: [{ target: `${displayId} 표기 후보를 가르는 원본 근거`, options: candidates }],
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
