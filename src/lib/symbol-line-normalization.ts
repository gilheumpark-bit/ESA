import type { ShapeLine, SymbolShape } from './symbol-shape';

/** Comparison policy, separate from stored descriptor and exact fp2 identity. */
export const SYMBOL_GEOMETRY_POLICY = 'collinear-degree-two-v2' as const;
const EPSILON = 1e-7;
type Point = [number, number];
const pointKey = (p: Point) => `${p[0]},${p[1]}`;
const compare = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};
const canonical = (line: ShapeLine): ShapeLine => compare(line.slice(0, 2), line.slice(2)) <= 0 ? [...line] : [line[2], line[3], line[0], line[1]];
function onSegment(p: Point, line: ShapeLine): boolean {
  const dx = line[2] - line[0], dy = line[3] - line[1], length = Math.hypot(dx, dy);
  if (!length) return Math.hypot(p[0] - line[0], p[1] - line[1]) <= EPSILON;
  const cross = Math.abs((p[0] - line[0]) * dy - (p[1] - line[1]) * dx) / length;
  const dot = (p[0] - line[0]) * dx + (p[1] - line[1]) * dy;
  return cross <= EPSILON && dot >= -EPSILON && dot <= length * length + EPSILON;
}

/** Remove representation-only splits, never inferred gaps or junctions.
 * A join needs exactly two distinct incident strokes, opposite collinear rays,
 * no third stroke crossing the join, and no circle/arc at the join.
 * Coordinates, curves, raw descriptor and original fp2 hashes stay untouched.
 * At most 48 strokes are compared, bounding the repeated incidence scan. */
export function normalizeSymbolLines(shape: SymbolShape): SymbolShape {
  let lines = shape.lines.map(canonical).sort(compare);
  if (lines.length > 48) return { ...shape, lines };
  while (lines.length > 1) {
    const endpoints = new Map<string, { point: Point; lines: number[] }>();
    lines.forEach((line, index) => {
      for (const point of [[line[0], line[1]], [line[2], line[3]]] as Point[]) {
        const key = pointKey(point), entry = endpoints.get(key) ?? { point, lines: [] };
        entry.lines.push(index); endpoints.set(key, entry);
      }
    });
    let replacement: { left: number; right: number; line: ShapeLine } | undefined;
    for (const [, entry] of [...endpoints].sort(([a], [b]) => a.localeCompare(b))) {
      if (entry.lines.length !== 2 || entry.lines[0] === entry.lines[1]) continue;
      const [left, right] = entry.lines, p = entry.point;
      const other = (line: ShapeLine): Point => pointKey([line[0], line[1]]) === pointKey(p) ? [line[2], line[3]] : [line[0], line[1]];
      const a = other(lines[left]), b = other(lines[right]);
      const u: Point = [a[0] - p[0], a[1] - p[1]], v: Point = [b[0] - p[0], b[1] - p[1]];
      const length = Math.hypot(...u) * Math.hypot(...v);
      if (!length || u[0] * v[0] + u[1] * v[1] >= 0
        || Math.abs(u[0] * v[1] - u[1] * v[0]) > EPSILON * length) continue;
      if (lines.some((line, index) => index !== left && index !== right && onSegment(p, line))) continue;
      // Conservatively preserve a join anywhere on a curve circumference, even
      // outside a partial arc. This sacrifices recall instead of deleting ports.
      if ([...shape.circles, ...shape.arcs].some((curve) => Math.abs(Math.hypot(p[0] - curve[0], p[1] - curve[1]) - curve[2]) <= EPSILON)) continue;
      replacement = { left, right, line: canonical([...a, ...b]) }; break;
    }
    if (!replacement) break;
    const { left, right, line } = replacement;
    lines = [...lines.filter((_, index) => index !== left && index !== right), line].sort(compare);
  }
  return { version: shape.version, extent: [...shape.extent], lines,
    circles: shape.circles.map((curve) => [...curve]), arcs: shape.arcs.map((curve) => [...curve]) };
}
