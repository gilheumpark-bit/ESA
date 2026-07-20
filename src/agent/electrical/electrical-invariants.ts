import type { NormalizedElectricalGraph, NormalizedSpec } from './domain-normalizer';
import type { ReviewBounds } from '../vision/review-types';
import type { SpatialEdge, SpatialEvidenceGraph, SpatialLine, SpatialSymbol, SpatialText } from '../vision/spatial-graph';
import { resolveSymbol } from '../vision/symbol-db';

export type ElectricalIssueCode =
  | 'GRAPH_CONFLICT'
  | 'DANGLING_EDGE'
  | 'ISOLATED_DEVICE'
  | 'DIRECTION_AMBIGUOUS'
  | 'SOURCE_OR_LOAD_UNRESOLVED'
  | 'NO_SOURCE_LOAD_PATH'
  | 'MULTIPLE_SOURCE_LOAD_PATHS'
  | 'NO_UPSTREAM_PROTECTION'
  | 'EXPLICIT_UNPROTECTED_PATH'
  | 'VOLTAGE_DOMAIN_UNRESOLVED'
  | 'VOLTAGE_DOMAIN_CONFLICT'
  | 'GROUND_PATH_UNKNOWN'
  | 'VALIDATION_BUDGET_EXCEEDED'
  | 'INPUT_REQUIRED';

export type ElectricalIssueJudgment = 'FAIL' | 'HOLD' | 'BLOCK';

export interface ElectricalIssueEvidence {
  drawingHash: string;
  stableIds: string[];
  originalEvidenceIds: string[];
  sourceIds: string[];
  pages: number[];
  bounds: ReviewBounds[];
}

export interface ElectricalIssue {
  id: string;
  code: ElectricalIssueCode;
  judgment: ElectricalIssueJudgment;
  severity: 'critical' | 'major' | 'minor';
  message: string;
  evidence: ElectricalIssueEvidence;
  requiredInputs: string[];
}

const MAX_SYMBOLS = 2_000;
const MAX_EDGES = 10_000;
const MAX_SPECS = 10_000;
const MAX_TRAVERSAL_STEPS = 100_000;
const MAX_ISSUES = 10_000;

const SOURCE_TYPES = new Set(['generator', 'ups', 'solar_panel', 'battery']);
const SOURCE_LABELS = new Set(['UTILITY', 'GRID', 'INCOMER', 'SOURCE', '수전', '전원']);
const SOURCE_BUS_LABELS = new Set(['SOURCE BUS', 'UTILITY BUS', 'INCOMER BUS', '수전 모선', '전원 모선']);
const PROTECTION_TYPES = new Set(['breaker_acb', 'breaker_vcb', 'breaker_mccb', 'breaker_elcb', 'breaker_mcb', 'fuse', 'afci']);
const PROTECTION_LABELS = new Set(['ACB', 'VCB', 'MCCB', 'ELCB', 'ELB', 'RCD', 'GFCI', 'MCB', 'CB', 'FUSE', 'PF', 'POWER FUSE', 'RELAY', 'AFCI']);
const LOAD_TYPES = new Set(['load_general', 'motor', 'light', 'outlet', 'hvac', 'ev_charger']);
const LOAD_LABELS = new Set(['LOAD', 'MOTOR', 'LIGHT', 'LAMP', 'OUTLET', 'RECEPTACLE', 'HVAC', 'AHU', 'EV', 'CHARGER', 'EVSE', '부하', '전동기', '조명', '콘센트']);
const GROUND_TYPES = new Set(['ground_rod']);
const GROUND_LABELS = new Set(['GND', 'GROUND', 'EARTH', '접지', '접지봉']);
const BLOCKING_GRAPH_CONFLICTS = new Set(['UNBOUND_LINE_ENDPOINT', 'SELF_LINE_ENDPOINT']);
const HOLDING_GRAPH_CONFLICTS = new Set(['AMBIGUOUS_LINE_ENDPOINT', 'AMBIGUOUS_NEAR_PARALLEL_LINE', 'AMBIGUOUS_SYMBOL_TYPE', 'AMBIGUOUS_TEXT_LINK']);
const EXPLICIT_UNPROTECTED = new Set(['UNPROTECTED', 'NO PROTECTION', 'WITHOUT PROTECTION', '무보호', '보호 없음']);

