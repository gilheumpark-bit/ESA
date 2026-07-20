import { createHash } from 'node:crypto';

import type { NormalizedElectricalGraph, NormalizedSpec } from './domain-normalizer';
import type { SpatialEvidenceGraph, SpatialSymbol } from '../vision/spatial-graph';
import type { LogicEvidence, ReviewBounds, RoleReviewEnvelope } from '../vision/review-types';
import { resolveSymbol } from '../vision/symbol-db';

export type LogicConflictKind = 'UNRESOLVED_LOGIC_REFERENCE' | 'CONTRADICTION';
export type LogicConflictTopic = LogicEvidence['topic'];

export interface LogicConflict {
  id: string;
  kind: LogicConflictKind;
  topic: LogicConflictTopic;
  severity: 'critical' | 'major';
  status: 'open' | 'hold';
  action: 'TARGETED_REVIEW';
  reasonCode: string;
  message: string;
  graphEvidenceIds: string[];
  graphOriginalEvidenceIds: string[];
  graphSourceIds: string[];
  graphEvidencePages: number[];
  graphEvidenceBounds: ReviewBounds[];
  logicEvidenceIds: string[];
  logicEvidenceBounds: ReviewBounds[];
  graphConflictIds: string[];
}

interface Resolution {
  kind: 'resolved' | 'unresolved';
  reference: string;
  stableId?: string;
  candidates: SpatialSymbol[];
  reasonCode: string;
}

const TOPICS: LogicConflictTopic[] = [
  'DIRECTION',
  'PROTECTION_CHAIN',
  'VOLTAGE_DOMAIN',
  'DEVICE_IDENTITY',
  'MISSING_RELATION',
];
const MAX_LOGIC_ITEMS = 10_000;
const MAX_GRAPH_SYMBOLS = 2_000;
const MAX_GRAPH_EDGES = 10_000;
const MAX_TEXT = 4_000;
const PROXIMITY = 24;

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

function sorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en'));
}

function sortedBounds(values: readonly ReviewBounds[]): ReviewBounds[] {
  return values.map((item) => ({ ...item })).sort((left, right) => left.page - right.page
    || left.y - right.y || left.x - right.x || left.h - right.h || left.w - right.w);
}

function isBoundedString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT;
}

function isBounds(value: unknown): value is ReviewBounds {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join('|') !== 'h|page|w|x|y') return false;
  return ['x', 'y', 'w', 'h'].every((key) => typeof item[key] === 'number' && Number.isFinite(item[key]))
    && typeof item.page === 'number' && Number.isSafeInteger(item.page) && item.page >= 1
    && (item.w as number) > 0 && (item.h as number) > 0;
}

function validLogicItem(value: unknown): value is LogicEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<LogicEvidence>;
  const allowedItemKeys = ['attributes', 'confidence', 'evidenceBounds', 'id', 'sourceId', 'statement', 'subjectIds', 'topic'];
  if (Object.keys(item).some((key) => !allowedItemKeys.includes(key))) return false;
  if (!isBoundedString(item.id) || (item.sourceId !== undefined && !isBoundedString(item.sourceId))) return false;
  if (!TOPICS.includes(item.topic as LogicConflictTopic)) return false;
  if (!Array.isArray(item.subjectIds) || item.subjectIds.length === 0 || !item.subjectIds.every(isBoundedString)) return false;
  if (!isBoundedString(item.statement)) return false;
  if (!Array.isArray(item.evidenceBounds) || item.evidenceBounds.length === 0 || !item.evidenceBounds.every(isBounds)) return false;
  if (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) return false;
  if (item.attributes !== undefined) {
    if (!item.attributes || typeof item.attributes !== 'object' || Array.isArray(item.attributes)) return false;
    const attributes = item.attributes;
    const allowedAttributeKeys = ['deviceType', 'fromId', 'protectedById', 'toId', 'voltageV'];
    if (Object.keys(attributes).some((key) => !allowedAttributeKeys.includes(key))) return false;
    if (attributes.fromId !== undefined && !isBoundedString(attributes.fromId)) return false;
    if (attributes.toId !== undefined && !isBoundedString(attributes.toId)) return false;
    if (attributes.protectedById !== undefined && attributes.protectedById !== null && !isBoundedString(attributes.protectedById)) return false;
    if (attributes.deviceType !== undefined && !isBoundedString(attributes.deviceType)) return false;
    if (attributes.voltageV !== undefined && (typeof attributes.voltageV !== 'number' || !Number.isFinite(attributes.voltageV) || attributes.voltageV <= 0)) return false;
  }
  return true;
}

