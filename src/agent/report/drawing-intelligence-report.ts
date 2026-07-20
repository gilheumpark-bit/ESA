import type { DrawingSynthesis } from '../electrical/synthesis';
import type { DrawingReviewArtifact } from '../teams/types';
import type { ReviewBounds } from '../vision/review-types';

type EvidenceCategory = 'symbol' | 'line' | 'text' | 'logic';

export interface DrawingRelation {
  id: string;
  from: string;
  line: string;
  to: string;
  text: string;
  evidenceIds: string[];
  page: number;
}

export interface DrawingQuantity {
  evidenceId: string;
  field: string;
  value: number | string;
  unit: string;
  page: number;
  bounds: ReviewBounds;
  sourceIds: string[];
  originalEvidenceIds: string[];
}

export interface DrawingIntelligenceReport {
  schemaVersion: 2;
  drawingHash: string;
  source: { assetKey: string; mimeType: string; width: number; height: number; page: number };
  symbols: Array<{ id: string; type: string; label: string | null; bounds: ReviewBounds; confidence: number; sourceIds: string[]; originalEvidenceIds: string[] }>;
  lines: Array<{ id: string; kind: string; path: Array<{ x: number; y: number }>; pages: number[]; confidence: number; sourceIds: string[]; originalEvidenceIds: string[] }>;
  relations: DrawingRelation[];
  quantities: DrawingQuantity[];
  issues: DrawingSynthesis['issues'];
  conflicts: DrawingSynthesis['conflicts'];
  calculations: DrawingSynthesis['calculations'];
  recommendations: DrawingSynthesis['recommendations'];
  holds: string[];
  traceability: number;
  verified95: boolean;
}

type CurrentRecord = { key: string; category: EvidenceCategory };
type Registry = { aliases: Map<string, Set<string>>; records: Map<string, CurrentRecord>; holds: Set<string> };

function sorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
}

function key(category: EvidenceCategory, id: string): string {
  return `${category}:${id}`;
}

function add(registry: Registry, category: EvidenceCategory, id: string, aliases: readonly string[]): void {
  const recordKey = key(category, id);
  registry.records.set(recordKey, { key: recordKey, category });
  for (const alias of aliases) {
    if (alias.length === 0) continue;
    const records = registry.aliases.get(alias) ?? new Set<string>();
    records.add(recordKey);
    registry.aliases.set(alias, records);
    if (records.size > 1) registry.holds.add('HOLD_AMBIGUOUS_PROVENANCE');
  }
}

function candidateKeys(registry: Registry, alias: string, allowed: readonly EvidenceCategory[]): Set<string> {
  return new Set([...registry.aliases.get(alias) ?? []].filter((recordKey) => allowed.includes(registry.records.get(recordKey)?.category as EvidenceCategory)));
}

/** All lineage aliases must intersect at one current record in an allowed category. */
function resolvesLineage(registry: Registry, ids: readonly string[], allowed: readonly EvidenceCategory[]): boolean {
  if (ids.length === 0) return false;
  let intersection: Set<string> | undefined;
  for (const id of ids) {
    const candidates = candidateKeys(registry, id, allowed);
    if (candidates.size === 0) return false;
    if (intersection === undefined) intersection = candidates;
    else intersection = new Set([...intersection].filter((recordKey) => candidates.has(recordKey)));
    if (intersection.size === 0) return false;
  }
  return intersection !== undefined && intersection.size === 1;
}

/** A claim/recommendation may cite an allowed set of distinct current records, but never an ambiguous alias. */
function resolvesRecordSet(registry: Registry, ids: readonly string[], allowed: readonly EvidenceCategory[]): boolean {
  return ids.length > 0 && ids.every((id) => candidateKeys(registry, id, allowed).size === 1);
}

function hasDirectRecord(registry: Registry, category: EvidenceCategory, id: string): boolean {
  return registry.records.has(key(category, id))
    && candidateKeys(registry, id, ['symbol', 'line', 'text', 'logic']).size === 1;
}

