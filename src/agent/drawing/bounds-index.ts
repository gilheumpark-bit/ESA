/**
 * Immutable, request-local bounding-volume index. This only narrows candidates;
 * callers must still run their original exact geometry predicates.
 * Invalid bounds stay in every query instead of silently dropping evidence.
 */
export interface IndexedBounds { x: number; y: number; w: number; h: number }
interface Extents { minX: number; maxX: number; minY: number; maxY: number }
interface Entry<T> { value: T; order: number; bounds: Extents }
interface Node<T> { bounds: Extents; entries?: Entry<T>[]; left?: Node<T>; right?: Node<T> }

function extents(bounds: IndexedBounds | undefined): Extents | undefined {
  if (!bounds || ![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite)
    || bounds.w < 0 || bounds.h < 0) return undefined;
  const result = { minX: bounds.x, minY: bounds.y, maxX: bounds.x + bounds.w, maxY: bounds.y + bounds.h };
  return Object.values(result).every(Number.isFinite) ? result : undefined;
}
function intersects(a: Extents, b: Extents): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
function union<T>(entries: Entry<T>[]): Extents {
  const result = { ...entries[0].bounds };
  for (const { bounds } of entries.slice(1)) {
    result.minX = Math.min(result.minX, bounds.minX);
    result.maxX = Math.max(result.maxX, bounds.maxX);
    result.minY = Math.min(result.minY, bounds.minY);
    result.maxY = Math.max(result.maxY, bounds.maxY);
  }
  return result;
}
function build<T>(entries: Entry<T>[]): Node<T> | undefined {
  if (!entries.length) return undefined;
  const bounds = union(entries);
  if (entries.length <= 8) return { bounds, entries };
  const horizontal = bounds.maxX - bounds.minX >= bounds.maxY - bounds.minY;
  const center = (entry: Entry<T>) => horizontal
    ? entry.bounds.minX / 2 + entry.bounds.maxX / 2
    : entry.bounds.minY / 2 + entry.bounds.maxY / 2;
  const sorted = [...entries].sort((a, b) => center(a) - center(b) || a.order - b.order);
  const middle = Math.floor(sorted.length / 2);
  return { bounds, left: build(sorted.slice(0, middle)), right: build(sorted.slice(middle)) };
}

export function createBoundsIndex<T>(values: readonly T[], getBounds: (value: T) => IndexedBounds | undefined) {
  const original = [...values];
  const entries: Entry<T>[] = [];
  const unbounded: Array<{ value: T; order: number }> = [];
  original.forEach((value, order) => {
    const bounds = extents(getBounds(value));
    if (bounds) entries.push({ value, order, bounds });
    else unbounded.push({ value, order });
  });
  const root = build(entries);
  return {
    query(bounds: IndexedBounds): T[] {
      const target = extents(bounds);
      if (!target) return [...original];
      const found: Array<{ value: T; order: number }> = [...unbounded];
      const pending = root ? [root] : [];
      while (pending.length) {
        const node = pending.pop()!;
        if (!intersects(node.bounds, target)) continue;
        if (node.entries) {
          for (const entry of node.entries) if (intersects(entry.bounds, target)) found.push(entry);
        } else {
          if (node.right) pending.push(node.right);
          if (node.left) pending.push(node.left);
        }
      }
      // Geometry tie-breaks and relation IDs must not depend on tree traversal order.
      return found.sort((a, b) => a.order - b.order).map((entry) => entry.value);
    },
  };
}