function validateEnvelope(normalized: NormalizedElectricalGraph, envelope: RoleReviewEnvelope): LogicEvidence[] | null {
  if (envelope.role !== 'logic') return null;
  if (envelope.drawingHash !== normalized.drawingHash || envelope.drawingHash !== normalized.graph.drawingHash) return null;
  if (!/^[a-f0-9]{64}$/.test(envelope.outputHash)) return null;
  if (!isBoundedString(envelope.model) || !isBoundedString(envelope.promptVersion)) return null;
  if (!['openai', 'gemini', 'claude'].includes(envelope.provider)) return null;
  if (!Number.isFinite(envelope.durationMs) || envelope.durationMs < 0) return null;
  const seal = {
    role: envelope.role,
    drawingHash: envelope.drawingHash,
    provider: envelope.provider,
    model: envelope.model,
    promptVersion: envelope.promptVersion,
    durationMs: envelope.durationMs,
    data: envelope.data,
  };
  if (createHash('sha256').update(canonicalize(seal)).digest('hex') !== envelope.outputHash) return null;
  const data = envelope.data;
  if (!data || typeof data !== 'object' || data.symbols !== undefined || data.lines !== undefined || data.texts !== undefined) return null;
  if (Object.keys(data).sort().join('|') !== 'confidence|logic|warnings') return null;
  if (!Array.isArray(data.warnings) || !data.warnings.every((item) => typeof item === 'string' && item.length <= MAX_TEXT)) return null;
  if (typeof data.confidence !== 'number' || !Number.isFinite(data.confidence) || data.confidence < 0 || data.confidence > 1) return null;
  if (!Array.isArray(data.logic) || data.logic.length > MAX_LOGIC_ITEMS || !data.logic.every(validLogicItem)) return null;
  const ids = new Set<string>();
  if (data.logic.some((item) => ids.has(item.id) || !ids.add(item.id))) return null;
  return data.logic;
}