function buildRegistry(artifact: DrawingReviewArtifact, drawingHash: string): Registry | undefined {
  if (!artifact.graph || artifact.snapshot.drawingHash !== drawingHash || artifact.graph.drawingHash !== drawingHash) return undefined;
  const registry: Registry = { aliases: new Map(), records: new Map(), holds: new Set() };
  for (const item of artifact.graph.symbols) add(registry, 'symbol', item.id, [item.id, ...item.originalEvidenceIds, ...item.sourceIds]);
  for (const item of artifact.graph.lines) add(registry, 'line', item.id, [item.id, ...item.originalEvidenceIds, ...item.sourceIds]);
  for (const item of artifact.graph.texts) add(registry, 'text', item.id, [item.id, ...item.originalEvidenceIds, ...item.sourceIds]);
  for (const envelope of artifact.envelopes) {
    if (envelope.role !== 'logic' || envelope.drawingHash !== drawingHash) continue;
    for (const item of envelope.data.logic ?? []) add(registry, 'logic', item.id, [item.id, item.sourceId ?? '']);
  }
  return registry;
}

function currentIssue(registry: Registry, issue: DrawingSynthesis['issues'][number], drawingHash: string): boolean {
  return issue.evidence.drawingHash === drawingHash && resolvesLineage(registry, [
    ...issue.evidence.stableIds,
    ...issue.evidence.originalEvidenceIds,
    ...issue.evidence.sourceIds,
  ], ['symbol', 'line', 'text']);
}

function currentConflict(registry: Registry, conflict: DrawingSynthesis['conflicts'][number]): boolean {
  return resolvesLineage(registry, [
    ...conflict.graphEvidenceIds,
    ...conflict.graphOriginalEvidenceIds,
    ...conflict.graphSourceIds,
  ], ['symbol', 'line', 'text']) && resolvesLineage(registry, conflict.logicEvidenceIds, ['logic']);
}

function currentCalculation(registry: Registry, calculation: DrawingSynthesis['calculations'][number]): boolean {
  return calculation.status === 'CALCULATED' && calculation.inputEvidence.length > 0 && calculation.inputEvidence.every((evidence) => resolvesLineage(registry, [
    evidence.evidenceId,
    ...evidence.originalEvidenceIds,
    ...evidence.sourceIds,
  ], ['text']));
}

