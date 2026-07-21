import type { EvidenceBounds, Point } from './evidence-types';
import type { LineEvidence, RoleReviewData, RoleReviewEnvelope, SymbolEvidence, TextEvidence } from './review-types';
import { createHash } from 'node:crypto';

const INPUT_ROLES = ['symbols', 'connections', 'text'] as const;
const MAX_INPUT_EVIDENCE = 2_000;
const MAX_OUTPUT_ITEMS = 10_000;
const MAX_ID_LENGTH = 240;
const DEFAULT_SNAP_TOLERANCE = 24;
const DEFAULT_DEDUPE_IOU = 0.5;
const LINE_TOLERANCE = 1e-6;
const ENDPOINT_DEDUPE_TOLERANCE = 1;
const INTERIOR_POLYLINE_TOLERANCE = 2;
const POINT_DEDUPE_TOLERANCE = 2;
const MAX_NESTED_ITEMS = 10_000;
const MAX_TOTAL_POINTS = 10_000;
const MAX_TOTAL_STRINGS = 200_000;

type InputRole = (typeof INPUT_ROLES)[number];

export interface SpatialGraphOptions {
  snapTolerance?: number;
  dedupeIou?: number;
  drawingWidth?: number;
}

export interface SpatialSymbol extends SymbolEvidence {
  id: string;
  originalEvidenceId: string;
  originalEvidenceIds: string[];
  sourceIds: string[];
}

export interface SpatialLine extends LineEvidence {
  id: string;
  originalEvidenceId: string;
  originalEvidenceIds: string[];
  sourceIds: string[];
  pages: number[];
}

export interface SpatialText extends TextEvidence {
  id: string;
  originalEvidenceId: string;
  originalEvidenceIds: string[];
  sourceIds: string[];
}

export interface SpatialJunction {
  id: string;
  page: number;
  point: Point;
  originalEvidenceIds: string[];
}

export interface SpatialEdge {
  id: string;
  from: string;
  to: string;
  lineId: string;
  confidence: number;
}

export interface SpatialTextLink {
  id: string;
  textId: string;
  symbolId: string;
  confidence: number;
}

export interface SpatialEvidenceGraph {
  drawingHash: string;
  symbols: SpatialSymbol[];
  lines: SpatialLine[];
  texts: SpatialText[];
  junctions: SpatialJunction[];
  crossovers: SpatialJunction[];
  edges: SpatialEdge[];
  textLinks: SpatialTextLink[];
  conflicts: string[];
}

interface SymbolRecord {
  item: SymbolEvidence;
  evidence: SymbolEvidence[];
}

interface LineRecord {
  item: LineEvidence;
  evidence: LineEvidence[];
  pages: number[];
}

interface TextRecord {
  item: TextEvidence;
  evidence: TextEvidence[];
}

interface InputBudget {
  points: number;
  strings: number;
}

function invalid(message: string): never {
  throw new Error(`Invalid spatial graph input: ${message}`);
}

function assertFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(`${label} must be finite.`);
}

function assertPoint(point: unknown, label: string): asserts point is Point {
  if (!point || typeof point !== 'object') invalid(`${label} must be a point.`);
  const value = point as Point;
  assertFinite(value.x, `${label}.x`);
  assertFinite(value.y, `${label}.y`);
}

function assertBounds(bounds: unknown, label: string): asserts bounds is EvidenceBounds & { page: number } {
  if (!bounds || typeof bounds !== 'object') invalid(`${label} must be bounds.`);
  const value = bounds as EvidenceBounds & { page: number };
  assertFinite(value.x, `${label}.x`);
  assertFinite(value.y, `${label}.y`);
  assertFinite(value.w, `${label}.w`);
  assertFinite(value.h, `${label}.h`);
  if (value.w <= 0 || value.h <= 0 || !Number.isSafeInteger(value.page) || value.page < 1) {
    invalid(`${label} must have positive finite extents and a positive page.`);
  }
}

