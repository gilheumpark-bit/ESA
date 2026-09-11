/** Portable vector descriptor. Similarity is a geometric distance, not a probability. */
export type ShapeLine = [number, number, number, number];
export type ShapeCircle = [number, number, number];
export type ShapeArc = [number, number, number, number, number];
export interface SymbolShape {
  version: 1;
  extent: [number, number];
  lines: ShapeLine[];
  circles: ShapeCircle[];
  arcs: ShapeArc[];
}
export const SYMBOL_SHAPE_LIMIT = 48;
const TAU = Math.PI * 2;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const round = (n: number) => Math.round(n * 100_000) / 100_000;
const angle = (n: number) => ((n % TAU) + TAU) % TAU;
const order = (a: readonly number[], b: readonly number[]) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};
function canonical(shape: SymbolShape): SymbolShape {
  return { version: 1, extent: [...shape.extent],
    lines: shape.lines.map((l): ShapeLine => order(l.slice(0, 2), l.slice(2)) <= 0 ? [...l] : [l[2], l[3], l[0], l[1]]).sort(order),
    circles: shape.circles.map((c): ShapeCircle => [...c]).sort(order), arcs: shape.arcs.map((a): ShapeArc => [...a]).sort(order) };
}
/** Import/API data must fit the version and bounds. Unknown fields confer no authority. */
export function readSymbolShape(raw: unknown): SymbolShape | undefined {
  if (!record(raw) || raw.version !== 1 || !Array.isArray(raw.extent) || raw.extent.length !== 2
    || !raw.extent.every((n) => finite(n) && n >= 0 && n <= 1) || Math.max(...raw.extent) < 0.99
    || !Array.isArray(raw.lines) || !Array.isArray(raw.circles) || !Array.isArray(raw.arcs)
    || raw.lines.length + raw.circles.length + raw.arcs.length < 1
    || raw.lines.length + raw.circles.length + raw.arcs.length > SYMBOL_SHAPE_LIMIT) return undefined;
  const tuples = (values: unknown[], size: number, angles = false) => values.every((row) => Array.isArray(row) && row.length === size
    && row.every((n, i) => finite(n) && n >= 0 && n <= (angles && i >= 3 ? TAU + 0.00001 : 1)));
  if (!tuples(raw.lines, 4) || !tuples(raw.circles, 3) || !tuples(raw.arcs, 5, true)
    || raw.circles.some((c) => c[2] <= 0) || raw.arcs.some((a) => a[2] <= 0)) return undefined;
  return canonical({ version: 1, extent: raw.extent as [number, number], lines: raw.lines as ShapeLine[],
    circles: raw.circles as ShapeCircle[], arcs: raw.arcs as ShapeArc[] });
}

/** LINE, unbulged 2D polylines, circles and arcs only. Unsupported or truncated
 * geometry returns null rather than comparing a misleading partial descriptor.
 * Definition translation/uniform scale/order are normalized. INSERT transforms
 * do not change the definition. Reflections/rotated definitions are not equated. */
export function describeSymbolShape(entities: readonly unknown[]): SymbolShape | null {
  if (!Array.isArray(entities) || !entities.length || entities.length > 256) return null;
  const lines: ShapeLine[] = [], circles: ShapeCircle[] = [], arcs: ShapeArc[] = [];
  const point = (v: unknown): [number, number] | null => record(v) && finite(v.x) && finite(v.y)
    && (v.z === undefined || v.z === 0) ? [v.x, v.y] : null;
  for (const raw of entities) {
    if (!record(raw) || typeof raw.type !== 'string') return null;
    if (['TEXT', 'MTEXT', 'ATTDEF', 'ATTRIB'].includes(raw.type)) continue;
    if (raw.type === 'LINE') {
      const vertices = Array.isArray(raw.vertices) ? raw.vertices : [];
      const a = point(vertices[0] ?? raw.startPoint), b = point(vertices[1] ?? raw.endPoint);
      if (!a || !b || (a[0] === b[0] && a[1] === b[1])) return null;
      lines.push([...a, ...b]);
    } else if (raw.type === 'LWPOLYLINE' || raw.type === 'POLYLINE') {
      if (!Array.isArray(raw.vertices) || raw.vertices.length < 2 || raw.vertices.length > SYMBOL_SHAPE_LIMIT + 1) return null;
      const vertices: [number, number][] = [];
      for (const v of raw.vertices) {
        const p = point(v);
        if (!p || !record(v) || (v.bulge !== undefined && v.bulge !== 0)
          || (v.startWidth !== undefined && v.startWidth !== 0) || (v.endWidth !== undefined && v.endWidth !== 0)) return null;
        vertices.push(p);
      }
      for (let i = 1; i < vertices.length; i++) lines.push([...vertices[i - 1], ...vertices[i]]);
      const a = vertices.at(-1)!, b = vertices[0];
      if ((raw.shape === true || raw.closed === true) && (a[0] !== b[0] || a[1] !== b[1])) lines.push([...a, ...b]);
    } else if (raw.type === 'CIRCLE' || raw.type === 'ARC') {
      const c = point(raw.center ?? raw.position);
      if (!c || !finite(raw.radius) || raw.radius <= 0) return null;
      if (raw.type === 'CIRCLE') circles.push([...c, raw.radius]);
      else {
        if (!finite(raw.startAngle) || !finite(raw.endAngle)) return null;
        arcs.push([...c, raw.radius, angle(raw.startAngle), angle(raw.endAngle)]);
      }
    } else return null;
    if (lines.length + circles.length + arcs.length > SYMBOL_SHAPE_LIMIT) return null;
  }
  if (!lines.length && !circles.length && !arcs.length) return null;
  const points: Array<[number, number]> = lines.flatMap((l) => [[l[0], l[1]], [l[2], l[3]]] as Array<[number, number]>);
  for (const c of [...circles, ...arcs]) points.push([c[0] - c[2], c[1] - c[2]], [c[0] + c[2], c[1] + c[2]]);
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), w = Math.max(...xs) - minX, h = Math.max(...ys) - minY;
  const scale = Math.max(w, h);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const x = (n: number) => round((n - minX) / scale), y = (n: number) => round((n - minY) / scale), r = (n: number) => round(n / scale);
  return readSymbolShape({ version: 1, extent: [r(w), r(h)],
    lines: lines.map((l) => [x(l[0]), y(l[1]), x(l[2]), y(l[3])]),
    circles: circles.map((c) => [x(c[0]), y(c[1]), r(c[2])]),
    arcs: arcs.map((a) => [x(a[0]), y(a[1]), r(a[2]), round(a[3]), round(a[4])]) }) ?? null;
}