type Role = 'source' | 'protection' | 'load' | 'ground';
type Neighbor = { nodeId: string; edgeId: string };
type Component = { nodeIds: string[]; edgeIds: string[]; hasCycle: boolean };

interface Context {
  input: NormalizedElectricalGraph;
  graph: SpatialEvidenceGraph;
  symbols: Map<string, SpatialSymbol>;
  lines: Map<string, SpatialLine>;
  texts: Map<string, SpatialText>;
  edges: Map<string, SpatialEdge>;
  adjacency: Map<string, Neighbor[]>;
  steps: number;
}

class TraversalBudgetExceeded extends Error {}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareText);
}

function sortedNumbers(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function cloneBounds(bounds: ReviewBounds): ReviewBounds {
  return { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, page: bounds.page };
}

function roleForType(value: string): Role | undefined {
  if (SOURCE_TYPES.has(value)) return 'source';
  if (PROTECTION_TYPES.has(value)) return 'protection';
  if (LOAD_TYPES.has(value)) return 'load';
  if (GROUND_TYPES.has(value)) return 'ground';
  return undefined;
}

function roleForLabel(label: string, canonicalTypes: readonly string[]): Role | undefined {
  if (SOURCE_LABELS.has(label)) return 'source';
  if (canonicalTypes.includes('bus') && SOURCE_BUS_LABELS.has(label)) return 'source';
  if (PROTECTION_LABELS.has(label)) return 'protection';
  if (LOAD_LABELS.has(label)) return 'load';
  if (GROUND_LABELS.has(label)) return 'ground';
  return undefined;
}

function classifyRole(symbol: SpatialSymbol): Role | undefined {
  const candidates = sortedUnique(symbol.typeCandidates.map((candidate) => resolveSymbol(candidate.trim())));
  const candidateRoles = candidates.map(roleForType);
  const recognized = candidateRoles.filter((role): role is Role => role !== undefined);
  if (recognized.length > 0) {
    if (recognized.length !== candidates.length || new Set(recognized).size !== 1) return undefined;
    return recognized[0];
  }
  const label = (symbol.rawLabel ?? '').trim().toUpperCase();
  return label ? roleForLabel(label, candidates) : undefined;
}

function addEvidenceFromSymbol(symbol: SpatialSymbol, originalEvidenceIds: string[], sourceIds: string[], pages: number[], bounds: ReviewBounds[]): void {
  originalEvidenceIds.push(...symbol.originalEvidenceIds);
  sourceIds.push(...symbol.sourceIds);
  pages.push(symbol.bounds.page);
  bounds.push(cloneBounds(symbol.bounds));
}

function addEvidenceFromLine(line: SpatialLine, originalEvidenceIds: string[], sourceIds: string[], pages: number[]): void {
  originalEvidenceIds.push(...line.originalEvidenceIds);
  sourceIds.push(...line.sourceIds);
  pages.push(...line.pages);
}

function addEvidenceFromText(text: SpatialText, originalEvidenceIds: string[], sourceIds: string[], pages: number[], bounds: ReviewBounds[]): void {
  originalEvidenceIds.push(...text.originalEvidenceIds);
  sourceIds.push(...text.sourceIds);
  pages.push(text.bounds.page);
  bounds.push(cloneBounds(text.bounds));
}

function evidenceFor(context: Context, stableIds: readonly string[], specs: readonly NormalizedSpec[] = []): ElectricalIssueEvidence {
  const originalEvidenceIds: string[] = [];
  const sourceIds: string[] = [];
  const pages: number[] = [];
  const bounds: ReviewBounds[] = [];
  for (const stableId of stableIds) {
    const symbol = context.symbols.get(stableId);
    if (symbol) addEvidenceFromSymbol(symbol, originalEvidenceIds, sourceIds, pages, bounds);
    const line = context.lines.get(stableId);
    if (line) addEvidenceFromLine(line, originalEvidenceIds, sourceIds, pages);
    const text = context.texts.get(stableId);
    if (text) addEvidenceFromText(text, originalEvidenceIds, sourceIds, pages, bounds);
    const edge = context.edges.get(stableId);
    if (edge) {
      const edgeLine = context.lines.get(edge.lineId);
      if (edgeLine) addEvidenceFromLine(edgeLine, originalEvidenceIds, sourceIds, pages);
    }
  }
  for (const spec of specs) {
    originalEvidenceIds.push(...spec.originalEvidenceIds);
    sourceIds.push(...spec.sourceIds);
    pages.push(spec.bounds.page);
    bounds.push(cloneBounds(spec.bounds));
  }
  const uniqueBounds = new Map<string, ReviewBounds>();
  for (const item of bounds) uniqueBounds.set(`${item.page}:${item.x}:${item.y}:${item.w}:${item.h}`, item);
  return {
    drawingHash: context.graph.drawingHash,
    stableIds: sortedUnique(stableIds),
    originalEvidenceIds: sortedUnique(originalEvidenceIds),
    sourceIds: sortedUnique(sourceIds),
    pages: sortedNumbers(pages),
    bounds: [...uniqueBounds.values()].sort((left, right) => left.page - right.page || left.y - right.y || left.x - right.x || left.w - right.w || left.h - right.h),
  };
}

function makeIssue(context: Context, code: ElectricalIssueCode, judgment: ElectricalIssueJudgment, severity: ElectricalIssue['severity'], message: string, stableIds: readonly string[], requiredInputs: readonly string[] = [], specs: readonly NormalizedSpec[] = []): ElectricalIssue {
  const primary = sortedUnique(stableIds);
  return {
    id: `issue:${code.toLowerCase()}:${primary.join('|') || 'graph'}`,
    code,
    judgment,
    severity,
    message,
    evidence: evidenceFor(context, primary, specs),
    requiredInputs: sortedUnique(requiredInputs),
  };
}

function makeBudgetIssue(context: Context): ElectricalIssue {
  return makeIssue(context, 'VALIDATION_BUDGET_EXCEEDED', 'BLOCK', 'critical', '입력 또는 순회 예산을 초과하여 검증을 중단했습니다.', [], ['bounded graph input']);
}

function preflight(input: NormalizedElectricalGraph): Context {
  const graph = input.graph;
  const symbols = new Map(graph.symbols.map((item) => [item.id, item]));
  const lines = new Map(graph.lines.map((item) => [item.id, item]));
  const texts = new Map(graph.texts.map((item) => [item.id, item]));
  const edges = new Map(graph.edges.map((item) => [item.id, item]));
  const adjacency = new Map<string, Neighbor[]>();
  for (const id of symbols.keys()) adjacency.set(id, []);
  return { input, graph, symbols, lines, texts, edges, adjacency, steps: 0 };
}

function inputExceedsBudget(context: Context): boolean {
  return context.graph.symbols.length > MAX_SYMBOLS || context.graph.edges.length > MAX_EDGES || context.input.specs.length > MAX_SPECS;
}

function conflictTargets(context: Context, suffix: string): string[] {
  const candidates = suffix.split('|').filter(Boolean);
  const stableIds: string[] = [];
  for (const candidate of candidates) {
    if (context.symbols.has(candidate) || context.lines.has(candidate) || context.texts.has(candidate) || context.edges.has(candidate)) {
      stableIds.push(candidate);
      continue;
    }
    const symbol = [...context.symbols.values()].find((item) => item.originalEvidenceIds.includes(candidate));
    const line = [...context.lines.values()].find((item) => item.originalEvidenceIds.includes(candidate));
    const text = [...context.texts.values()].find((item) => item.originalEvidenceIds.includes(candidate));
    if (symbol) stableIds.push(symbol.id);
    else if (line) stableIds.push(line.id);
    else if (text) stableIds.push(text.id);
  }
  return sortedUnique(stableIds);
}

function translateGraphConflicts(context: Context): ElectricalIssue[] {
  const issues: ElectricalIssue[] = [];
  for (const conflict of [...context.graph.conflicts].sort(compareText)) {
    const separator = conflict.indexOf(':');
    const prefix = separator < 0 ? conflict : conflict.slice(0, separator);
    const suffix = separator < 0 ? '' : conflict.slice(separator + 1);
    const judgment: ElectricalIssueJudgment = BLOCKING_GRAPH_CONFLICTS.has(prefix) ? 'BLOCK' : 'HOLD';
    const severity: ElectricalIssue['severity'] = judgment === 'BLOCK' ? 'critical' : 'major';
    const required = HOLDING_GRAPH_CONFLICTS.has(prefix) ? ['unambiguous graph review'] : judgment === 'HOLD' ? ['graph conflict resolution'] : ['repair graph structure'];
    issues.push(makeIssue(context, 'GRAPH_CONFLICT', judgment, severity, `그래프 충돌: ${conflict}`, conflictTargets(context, suffix), required));
  }
  return issues;
}

function findDanglingAndIsolated(context: Context): ElectricalIssue[] {
  const issues: ElectricalIssue[] = [];
  for (const edge of [...context.graph.edges].sort((left, right) => compareText(left.id, right.id))) {
    const missing: string[] = [];
    if (!context.symbols.has(edge.from)) missing.push(edge.from);
    if (!context.symbols.has(edge.to)) missing.push(edge.to);
    if (!context.lines.has(edge.lineId)) missing.push(edge.lineId);
    if (missing.length > 0) {
      issues.push(makeIssue(context, 'DANGLING_EDGE', 'BLOCK', 'critical', `연결 ${edge.id}의 참조 대상이 없습니다.`, [edge.id, edge.lineId, edge.from, edge.to], missing));
      continue;
    }
    context.adjacency.get(edge.from)?.push({ nodeId: edge.to, edgeId: edge.id });
    context.adjacency.get(edge.to)?.push({ nodeId: edge.from, edgeId: edge.id });
  }
  for (const neighbors of context.adjacency.values()) neighbors.sort((left, right) => compareText(left.nodeId, right.nodeId) || compareText(left.edgeId, right.edgeId));
  for (const symbol of [...context.symbols.values()].sort((left, right) => compareText(left.id, right.id))) {
    if ((context.adjacency.get(symbol.id)?.length ?? 0) === 0) {
      issues.push(makeIssue(context, 'ISOLATED_DEVICE', 'HOLD', 'minor', `설비 ${symbol.id}가 연결되지 않았습니다.`, [symbol.id], ['connected drawing evidence']));
    }
  }
  return issues;
}

function step(context: Context): void {
  context.steps += 1;
  if (context.steps > MAX_TRAVERSAL_STEPS) throw new TraversalBudgetExceeded();
}

function buildUndirectedComponents(context: Context): Component[] {
  const visited = new Set<string>();
  const components: Component[] = [];
  for (const start of [...context.symbols.keys()].sort(compareText)) {
    if (visited.has(start)) continue;
    const stack = [start];
    const nodeIds: string[] = [];
    const edgeIds = new Set<string>();
    visited.add(start);
    while (stack.length > 0) {
      const current = stack.pop() as string;
      step(context);
      nodeIds.push(current);
      for (const neighbor of context.adjacency.get(current) ?? []) {
        step(context);
        edgeIds.add(neighbor.edgeId);
        if (!visited.has(neighbor.nodeId)) {
          visited.add(neighbor.nodeId);
          stack.push(neighbor.nodeId);
        }
      }
    }
    const sortedNodes = nodeIds.sort(compareText);
    const sortedEdges = [...edgeIds].sort(compareText);
    components.push({ nodeIds: sortedNodes, edgeIds: sortedEdges, hasCycle: sortedEdges.length >= sortedNodes.length && sortedNodes.length > 0 });
  }
  return components.sort((left, right) => compareText(left.nodeIds[0] ?? '', right.nodeIds[0] ?? ''));
}

function componentRoles(context: Context, component: Component): { sources: string[]; loads: string[]; mixed: string[] } {
  const sources: string[] = [];
  const loads: string[] = [];
  const mixed: string[] = [];
  for (const id of component.nodeIds) {
    const symbol = context.symbols.get(id);
    if (!symbol) continue;
    const role = classifyRole(symbol);
    if (role === 'source') sources.push(id);
    if (role === 'load') loads.push(id);
    if (!role && symbol.typeCandidates.length > 1 && symbol.typeCandidates.some((candidate) => roleForType(resolveSymbol(candidate.trim())) !== undefined)) mixed.push(id);
  }
  return { sources, loads, mixed };
}

function bfsParents(context: Context, sourceId: string, component: Component): Map<string, string | undefined> {
  const allowed = new Set(component.nodeIds);
  const parents = new Map<string, string | undefined>([[sourceId, undefined]]);
  const queue = [sourceId];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    step(context);
    for (const neighbor of context.adjacency.get(current) ?? []) {
      step(context);
      if (!allowed.has(neighbor.nodeId) || parents.has(neighbor.nodeId)) continue;
      parents.set(neighbor.nodeId, current);
      queue.push(neighbor.nodeId);
    }
  }
  return parents;
}