function assertEvidenceId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_ID_LENGTH) {
    invalid(`${label} must be a bounded non-empty string.`);
  }
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array.`);
}

function consumeBudget(budget: InputBudget, points: number, strings: number): void {
  budget.points += points;
  budget.strings += strings;
  if (budget.points > MAX_TOTAL_POINTS) invalid(`points exceed the ${MAX_TOTAL_POINTS} input budget.`);
  if (budget.strings > MAX_TOTAL_STRINGS) invalid(`strings exceed the ${MAX_TOTAL_STRINGS} input budget.`);
}

function assertBoundedArray(value: unknown, label: string): asserts value is unknown[] {
  assertArray(value, label);
  if (value.length > MAX_NESTED_ITEMS) invalid(`${label} exceeds the nested input budget.`);
}

function assertConfidence(value: unknown, label: string): void {
  assertFinite(value, label);
  if (value < 0 || value > 1) invalid(`${label} must be from 0 to 1.`);
}

function assertSymbol(item: unknown, budget: InputBudget): asserts item is SymbolEvidence {
  if (!item || typeof item !== 'object') invalid('symbol must be an object.');
  const value = item as SymbolEvidence;
  assertEvidenceId(value.id, 'symbol.id');
  if (value.sourceId !== undefined) assertEvidenceId(value.sourceId, 'symbol.sourceId');
  assertBoundedArray(value.typeCandidates, 'symbol.typeCandidates');
  if (!value.typeCandidates.every((candidate) => typeof candidate === 'string' && candidate.length <= MAX_ID_LENGTH)) {
    invalid('symbol.typeCandidates must contain bounded strings.');
  }
  if (value.rawLabel !== null && (typeof value.rawLabel !== 'string' || value.rawLabel.length > 4_000)) invalid('symbol.rawLabel is invalid.');
  assertBounds(value.bounds, 'symbol.bounds');
  assertBoundedArray(value.ports, 'symbol.ports');
  value.ports.forEach((point, index) => assertPoint(point, `symbol.ports[${index}]`));
  assertConfidence(value.confidence, 'symbol.confidence');
  consumeBudget(budget, value.ports.length, value.id.length + (value.sourceId?.length ?? 0) + (value.rawLabel?.length ?? 0) + value.typeCandidates.reduce((sum, candidate) => sum + candidate.length, 0));
}

function assertLine(item: unknown, budget: InputBudget): asserts item is LineEvidence {
  if (!item || typeof item !== 'object') invalid('line must be an object.');
  const value = item as LineEvidence;
  assertEvidenceId(value.id, 'line.id');
  if (value.sourceId !== undefined) assertEvidenceId(value.sourceId, 'line.sourceId');
  assertEvidenceId(value.lineKind, 'line.lineKind');
  assertBoundedArray(value.path, 'line.path');
  if (value.path.length < 2) invalid('line.path must have at least two points.');
  value.path.forEach((point, index) => assertPoint(point, `line.path[${index}]`));
  assertPoint(value.start, 'line.start');
  assertPoint(value.end, 'line.end');
  assertBoundedArray(value.junctions, 'line.junctions');
  assertBoundedArray(value.crossovers, 'line.crossovers');
  value.junctions.forEach((point, index) => assertPoint(point, `line.junctions[${index}]`));
  value.crossovers.forEach((point, index) => assertPoint(point, `line.crossovers[${index}]`));
  assertConfidence(value.confidence, 'line.confidence');
  consumeBudget(budget, value.path.length + value.junctions.length + value.crossovers.length + 2, value.id.length + (value.sourceId?.length ?? 0) + value.lineKind.length);
}

function assertText(item: unknown, budget: InputBudget): asserts item is TextEvidence {
  if (!item || typeof item !== 'object') invalid('text must be an object.');
  const value = item as TextEvidence;
  assertEvidenceId(value.id, 'text.id');
  if (value.sourceId !== undefined) assertEvidenceId(value.sourceId, 'text.sourceId');
  if (typeof value.raw !== 'string' || value.raw.length > 4_000) invalid('text.raw is invalid.');
  assertBoundedArray(value.candidates, 'text.candidates');
  if (!value.candidates.every((candidate) => typeof candidate === 'string' && candidate.length <= 4_000)) invalid('text.candidates are invalid.');
  assertBounds(value.bounds, 'text.bounds');
  assertConfidence(value.confidence, 'text.confidence');
  consumeBudget(budget, 0, value.id.length + (value.sourceId?.length ?? 0) + value.raw.length + value.candidates.reduce((sum, candidate) => sum + candidate.length, 0));
}

function assertEnvelopeData(role: InputRole, data: RoleReviewData, budget: InputBudget): void {
  if (!data || typeof data !== 'object' || !Array.isArray(data.warnings)) invalid('data must include warnings.');
  if (data.warnings.length > MAX_INPUT_EVIDENCE || !data.warnings.every((warning) => typeof warning === 'string' && warning.length <= 4_000)) {
    invalid('warnings exceed the bounded input contract.');
  }
  consumeBudget(budget, 0, data.warnings.reduce((sum, warning) => sum + warning.length, 0));
  assertConfidence(data.confidence, 'data.confidence');
  const collection = role === 'symbols' ? data.symbols : role === 'connections' ? data.lines : data.texts;
  if (!Array.isArray(collection)) invalid(`${role} collection is required.`);
  if (collection.length > MAX_INPUT_EVIDENCE) invalid(`${role} collection exceeds the input budget.`);
  if (
    (role !== 'symbols' && data.symbols !== undefined) ||
    (role !== 'connections' && data.lines !== undefined) ||
    (role !== 'text' && data.texts !== undefined) ||
    data.logic !== undefined
  ) invalid(`${role} contains an unsupported collection.`);
  if (role === 'symbols') data.symbols?.forEach((item) => assertSymbol(item, budget));
  if (role === 'connections') data.lines?.forEach((item) => assertLine(item, budget));
  if (role === 'text') data.texts?.forEach((item) => assertText(item, budget));
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

function sealedOutputHash(envelope: RoleReviewEnvelope): string {
  const seal = {
    role: envelope.role,
    drawingHash: envelope.drawingHash,
    provider: envelope.provider,
    model: envelope.model,
    promptVersion: envelope.promptVersion,
    durationMs: envelope.durationMs,
    data: envelope.data,
  };
  return createHash('sha256').update(canonicalize(seal)).digest('hex');
}

function validateInput(envelopes: readonly RoleReviewEnvelope[], options: SpatialGraphOptions): {
  drawingHash: string;
  snapTolerance: number;
  dedupeIou: number;
  lineEndpointTolerance: number;
  lineInteriorTolerance: number;
} {
  if (!Array.isArray(envelopes) || envelopes.length === 0) invalid('envelopes must not be empty.');
  const snapTolerance = options.snapTolerance ?? DEFAULT_SNAP_TOLERANCE;
  const dedupeIou = options.dedupeIou ?? DEFAULT_DEDUPE_IOU;
  if (!Number.isFinite(snapTolerance) || snapTolerance <= 0 || snapTolerance > 10_000) invalid('snapTolerance must be finite, positive, and bounded.');
  if (!Number.isFinite(dedupeIou) || dedupeIou <= 0 || dedupeIou > 1) invalid('dedupeIou must be finite and from 0 to 1.');
  if (options.drawingWidth !== undefined
    && (!Number.isFinite(options.drawingWidth) || options.drawingWidth <= 0 || options.drawingWidth > 100_000)) {
    invalid('drawingWidth must be finite, positive, and bounded.');
  }
  const scaledLineTolerance = options.drawingWidth === undefined ? 0 : 2 * options.drawingWidth / 1_000;
  const lineEndpointTolerance = Math.max(ENDPOINT_DEDUPE_TOLERANCE, scaledLineTolerance);
  const lineInteriorTolerance = Math.max(INTERIOR_POLYLINE_TOLERANCE, scaledLineTolerance);

  const roles = new Set<string>();
  let drawingHash: string | undefined;
  let evidenceCount = 0;
  const budget: InputBudget = { points: 0, strings: 0 };
  for (const envelope of envelopes) {
    if (!envelope || typeof envelope !== 'object') invalid('envelope must be an object.');
    if (!INPUT_ROLES.includes(envelope.role as InputRole)) invalid('envelope role is unsupported.');
    if (roles.has(envelope.role)) invalid(`duplicate role: ${envelope.role}.`);
    roles.add(envelope.role);
    assertEvidenceId(envelope.drawingHash, 'drawingHash');
    if (drawingHash !== undefined && drawingHash !== envelope.drawingHash) invalid('drawingHash must match across envelopes.');
    drawingHash = envelope.drawingHash;
    assertEnvelopeData(envelope.role, envelope.data, budget);
    if (typeof envelope.outputHash !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.outputHash)) invalid('outputHash must be a SHA-256 hex string.');
    if (envelope.outputHash !== sealedOutputHash(envelope)) invalid('outputHash does not match the canonical sealed envelope.');
    evidenceCount += envelope.data.symbols?.length ?? 0;
    evidenceCount += envelope.data.lines?.length ?? 0;
    evidenceCount += envelope.data.texts?.length ?? 0;
  }
  if (envelopes.length > INPUT_ROLES.length) invalid('envelopes may not repeat a role.');
  if (evidenceCount > MAX_INPUT_EVIDENCE) invalid(`evidence exceeds the ${MAX_INPUT_EVIDENCE} input budget.`);
  return { drawingHash: drawingHash as string, snapTolerance, dedupeIou, lineEndpointTolerance, lineInteriorTolerance };
}

function normalizedCandidates(values: readonly string[]): string[] {
  return [...new Set(values.map((item) => item.trim().toUpperCase()).filter(Boolean))].sort();
}

function displayType(symbol: SymbolEvidence): string {
  const candidates = [...new Set(symbol.typeCandidates.map((item) => item.trim().toUpperCase()).filter(Boolean))];
  if (candidates.length > 1) return 'AMB';
  const raw = candidates[0] ?? 'UNK';
  return raw.replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'UNK';
}

function normalizedLabel(symbol: SymbolEvidence): string {
  return symbol.rawLabel?.trim().toUpperCase() ?? '';
}

function compatibleLabels(left: SymbolEvidence, right: SymbolEvidence): boolean {
  return left.rawLabel === null || right.rawLabel === null || normalizedLabel(left) === normalizedLabel(right);
}

function overlapsCandidates(left: readonly SymbolEvidence[], right: SymbolEvidence): boolean {
  const known = new Set(left.flatMap((item) => normalizedCandidates(item.typeCandidates)));
  return normalizedCandidates(right.typeCandidates).some((candidate) => known.has(candidate));
}

function unionCandidates(evidence: readonly SymbolEvidence[]): string[] {
  return [...new Set(evidence.flatMap((item) => item.typeCandidates))];
}

function compareSymbols(left: SymbolEvidence, right: SymbolEvidence): number {
  return left.bounds.page - right.bounds.page
    || left.bounds.y - right.bounds.y
    || left.bounds.x - right.bounds.x
    || displayType(left).localeCompare(displayType(right))
    || left.id.localeCompare(right.id);
}

function iou(left: EvidenceBounds, right: EvidenceBounds): number {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.w, right.x + right.w);
  const y2 = Math.min(left.y + left.h, right.y + right.h);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = left.w * left.h + right.w * right.h - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function deduplicateSymbols(symbols: readonly SymbolEvidence[], threshold: number): SymbolRecord[] {
  const prioritized = [...symbols].sort((left, right) => right.confidence - left.confidence || compareSymbols(left, right));
  const accepted: SymbolRecord[] = [];
  for (const candidate of prioritized) {
    const match = accepted.find((record) =>
      record.item.bounds.page === candidate.bounds.page
      && compatibleLabels(record.item, candidate)
      && overlapsCandidates(record.evidence, candidate)
      && iou(record.item.bounds, candidate.bounds) >= threshold);
    if (match) match.evidence.push(candidate);
    else accepted.push({ item: candidate, evidence: [candidate] });
  }
  return accepted.sort((left, right) => compareSymbols(left.item, right.item));
}

function normalizedTextCandidates(text: TextEvidence): string {
  return normalizedCandidates(text.candidates).join('|');
}

function deduplicateTexts(texts: readonly TextEvidence[], threshold: number): TextRecord[] {
  const ordered = [...texts].sort((left, right) => right.confidence - left.confidence
    || left.bounds.page - right.bounds.page || left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x
    || left.raw.localeCompare(right.raw) || left.id.localeCompare(right.id));
  const accepted: TextRecord[] = [];
  for (const candidate of ordered) {
    const match = accepted.find((record) => record.item.bounds.page === candidate.bounds.page
      && record.item.raw.trim().toUpperCase() === candidate.raw.trim().toUpperCase()
      && normalizedTextCandidates(record.item) === normalizedTextCandidates(candidate)
      && iou(record.item.bounds, candidate.bounds) >= threshold);
    if (match) match.evidence.push(candidate);
    else accepted.push({ item: candidate, evidence: [candidate] });
  }
  return accepted.sort((left, right) => left.item.bounds.page - right.item.bounds.page
    || left.item.bounds.y - right.item.bounds.y || left.item.bounds.x - right.item.bounds.x
    || left.item.raw.localeCompare(right.item.raw) || left.item.id.localeCompare(right.item.id));
}

function distance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function center(bounds: EvidenceBounds): Point {
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
}

function samePoint(left: Point, right: Point, tolerance = LINE_TOLERANCE): boolean {
  return distance(left, right) <= tolerance;
}

function resamplePolyline(path: readonly Point[], count: number): Point[] {
  const lengths = new Array<number>(path.length).fill(0);
  for (let index = 1; index < path.length; index += 1) lengths[index] = lengths[index - 1] + distance(path[index - 1], path[index]);
  const total = lengths[lengths.length - 1];
  if (total === 0) return Array.from({ length: count }, () => ({ ...path[0] }));
  const samples: Point[] = [];
  let segment = 1;
  for (let index = 0; index < count; index += 1) {
    const target = total * index / (count - 1);
    while (segment < lengths.length - 1 && lengths[segment] < target) segment += 1;
    const previous = lengths[segment - 1];
    const span = lengths[segment] - previous;
    const ratio = span === 0 ? 0 : (target - previous) / span;
    samples.push({
      x: path[segment - 1].x + (path[segment].x - path[segment - 1].x) * ratio,
      y: path[segment - 1].y + (path[segment].y - path[segment - 1].y) * ratio,
    });
  }
  return samples;
}

function endpointMatch(left: LineEvidence, right: LineEvidence, reverse: boolean, tolerance: number): boolean {
  return samePoint(left.start, reverse ? right.end : right.start, tolerance)
    && samePoint(left.end, reverse ? right.start : right.end, tolerance);
}

function hasUniformNonZeroOffset(left: readonly Point[], right: readonly Point[], offsetTolerance: number, variationTolerance: number): boolean {
  const offset = { x: right[0].x - left[0].x, y: right[0].y - left[0].y };
  if (Math.hypot(offset.x, offset.y) <= offsetTolerance) return false;
  return left.every((point, index) => Math.hypot(
    (right[index].x - point.x) - offset.x,
    (right[index].y - point.y) - offset.y,
  ) <= variationTolerance);
}

function lineRelation(
  left: LineEvidence,
  right: LineEvidence,
  endpointTolerance: number,
  interiorTolerance: number,
): 'duplicate' | 'near-parallel' | 'different' {
  if (left.lineKind !== right.lineKind) return 'different';
  const reverse = endpointMatch(left, right, true, interiorTolerance);
  if (!reverse && !endpointMatch(left, right, false, interiorTolerance)) return 'different';
  const sampleCount = Math.max(2, Math.min(128, Math.max(left.path.length, right.path.length)));
  const leftSamples = resamplePolyline(left.path, sampleCount);
  const rightSamples = resamplePolyline(reverse ? [...right.path].reverse() : right.path, sampleCount);
  if (!leftSamples.every((point, index) => samePoint(point, rightSamples[index], interiorTolerance))) return 'different';
  if (!endpointMatch(left, right, reverse, endpointTolerance)) return 'near-parallel';
  return hasUniformNonZeroOffset(leftSamples, rightSamples, endpointTolerance, LINE_TOLERANCE) ? 'near-parallel' : 'duplicate';
}

function sourcePages(symbols: readonly SymbolEvidence[]): Map<string, number[]> {
  const pages = new Map<string, Set<number>>();
  for (const symbol of symbols) {
    const sourceId = symbol.sourceId;
    if (!sourceId) continue;
    const set = pages.get(sourceId) ?? new Set<number>();
    set.add(symbol.bounds.page);
    pages.set(sourceId, set);
  }
  return new Map([...pages].map(([sourceId, values]) => [sourceId, [...values].sort((left, right) => left - right)]));
}

function deduplicateLines(
  lines: readonly LineEvidence[],
  pagesBySource: ReadonlyMap<string, number[]>,
  fallbackPages: readonly number[],
  conflicts: string[],
  endpointTolerance: number,
  interiorTolerance: number,
): LineRecord[] {
  const ordered = [...lines].sort((left, right) =>
    left.lineKind.localeCompare(right.lineKind)
    || left.start.y - right.start.y || left.start.x - right.start.x
    || left.end.y - right.end.y || left.end.x - right.end.x
    || left.id.localeCompare(right.id));
  const accepted: LineRecord[] = [];
  for (const candidate of ordered) {
    const candidatePages = candidate.sourceId
      ? pagesBySource.get(candidate.sourceId) ?? (fallbackPages.length === 1 ? [...fallbackPages] : [])
      : fallbackPages.length === 1 ? [...fallbackPages] : [];
    if (candidatePages.length !== 1) invalid('line page cannot be inferred safely from an ambiguous drawing frame.');
    const comparable = accepted.filter((record) =>
      record.pages.join(',') === candidatePages.join(','));
    const match = comparable.find((record) => lineRelation(record.item, candidate, endpointTolerance, interiorTolerance) === 'duplicate');
    if (match) {
      match.evidence.push(candidate);
      match.pages = [...new Set([...match.pages, ...candidatePages])].sort((left, right) => left - right);
    }
    else {
      for (const record of comparable) {
        if (lineRelation(record.item, candidate, endpointTolerance, interiorTolerance) === 'near-parallel') {
          conflicts.push(`AMBIGUOUS_NEAR_PARALLEL_LINE:${stableIds([...record.evidence.map((item) => item.id), candidate.id]).join('|')}`);
        }
      }
      accepted.push({ item: candidate, evidence: [candidate], pages: [...candidatePages] });
    }
  }
  return accepted.sort((left, right) =>
    (left.pages[0] ?? Number.MAX_SAFE_INTEGER) - (right.pages[0] ?? Number.MAX_SAFE_INTEGER)
    || left.item.lineKind.localeCompare(right.item.lineKind)
    || left.item.start.y - right.item.start.y || left.item.start.x - right.item.start.x
    || left.item.end.y - right.item.end.y || left.item.end.x - right.item.end.x
    || left.item.id.localeCompare(right.item.id));
}

function stableIds(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

function deduplicatePoints(
  values: Array<{ page: number; point: Point; originalEvidenceIds: string[] }>,
  prefix: string,
): SpatialJunction[] {
  const accepted: Array<{ page: number; point: Point; originalEvidenceIds: string[] }> = [];
  const buckets = new Map<string, number[]>();
  for (const value of values.sort((left, right) => left.page - right.page || left.point.y - right.point.y || left.point.x - right.point.x)) {
    const bucketX = Math.floor(value.point.x / POINT_DEDUPE_TOLERANCE);
    const bucketY = Math.floor(value.point.y / POINT_DEDUPE_TOLERANCE);
    let match: { page: number; point: Point; originalEvidenceIds: string[] } | undefined;
    for (let x = bucketX - 1; x <= bucketX + 1 && !match; x += 1) {
      for (let y = bucketY - 1; y <= bucketY + 1 && !match; y += 1) {
        for (const index of buckets.get(`${value.page}:${x}:${y}`) ?? []) {
          if (samePoint(accepted[index].point, value.point, POINT_DEDUPE_TOLERANCE)) {
            match = accepted[index];
            break;
          }
        }
      }
    }
    if (match) match.originalEvidenceIds.push(...value.originalEvidenceIds);
    else {
      const index = accepted.push({ page: value.page, point: { ...value.point }, originalEvidenceIds: [...value.originalEvidenceIds] }) - 1;
      const key = `${value.page}:${bucketX}:${bucketY}`;
      const entries = buckets.get(key) ?? [];
      entries.push(index);
      buckets.set(key, entries);
    }
  }
  return accepted.map((item, index) => ({
    id: `${prefix}-${String(index + 1).padStart(3, '0')}`,
    page: item.page,
    point: item.point,
    originalEvidenceIds: stableIds(item.originalEvidenceIds),
  }));
}

function endpointCandidates(line: SpatialLine, point: Point, symbols: readonly SpatialSymbol[], tolerance: number): SpatialSymbol[] {
  return symbols.filter((symbol) =>
    line.pages.includes(symbol.bounds.page)
    && Math.min(distance(center(symbol.bounds), point), ...symbol.ports.map((port) => distance(port, point))) <= tolerance)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function textCandidates(text: SpatialText, symbols: readonly SpatialSymbol[], tolerance: number): SpatialSymbol[] {
  const textCenter = center(text.bounds);
  return symbols.filter((symbol) =>
    symbol.bounds.page === text.bounds.page
    && distance(center(symbol.bounds), textCenter) <= tolerance)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function assembleSpatialGraph(
  envelopes: readonly RoleReviewEnvelope[],
  options: SpatialGraphOptions = {},
): SpatialEvidenceGraph {
  const { drawingHash, snapTolerance, dedupeIou, lineEndpointTolerance, lineInteriorTolerance } = validateInput(envelopes, options);
  const symbolEvidence = envelopes.flatMap((envelope) => envelope.data.symbols ?? []);
  const lineEvidence = envelopes.flatMap((envelope) => envelope.data.lines ?? []);
  const textEvidence = envelopes.flatMap((envelope) => envelope.data.texts ?? []);
  const conflicts: string[] = [];

  const symbolRecords = deduplicateSymbols(symbolEvidence, dedupeIou);
  const typeCounts = new Map<string, number>();
  const symbols: SpatialSymbol[] = symbolRecords.map((record) => {
    const typeCandidates = unionCandidates(record.evidence);
    const type = displayType({ ...record.item, typeCandidates });
    const count = (typeCounts.get(type) ?? 0) + 1;
    typeCounts.set(type, count);
    const originalEvidenceIds = stableIds(record.evidence.map((item) => item.id));
    if (normalizedCandidates(typeCandidates).length > 1) conflicts.push(`AMBIGUOUS_SYMBOL_TYPE:${originalEvidenceIds[0]}`);
    return {
      ...record.item,
      id: `${type}-${String(count).padStart(2, '0')}`,
      originalEvidenceId: originalEvidenceIds[0],
      originalEvidenceIds,
      sourceIds: stableIds(record.evidence.map((item) => item.sourceId ?? '')),
      typeCandidates: [...typeCandidates],
      ports: record.item.ports.map((point) => ({ ...point })),
      bounds: { ...record.item.bounds },
    };
  });

  const pagesBySource = sourcePages(symbolEvidence);
  const fallbackPages = [...new Set(symbolEvidence.map((item) => item.bounds.page))].sort((left, right) => left - right);
  const lineRecords = deduplicateLines(lineEvidence, pagesBySource, fallbackPages, conflicts, lineEndpointTolerance, lineInteriorTolerance);
  const lines: SpatialLine[] = lineRecords.map((record, index) => {
    const originalEvidenceIds = stableIds(record.evidence.map((item) => item.id));
    return {
      ...record.item,
      id: `LINE-${String(index + 1).padStart(3, '0')}`,
      originalEvidenceId: originalEvidenceIds[0],
      originalEvidenceIds,
      sourceIds: stableIds(record.evidence.map((item) => item.sourceId ?? '')),
      pages: [...record.pages],
      path: record.item.path.map((point) => ({ ...point })),
      start: { ...record.item.start },
      end: { ...record.item.end },
      junctions: record.item.junctions.map((point) => ({ ...point })),
      crossovers: record.item.crossovers.map((point) => ({ ...point })),
    };
  });

  const junctionPoints: Array<{ page: number; point: Point; originalEvidenceIds: string[] }> = [];
  const crossoverPoints: Array<{ page: number; point: Point; originalEvidenceIds: string[] }> = [];
  for (const record of lineRecords) {
    for (const line of record.evidence) {
      for (const page of record.pages) {
        for (const point of line.junctions) junctionPoints.push({ page, point, originalEvidenceIds: [line.id] });
        for (const point of line.crossovers) crossoverPoints.push({ page, point, originalEvidenceIds: [line.id] });
      }
    }
  }
  const junctions = deduplicatePoints(junctionPoints, 'J');
  const crossovers = deduplicatePoints(crossoverPoints, 'X');

  const textRecords = deduplicateTexts(textEvidence, dedupeIou);
  const texts: SpatialText[] = textRecords
    .map((record, index) => {
      const originalEvidenceIds = stableIds(record.evidence.map((item) => item.id));
      const candidates = [...new Set(record.evidence.flatMap((item) => item.candidates))];
      return {
        ...record.item,
        id: `TEXT-${String(index + 1).padStart(3, '0')}`,
        originalEvidenceId: originalEvidenceIds[0],
        originalEvidenceIds,
        sourceIds: stableIds(record.evidence.map((item) => item.sourceId ?? '')),
        candidates,
        bounds: { ...record.item.bounds },
      };
    });

  const edges: SpatialEdge[] = [];
  for (const line of lines) {
    const from = endpointCandidates(line, line.start, symbols, snapTolerance);
    const to = endpointCandidates(line, line.end, symbols, snapTolerance);
    if (from.length === 0 || to.length === 0) {
      conflicts.push(`UNBOUND_LINE_ENDPOINT:${line.id}`);
    } else if (from.length !== 1 || to.length !== 1) {
      conflicts.push(`AMBIGUOUS_LINE_ENDPOINT:${line.id}`);
    } else if (from[0].id === to[0].id) {
      conflicts.push(`SELF_LINE_ENDPOINT:${line.id}`);
    } else {
      edges.push({
        id: `EDGE-${String(edges.length + 1).padStart(3, '0')}`,
        from: from[0].id,
        to: to[0].id,
        lineId: line.id,
        confidence: Math.min(line.confidence, from[0].confidence, to[0].confidence),
      });
    }
  }

  const textLinks: SpatialTextLink[] = [];
  for (const text of texts) {
    const candidates = textCandidates(text, symbols, snapTolerance);
    if (candidates.length === 1) {
      textLinks.push({ id: `TEXT-LINK-${String(textLinks.length + 1).padStart(3, '0')}`, textId: text.id, symbolId: candidates[0].id, confidence: Math.min(text.confidence, candidates[0].confidence) });
    } else if (candidates.length > 1) {
      conflicts.push(`AMBIGUOUS_TEXT_LINK:${text.id}`);
    }
  }

  const total = symbols.length + lines.length + texts.length + junctions.length + crossovers.length + edges.length + textLinks.length + conflicts.length;
  if (total > MAX_OUTPUT_ITEMS) invalid(`output exceeds the ${MAX_OUTPUT_ITEMS} aggregate budget.`);
  return deepFreeze({
    drawingHash,
    symbols,
    lines,
    texts,
    junctions,
    crossovers,
    edges,
    textLinks,
    conflicts: stableIds(conflicts),
  });
}
