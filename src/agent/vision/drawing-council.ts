import { createHash } from 'node:crypto';

import {
  drawingRoleTimeoutMs,
  resolveRoleEffort,
  type DrawingEffortProfile,
} from '@/lib/drawing-reasoning-effort';

import { annotatePrecisionRegion } from './annotated-region-renderer';
import { planBoundaryContinuations } from './boundary-continuation-planner';
import type { BoundaryContinuationPlan, GlobalLineCandidate } from './continuity-types';
import { ROLE_PROMPT_VERSION } from './role-prompts';
import { parseRoleReviewData, type RoleReviewData, type RoleReviewEnvelope } from './review-types';
import { assembleSpatialGraph } from './spatial-graph';
import { analyzeDrawingRole, type VLMOptions, type VLMReviewRole } from './vlm-client';
import { toOriginalPoint, type AnalysisRegionPlan, type DrawingSnapshot, type EvidenceBounds, type ImageVariant, type Point, type PrecisionRegion } from './evidence-types';

const PRIMARY_ROLES = ['symbols', 'connections', 'text', 'logic'] as const satisfies readonly VLMReviewRole[];
const COVERAGE_ROLE: VLMReviewRole = 'coverage-auditor';
const VARIANT_KINDS = ['original', 'upscale-2x', 'upscale-4x', 'text-high-contrast', 'line-enhanced'] as const;
const PROVIDERS = ['openai', 'gemini', 'google-agent-platform', 'claude', 'chatgpt-local', 'claude-local'] as const;
const PREPARED_SOURCE_MIME = 'image/png';
const MAX_REGION_CALLS_PER_ROLE = 16;
const MAX_TOTAL_SOURCE_CALLS = 55;
const DEFAULT_MAX_CONCURRENT_CALLS = 4;
const MAX_CONCURRENT_CALLS = 8;
const MAX_VARIANTS = 5;
const MAX_REGIONS = 48;
const MAX_PREPARED_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_ID_LENGTH = 160;
const MAX_MODEL_LENGTH = 200;
const MAX_MODEL_AGGREGATE_LENGTH = 2_000;
const MAX_COMBINED_EVIDENCE_PER_ROLE = 10_000;
const MAX_COMBINED_WARNINGS_PER_ROLE = 2_000;
const MAX_FAILURE_LENGTH = 300;
const COORDINATE_EPSILON = 1e-6;
const PRECISION_CONFIDENCE_THRESHOLD = 0.85;
const PRECISION_ROLES = ['symbols', 'connections', 'text'] as const;
const MAX_AUDIT_GRAPH_ITEMS = 200;

type PrecisionRole = (typeof PRECISION_ROLES)[number];
export type CouncilReviewRole = (typeof PRIMARY_ROLES)[number];
export type PrecisionPlan = Record<PrecisionRole, string[]>;

type Invoke = typeof analyzeDrawingRole;
type AnnotateRegion = typeof annotatePrecisionRegion;

export interface RoleFailure {
  role: VLMReviewRole;
  sourceId: string;
  error: string;
  fatal: boolean;
}

export interface DrawingCouncilInput {
  snapshot: DrawingSnapshot;
  variants: readonly ImageVariant[];
  regions: readonly PrecisionRegion[];
  options: VLMOptions;
  /**
   * 역할별 추론 단계. 지정한 역할만 `options.effort` 를 덮고, 그 역할의
   * 호출 시간 제한도 같은 단계에서 다시 파생한다. 비우면 기존과 동일하게
   * 모든 역할이 `options.effort` 하나를 쓴다.
   */
  effortProfile?: DrawingEffortProfile;
  maxRegionCallsPerRole?: number;
  maxConcurrentCalls?: number;
  /** Deadline/cancellation closes queued work but keeps already sealed role receipts. */
  settleOnAbort?: boolean;
  /** Sealed primary-role receipts from earlier attempts on the same drawing. */
  priorEnvelopes?: readonly RoleReviewEnvelope[];
  /** Targeted retries call only these primary axes and reuse sealed prior axes. */
  reviewRoles?: readonly CouncilReviewRole[];
  /** Targeted axes that must refresh their full-page source instead of only precision crops. */
  fullSourceReviewRoles?: readonly CouncilReviewRole[];
}

export interface DrawingCouncilResult {
  envelopes: RoleReviewEnvelope[];
  failures: RoleFailure[];
  callCounts?: { planned: number; attempted: number; successful: number; failed: number };
  /** Regions selected after the full-page survey, by the role that needs them. */
  precisionPlan?: PrecisionPlan;
  /** Present for production council runs; optional for injected legacy test doubles. */
  continuityPlan?: BoundaryContinuationPlan;
}

interface ReviewSource {
  id: string;
  namespace: string;
  buffer: ArrayBuffer;
  originalBounds: EvidenceBounds;
  context?: string;
  allowedContinuationIds?: readonly string[];
}

interface PlannedRole {
  role: VLMReviewRole;
  sources: readonly ReviewSource[];
  started: number;
  context?: string;
}

interface SuccessfulSource {
  source: ReviewSource;
  data: RoleReviewData;
  model: string;
}

interface SourceTask {
  role: VLMReviewRole;
  source: ReviewSource;
  order: number;
  context?: string;
}

interface SourceSuccess extends SuccessfulSource {
  role: VLMReviewRole;
}

interface SourceFailure {
  role: VLMReviewRole;
  source: ReviewSource;
  order: number;
  error: unknown;
  started: boolean;
}

interface RoleOutcome {
  envelope?: RoleReviewEnvelope;
  failures: RoleFailure[];
}

interface CouncilLimits {
  maxRegionCalls: number;
  maxConcurrentCalls: number;
}

function invalid(message: string): never {
  throw new Error(`Invalid drawing council input: ${message}`);
}

function assertBoundedString(value: unknown, label: string, maxLength = MAX_SOURCE_ID_LENGTH): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    invalid(`${label} must be a bounded non-empty string.`);
  }
}