export function buildDrawingIntelligenceReport(input: {
  drawingReview: DrawingReviewArtifact;
  synthesis: DrawingSynthesis;
  verified95: boolean;
}): DrawingIntelligenceReport {
  const drawingHash = input.synthesis.drawingHash;
  const registry = buildRegistry(input.drawingReview, drawingHash);
  const holds = new Set<string>();
  if (!registry) holds.add('HOLD_DRAWING_HASH_MISMATCH');
  const active = registry ?? { aliases: new Map<string, Set<string>>(), records: new Map<string, CurrentRecord>(), holds: new Set<string>() };
  for (const hold of active.holds) holds.add(hold);
  const graph = registry && input.drawingReview.graph ? input.drawingReview.graph : undefined;
  const calculations = input.synthesis.calculations.filter((item) => currentCalculation(active, item));
  if (calculations.length !== input.synthesis.calculations.length) holds.add('HOLD_UNRESOLVED_CALCULATION');
  const issues = input.synthesis.issues.filter((item) => currentIssue(active, item, drawingHash));
  if (issues.length !== input.synthesis.issues.length) holds.add('HOLD_UNRESOLVED_ISSUE');
  const conflicts = input.synthesis.conflicts.filter((item) => currentConflict(active, item));
  if (conflicts.length !== input.synthesis.conflicts.length) holds.add('HOLD_UNRESOLVED_CONFLICT');
  const recommendations = input.synthesis.recommendations.filter((item) => item.status === 'SUPPORTED' && resolvesRecordSet(active, item.evidenceIds, ['symbol', 'line', 'text', 'logic']));
  if (recommendations.length !== input.synthesis.recommendations.filter((item) => item.status === 'SUPPORTED').length) holds.add('HOLD_UNRESOLVED_RECOMMENDATION');
  const eligibleClaims = input.synthesis.claims.filter((item) => item.status !== 'hold');
  const tracedClaims = eligibleClaims.filter((item) => resolvesRecordSet(active, item.evidenceIds, ['symbol', 'line', 'text', 'logic']));
  if (tracedClaims.length !== eligibleClaims.length) holds.add('HOLD_UNRESOLVED_CLAIM');
  if (issues.some((item) => item.judgment === 'HOLD' || item.judgment === 'BLOCK')) holds.add('HOLD_INVARIANT');
  if (conflicts.some((item) => item.status === 'hold' || item.kind === 'UNRESOLVED_LOGIC_REFERENCE')) holds.add('HOLD_LOGIC');
  if (input.synthesis.requiresHumanReview) holds.add('HOLD_HUMAN_REVIEW');
  for (const conflict of input.synthesis.graphConflicts) holds.add(`HOLD_GRAPH_CONFLICT:${conflict}`);

  const relations = graph ? graph.edges.flatMap((edge) => {
    const line = graph.lines.find((item) => item.id === edge.lineId);
    if (!line || !hasDirectRecord(active, 'symbol', edge.from) || !hasDirectRecord(active, 'line', edge.lineId) || !hasDirectRecord(active, 'symbol', edge.to)) {
      holds.add('HOLD_UNRESOLVED_RELATION');
      return [];
    }
    return [{ id: edge.id, from: edge.from, line: edge.lineId, to: edge.to, text: `${edge.from} → ${edge.lineId} → ${edge.to}`, evidenceIds: [edge.from, edge.lineId, edge.to], page: line.pages[0] }];
  }) : [];
  const quantities = calculations.flatMap((calculation) => calculation.inputEvidence.map((evidence) => ({
    evidenceId: evidence.evidenceId,
    field: evidence.normalizedField,
    value: evidence.value,
    unit: evidence.targetUnit,
    page: evidence.bounds.page,
    bounds: clone(evidence.bounds),
    sourceIds: sorted(evidence.sourceIds),
    originalEvidenceIds: sorted(evidence.originalEvidenceIds),
  })));
  const traceable = tracedClaims.length
    + recommendations.length
    + relations.length
    + issues.length
    + conflicts.length
    + calculations.length;
  const traceableTotal = eligibleClaims.length
    + input.synthesis.recommendations.filter((item) => item.status === 'SUPPORTED').length
    + (graph?.edges.length ?? 0)
    + input.synthesis.issues.length
    + input.synthesis.conflicts.length
    + input.synthesis.calculations.length;
  const traceability = traceableTotal === 0 ? 1 : traceable / traceableTotal;
  if (traceability < 1) holds.add('HOLD_UNRESOLVED_TRACEABILITY');
  const snapshot = input.drawingReview.snapshot;
  const report: DrawingIntelligenceReport = {
    schemaVersion: 2,
    drawingHash,
    source: { assetKey: snapshot.drawingHash, mimeType: snapshot.mimeType, width: snapshot.width, height: snapshot.height, page: snapshot.page },
    symbols: graph ? graph.symbols.map((item) => ({ id: item.id, type: item.typeCandidates[0] ?? 'unknown', label: item.rawLabel, bounds: clone(item.bounds), confidence: item.confidence, sourceIds: sorted(item.sourceIds), originalEvidenceIds: sorted(item.originalEvidenceIds) })) : [],
    lines: graph ? graph.lines.map((item) => ({ id: item.id, kind: item.lineKind, path: item.path.map(clone), pages: [...item.pages].sort((left, right) => left - right), confidence: item.confidence, sourceIds: sorted(item.sourceIds), originalEvidenceIds: sorted(item.originalEvidenceIds) })) : [],
    relations: relations.sort((left, right) => left.id.localeCompare(right.id)),
    quantities: quantities.sort((left, right) => left.evidenceId.localeCompare(right.evidenceId) || left.field.localeCompare(right.field)),
    issues: clone(issues).sort((left, right) => left.id.localeCompare(right.id)),
    conflicts: clone(conflicts).sort((left, right) => left.id.localeCompare(right.id)),
    calculations: clone(calculations).sort((left, right) => left.id.localeCompare(right.id)),
    recommendations: clone(recommendations).sort((left, right) => left.id.localeCompare(right.id)),
    holds: [...holds].sort((left, right) => left.localeCompare(right)),
    traceability,
    verified95: input.verified95 && holds.size === 0,
  };
  return freeze(report);
}
