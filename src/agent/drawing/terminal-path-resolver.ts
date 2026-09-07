/**
 * Recover point-to-point circuits from observed conductor fragments.
 * This is geometry evidence, not an AI confidence vote or a flow-direction claim.
 * Gaps, synthetic chords, uncertain observations and unmodelled multi-terminal
 * nets remain in the existing candidate path. No physical units are inferred.
 */
import { hasDeviceClass } from './device-class';
import type { LineNode, SymbolNode } from './types-v3';

type Point = { x: number; y: number };
const EPSILON = 1e-6;
const TERMINAL_TOLERANCE = 2; // Existing original-coordinate contact contract.

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function finite(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}
function usable(line: LineNode): boolean {
  return line.path.length > 1 && line.path.every(finite)
    && line.path.some((point, index) => index > 0 && distance(point, line.path[index - 1]) > EPSILON);
}
function projection(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const squared = dx * dx + dy * dy;
  if (squared === 0) return { point: start, ratio: 0, distance: distance(point, start) };
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / squared));
  const projected = { x: start.x + dx * ratio, y: start.y + dy * ratio };
  return { point: projected, ratio, distance: distance(point, projected) };
}
function pathDistance(point: Point, line: LineNode): number {
  let result = Infinity;
  for (let i = 1; i < line.path.length; i += 1) {
    result = Math.min(result, projection(point, line.path[i - 1], line.path[i]).distance);
  }
  return result;
}
function compatible(left: LineNode, right: LineNode): boolean {
  if (left.lineKind === right.lineKind) return true;
  const powerKinds = ['power', 'bus', 'unknown'];
  return powerKinds.includes(left.lineKind) && powerKinds.includes(right.lineKind);
}
function blockedCrossing(left: LineNode, right: LineNode, a: Point, b: Point): boolean {
  return [...left.crossovers, ...right.crossovers].some((point) => finite(point)
    && Math.min(distance(point, a), distance(point, b)) <= TERMINAL_TOLERANCE);
}
function endpointMeets(from: LineNode, onto: LineNode, index: number, tolerance: number): boolean {
  const point = from.path[index];
  const neighbor = from.path[index === 0 ? 1 : from.path.length - 2];
  const dx = point.x - neighbor.x, dy = point.y - neighbor.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return false;
  for (let i = 1; i < onto.path.length; i += 1) {
    const start = onto.path[i - 1], end = onto.path[i];
    const segmentLength = distance(start, end);
    if (segmentLength === 0) continue;
    const hit = projection(point, start, end);
    if (hit.distance > tolerance || blockedCrossing(from, onto, point, hit.point)) continue;
    // A geometrically coincident endpoint is a contact regardless of angle.
    if (hit.distance <= EPSILON) return true;
    // Preserve the old, explicitly ambiguous gap-recovery rule. A parallel
    // nearby wire is not a perpendicular branch, even inside the search radius.
    if (hit.ratio <= 0.05 || hit.ratio >= 0.95) return true;
    const parallel = Math.abs(dx * (end.x - start.x) + dy * (end.y - start.y)) / (length * segmentLength);
    if (parallel <= 0.35) return true;
  }
  return false;
}
function meet(left: LineNode, right: LineNode, tolerance: number): boolean {
  if (endpointMeets(left, right, 0, tolerance)
    || endpointMeets(left, right, left.path.length - 1, tolerance)
    || endpointMeets(right, left, 0, tolerance)
    || endpointMeets(right, left, right.path.length - 1, tolerance)) return true;
  // Interior/interior crossings require an explicit junction observation.
  return [...left.junctions, ...right.junctions].some((point) => finite(point)
    && !blockedCrossing(left, right, point, point)
    && pathDistance(point, left) <= EPSILON && pathDistance(point, right) <= EPSILON);
}