function pathToSource(parents: Map<string, string | undefined>, loadId: string): string[] {
  const path: string[] = [];
  let current: string | undefined = loadId;
  while (current !== undefined) {
    path.push(current);
    current = parents.get(current);
  }
  return path.reverse();
}

function pathEdges(context: Context, path: readonly string[]): string[] {
  const result: string[] = [];
  for (let index = 1; index < path.length; index += 1) {
    const left = path[index - 1];
    const right = path[index];
    const match = (context.adjacency.get(left) ?? []).find((neighbor) => neighbor.nodeId === right);
    if (match) result.push(match.edgeId);
  }
  return result;
}

function normalizedMarker(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toUpperCase();
}

function explicitUnprotectedText(context: Context, path: readonly string[]): SpatialText | undefined {
  const pathIds = new Set(path);
  const matches: SpatialText[] = [];
  for (const text of context.graph.texts) {
    if (![text.raw, ...text.candidates].some((value) => EXPLICIT_UNPROTECTED.has(normalizedMarker(value)))) continue;
    if (text.originalEvidenceIds.length === 0 || text.sourceIds.length === 0) continue;
    const allLinks = context.graph.textLinks.filter((link) => link.textId === text.id);
    if (allLinks.length !== 1 || !pathIds.has(allLinks[0].symbolId)) continue;
    const symbol = context.symbols.get(allLinks[0].symbolId);
    if (symbol && symbol.bounds.page === text.bounds.page) matches.push(text);
  }
  return [...matches].sort((left, right) => compareText(left.id, right.id))[0];
}