function validateGraph(input: NormalizedElectricalGraph): boolean {
  const graph = input.graph;
  if (
    input.drawingHash !== graph.drawingHash
    || !Array.isArray(graph.symbols)
    || !Array.isArray(graph.lines)
    || !Array.isArray(graph.edges)
    || !Array.isArray(graph.conflicts)
    || graph.symbols.length > MAX_GRAPH_SYMBOLS
    || graph.lines.length > MAX_GRAPH_EDGES
    || graph.edges.length > MAX_GRAPH_EDGES
  ) return false;
  const ids = new Set<string>();
  for (const symbol of graph.symbols) {
    if (!isBoundedString(symbol.id) || ids.has(symbol.id) || !isBounds(symbol.bounds)) return false;
    if (!Array.isArray(symbol.originalEvidenceIds) || symbol.originalEvidenceIds.length === 0 || !symbol.originalEvidenceIds.every(isBoundedString)) return false;
    if (!Array.isArray(symbol.sourceIds) || symbol.sourceIds.length === 0 || !symbol.sourceIds.every(isBoundedString)) return false;
    ids.add(symbol.id);
  }
  const lineIds = new Set<string>();
  for (const line of graph.lines) {
    if (!isBoundedString(line.id) || lineIds.has(line.id)) return false;
    if (!Array.isArray(line.originalEvidenceIds) || line.originalEvidenceIds.length === 0 || !line.originalEvidenceIds.every(isBoundedString)) return false;
    if (!Array.isArray(line.sourceIds) || line.sourceIds.length === 0 || !line.sourceIds.every(isBoundedString)) return false;
    if (!Array.isArray(line.pages) || line.pages.length === 0 || !line.pages.every((page) => Number.isSafeInteger(page) && page >= 1)) return false;
    lineIds.add(line.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (!isBoundedString(edge.id) || edgeIds.has(edge.id) || !ids.has(edge.from) || !ids.has(edge.to) || !lineIds.has(edge.lineId)) return false;
    edgeIds.add(edge.id);
  }
  return graph.conflicts.every((conflict) => isBoundedString(conflict));
}

function center(bounds: ReviewBounds): { x: number; y: number } {
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
}

function spatiallyRelated(left: ReviewBounds, right: ReviewBounds): boolean {
  if (left.page !== right.page) return false;
  const overlap = left.x <= right.x + right.w && left.x + left.w >= right.x
    && left.y <= right.y + right.h && left.y + left.h >= right.y;
  if (overlap) return true;
  const a = center(left);
  const b = center(right);
  return Math.hypot(a.x - b.x, a.y - b.y) <= PROXIMITY;
}

function evidenceForReference(item: LogicEvidence, reference: string): ReviewBounds[] {
  const from = item.attributes?.fromId;
  const to = item.attributes?.toId;
  if (reference === from) return [item.evidenceBounds[0]];
  if (reference === to) return [item.evidenceBounds[Math.min(1, item.evidenceBounds.length - 1)]];
  if (reference === item.attributes?.protectedById) return [item.evidenceBounds[Math.min(1, item.evidenceBounds.length - 1)]];
  const index = item.subjectIds.indexOf(reference);
  if (index >= 0 && index < item.evidenceBounds.length) return [item.evidenceBounds[index]];
  return item.evidenceBounds;
}

function aliases(symbol: SpatialSymbol): string[] {
  return [symbol.id, symbol.originalEvidenceId, ...symbol.originalEvidenceIds, ...symbol.sourceIds];
}

function resolveReference(graph: SpatialEvidenceGraph, item: LogicEvidence, reference: string): Resolution {
  if (graph.conflicts.length > 0) return { kind: 'unresolved', reference, candidates: [], reasonCode: 'GRAPH_CONFLICT' };
  const evidence = evidenceForReference(item, reference);
  let candidates = graph.symbols.filter((symbol) => evidence.some((itemBounds) => spatiallyRelated(itemBounds, symbol.bounds)));
  const identifierMatches = graph.symbols.filter((symbol) => aliases(symbol).includes(reference));
  if (identifierMatches.length > 0) {
    if (identifierMatches.some((symbol) => !candidates.some((candidate) => candidate.id === symbol.id))) {
      return { kind: 'unresolved', reference, candidates, reasonCode: 'IDENTIFIER_GEOMETRY_MISMATCH' };
    }
    const matchIds = new Set(identifierMatches.map((symbol) => symbol.id));
    candidates = candidates.filter((symbol) => matchIds.has(symbol.id));
  }
  candidates = [...candidates].sort((left, right) => left.id.localeCompare(right.id, 'en'));
  if (candidates.length !== 1) {
    return { kind: 'unresolved', reference, candidates, reasonCode: candidates.length === 0 ? 'NO_SPATIAL_CANDIDATE' : 'AMBIGUOUS_SPATIAL_CANDIDATE' };
  }
  return { kind: 'resolved', reference, stableId: candidates[0].id, candidates, reasonCode: 'RESOLVED' };
}

function severity(topic: LogicConflictTopic): 'critical' | 'major' {
  return topic === 'DIRECTION' || topic === 'PROTECTION_CHAIN' ? 'critical' : 'major';
}

function makeConflict(
  graph: SpatialEvidenceGraph,
  item: LogicEvidence,
  kind: LogicConflictKind,
  reasonCode: string,
  resolutions: readonly Resolution[],
  extras: { stableIds?: string[]; originals?: string[]; sources?: string[]; pages?: number[]; graphBounds?: ReviewBounds[]; bounds?: ReviewBounds[] } = {},
): LogicConflict {
  const symbols = resolutions.flatMap((resolution) => resolution.candidates);
  const referenceKey = sorted(resolutions.map((resolution) => resolution.reference)).join('+') || 'integrity';
  return {
    id: `conflict:${kind.toLowerCase()}:${item.topic}:${item.id}:${referenceKey}`,
    kind,
    topic: item.topic,
    severity: severity(item.topic),
    status: kind === 'CONTRADICTION' ? 'open' : 'hold',
    action: 'TARGETED_REVIEW',
    reasonCode,
    message: kind === 'CONTRADICTION' ? '독립 논리 판독과 현재 도면 근거가 일치하지 않습니다.' : '독립 논리 판독의 도면 참조를 유일하게 확인할 수 없습니다.',
    graphEvidenceIds: sorted([...symbols.map((symbol) => symbol.id), ...(extras.stableIds ?? [])]),
    graphOriginalEvidenceIds: sorted([...symbols.flatMap((symbol) => symbol.originalEvidenceIds), ...(extras.originals ?? [])]),
    graphSourceIds: sorted([...symbols.flatMap((symbol) => symbol.sourceIds), ...(extras.sources ?? [])]),
    graphEvidencePages: [...new Set([...symbols.map((symbol) => symbol.bounds.page), ...(extras.pages ?? [])])].sort((left, right) => left - right),
    graphEvidenceBounds: sortedBounds([...symbols.map((symbol) => symbol.bounds), ...(extras.graphBounds ?? [])]),
    logicEvidenceIds: sorted([item.id, ...(item.sourceId ? [item.sourceId] : [])]),
    logicEvidenceBounds: sortedBounds([...(item.evidenceBounds ?? []), ...(extras.bounds ?? [])]),
    graphConflictIds: sorted(graph.conflicts),
  };
}

function lineEvidenceExtras(graph: SpatialEvidenceGraph, stableIds: readonly string[]) {
  const wanted = new Set(stableIds);
  const lines = graph.lines.filter((line) => wanted.has(line.id) || line.originalEvidenceIds.some((id) => wanted.has(id)));
  const graphBounds = lines.flatMap((line) => {
    const points = [...line.path, line.start, line.end];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const w = Math.max(1e-6, Math.max(...xs) - x);
    const h = Math.max(1e-6, Math.max(...ys) - y);
    return line.pages.map((page) => ({ x, y, w, h, page }));
  });
  return {
    stableIds: lines.map((line) => line.id),
    originals: lines.flatMap((line) => line.originalEvidenceIds),
    sources: lines.flatMap((line) => line.sourceIds),
    pages: lines.flatMap((line) => line.pages),
    graphBounds,
  };
}

function relationExtras(graph: SpatialEvidenceGraph, edgeIds: readonly string[]) {
  const edges = graph.edges.filter((edge) => edgeIds.includes(edge.id));
  const lineExtras = lineEvidenceExtras(graph, edges.map((edge) => edge.lineId));
  return {
    stableIds: [...edges.flatMap((edge) => [edge.id, edge.lineId]), ...lineExtras.stableIds],
    originals: lineExtras.originals,
    sources: lineExtras.sources,
    pages: lineExtras.pages,
    graphBounds: lineExtras.graphBounds,
  };
}

function graphConflictExtras(graph: SpatialEvidenceGraph) {
  const matchedLines = graph.lines.filter((line) => graph.conflicts.some((conflict) =>
    conflict.includes(line.id) || line.originalEvidenceIds.some((id) => conflict.includes(id))));
  const matchedSymbols = graph.symbols.filter((symbol) => graph.conflicts.some((conflict) =>
    conflict.includes(symbol.id) || symbol.originalEvidenceIds.some((id) => conflict.includes(id))));
  return {
    stableIds: [...matchedLines.map((line) => line.id), ...matchedSymbols.map((symbol) => symbol.id)],
    originals: [...matchedLines.flatMap((line) => line.originalEvidenceIds), ...matchedSymbols.flatMap((symbol) => symbol.originalEvidenceIds)],
    sources: [...matchedLines.flatMap((line) => line.sourceIds), ...matchedSymbols.flatMap((symbol) => symbol.sourceIds)],
    pages: [...matchedLines.flatMap((line) => line.pages), ...matchedSymbols.map((symbol) => symbol.bounds.page)],
    graphBounds: [...lineEvidenceExtras(graph, matchedLines.map((line) => line.id)).graphBounds, ...matchedSymbols.map((symbol) => symbol.bounds)],
  };
}

function integrityConflict(graph: SpatialEvidenceGraph): LogicConflict {
  const item: LogicEvidence = {
    id: 'envelope', topic: 'MISSING_RELATION', subjectIds: ['integrity'], statement: 'integrity', evidenceBounds: [{ x: 0, y: 0, w: 1, h: 1, page: 1 }], confidence: 0,
  };
  return makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', 'ENVELOPE_OR_GRAPH_INTEGRITY', [], {});
}

function firstUnresolved(resolutions: readonly Resolution[]): Resolution | undefined {
  return resolutions.find((resolution) => resolution.kind === 'unresolved');
}

function compareDirection(graph: SpatialEvidenceGraph, item: LogicEvidence): LogicConflict[] {
  const fromRef = item.attributes?.fromId;
  const toRef = item.attributes?.toId;
  if (!fromRef || !toRef) return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', 'DIRECTION_REFERENCES_MISSING', [], {})];
  const resolutions = [resolveReference(graph, item, fromRef), resolveReference(graph, item, toRef)];
  const unresolved = firstUnresolved(resolutions);
  if (unresolved) return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', unresolved.reasonCode, resolutions)];
  const [from, to] = resolutions.map((resolution) => resolution.stableId as string);
  const forward = graph.edges.filter((edge) => edge.from === from && edge.to === to);
  const reverse = graph.edges.filter((edge) => edge.from === to && edge.to === from);
  if (forward.length === 1 && reverse.length === 0) return [];
  if (reverse.length === 1 && forward.length === 0) {
    // Spatial edges inherit polyline endpoint order, not source-to-load order.
    // A reverse match therefore proves connectivity only and must not fail an
    // otherwise valid drawing until a directional edge contract exists.
    return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', 'REVERSED_DIRECTION', resolutions, relationExtras(graph, reverse.map((edge) => edge.id)))];
  }
  return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', forward.length + reverse.length === 0 ? 'MISSING_RELATION' : 'AMBIGUOUS_DIRECTION', resolutions)];
}

function isProtection(symbol: SpatialSymbol): boolean {
  const types = sorted(symbol.typeCandidates.map((candidate) => resolveSymbol(candidate)));
  return types.length > 0 && types.every((type) => ['breaker_acb', 'breaker_vcb', 'breaker_mccb', 'breaker_elcb', 'breaker_mcb', 'fuse', 'afci'].includes(type));
}

function adjacent(graph: SpatialEvidenceGraph, left: string, right: string): boolean {
  return graph.edges.some((edge) => (edge.from === left && edge.to === right) || (edge.from === right && edge.to === left));
}

function connected(graph: SpatialEvidenceGraph, left: string, right: string): boolean {
  const visited = new Set([left]);
  const queue = [left];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === right) return true;
    for (const edge of graph.edges) {
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : undefined;
      if (next && !visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

function compareProtection(graph: SpatialEvidenceGraph, item: LogicEvidence): LogicConflict[] {
  const subjectRef = item.subjectIds[0];
  const protectorRef = item.attributes?.protectedById;
  if (!subjectRef || !protectorRef) return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', 'PROTECTION_REFERENCES_MISSING', [], {})];
  const resolutions = [resolveReference(graph, item, subjectRef), resolveReference(graph, item, protectorRef)];
  const unresolved = firstUnresolved(resolutions);
  if (unresolved) return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', unresolved.reasonCode, resolutions)];
  const subject = resolutions[0].stableId as string;
  const protector = resolutions[1].stableId as string;
  const assertedProtector = graph.symbols.find((symbol) => symbol.id === protector);
  if (assertedProtector && isProtection(assertedProtector) && adjacent(graph, subject, protector)) return [];
  if (assertedProtector && isProtection(assertedProtector) && connected(graph, subject, protector)) {
    return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', 'PROTECTOR_PATH_DIRECTION_UNVERIFIED', resolutions)];
  }
  const known = graph.symbols.filter((symbol) => isProtection(symbol) && adjacent(graph, subject, symbol.id));
  if (known.length === 1 && (!assertedProtector || !isProtection(assertedProtector))) {
    return [makeConflict(graph, item, 'CONTRADICTION', 'PROTECTOR_MISMATCH', resolutions.concat({ kind: 'resolved', reference: known[0].id, stableId: known[0].id, candidates: [known[0]], reasonCode: 'RESOLVED' }))];
  }
  if (known.length === 1) {
    return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', 'PROTECTOR_PATH_UNRESOLVED', resolutions.concat({ kind: 'resolved', reference: known[0].id, stableId: known[0].id, candidates: [known[0]], reasonCode: 'RESOLVED' }))];
  }
  return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', known.length > 1 ? 'AMBIGUOUS_PROTECTION_PATH' : 'MISSING_PROTECTION_PATH', resolutions)];
}

function validVoltageSpec(spec: NormalizedSpec, owner: SpatialSymbol, drawingHash: string): boolean {
  return spec.drawingHash === drawingHash && spec.field === 'voltage_V' && spec.unit === 'V'
    && spec.ownerId === owner.id && typeof spec.value === 'number' && Number.isFinite(spec.value) && spec.value > 0
    && spec.bounds.page === owner.bounds.page && spec.originalEvidenceIds.length > 0 && spec.sourceIds.length > 0;
}

function compareVoltage(normalized: NormalizedElectricalGraph, item: LogicEvidence): LogicConflict[] {
  const graph = normalized.graph;
  const subjectRef = item.subjectIds[0];
  const asserted = item.attributes?.voltageV;
  if (!subjectRef || typeof asserted !== 'number' || !Number.isFinite(asserted) || asserted <= 0) {
    return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', 'VOLTAGE_REFERENCE_OR_VALUE_MISSING', [], {})];
  }
  const resolution = resolveReference(graph, item, subjectRef);
  if (resolution.kind === 'unresolved') return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', resolution.reasonCode, [resolution])];
  const owner = resolution.candidates[0];
  const specs = normalized.specs.filter((spec) => validVoltageSpec(spec, owner, normalized.drawingHash));
  const values = [...new Set(specs.map((spec) => spec.value as number))];
  if (values.length !== 1) return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', values.length === 0 ? 'VOLTAGE_EVIDENCE_MISSING' : 'AMBIGUOUS_VOLTAGE_EVIDENCE', [resolution])];
  if (values[0] === asserted) return [];
  return [makeConflict(graph, item, 'CONTRADICTION', 'VOLTAGE_MISMATCH', [resolution], {
    stableIds: specs.map((spec) => spec.evidenceId), originals: specs.flatMap((spec) => spec.originalEvidenceIds), sources: specs.flatMap((spec) => spec.sourceIds),
    pages: specs.map((spec) => spec.bounds.page), graphBounds: specs.map((spec) => ({ ...spec.bounds })),
  })];
}

function compareIdentity(graph: SpatialEvidenceGraph, item: LogicEvidence): LogicConflict[] {
  const subjectRef = item.subjectIds[0];
  const asserted = item.attributes?.deviceType;
  if (!subjectRef || !asserted) return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', 'IDENTITY_REFERENCE_OR_TYPE_MISSING', [], {})];
  const resolution = resolveReference(graph, item, subjectRef);
  if (resolution.kind === 'unresolved') return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', resolution.reasonCode, [resolution])];
  const candidates = sorted(resolution.candidates[0].typeCandidates.map((candidate) => resolveSymbol(candidate)));
  if (candidates.length !== 1) return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', 'AMBIGUOUS_DEVICE_IDENTITY', [resolution])];
  if (candidates[0] === resolveSymbol(asserted)) return [];
  return [makeConflict(graph, item, 'CONTRADICTION', 'DEVICE_IDENTITY_MISMATCH', [resolution])];
}

function compareMissingRelation(graph: SpatialEvidenceGraph, item: LogicEvidence): LogicConflict[] {
  const refs = item.subjectIds.slice(0, 2);
  if (refs.length !== 2) return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', 'RELATION_REFERENCES_MISSING', [], {})];
  const resolutions = refs.map((reference) => resolveReference(graph, item, reference));
  const unresolved = firstUnresolved(resolutions);
  if (unresolved) return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', unresolved.reasonCode, resolutions)];
  const left = resolutions[0].stableId as string;
  const right = resolutions[1].stableId as string;
  const relations = graph.edges.filter((edge) => (edge.from === left && edge.to === right) || (edge.from === right && edge.to === left));
  if (relations.length === 1) return [makeConflict(graph, item, 'CONTRADICTION', 'RELATION_EXISTS', resolutions, relationExtras(graph, relations.map((edge) => edge.id)))];
  return [makeConflict(graph, item, 'UNRESOLVED_LOGIC_REFERENCE', relations.length === 0 ? 'ABSENCE_NOT_PROVEN' : 'AMBIGUOUS_RELATION', resolutions)];
}

function compareItem(normalized: NormalizedElectricalGraph, item: LogicEvidence): LogicConflict[] {
  if (normalized.graph.conflicts.length > 0) return [makeConflict(normalized.graph, item, 'UNRESOLVED_LOGIC_REFERENCE', 'GRAPH_CONFLICT', [], graphConflictExtras(normalized.graph))];
  if (item.topic === 'DIRECTION') return compareDirection(normalized.graph, item);
  if (item.topic === 'PROTECTION_CHAIN') return compareProtection(normalized.graph, item);
  if (item.topic === 'VOLTAGE_DOMAIN') return compareVoltage(normalized, item);
  if (item.topic === 'DEVICE_IDENTITY') return compareIdentity(normalized.graph, item);
  return compareMissingRelation(normalized.graph, item);
}

export function compareLogicToGraph(
  normalized: NormalizedElectricalGraph,
  logicEnvelope: RoleReviewEnvelope,
): LogicConflict[] {
  if (!validateGraph(normalized)) return [integrityConflict(normalized.graph)];
  const items = validateEnvelope(normalized, logicEnvelope);
  if (!items) return [integrityConflict(normalized.graph)];
  return items
    .flatMap((item) => compareItem(normalized, item))
    .sort((left, right) => left.topic.localeCompare(right.topic, 'en')
      || left.logicEvidenceIds[0].localeCompare(right.logicEvidenceIds[0], 'en')
      || left.id.localeCompare(right.id, 'en'));
}