/** Shared by conservative route proofs and the legacy inferred-gap path. */
export function buildConductorAdjacency(lines: LineNode[], tolerance: number): Map<string, Set<string>> {
  const result = new Map(lines.map((line) => [line.id, new Set<string>()]));
  const bounded = lines.filter(usable).map((line) => ({
    line, minX: Math.min(...line.path.map((p) => p.x)), maxX: Math.max(...line.path.map((p) => p.x)),
    minY: Math.min(...line.path.map((p) => p.y)), maxY: Math.max(...line.path.map((p) => p.y)),
  })).sort((a, b) => a.minX - b.minX || a.line.id.localeCompare(b.line.id));
  for (let i = 0; i < bounded.length; i += 1) {
    const left = bounded[i];
    for (let j = i + 1; j < bounded.length; j += 1) {
      const right = bounded[j];
      if (right.minX > left.maxX + tolerance) break;
      if (right.minY > left.maxY + tolerance || left.minY > right.maxY + tolerance) continue;
      if (left.line.evidence[0]?.pageIndex !== right.line.evidence[0]?.pageIndex) continue;
      if (!compatible(left.line, right.line) || !meet(left.line, right.line, tolerance)) continue;
      result.get(left.line.id)?.add(right.line.id);
      result.get(right.line.id)?.add(left.line.id);
    }
  }
  return result;
}