function validateSourceLoadPaths(context: Context, components: readonly Component[]): ElectricalIssue[] {
  const issues: ElectricalIssue[] = [];
  const globalRoles = components.map((component) => componentRoles(context, component));
  if (globalRoles.every((roles) => roles.sources.length === 0) || globalRoles.every((roles) => roles.loads.length === 0) || globalRoles.some((roles) => roles.mixed.length > 0)) {
    issues.push(makeIssue(context, 'SOURCE_OR_LOAD_UNRESOLVED', 'HOLD', 'major', 'source 또는 load 역할을 유일하게 확인할 수 없습니다.', sortedUnique(globalRoles.flatMap((roles) => roles.mixed)), ['source/load role evidence']));
  }
  for (const component of components) {
    const { sources, loads } = componentRoles(context, component);
    if (component.hasCycle) {
      issues.push(makeIssue(context, 'DIRECTION_AMBIGUOUS', 'HOLD', 'major', 'cycle 또는 병렬 연결로 유일한 전력 경로를 정할 수 없습니다.', [...component.nodeIds, ...component.edgeIds], ['directional drawing evidence']));
      continue;
    }
    for (const loadId of loads) {
      if (sources.length === 0) {
        issues.push(makeIssue(context, 'NO_SOURCE_LOAD_PATH', 'HOLD', 'major', `부하 ${loadId}까지 확인된 source 경로가 없습니다.`, [loadId, ...component.edgeIds], ['source connection evidence']));
        continue;
      }
      if (sources.length > 1) {
        issues.push(makeIssue(context, 'MULTIPLE_SOURCE_LOAD_PATHS', 'HOLD', 'major', `부하 ${loadId}에 복수 source 경로가 있습니다.`, [loadId, ...sources, ...component.edgeIds], ['ATS/tie/backfeed evidence']));
        continue;
      }
      const parents = bfsParents(context, sources[0], component);
      if (!parents.has(loadId)) {
        issues.push(makeIssue(context, 'NO_SOURCE_LOAD_PATH', 'HOLD', 'major', `부하 ${loadId}까지 확인된 source 경로가 없습니다.`, [loadId], ['source connection evidence']));
        continue;
      }
      const path = pathToSource(parents, loadId);
      const protectedPath = path.slice(1, -1).some((id) => {
        const symbol = context.symbols.get(id);
        return symbol ? classifyRole(symbol) === 'protection' : false;
      });
      if (protectedPath) continue;
      const marker = explicitUnprotectedText(context, path);
      const stableIds = [...path, ...pathEdges(context, path), ...(marker ? [marker.id] : [])];
      if (marker) {
        issues.push(makeIssue(context, 'EXPLICIT_UNPROTECTED_PATH', 'FAIL', 'critical', `부하 ${loadId} 경로가 명시적으로 무보호입니다.`, stableIds, []));
      } else {
        issues.push(makeIssue(context, 'NO_UPSTREAM_PROTECTION', 'HOLD', 'major', `부하 ${loadId} 경로의 보호기 확인이 필요합니다.`, stableIds, ['upstream protection evidence']));
      }
    }
  }
  return issues;
}