function assertSnapshot(snapshot: DrawingSnapshot): void {
  assertBoundedString(snapshot.drawingHash, 'snapshot.drawingHash', 200);
  assertBoundedString(snapshot.mimeType, 'snapshot.mimeType', 128);
  if (!Number.isSafeInteger(snapshot.page) || snapshot.page < 1) {
    invalid('snapshot.page must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(snapshot.width) || !Number.isSafeInteger(snapshot.height) || snapshot.width < 1 || snapshot.height < 1) {
    invalid('snapshot dimensions must be positive safe integers.');
  }
}

function assertFiniteBounds(bounds: EvidenceBounds, width: number, height: number, label: string): void {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.w) ||
    !Number.isFinite(bounds.h) ||
    bounds.x < 0 ||
    bounds.y < 0 ||
    bounds.w <= 0 ||
    bounds.h <= 0 ||
    bounds.x + bounds.w > width ||
    bounds.y + bounds.h > height
  ) {
    invalid(`${label} must be a finite positive rectangle inside its image.`);
  }
}

function assertSameBounds(actual: EvidenceBounds, expected: EvidenceBounds, label: string): void {
  const values: Array<keyof EvidenceBounds> = ['x', 'y', 'w', 'h'];
  if (values.some((key) => Math.abs(actual[key] - expected[key]) > COORDINATE_EPSILON)) {
    invalid(`${label} must match the variant transform within epsilon.`);
  }
}

function assertVariant(variant: ImageVariant): void {
  assertBoundedString(variant.id, 'variant.id');
  if (!VARIANT_KINDS.includes(variant.kind)) invalid(`variant ${variant.id} has an unsupported kind.`);
  if (!variant.buffer || !(variant.buffer instanceof ArrayBuffer) || variant.buffer.byteLength === 0 || variant.buffer.byteLength > MAX_PREPARED_SOURCE_BYTES) {
    invalid(`variant ${variant.id} must have a bounded non-empty ArrayBuffer.`);
  }
  if (!Number.isSafeInteger(variant.width) || !Number.isSafeInteger(variant.height) || variant.width < 1 || variant.height < 1) {
    invalid(`variant ${variant.id} dimensions must be positive safe integers.`);
  }
  const transform = variant.transform;
  if (
    !Number.isFinite(transform.scaleX) ||
    !Number.isFinite(transform.scaleY) ||
    !Number.isFinite(transform.offsetX) ||
    !Number.isFinite(transform.offsetY) ||
    transform.scaleX <= 0 ||
    transform.scaleY <= 0
  ) {
    invalid(`variant ${variant.id} has an invalid transform.`);
  }
}

function originalBoundsForVariant(variant: ImageVariant): EvidenceBounds {
  return originalBoundsForVariantBounds({ x: 0, y: 0, w: variant.width, h: variant.height }, variant);
}

function originalBoundsForVariantBounds(bounds: EvidenceBounds, variant: ImageVariant): EvidenceBounds {
  const origin = toOriginalPoint({ x: bounds.x, y: bounds.y }, variant.transform);
  const end = toOriginalPoint({ x: bounds.x + bounds.w, y: bounds.y + bounds.h }, variant.transform);
  return { x: origin.x, y: origin.y, w: end.x - origin.x, h: end.y - origin.y };
}

function assertOptions(options: VLMOptions): void {
  if (!options || !PROVIDERS.includes(options.provider)) invalid('options.provider is unsupported.');
  // 로컬 공급자는 사용자의 로그인된 CLI를 쓰므로 키가 없다.
  if (options.provider !== 'chatgpt-local' && options.provider !== 'claude-local') {
    assertBoundedString(options.apiKey, 'options.apiKey', 4_096);
  }
  if (options.model !== undefined) assertBoundedString(options.model, 'options.model', MAX_MODEL_LENGTH);
  if (options.maxRetries !== undefined && (!Number.isSafeInteger(options.maxRetries) || options.maxRetries < 0 || options.maxRetries > 5)) {
    invalid('options.maxRetries must be an integer from 0 to 5.');
  }
  if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 180_000)) {
    invalid('options.timeoutMs must be a positive integer no greater than 180000.');
  }
  if (options.maxTokens !== undefined && (!Number.isSafeInteger(options.maxTokens) || options.maxTokens < 1 || options.maxTokens > 32_768)) {
    invalid('options.maxTokens must be an integer from 1 to 32768.');
  }
  if (options.temperature !== undefined && (!Number.isFinite(options.temperature) || options.temperature < 0 || options.temperature > 2)) {
    invalid('options.temperature must be finite from 0 to 2.');
  }
  if (options.signal !== undefined && (typeof options.signal.addEventListener !== 'function' || typeof options.signal.aborted !== 'boolean')) {
    invalid('options.signal must be an AbortSignal.');
  }
}

