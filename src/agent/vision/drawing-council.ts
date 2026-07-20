import { createHash } from 'node:crypto';

import { ROLE_PROMPT_VERSION } from './role-prompts';
import { parseRoleReviewData, type RoleReviewData, type RoleReviewEnvelope } from './review-types';
import { analyzeDrawingRole, type VLMOptions, type VLMReviewRole } from './vlm-client';
import type { DrawingSnapshot, EvidenceBounds, ImageVariant, Point, PrecisionRegion } from './evidence-types';

const ROLES: readonly VLMReviewRole[] = ['symbols', 'connections', 'text', 'logic'];
const MAX_REGION_CALLS_PER_ROLE = 16;
const MAX_SOURCE_ID_LENGTH = 160;
const MAX_MODEL_LENGTH = 200;
const MAX_FAILURE_LENGTH = 300;

type Invoke = typeof analyzeDrawingRole;

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
  maxRegionCallsPerRole?: number;
}

interface ReviewSource {
  id: string;
  namespace: string;
  buffer: ArrayBuffer;
  originalBounds: EvidenceBounds;
}

interface SuccessfulSource {
  source: ReviewSource;
  data: RoleReviewData;
  model: string;
}

interface RoleOutcome {
  envelope?: RoleReviewEnvelope;
  failures: RoleFailure[];
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

function assertVariant(variant: ImageVariant): void {
  assertBoundedString(variant.id, 'variant.id');
  if (!variant.buffer || !(variant.buffer instanceof ArrayBuffer) || variant.buffer.byteLength === 0) {
    invalid(`variant ${variant.id} must have a non-empty ArrayBuffer.`);
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
  const { scaleX, scaleY, offsetX, offsetY } = variant.transform;
  const x = -offsetX / scaleX;
  const y = -offsetY / scaleY;
  const right = (variant.width - offsetX) / scaleX;
  const bottom = (variant.height - offsetY) / scaleY;

  return { x, y, w: right - x, h: bottom - y };
}

function validateInput(input: DrawingCouncilInput): number {
  assertSnapshot(input.snapshot);
  if (!Array.isArray(input.variants) || input.variants.length === 0) {
    invalid('variants must be a non-empty array.');
  }
  if (!Array.isArray(input.regions)) {
    invalid('regions must be an array.');
  }
  if (!input.options || typeof input.options.apiKey !== 'string') {
    invalid('options.apiKey must be a string.');
  }
  const maxRegionCalls = input.maxRegionCallsPerRole ?? MAX_REGION_CALLS_PER_ROLE;
  if (!Number.isSafeInteger(maxRegionCalls) || maxRegionCalls < 0 || maxRegionCalls > MAX_REGION_CALLS_PER_ROLE) {
    invalid(`maxRegionCallsPerRole must be an integer from 0 to ${MAX_REGION_CALLS_PER_ROLE}.`);
  }

  const sourceIds = new Set<string>();
  const variantsById = new Map<string, ImageVariant>();
  let originalCount = 0;
  for (const variant of input.variants) {
    assertVariant(variant);
    assertFiniteBounds(
      originalBoundsForVariant(variant),
      input.snapshot.width,
      input.snapshot.height,
      `variant ${variant.id} transform`,
    );
    if (sourceIds.has(variant.id)) invalid(`duplicate source id: ${variant.id}.`);
    sourceIds.add(variant.id);
    variantsById.set(variant.id, variant);
    if (variant.kind === 'original') originalCount += 1;
  }
  if (originalCount !== 1) {
    invalid('variants must contain exactly one original image.');
  }

  for (const region of input.regions) {
    assertBoundedString(region.id, 'region.id');
    assertBoundedString(region.variantId, 'region.variantId');
    if (sourceIds.has(region.id)) invalid(`duplicate source id: ${region.id}.`);
    sourceIds.add(region.id);
    const variant = variantsById.get(region.variantId);
    if (!variant) invalid(`region ${region.id} references an unknown variant.`);
    if (!(region.buffer instanceof ArrayBuffer) || region.buffer.byteLength === 0) {
      invalid(`region ${region.id} must have a non-empty ArrayBuffer.`);
    }
    assertFiniteBounds(region.variantBounds, variant.width, variant.height, `region ${region.id}.variantBounds`);
    assertFiniteBounds(region.originalBounds, input.snapshot.width, input.snapshot.height, `region ${region.id}.originalBounds`);
  }

  return maxRegionCalls;
}

function pickVariant(role: VLMReviewRole, variants: readonly ImageVariant[]): ImageVariant {
  const original = variants.find((variant) => variant.kind === 'original');
  if (!original) invalid('original variant is missing.');
  if (role === 'text') return variants.find((variant) => variant.kind === 'text-high-contrast') ?? original;
  if (role === 'connections') return variants.find((variant) => variant.kind === 'line-enhanced') ?? original;
  return original;
}

function planSources(
  role: VLMReviewRole,
  input: DrawingCouncilInput,
  maxRegionCalls: number,
): ReviewSource[] {
  const variant = pickVariant(role, input.variants);
  const full: ReviewSource = {
    id: variant.id,
    namespace: 's0',
    buffer: variant.buffer,
    originalBounds: originalBoundsForVariant(variant),
  };
  if (role === 'logic' || maxRegionCalls === 0) return [full];

  const planned = input.regions
    .filter((region) => region.variantId === variant.id)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, maxRegionCalls);
  return [
    full,
    ...planned.map((region, index) => ({
      id: region.id,
      namespace: `s${index + 1}`,
      buffer: region.buffer,
      originalBounds: { ...region.originalBounds },
    })),
  ];
}

function sanitizeFailure(error: unknown, apiKey: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(apiKey).join('[REDACTED]').slice(0, MAX_FAILURE_LENGTH);
}

function assertModel(model: unknown): asserts model is string {
  if (typeof model !== 'string' || model.trim().length === 0 || model.length > MAX_MODEL_LENGTH) {
    throw new Error('review result model must be a bounded non-empty string.');
  }
}

function mapPoint(point: Point, source: EvidenceBounds, snapshot: DrawingSnapshot): Point {
  const mapped = {
    x: source.x + (point.x / 1000) * source.w,
    y: source.y + (point.y / 1000) * source.h,
  };
  if (
    !Number.isFinite(mapped.x) ||
    !Number.isFinite(mapped.y) ||
    mapped.x < 0 ||
    mapped.y < 0 ||
    mapped.x > snapshot.width ||
    mapped.y > snapshot.height
  ) {
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
    ...(data.symbols ? {
      symbols: data.symbols.map((item) => ({
        ...item,
        id: namespaceId(source, item.id),
        sourceId: source.id,
        bounds: mapBounds(item.bounds, source.originalBounds, snapshot),
        ports: item.ports.map((point) => mapPoint(point, source.originalBounds, snapshot)),
      })),
    } : {}),
    ...(data.lines ? {
      lines: data.lines.map((item) => ({
        ...item,
        id: namespaceId(source, item.id),
        sourceId: source.id,
        path: item.path.map((point) => mapPoint(point, source.originalBounds, snapshot)),
        start: mapPoint(item.start, source.originalBounds, snapshot),
        end: mapPoint(item.end, source.originalBounds, snapshot),
        junctions: item.junctions.map((point) => mapPoint(point, source.originalBounds, snapshot)),
        crossovers: item.crossovers.map((point) => mapPoint(point, source.originalBounds, snapshot)),
      })),
    } : {}),
    ...(data.texts ? {
      texts: data.texts.map((item) => ({
        ...item,
        id: namespaceId(source, item.id),
        sourceId: source.id,
        bounds: mapBounds(item.bounds, source.originalBounds, snapshot),
      })),
    } : {}),
    ...(data.logic ? {
      logic: data.logic.map((item) => ({
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
      })),
    } : {}),
  };
}

function combineRoleData(role: VLMReviewRole, data: readonly RoleReviewData[], failures: readonly RoleFailure[]): RoleReviewData {
  const warnings = [
    ...data.flatMap((item) => item.warnings),
    ...failures.filter((failure) => !failure.fatal).map((failure) => `REGION_REVIEW_FAILED:${failure.sourceId}`),
  ];
  const confidence = data.reduce((sum, item) => sum + item.confidence, 0) / data.length;
  if (role === 'symbols') return { symbols: data.flatMap((item) => item.symbols ?? []), warnings, confidence };
  if (role === 'connections') return { lines: data.flatMap((item) => item.lines ?? []), warnings, confidence };
  if (role === 'text') return { texts: data.flatMap((item) => item.texts ?? []), warnings, confidence };
  return { logic: data.flatMap((item) => item.logic ?? []), warnings, confidence };
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
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
  data: RoleReviewData,
): RoleReviewEnvelope {
  const frozenData = deepFreeze(data);
  const seal = { role, drawingHash: snapshot.drawingHash, provider: options.provider, model, promptVersion: ROLE_PROMPT_VERSION, data: frozenData };
  const envelope: RoleReviewEnvelope = {
    role,
    drawingHash: snapshot.drawingHash,
    provider: options.provider,
    model,
    promptVersion: ROLE_PROMPT_VERSION,
    outputHash: createHash('sha256').update(canonicalize(seal)).digest('hex'),
    durationMs,
    data: frozenData,
  };
  return deepFreeze(envelope);
}

async function executeRole(
  role: VLMReviewRole,
  input: DrawingCouncilInput,
  maxRegionCalls: number,
  invoke: Invoke,
): Promise<RoleOutcome> {
  const started = Date.now();
  const sources = planSources(role, input, maxRegionCalls);
  const settled = await Promise.allSettled(sources.map(async (source) => {
    const result = await invoke(source.buffer, input.snapshot.mimeType, role, input.options);
    if (result.role !== role) throw new Error(`review result role mismatch: expected ${role}.`);
    assertModel(result.model);
    return { source, data: parseRoleReviewData(role, result.data), model: result.model } satisfies SuccessfulSource;
  }));
  const successes: SuccessfulSource[] = [];
  const failures: RoleFailure[] = [];
  for (let index = 0; index < settled.length; index += 1) {
    const item = settled[index];
    if (item.status === 'fulfilled') {
      successes.push(item.value);
      continue;
    }
    failures.push({
      role,
      sourceId: sources[index].id,
      error: sanitizeFailure(item.reason, input.options.apiKey),
      fatal: false,
    });
  }
  if (successes.length === 0) {
    for (const failure of failures) failure.fatal = true;
    failures.push({ role, sourceId: 'role', error: `${role} role produced no usable review.`, fatal: true });
    return { failures };
  }

  const remapped = successes.map((item) => remapRoleData(item.data, item.source, input.snapshot));
  const data = combineRoleData(role, remapped, failures);
  const model = [...new Set(successes.map((item) => item.model))].sort().join(',');
  return { envelope: sealEnvelope(role, input.snapshot, input.options, model, Date.now() - started, data), failures };
}

export async function runDrawingCouncil(
  input: DrawingCouncilInput,
  invoke: Invoke = analyzeDrawingRole,
): Promise<{ envelopes: RoleReviewEnvelope[]; failures: RoleFailure[] }> {
  const maxRegionCalls = validateInput(input);
  const outcomes = await Promise.all(ROLES.map((role) => executeRole(role, input, maxRegionCalls, invoke)));
  const envelopes = outcomes.flatMap((outcome) => outcome.envelope ? [outcome.envelope] : []);
  const failures = outcomes.flatMap((outcome) => outcome.failures);
  return {
    envelopes: deepFreeze(envelopes) as RoleReviewEnvelope[],
    failures: deepFreeze(failures) as RoleFailure[],
  };
}