function validVoltage(context: Context, spec: NormalizedSpec): boolean {
  const owner = spec.ownerId ? context.symbols.get(spec.ownerId) : undefined;
  return spec.drawingHash === context.graph.drawingHash
    && spec.field === 'voltage_V'
    && typeof spec.value === 'number'
    && Number.isFinite(spec.value)
    && spec.value > 0
    && spec.unit === 'V'
    && owner !== undefined
    && spec.originalEvidenceIds.length > 0
    && spec.sourceIds.length > 0
    && spec.bounds.page === owner.bounds.page;
}

function voltageDomainBoundary(symbol: SpatialSymbol): boolean {
  return symbol.typeCandidates.map((candidate) => resolveSymbol(candidate.trim())).some((type) =>
    type === 'transformer'
    || type === 'transformer_dry'
    || type === 'transformer_auto'
    || type === 'transformer_vt');
}

function validateVoltageDomains(context: Context): ElectricalIssue[] {
  const issues: ElectricalIssue[] = [];
  const voltageSpecs = context.input.specs.filter((spec) => spec.field === 'voltage_V');
  const validByOwner = new Map<string, NormalizedSpec[]>();
  const invalidByOwner = new Map<string, NormalizedSpec[]>();
  for (const spec of voltageSpecs) {
    const target = validVoltage(context, spec) && spec.ownerId ? validByOwner : invalidByOwner;
    const key = spec.ownerId ?? spec.evidenceId;
    const values = target.get(key) ?? [];
    values.push(spec);
    target.set(key, values);
  }
  for (const edge of [...context.graph.edges].sort((left, right) => compareText(left.id, right.id))) {
    const from = context.symbols.get(edge.from);
    const to = context.symbols.get(edge.to);
    if (!from || !to || voltageDomainBoundary(from) || voltageDomainBoundary(to)) continue;
    const fromSpecs = validByOwner.get(from.id) ?? [];
    const toSpecs = validByOwner.get(to.id) ?? [];
    const fromValues = sortedUnique(fromSpecs.map((spec) => String(spec.value)));
    const toValues = sortedUnique(toSpecs.map((spec) => String(spec.value)));
    const invalid = [...(invalidByOwner.get(from.id) ?? []), ...(invalidByOwner.get(to.id) ?? [])];
    if (fromValues.length !== 1 || toValues.length !== 1 || invalid.length > 0) {
      issues.push(makeIssue(context, 'VOLTAGE_DOMAIN_UNRESOLVED', 'HOLD', 'major', `연결 ${edge.id} 양단의 source-linked 전압을 유일하게 확인할 수 없습니다.`, [edge.id, from.id, to.id], ['owner-linked voltage evidence'], [...fromSpecs, ...toSpecs, ...invalid]));
      continue;
    }
    if (Number(fromValues[0]) !== Number(toValues[0])) {
      issues.push(makeIssue(context, 'VOLTAGE_DOMAIN_CONFLICT', 'FAIL', 'critical', `연결 ${edge.id} 양단 전압이 일치하지 않습니다.`, [edge.id, from.id, to.id], [], [...fromSpecs, ...toSpecs]));
    }
  }
  for (const [owner, specs] of invalidByOwner) {
    if (context.symbols.has(owner)) continue;
    issues.push(makeIssue(context, 'VOLTAGE_DOMAIN_UNRESOLVED', 'HOLD', 'major', '전압 spec의 owner 또는 provenance를 확인할 수 없습니다.', [], ['owner-linked voltage evidence'], specs));
  }
  return issues;
}