function validateInput(input: DrawingCouncilInput): CouncilLimits {
  assertSnapshot(input.snapshot);
  if (!Array.isArray(input.variants) || input.variants.length === 0 || input.variants.length > MAX_VARIANTS) {
    invalid(`variants must contain from 1 to ${MAX_VARIANTS} entries.`);
  }
  if (!Array.isArray(input.regions) || input.regions.length > MAX_REGIONS) {
    invalid(`regions must contain at most ${MAX_REGIONS} entries.`);
  }
  assertOptions(input.options);
  const maxRegionCalls = input.maxRegionCallsPerRole ?? MAX_REGION_CALLS_PER_ROLE;
  if (!Number.isSafeInteger(maxRegionCalls) || maxRegionCalls < 0 || maxRegionCalls > MAX_REGION_CALLS_PER_ROLE) {
    invalid(`maxRegionCallsPerRole must be an integer from 0 to ${MAX_REGION_CALLS_PER_ROLE}.`);
  }
  const maxConcurrentCalls = input.maxConcurrentCalls ?? DEFAULT_MAX_CONCURRENT_CALLS;
  if (!Number.isSafeInteger(maxConcurrentCalls) || maxConcurrentCalls < 1 || maxConcurrentCalls > MAX_CONCURRENT_CALLS) {
    invalid(`maxConcurrentCalls must be an integer from 1 to ${MAX_CONCURRENT_CALLS}.`);
  }
  if (input.reviewRoles !== undefined) {
    const reviewRoles = [...input.reviewRoles];
    if (reviewRoles.length === 0
      || new Set(reviewRoles).size !== reviewRoles.length
      || reviewRoles.some((role) => !PRIMARY_ROLES.includes(role))) {
      invalid('reviewRoles must be a non-empty unique subset of primary roles.');
    }
    const priorRoles = new Set((input.priorEnvelopes ?? []).map((envelope) => envelope.role));
    const missingPrior = PRIMARY_ROLES.filter((role) => !reviewRoles.includes(role) && !priorRoles.has(role));
    if (missingPrior.length > 0) invalid(`targeted retry is missing prior roles: ${missingPrior.join(',')}.`);
    const fullSourceRoles = [...(input.fullSourceReviewRoles ?? [])];
    if (new Set(fullSourceRoles).size !== fullSourceRoles.length
      || fullSourceRoles.some((role) => !reviewRoles.includes(role))) {
      invalid('fullSourceReviewRoles must be a unique subset of reviewRoles.');
    }
  } else if ((input.fullSourceReviewRoles?.length ?? 0) > 0) {
    invalid('fullSourceReviewRoles requires reviewRoles.');
  }
  const hasTripleTextSources = ['original', 'upscale-4x', 'text-high-contrast']
    .every((kind) => input.variants.some((variant) => variant.kind === kind));
  const textFullCallDelta = hasTripleTextSources ? 2 : 0;
  if (5 + textFullCallDelta + (3 * maxRegionCalls) > MAX_TOTAL_SOURCE_CALLS) {
    invalid(`planned calls exceed the ${MAX_TOTAL_SOURCE_CALLS} source-call budget.`);
  }

  const sourceIds = new Set<string>();
  const kinds = new Set<string>();
  const variantsById = new Map<string, ImageVariant>();
  let originalCount = 0;
  const snapshotFrame = { x: 0, y: 0, w: input.snapshot.width, h: input.snapshot.height };
  for (const variant of input.variants) {
    assertVariant(variant);
    if (sourceIds.has(variant.id)) invalid(`duplicate source id: ${variant.id}.`);
    if (kinds.has(variant.kind)) invalid(`duplicate variant kind: ${variant.kind}.`);
    const mappedFrame = originalBoundsForVariant(variant);
    assertFiniteBounds(mappedFrame, input.snapshot.width, input.snapshot.height, `variant ${variant.id} transform`);
    assertSameBounds(mappedFrame, snapshotFrame, `variant ${variant.id} transform`);
    sourceIds.add(variant.id);
    kinds.add(variant.kind);
    variantsById.set(variant.id, variant);
    if (variant.kind === 'original') originalCount += 1;
  }
  if (originalCount !== 1) invalid('variants must contain exactly one original image.');

  for (const region of input.regions) {
    assertBoundedString(region.id, 'region.id');
    assertBoundedString(region.variantId, 'region.variantId');
    if (sourceIds.has(region.id)) invalid(`duplicate source id: ${region.id}.`);
    sourceIds.add(region.id);
    const variant = variantsById.get(region.variantId);
    if (!variant) invalid(`region ${region.id} references an unknown variant.`);
    if (!(region.buffer instanceof ArrayBuffer) || region.buffer.byteLength === 0 || region.buffer.byteLength > MAX_PREPARED_SOURCE_BYTES) {
      invalid(`region ${region.id} must have a bounded non-empty ArrayBuffer.`);
    }
    assertFiniteBounds(region.variantBounds, variant.width, variant.height, `region ${region.id}.variantBounds`);
    assertFiniteBounds(region.originalBounds, input.snapshot.width, input.snapshot.height, `region ${region.id}.originalBounds`);
    assertSameBounds(originalBoundsForVariantBounds(region.variantBounds, variant), region.originalBounds, `region ${region.id}.originalBounds`);
  }

  return { maxRegionCalls, maxConcurrentCalls };
}

export function selectCouncilVariant(role: VLMReviewRole, variants: readonly ImageVariant[], recommendedScale?: 1 | 2 | 4): ImageVariant {
  const original = variants.find((variant) => variant.kind === 'original');
  if (!original) invalid('original variant is missing.');
  if (role === 'text') return variants.find((variant) => variant.kind === 'text-high-contrast') ?? original;
  if (role === 'connections') return variants.find((variant) => variant.kind === 'line-enhanced') ?? original;
  if (role === 'symbols') {
    if (recommendedScale === 4) return variants.find((variant) => variant.kind === 'upscale-4x') ?? original;
    if (recommendedScale === 2) return variants.find((variant) => variant.kind === 'upscale-2x') ?? original;
    return original;
  }
  return original;
}

function fullSourcesForRole(role: VLMReviewRole, input: DrawingCouncilInput): ReviewSource[] {
  const variant = selectCouncilVariant(role, input.variants, input.snapshot.quality.recommendedScale);
  const textKinds = role === 'text'
    && ['original', 'upscale-4x', 'text-high-contrast'].every((kind) =>
      input.variants.some((candidate) => candidate.kind === kind))
    ? ['original', 'upscale-4x', 'text-high-contrast'] as const
    : [variant.kind] as const;
  const fullSources: ReviewSource[] = textKinds.map((kind, index) => {
    const sourceVariant = input.variants.find((candidate) => candidate.kind === kind) ?? variant;
    return {
      id: sourceVariant.id,
      namespace: `s${index}`,
      buffer: sourceVariant.buffer,
      originalBounds: { x: 0, y: 0, w: input.snapshot.width, h: input.snapshot.height },
    };
  });
  return fullSources;
}

function precisionSourcesForRole(
  role: VLMReviewRole,
  input: DrawingCouncilInput,
  regions: readonly PrecisionRegion[],
  continuityPlan: BoundaryContinuationPlan,
  maxRegionCalls: number,
): ReviewSource[] {
  if (role === 'logic' || role === 'coverage-auditor' || maxRegionCalls === 0) return [];
  const variant = selectCouncilVariant(role, input.variants, input.snapshot.quality.recommendedScale);
  const fullSourceCount = fullSourcesForRole(role, input).length;
  const planned = regions
    .filter((region) => region.variantId === variant.id)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, maxRegionCalls);
  return planned.map((region, index) => {
    const allowedContinuationIds = continuityPlan.continuations
      .filter((port) => port.observations.some((observation) =>
        observation.regionDisplayId === region.displayId))
      .map((port) => port.displayId)
      .sort();
    return {
      id: region.id,
      namespace: `s${index + fullSourceCount}`,
      buffer: region.buffer,
      originalBounds: { ...region.originalBounds },
      allowedContinuationIds,
      context: canonicalize({
        regionId: region.displayId ?? region.id,
        logicalCore: region.logicalOriginalBounds ?? region.originalBounds,
        allowedContinuationIds,
      }),
    };
  });
}