function crossesEquipmentBody(line: LineNode, symbol: SymbolNode): boolean {
  if (hasDeviceClass(symbol, 'bus')) return false;
  // A whole body, not a small crop fragment, is the obstacle to bypassing a device.
  const bounds = [...symbol.evidence].sort((a, b) => b.bounds.w * b.bounds.h - a.bounds.w * a.bounds.h)[0]?.bounds;
  if (!bounds) return false;
  const inset = Math.min(TERMINAL_TOLERANCE, bounds.w / 4, bounds.h / 4);
  const minX = bounds.x + inset, maxX = bounds.x + bounds.w - inset;
  const minY = bounds.y + inset, maxY = bounds.y + bounds.h - inset;
  if (!(maxX > minX && maxY > minY)) return false;
  // Clip each segment to the interior rectangle, not just its vertices.
  for (let i = 1; i < line.path.length; i += 1) {
    const start = line.path[i - 1], end = line.path[i];
    let entry = 0, exit = 1;
    for (const [origin, delta, low, high] of [
      [start.x, end.x - start.x, minX, maxX], [start.y, end.y - start.y, minY, maxY],
    ]) {
      if (Math.abs(delta) <= EPSILON) {
        if (origin <= low || origin >= high) { entry = 1; exit = 0; break; }
      } else {
        const a = (low - origin) / delta, b = (high - origin) / delta;
        entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (exit - entry > EPSILON) return true;
  }
  return false;
}

interface Contact { symbol: SymbolNode; point: Point; lineIds: string[] }
export interface TerminalPathProof {
  from: SymbolNode;
  to: SymbolNode;
  fromPort: Point;
  toPort: Point;
  lines: LineNode[];
}

function shortestPath(startIds: string[], endIds: string[], graph: Map<string, Set<string>>): string[] {
  const targets = new Set(endIds);
  const queue = [...startIds].sort();
  const parent = new Map<string, string | null>(queue.map((id) => [id, null]));
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    if (targets.has(current)) {
      const route: string[] = [];
      let node: string | null = current;
      while (node !== null) { route.push(node); node = parent.get(node) ?? null; }
      return route.reverse();
    }
    for (const next of [...(graph.get(current) ?? [])].sort()) {
      if (parent.has(next)) continue;
      parent.set(next, current); queue.push(next);
    }
  }
  return [];
}

/**
 * Prove only two-device conductor components. Branch networks without an
 * explicit terminal model are not converted into an arbitrary spanning tree.
 * All traversed observations must be confirmed and geometrically continuous.
 */
export function resolveTerminalPaths(symbols: SymbolNode[], lines: LineNode[], pageIndex: number): TerminalPathProof[] {
  const pageSymbols = symbols.filter((symbol) => symbol.evidence.length > 0
    && symbol.evidence.every((ref) => ref.pageIndex === pageIndex));
  const pageLines = lines.filter((line) => usable(line) && line.evidence.length > 0
    && line.evidence.every((ref) => ref.pageIndex === pageIndex));
  const observed = pageLines.filter((line) => line.certainty === 'confirmed'
    && line.geometrySource !== 'synthetic' && line.lineKind !== 'unknown'
    && line.evidence.length > 0 && line.evidence.every((ref) => ref.pageIndex === pageIndex)
    && !pageSymbols.some((symbol) => crossesEquipmentBody(line, symbol)));
  if (!observed.length || !pageSymbols.some((symbol) => symbol.ports?.length)) return [];
  // Keep excluded observations in the component map. Dropping an uncertain
  // branch first would turn a three-terminal net into a false two-terminal proof.
  const graph = buildConductorAdjacency(pageLines, EPSILON);
  const componentOf = new Map<string, number>();
  let sequence = 0;
  for (const line of pageLines) {
    if (componentOf.has(line.id)) continue;
    const queue = [line.id]; componentOf.set(line.id, sequence);
    for (let i = 0; i < queue.length; i += 1) {
      for (const next of graph.get(queue[i]) ?? []) {
        if (componentOf.has(next)) continue;
        componentOf.set(next, sequence); queue.push(next);
      }
    }
    sequence += 1;
  }
  const contacts = new Map<number, Contact[]>();
  const allPorts = pageSymbols.flatMap((symbol) => (symbol.ports ?? []).filter(finite).map((point) => ({ symbol, point })));
  const eligible = new Set(observed.map((line) => line.id));
  const blockedComponents = new Set(pageLines.filter((line) => !eligible.has(line.id))
    .map((line) => componentOf.get(line.id)!));
  for (const port of allPorts) {
    const candidates = pageLines.map((line) => ({ line, distance: pathDistance(port.point, line) }))
      .filter((hit) => hit.distance <= TERMINAL_TOLERANCE
        && !hit.line.crossovers.some((crossing) => distance(crossing, port.point) <= TERMINAL_TOLERANCE));
    if (!candidates.length) continue;
    const minimum = Math.min(...candidates.map((hit) => hit.distance));
    const closest = candidates.filter((hit) => hit.distance <= minimum + EPSILON);
    const components = new Set(closest.map((hit) => componentOf.get(hit.line.id)!));
    const collision = allPorts.some((other) => other.symbol.id !== port.symbol.id
      && distance(other.point, port.point) <= TERMINAL_TOLERANCE);
    if (components.size !== 1 || collision) {
      for (const component of components) blockedComponents.add(component);
      continue;
    }
    const component = components.values().next().value!;
    const current = contacts.get(component) ?? [];
    if (!current.some((contact) => contact.symbol.id === port.symbol.id && distance(contact.point, port.point) <= EPSILON)) {
      current.push({ ...port, lineIds: closest.map((hit) => hit.line.id) });
    }
    contacts.set(component, current);
  }
  const byId = new Map(observed.map((line) => [line.id, line]));
  const proofs: TerminalPathProof[] = [];
  for (const [component, terminals] of contacts) {
    if (blockedComponents.has(component) || terminals.length !== 2) continue;
    const [from, to] = [...terminals].sort((a, b) => a.symbol.displayId.localeCompare(b.symbol.displayId)
      || a.symbol.id.localeCompare(b.symbol.id));
    if (from.symbol.id === to.symbol.id
      || from.symbol.certainty !== 'confirmed' || to.symbol.certainty !== 'confirmed') continue;
    const route = shortestPath(from.lineIds, to.lineIds, graph);
    if (!route.length) continue;
    proofs.push({ from: from.symbol, to: to.symbol, fromPort: { ...from.point }, toPort: { ...to.point },
      lines: route.map((id) => byId.get(id)!) });
  }
  return proofs;
}