function validateGroundPaths(context: Context): ElectricalIssue[] {
  const issues: ElectricalIssue[] = [];
  const groundIds = [...context.symbols.values()].filter((symbol) => classifyRole(symbol) === 'ground').map((symbol) => symbol.id).sort(compareText);
  const loads = [...context.symbols.values()].filter((symbol) => classifyRole(symbol) === 'load').map((symbol) => symbol.id).sort(compareText);
  const adjacency = new Map<string, Neighbor[]>();
  for (const id of context.symbols.keys()) adjacency.set(id, []);
  for (const edge of context.graph.edges) {
    const line = context.lines.get(edge.lineId);
    if (!line || line.lineKind !== 'ground' || !context.symbols.has(edge.from) || !context.symbols.has(edge.to)) continue;
    adjacency.get(edge.from)?.push({ nodeId: edge.to, edgeId: edge.id });
    adjacency.get(edge.to)?.push({ nodeId: edge.from, edgeId: edge.id });
  }
  for (const neighbors of adjacency.values()) neighbors.sort((left, right) => compareText(left.nodeId, right.nodeId) || compareText(left.edgeId, right.edgeId));
  for (const loadId of loads) {
    const visited = new Set<string>([loadId]);
    const queue = [loadId];
    const edges = new Set<string>();
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      step(context);
      for (const neighbor of adjacency.get(current) ?? []) {
        step(context);
        edges.add(neighbor.edgeId);
        if (!visited.has(neighbor.nodeId)) {
          visited.add(neighbor.nodeId);
          queue.push(neighbor.nodeId);
        }
      }
    }
    const reachableGrounds = groundIds.filter((id) => visited.has(id));
    const ambiguous = edges.size >= visited.size && visited.size > 0;
    if (reachableGrounds.length !== 1 || ambiguous) {
      issues.push(makeIssue(context, 'GROUND_PATH_UNKNOWN', 'HOLD', 'major', `부하 ${loadId}의 유일한 ground 경로를 확인할 수 없습니다.`, [loadId, ...reachableGrounds, ...edges], ['ground-line path evidence']));
    }
  }
  return issues;
}