function analysisPlansFromRegions(
  regions: readonly PrecisionRegion[],
  pageIndex: number,
): AnalysisRegionPlan[] {
  const byDisplayId = new Map<string, AnalysisRegionPlan>();
  for (const region of regions) {
    if (!region.displayId || !region.logicalOriginalBounds) continue;
    if (byDisplayId.has(region.displayId)) continue;
    const match = region.displayId.match(/-A(\d+)$/);
    const sequence = match ? Number(match[1]) - 1 : byDisplayId.size;
    const side = Math.max(1, Math.round(Math.sqrt(new Set(regions.map((item) => item.displayId).filter(Boolean)).size)));
    byDisplayId.set(region.displayId, {
      id: region.id,
      displayId: region.displayId,
      pageIndex,
      row: Math.floor(sequence / side),
      column: sequence % side,
      logicalBounds: { ...region.logicalOriginalBounds },
      cropBounds: { ...region.originalBounds },
    });
  }
  return [...byDisplayId.values()].sort((left, right) => left.displayId.localeCompare(right.displayId));
}

function fullEnvelopeFor(
  role: VLMReviewRole,
  plan: PlannedRole,
  settled: { successes: SourceSuccess[]; failures: SourceFailure[] },
  input: DrawingCouncilInput,
): RoleReviewEnvelope | undefined {
  if (plan.role !== role) return undefined;
  return buildRoleOutcome(plan, settled.successes, settled.failures, input).envelope;
}

function buildContinuationPlan(
  input: DrawingCouncilInput,
  precisionRegions: readonly PrecisionRegion[],
  plans: readonly PlannedRole[],
  settled: { successes: SourceSuccess[]; failures: SourceFailure[] },
): BoundaryContinuationPlan {
  const regions = analysisPlansFromRegions(precisionRegions, input.snapshot.page - 1);
  if (regions.length < 2) {
    return { regions, continuations: [], seamAlignedLineIds: [], warnings: [] };
  }
  const connectionPlan = plans.find((plan) => plan.role === 'connections');
  const symbolPlan = plans.find((plan) => plan.role === 'symbols');
  const connectionEnvelope = (connectionPlan
    ? fullEnvelopeFor('connections', connectionPlan, settled, input)
    : undefined) ?? latestPriorPrimary(input, 'connections');
  const symbolEnvelope = (symbolPlan
    ? fullEnvelopeFor('symbols', symbolPlan, settled, input)
    : undefined) ?? latestPriorPrimary(input, 'symbols');
  const lines: GlobalLineCandidate[] = (connectionEnvelope?.data.lines ?? []).map((line) => ({
    id: line.id,
    path: line.path.map((point) => ({ ...point })),
    lineKind: line.lineKind,
    source: 'global-vision',
    confidence: line.confidence,
    junctions: line.junctions.map((point) => ({ ...point })),
  }));
  return planBoundaryContinuations({
    pageIndex: input.snapshot.page - 1,
    regions,
    lines,
    deviceBounds: (symbolEnvelope?.data.symbols ?? []).map((symbol) => ({
      x: symbol.bounds.x,
      y: symbol.bounds.y,
      w: symbol.bounds.w,
      h: symbol.bounds.h,
    })),
  });
}

function intersects(left: EvidenceBounds, right: EvidenceBounds): boolean {
  return left.x < right.x + right.w
    && left.x + left.w > right.x
    && left.y < right.y + right.h
    && left.y + left.h > right.y;
}