/** Stroke endpoint connectivity, not inferred physical device terminals. */
export function shapeTopology(shape: SymbolShape): string {
  const degree = new Map<string, number>();
  const neighbours = new Map<string, Set<string>>();
  const key = (x: number, y: number) => `${Math.round(x * 10_000)},${Math.round(y * 10_000)}`;
  for (const l of shape.lines) {
    const a = key(l[0], l[1]), b = key(l[2], l[3]);
    for (const [from, to] of [[a, b], [b, a]]) {
      degree.set(from, (degree.get(from) ?? 0) + 1);
      const set = neighbours.get(from) ?? new Set<string>(); set.add(to); neighbours.set(from, set);
    }
  }
  const visited = new Set<string>(), groups: number[] = [];
  for (const node of degree.keys()) {
    if (visited.has(node)) continue;
    const stack = [node]; let size = 0;
    while (stack.length) { const current = stack.pop()!; if (visited.has(current)) continue; visited.add(current); size++;
      for (const next of neighbours.get(current) ?? []) if (!visited.has(next)) stack.push(next); }
    groups.push(size);
  }
  return `${shape.lines.length}/${shape.circles.length}/${shape.arcs.length}:${[...degree.values()].sort((a, b) => a - b)}:${groups.sort((a, b) => a - b)}`;
}
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function matchCosts<T>(left: T[], right: T[], cost: (a: T, b: T) => number): number[] {
  // Deterministic one-to-one matching: the same small stroke cannot explain several others.
  const pairs = left.flatMap((a, i) => right.map((b, j) => ({ i, j, cost: cost(a, b) })))
    .sort((a, b) => a.cost - b.cost || a.i - b.i || a.j - b.j);
  const usedA = new Set<number>(), usedB = new Set<number>(), costs: number[] = [];
  for (const pair of pairs) if (!usedA.has(pair.i) && !usedB.has(pair.j)) {
    usedA.add(pair.i); usedB.add(pair.j); costs.push(pair.cost);
  }
  return costs;
}
export function compareSymbolShapes(a: SymbolShape, b: SymbolShape): { score: number; topologyMatch: boolean; maxDistance: number } {
  if (shapeTopology(a) !== shapeTopology(b)) return { score: 0, topologyMatch: false, maxDistance: 1 };
  const lineCost = (x: ShapeLine, y: ShapeLine) => Math.min(
    Math.max(distance(x, y), distance(x.slice(2), y.slice(2))),
    Math.max(distance(x, y.slice(2)), distance(x.slice(2), y)));
  const circleCost = (x: ShapeCircle, y: ShapeCircle) => Math.max(distance(x, y), Math.abs(x[2] - y[2]));
  const radians = (x: number, y: number) => Math.min(Math.abs(x - y), TAU - Math.abs(x - y)) / Math.PI;
  const costs = [...matchCosts(a.lines, b.lines, lineCost), ...matchCosts(a.circles, b.circles, circleCost),
    ...matchCosts(a.arcs, b.arcs, (x, y) => Math.max(circleCost([x[0], x[1], x[2]], [y[0], y[1], y[2]]), radians(x[3], y[3]), radians(x[4], y[4]))),
    Math.abs(a.extent[0] - b.extent[0]), Math.abs(a.extent[1] - b.extent[1])];
  const maximum = Math.max(...costs), mean = costs.reduce((sum, n) => sum + n, 0) / costs.length;
  return { score: round(Math.max(0, 1 - Math.max(maximum * 2, mean * 4))), topologyMatch: true, maxDistance: maximum };
}