function rank(judgment: ElectricalIssueJudgment): number {
  return judgment === 'BLOCK' ? 0 : judgment === 'FAIL' ? 1 : 2;
}

function finalizeIssues(context: Context, issues: readonly ElectricalIssue[]): ElectricalIssue[] {
  const unique = new Map<string, ElectricalIssue>();
  for (const issue of issues) {
    if (!unique.has(issue.id)) unique.set(issue.id, issue);
  }
  const result = [...unique.values()].sort((left, right) => rank(left.judgment) - rank(right.judgment) || compareText(left.code, right.code) || compareText(left.id, right.id));
  if (result.length > MAX_ISSUES) {
    return [...result.filter((issue) => issue.code === 'GRAPH_CONFLICT').slice(0, MAX_ISSUES - 1), makeBudgetIssue(context)]
      .sort((left, right) => rank(left.judgment) - rank(right.judgment) || compareText(left.code, right.code) || compareText(left.id, right.id));
  }
  return result;
}

export function validateElectricalInvariants(input: NormalizedElectricalGraph): ElectricalIssue[] {
  const context = preflight(input);
  const issues = translateGraphConflicts(context);
  if (inputExceedsBudget(context)) return finalizeIssues(context, [...issues.filter((issue) => issue.code === 'GRAPH_CONFLICT'), makeBudgetIssue(context)]);
  issues.push(...findDanglingAndIsolated(context));
  if (issues.some((issue) => issue.judgment === 'BLOCK')) return finalizeIssues(context, issues);
  try {
    const components = buildUndirectedComponents(context);
    issues.push(...validateSourceLoadPaths(context, components));
    issues.push(...validateVoltageDomains(context));
    issues.push(...validateGroundPaths(context));
    return finalizeIssues(context, issues);
  } catch (error) {
    if (!(error instanceof TraversalBudgetExceeded)) throw error;
    return finalizeIssues(context, [...issues.filter((issue) => issue.code === 'GRAPH_CONFLICT'), makeBudgetIssue(context)]);
  }
}