function lineBounds(points: readonly Point[]): EvidenceBounds | null {
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

function precisionEvidence(
  role: PrecisionRole,
  envelope: RoleReviewEnvelope,
): Array<{ bounds: EvidenceBounds; uncertain: boolean }> {
  if (role === 'symbols') {
    return (envelope.data.symbols ?? []).map((item) => ({
      bounds: item.bounds,
      uncertain: item.confidence < PRECISION_CONFIDENCE_THRESHOLD || item.typeCandidates.length !== 1,
    }));
  }
  if (role === 'text') {
    return (envelope.data.texts ?? []).map((item) => ({
      bounds: item.bounds,
      uncertain: item.confidence < PRECISION_CONFIDENCE_THRESHOLD || item.candidates.length !== 1,
    }));
  }
  return (envelope.data.lines ?? []).flatMap((item) => {
    const bounds = lineBounds(item.path);
    return bounds ? [{ bounds, uncertain: item.confidence < PRECISION_CONFIDENCE_THRESHOLD }] : [];
  });
}

function initialPrecisionCap(regionCount: number, maxRegionCalls: number): number {
  if (regionCount === 0 || maxRegionCalls === 0) return 0;
  return Math.min(maxRegionCalls, Math.max(1, Math.ceil(Math.sqrt(regionCount))));
}

function selectPrecisionPlan(
  input: DrawingCouncilInput,
  fullEnvelopes: readonly RoleReviewEnvelope[],
  fullFailures: readonly RoleFailure[],
  maxRegionCalls: number,
  activeRoles: readonly CouncilReviewRole[] = PRIMARY_ROLES,
): PrecisionPlan {
  const explicitRetry = (input.priorEnvelopes?.length ?? 0) > 0;
  return Object.fromEntries(PRECISION_ROLES.map((role) => {
    if (!activeRoles.includes(role)) return [role, []];
    const variant = selectCouncilVariant(role, input.variants, input.snapshot.quality.recommendedScale);
    const regions = input.regions
      .filter((region) => region.variantId === variant.id)
      .slice()
      .sort((left, right) => left.originalBounds.y - right.originalBounds.y
        || left.originalBounds.x - right.originalBounds.x
        || left.id.localeCompare(right.id));
    if (explicitRetry) return [role, regions.slice(0, maxRegionCalls).map((region) => region.id)];

    const cap = initialPrecisionCap(regions.length, maxRegionCalls);
    if (cap === 0) return [role, []];
    const envelope = fullEnvelopes.find((item) => item.role === role);
    const fullFailed = !envelope || fullFailures.some((failure) => failure.role === role);
    if (fullFailed) return [role, regions.slice(0, cap).map((region) => region.id)];

    const evidence = precisionEvidence(role, envelope);
    const denseThreshold = role === 'symbols' ? 6 : role === 'connections' ? 8 : 12;
    const ranked = regions.flatMap((region) => {
      const hits = evidence.filter((item) => intersects(item.bounds, region.originalBounds));
      const uncertain = hits.filter((item) => item.uncertain).length;
      if (uncertain === 0 && hits.length < denseThreshold) return [];
      return [{ region, score: uncertain * 100 + hits.length }];
    }).sort((left, right) => right.score - left.score || left.region.id.localeCompare(right.region.id));
    return [role, ranked.slice(0, cap).map((item) => item.region.id)];
  })) as PrecisionPlan;
}

function latestPriorPrimary(input: DrawingCouncilInput, role: CouncilReviewRole): RoleReviewEnvelope | undefined {
  return [...(input.priorEnvelopes ?? [])].reverse().find((envelope) => envelope.role === role);
}

function mergePrimaryEnvelopes(
  input: DrawingCouncilInput,
  current: readonly RoleReviewEnvelope[],
  activeRoles: readonly CouncilReviewRole[],
): RoleReviewEnvelope[] {
  return PRIMARY_ROLES.flatMap((role) => {
    const currentEnvelope = current.find((envelope) => envelope.role === role);
    const prior = latestPriorPrimary(input, role);
    if (activeRoles.includes(role)) {
      if (!currentEnvelope) return [];
      if (input.reviewRoles === undefined
        || input.fullSourceReviewRoles?.includes(role)
        || !prior
        || role === 'logic') return [currentEnvelope];
      const model = [...new Set([...prior.model.split(','), ...currentEnvelope.model.split(',')])].sort().join(',');
      return [sealEnvelope(
        role,
        input.snapshot,
        input.options,
        model,
        prior.durationMs + currentEnvelope.durationMs,
        [...(prior.reviewedSourceIds ?? []), ...(currentEnvelope.reviewedSourceIds ?? [])],
        combineRoleData(role, [prior.data, currentEnvelope.data], []),
      )];
    }
    return prior ? [prior] : [];
  });
}

function graphSummary(envelopes: readonly RoleReviewEnvelope[], drawingWidth: number) {
  const graphEnvelopes = envelopes.filter((item) =>
    item.role === 'symbols' || item.role === 'connections' || item.role === 'text');
  if (graphEnvelopes.length !== 3) return {
    available: false, symbols: 0, lines: 0, texts: 0, edges: 0,
    nodes: [], relations: [], openLines: [], textLinks: [], conflicts: [] as string[],
  };
  try {
    const graph = assembleSpatialGraph(graphEnvelopes, { drawingWidth });
    return {
      available: true,
      symbols: graph.symbols.length,
      lines: graph.lines.length,
      texts: graph.texts.length,
      edges: graph.edges.length,
      nodes: graph.symbols.slice(0, MAX_AUDIT_GRAPH_ITEMS).map((item) => ({
        id: item.id,
        types: item.typeCandidates,
        label: item.rawLabel,
        bounds: item.bounds,
        confidence: item.confidence,
      })),
      relations: graph.edges.slice(0, MAX_AUDIT_GRAPH_ITEMS).map((item) => ({
        from: item.from,
        to: item.to,
        lineId: item.lineId,
        confidence: item.confidence,
      })),
      openLines: graph.lines
        .filter((item) => item.openEndReason || !graph.edges.some((edge) => edge.lineId === item.id))
        .slice(0, MAX_AUDIT_GRAPH_ITEMS)
        .map((item) => ({
          id: item.id,
          start: item.start,
          end: item.end,
          startAnchorId: item.startAnchorId,
          endAnchorId: item.endAnchorId,
          openEndReason: item.openEndReason,
          confidence: item.confidence,
        })),
      textLinks: graph.textLinks.slice(0, MAX_AUDIT_GRAPH_ITEMS).map((item) => ({
        textId: item.textId,
        symbolId: item.symbolId,
        confidence: item.confidence,
      })),
      conflicts: graph.conflicts.slice(0, 50),
    };
  } catch {
    return {
      available: false, symbols: 0, lines: 0, texts: 0, edges: 0,
      nodes: [], relations: [], openLines: [], textLinks: [], conflicts: ['GRAPH_ASSEMBLY_FAILED'],
    };
  }
}

function sanitizeFailure(error: unknown, apiKey: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const redacted = apiKey.length === 0 ? message : message.split(apiKey).join('[REDACTED]');
  return redacted.slice(0, MAX_FAILURE_LENGTH);
}

function assertModel(model: unknown): asserts model is string {
  if (typeof model !== 'string' || model.trim().length === 0 || model.length > MAX_MODEL_LENGTH) {
    throw new Error('review result model must be a bounded non-empty string.');
  }
}

function abortError(): Error {
  return new Error('[VLM] request aborted.');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function raceExternalAbort<T>(operation: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return operation;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function mapPoint(point: Point, source: EvidenceBounds, snapshot: DrawingSnapshot): Point {
  const mapped = { x: source.x + (point.x / 1000) * source.w, y: source.y + (point.y / 1000) * source.h };
  if (!Number.isFinite(mapped.x) || !Number.isFinite(mapped.y) || mapped.x < 0 || mapped.y < 0 || mapped.x > snapshot.width || mapped.y > snapshot.height) {
    throw new Error('remapped point is outside the drawing snapshot.');
  }
  return mapped;
}

function mapBounds(bounds: EvidenceBounds, source: EvidenceBounds, snapshot: DrawingSnapshot): EvidenceBounds & { page: number } {
  const start = mapPoint(bounds, source, snapshot);
  const end = mapPoint({ x: bounds.x + bounds.w, y: bounds.y + bounds.h }, source, snapshot);
  const mapped = { x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y, page: snapshot.page };
  if (!Number.isFinite(mapped.w) || !Number.isFinite(mapped.h) || mapped.w <= 0 || mapped.h <= 0 || mapped.x + mapped.w > snapshot.width || mapped.y + mapped.h > snapshot.height) {
    throw new Error('remapped bounds are outside the drawing snapshot.');
  }
  return mapped;
}

function namespaceId(source: ReviewSource, id: string): string {
  return `${source.namespace}:${id}`;
}

function remapRoleData(data: RoleReviewData, source: ReviewSource, snapshot: DrawingSnapshot): RoleReviewData {
  return {
    warnings: [...data.warnings],
    confidence: data.confidence,
    ...(data.symbols ? { symbols: data.symbols.map((item) => ({ ...item, id: namespaceId(source, item.id), sourceId: source.id, bounds: mapBounds(item.bounds, source.originalBounds, snapshot), ports: item.ports.map((point) => mapPoint(point, source.originalBounds, snapshot)) })) } : {}),
    ...(data.lines ? { lines: data.lines.map((item) => ({ ...item, id: namespaceId(source, item.id), sourceId: source.id, path: item.path.map((point) => mapPoint(point, source.originalBounds, snapshot)), start: mapPoint(item.start, source.originalBounds, snapshot), end: mapPoint(item.end, source.originalBounds, snapshot), junctions: item.junctions.map((point) => mapPoint(point, source.originalBounds, snapshot)), crossovers: item.crossovers.map((point) => mapPoint(point, source.originalBounds, snapshot)) })) } : {}),
    ...(data.texts ? { texts: data.texts.map((item) => ({ ...item, id: namespaceId(source, item.id), sourceId: source.id, bounds: mapBounds(item.bounds, source.originalBounds, snapshot) })) } : {}),
    ...(data.logic ? { logic: data.logic.map((item) => ({
      ...item,
      id: namespaceId(source, item.id),
      sourceId: source.id,
      subjectIds: item.subjectIds.map((id) => namespaceId(source, id)),
      attributes: item.attributes === undefined ? undefined : {
        ...item.attributes,
        ...(item.attributes.fromId === undefined ? {} : { fromId: namespaceId(source, item.attributes.fromId) }),
        ...(item.attributes.toId === undefined ? {} : { toId: namespaceId(source, item.attributes.toId) }),
        ...(item.attributes.protectedById === undefined || item.attributes.protectedById === null ? {} : { protectedById: namespaceId(source, item.attributes.protectedById) }),
      },
      evidenceBounds: item.evidenceBounds.map((bounds) => mapBounds(bounds, source.originalBounds, snapshot)),
    })) } : {}),
    ...(data.rescanTargets ? { rescanTargets: data.rescanTargets.map((item) => ({
      ...item,
      id: namespaceId(source, item.id),
      sourceId: source.id,
      bounds: mapBounds(item.bounds, source.originalBounds, snapshot),
    })) } : {}),
  };
}

function combineRoleData(role: VLMReviewRole, data: readonly RoleReviewData[], failures: readonly RoleFailure[]): RoleReviewData {
  const warnings = [...data.flatMap((item) => item.warnings), ...failures.filter((failure) => !failure.fatal).map((failure) => `REGION_REVIEW_FAILED:${failure.sourceId}`)];
  const evidenceCount = data.reduce((count, item) => count + (item.symbols?.length ?? 0) + (item.lines?.length ?? 0) + (item.texts?.length ?? 0) + (item.logic?.length ?? 0) + (item.rescanTargets?.length ?? 0), 0);
  if (evidenceCount > MAX_COMBINED_EVIDENCE_PER_ROLE) throw new Error(`combined evidence exceeds ${MAX_COMBINED_EVIDENCE_PER_ROLE}.`);
  if (warnings.length > MAX_COMBINED_WARNINGS_PER_ROLE) throw new Error(`combined warnings exceed ${MAX_COMBINED_WARNINGS_PER_ROLE}.`);
  const confidence = data.reduce((sum, item) => sum + item.confidence, 0) / data.length;
  if (role === 'symbols') return { symbols: data.flatMap((item) => item.symbols ?? []), warnings, confidence };
  if (role === 'connections') return { lines: data.flatMap((item) => item.lines ?? []), warnings, confidence };
  if (role === 'text') return { texts: data.flatMap((item) => item.texts ?? []), warnings, confidence };
  if (role === 'coverage-auditor') return { rescanTargets: data.flatMap((item) => item.rescanTargets ?? []), warnings, confidence };
  return { logic: data.flatMap((item) => item.logic ?? []), warnings, confidence };
}

function aggregateModel(successes: readonly SuccessfulSource[]): string {
  const model = [...new Set(successes.map((item) => item.model))].sort().join(',');
  if (model.length > MAX_MODEL_AGGREGATE_LENGTH) throw new Error(`combined model metadata exceeds ${MAX_MODEL_AGGREGATE_LENGTH}.`);
  return model;
}

function canonicalize(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
  }
  return 'null';
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

function sealEnvelope(
  role: VLMReviewRole,
  snapshot: DrawingSnapshot,
  options: VLMOptions,
  model: string,
  durationMs: number,
  reviewedSourceIds: string[],
  data: RoleReviewData,
): RoleReviewEnvelope {
  const frozenData = deepFreeze(data);
  // outputHash seals all immutable envelope metadata except the self-referential hash field.
  const seal = {
    role,
    drawingHash: snapshot.drawingHash,
    provider: options.provider,
    model,
    promptVersion: ROLE_PROMPT_VERSION,
    durationMs,
    reviewedSourceIds: [...new Set(reviewedSourceIds)].sort(),
    data: frozenData,
  };
  return deepFreeze({ ...seal, outputHash: createHash('sha256').update(canonicalize(seal)).digest('hex') });
}

function assertSourceAnchors(role: VLMReviewRole, source: ReviewSource, data: RoleReviewData): void {
  const allowed = new Set(source.allowedContinuationIds ?? []);
  if (role === 'connections') {
    for (const line of data.lines ?? []) {
      for (const anchorId of [line.startAnchorId, line.endAnchorId]) {
        if (anchorId !== undefined && anchorId !== null && !allowed.has(anchorId)) {
          throw new Error(`continuation anchor ${anchorId} is not allowed for source ${source.id}.`);
        }
      }
    }
  }
  if (role === 'symbols' && allowed.size > 0) {
    for (const symbol of data.symbols ?? []) {
      const claimsContinuation = symbol.rawLabel !== null && allowed.has(symbol.rawLabel)
        || symbol.typeCandidates.some((candidate) => allowed.has(candidate));
      if (claimsContinuation) {
        throw new Error(`continuation marker must not be returned as a symbol for source ${source.id}.`);
      }
    }
  }
}

/**
 * 이 역할이 실제로 쓸 호출 옵션. 프로필이 이 역할의 단계를 덮으면 시간 제한도
 * 같은 단계에서 다시 파생한다 — 낮춘 추론에 고추론 예산을 남겨두면 역할별
 * 분리의 목적인 시간 회수가 일어나지 않는다.
 */
function roleOptions(input: DrawingCouncilInput, role: string): VLMOptions {
  const effort = resolveRoleEffort(role, input.options.effort, input.effortProfile);
  if (effort === input.options.effort) return input.options;
  return {
    ...input.options,
    effort,
    timeoutMs: drawingRoleTimeoutMs(input.options.provider, effort),
  };
}

async function invokeSource(task: SourceTask, input: DrawingCouncilInput, invoke: Invoke): Promise<SourceSuccess> {
  throwIfAborted(input.options.signal);
  const options = roleOptions(input, task.role);
  const result = await raceExternalAbort(Promise.resolve().then(() => invoke(task.source.buffer, PREPARED_SOURCE_MIME, task.role, options, task.context)), input.options.signal);
  throwIfAborted(input.options.signal);
  if (result.role !== task.role) throw new Error(`review result role mismatch: expected ${task.role}.`);
  assertModel(result.model);
  const data = parseRoleReviewData(task.role, result.data);
  assertSourceAnchors(task.role, task.source, data);
  return { role: task.role, source: task.source, data, model: result.model };
}

async function runFairSourceTasks(plans: readonly PlannedRole[], input: DrawingCouncilInput, invoke: Invoke, limit: number): Promise<{ successes: SourceSuccess[]; failures: SourceFailure[] }> {
  const tasks: SourceTask[] = [];
  const longestPlan = Math.max(...plans.map((plan) => plan.sources.length));
  for (let sourceIndex = 0; sourceIndex < longestPlan; sourceIndex += 1) {
    for (const plan of plans) {
      const source = plan.sources[sourceIndex];
      if (source) tasks.push({ role: plan.role, source, order: tasks.length, context: source.context ?? plan.context });
    }
  }
  const successes: SourceSuccess[] = [];
  const failures: SourceFailure[] = [];
  const started = new Set<number>();
  let nextTask = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      if (input.options.signal?.aborted) {
        if (input.settleOnAbort) return;
        throw abortError();
      }
      const index = nextTask;
      nextTask += 1;
      if (index >= tasks.length) return;
      const task = tasks[index];
      started.add(index);
      try {
        successes.push(await invokeSource(task, input, invoke));
      } catch (error) {
        if (input.options.signal?.aborted) {
          if (!input.settleOnAbort) throw abortError();
          failures.push({ role: task.role, source: task.source, order: task.order, error, started: true });
          return;
        }
        failures.push({ role: task.role, source: task.source, order: task.order, error, started: true });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  if (input.options.signal?.aborted && input.settleOnAbort) {
    for (let index = 0; index < tasks.length; index += 1) {
      if (started.has(index)) continue;
      const task = tasks[index];
      failures.push({ role: task.role, source: task.source, order: task.order, error: abortError(), started: false });
    }
  }
  return { successes, failures };
}

function settleAbortedCouncil(
  input: DrawingCouncilInput,
  plans: readonly PlannedRole[],
  settled: { successes: readonly SourceSuccess[]; failures: readonly SourceFailure[] },
  continuityPlan: BoundaryContinuationPlan,
  plannedCalls: number,
  precisionPlan: PrecisionPlan = { symbols: [], connections: [], text: [] },
): DrawingCouncilResult {
  const outcomes = plans.map((plan) => buildRoleOutcome(plan, settled.successes, settled.failures, input));
  const envelopes = outcomes.flatMap((outcome) => outcome.envelope ? [outcome.envelope] : []);
  const failures = outcomes.flatMap((outcome) => outcome.failures);
  failures.push({
    role: COVERAGE_ROLE,
    sourceId: 'role',
    error: 'coverage-auditor was not run because the council deadline expired.',
    fatal: true,
  });
  return {
    envelopes: deepFreeze(envelopes) as RoleReviewEnvelope[],
    failures: deepFreeze(failures) as RoleFailure[],
    callCounts: callCounts(plannedCalls, settled),
    precisionPlan: deepFreeze(precisionPlan) as PrecisionPlan,
    continuityPlan: deepFreeze(continuityPlan) as BoundaryContinuationPlan,
  };
}

function callCounts(
  planned: number,
  ...settledGroups: Array<{ successes: readonly SourceSuccess[]; failures: readonly SourceFailure[] }>
): NonNullable<DrawingCouncilResult['callCounts']> {
  const successful = settledGroups.reduce((total, settled) => total + settled.successes.length, 0);
  const failed = settledGroups.reduce((total, settled) => total + settled.failures.filter((failure) => failure.started).length, 0);
  return { planned, attempted: successful + failed, successful, failed };
}

function buildRoleOutcome(plan: PlannedRole, successes: readonly SourceSuccess[], sourceFailures: readonly SourceFailure[], input: DrawingCouncilInput): RoleOutcome {
  const roleSuccesses = successes.filter((item) => item.role === plan.role).sort((left, right) => plan.sources.indexOf(left.source) - plan.sources.indexOf(right.source));
  const failures = sourceFailures.filter((item) => item.role === plan.role).sort((left, right) => left.order - right.order).map((item) => ({ role: plan.role, sourceId: item.source.id, error: sanitizeFailure(item.error, input.options.apiKey ?? ''), fatal: false }));
  if (roleSuccesses.length === 0) {
    for (const failure of failures) failure.fatal = true;
    failures.push({ role: plan.role, sourceId: 'role', error: `${plan.role} role produced no usable review.`, fatal: true });
    return { failures };
  }
  try {
    const remapped = roleSuccesses.map((item) => remapRoleData(item.data, item.source, input.snapshot));
    const data = combineRoleData(plan.role, remapped, failures);
    const model = aggregateModel(roleSuccesses);
    return {
      envelope: sealEnvelope(
        plan.role,
        input.snapshot,
        input.options,
        model,
        Math.max(0, Date.now() - plan.started),
        roleSuccesses.map((item) => item.source.id),
        data,
      ),
      failures,
    };
  } catch (error) {
    failures.push({ role: plan.role, sourceId: 'role', error: sanitizeFailure(error, input.options.apiKey ?? ''), fatal: true });
    return { failures };
  }
}

export async function runDrawingCouncil(
  input: DrawingCouncilInput,
  invoke: Invoke = analyzeDrawingRole,
  annotateRegion: AnnotateRegion = annotatePrecisionRegion,
): Promise<DrawingCouncilResult> {
  const limits = validateInput(input);
  throwIfAborted(input.options.signal);
  const activeRoles = input.reviewRoles ?? PRIMARY_ROLES;
  const targetedRetry = input.reviewRoles !== undefined;
  const fullPlans = activeRoles.map((role) => ({
    role,
    sources: targetedRetry
      && role !== 'logic'
      && !input.fullSourceReviewRoles?.includes(role)
      ? []
      : fullSourcesForRole(role, input),
    started: Date.now(),
  }));
  const fullPlannedCalls = fullPlans.reduce((total, plan) => total + plan.sources.length, 0);
  const fullSettled = await runFairSourceTasks(fullPlans, input, invoke, limits.maxConcurrentCalls);
  const fullOutcomes = fullPlans
    .filter((plan) => plan.sources.length > 0)
    .map((plan) => buildRoleOutcome(plan, fullSettled.successes, fullSettled.failures, input));
  const fullEnvelopes = fullOutcomes.flatMap((outcome) => outcome.envelope ? [outcome.envelope] : []);
  const fullFailures = fullOutcomes.flatMap((outcome) => outcome.failures);
  const precisionPlan = selectPrecisionPlan(input, fullEnvelopes, fullFailures, limits.maxRegionCalls, activeRoles);
  const selectedRegionIds = new Set(Object.values(precisionPlan).flat());
  const selectedRegions = input.regions.filter((region) => selectedRegionIds.has(region.id));
  const plannedCalls = fullPlannedCalls
    + Object.values(precisionPlan).reduce((total, regionIds) => total + regionIds.length, 0)
    + 1;
  const continuityPlan = buildContinuationPlan(input, selectedRegions, fullPlans, fullSettled);
  if (input.options.signal?.aborted) {
    if (!input.settleOnAbort) throw abortError();
    return settleAbortedCouncil(input, fullPlans, fullSettled, continuityPlan, plannedCalls, precisionPlan);
  }
  const shouldAnnotate = selectedRegions.some((region) =>
    Boolean(region.displayId && region.logicalOriginalBounds && region.logicalVariantBounds));
  const precisionRegions = shouldAnnotate
    ? await Promise.all(selectedRegions.map((region) =>
      region.displayId && region.logicalOriginalBounds && region.logicalVariantBounds
        ? annotateRegion(region, continuityPlan.continuations)
        : Promise.resolve(region)))
    : [...selectedRegions];
  const precisionPlans = activeRoles.map((role) => ({
    role,
    sources: precisionSourcesForRole(
      role,
      input,
      precisionRegions.filter((region) => role === 'logic' || precisionPlan[role as PrecisionRole]?.includes(region.id)),
      continuityPlan,
      limits.maxRegionCalls,
    ),
    started: Date.now(),
  }));
  const precisionSettled = await runFairSourceTasks(
    precisionPlans,
    input,
    invoke,
    limits.maxConcurrentCalls,
  );
  const plans = activeRoles.map((role, index) => ({
    role,
    sources: [...fullPlans[index].sources, ...precisionPlans[index].sources],
    started: fullPlans[index].started,
  }));
  const settled = {
    successes: [...fullSettled.successes, ...precisionSettled.successes],
    failures: [...fullSettled.failures, ...precisionSettled.failures],
  };
  if (input.options.signal?.aborted) {
    if (!input.settleOnAbort) throw abortError();
    return settleAbortedCouncil(input, plans, settled, continuityPlan, plannedCalls, precisionPlan);
  }
  const outcomes = plans.map((plan) => buildRoleOutcome(plan, settled.successes, settled.failures, input));
  const currentEnvelopes = outcomes.flatMap((outcome) => outcome.envelope ? [outcome.envelope] : []);
  const primaryEnvelopes = mergePrimaryEnvelopes(input, currentEnvelopes, activeRoles);
  const primaryFailures = outcomes.flatMap((outcome) => outcome.failures);
  const original = selectCouncilVariant(COVERAGE_ROLE, input.variants, input.snapshot.quality.recommendedScale);
  const auditPlan: PlannedRole = {
    role: COVERAGE_ROLE,
    sources: [{
      id: original.id,
      namespace: 'audit',
      buffer: original.buffer,
      originalBounds: { x: 0, y: 0, w: input.snapshot.width, h: input.snapshot.height },
    }],
    started: Date.now(),
    context: buildCoverageContext(
      input,
      [...(input.priorEnvelopes ?? []), ...primaryEnvelopes],
      primaryFailures,
      precisionPlan,
      graphSummary(primaryEnvelopes, input.snapshot.width),
    ),
  };
  const auditSettled = await runFairSourceTasks([auditPlan], input, invoke, 1);
  const auditOutcome = buildRoleOutcome(auditPlan, auditSettled.successes, auditSettled.failures, input);
  return {
    envelopes: deepFreeze([...primaryEnvelopes, ...(auditOutcome.envelope ? [auditOutcome.envelope] : [])]) as RoleReviewEnvelope[],
    failures: deepFreeze([...primaryFailures, ...auditOutcome.failures]) as RoleFailure[],
    callCounts: callCounts(plannedCalls, settled, auditSettled),
    precisionPlan: deepFreeze(precisionPlan) as PrecisionPlan,
    continuityPlan: deepFreeze(continuityPlan) as BoundaryContinuationPlan,
  };
}

function buildCoverageContext(
  input: DrawingCouncilInput,
  envelopes: readonly RoleReviewEnvelope[],
  failures: readonly RoleFailure[],
  precisionPlan: PrecisionPlan,
  graph: ReturnType<typeof graphSummary>,
): string {
  const byRole = Object.fromEntries(PRIMARY_ROLES.map((role) => {
    const attempts = envelopes.filter((envelope) => envelope.role === role).map((envelope) => ({
      outputHash: envelope.outputHash,
      symbols: envelope.data.symbols?.length ?? 0,
      lines: envelope.data.lines?.length ?? 0,
      texts: envelope.data.texts?.length ?? 0,
      logic: envelope.data.logic?.length ?? 0,
      sourceIds: [
        ...(envelope.data.symbols ?? []).map((item) => item.sourceId),
        ...(envelope.data.lines ?? []).map((item) => item.sourceId),
        ...(envelope.data.texts ?? []).map((item) => item.sourceId),
      ].filter(Boolean),
      reviewedSourceIds: envelope.reviewedSourceIds ?? [],
    }));
    return [role, { attempts }];
  }));
  return canonicalize({
    page: input.snapshot.page,
    plannedRegions: input.regions
      .filter((region) => Object.values(precisionPlan).some((ids) => ids.includes(region.id)))
      .map((region) => ({ id: region.id, bounds: region.originalBounds })),
    precisionPlan,
    graph,
    byRole,
    failures: failures.map((failure) => ({ role: failure.role, sourceId: failure.sourceId, fatal: failure.fatal })),
  });
}
