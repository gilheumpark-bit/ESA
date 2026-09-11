import { describeSymbolShape, compareSymbolShapes, readSymbolShape, shapeTopology, SYMBOL_SHAPE_LIMIT } from '../symbol-shape';
import { rectangle } from '@/engine/topology/test-support/symbol-classification-fixture';

it('normalizes uniform scale, translation, segment and endpoint order', () => {
  const first = describeSymbolShape(rectangle())!;
  const transformed = rectangle().reverse().map((e) => ({ type: 'LINE', vertices: [e.endPoint, e.startPoint].map((p) => ({ x: p.x * 3 + 77, y: p.y * 3 - 30 })) }));
  expect(describeSymbolShape(transformed)).toEqual(first);
  expect(compareSymbolShapes(first, describeSymbolShape(transformed)!)).toEqual({ score: 1, topologyMatch: true, maxDistance: 0 });
});
it('compares nearly equal geometry without comparing cryptographic hashes', () => {
  const result = compareSymbolShapes(describeSymbolShape(rectangle())!, describeSymbolShape(rectangle(20.2))!);
  expect(result.topologyMatch).toBe(true); expect(result.score).toBeGreaterThanOrEqual(0.96); expect(result.score).toBeLessThan(1);
});
it('a changed endpoint connection does not pass as a harmless shape variation', () => {
  const original = rectangle(), changed = rectangle(); changed[0].endPoint.x -= 0.1;
  const a = describeSymbolShape(original)!, b = describeSymbolShape(changed)!;
  expect(shapeTopology(a)).not.toBe(shapeTopology(b)); expect(compareSymbolShapes(a, b).topologyMatch).toBe(false);
});
it('a straight closed polyline and its line segments have the same descriptor', () => {
  const polyline = [{ type: 'LWPOLYLINE', shape: true, vertices: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] }];
  expect(describeSymbolShape(polyline)).toEqual(describeSymbolShape(rectangle()));
});
it('added primitive topology is not silently discarded', () => {
  const a = describeSymbolShape(rectangle())!, b = describeSymbolShape([...rectangle(), { type: 'CIRCLE', center: { x: 10, y: 10 }, radius: 2 }])!;
  expect(compareSymbolShapes(a, b)).toMatchObject({ score: 0, topologyMatch: false });
});
it('mirrored asymmetric and internally rotated shapes are not arbitrarily equated', () => {
  const original = [...rectangle(), { type: 'LINE', startPoint: { x: 0, y: 0 }, endPoint: { x: 5, y: 12 } }];
  const mirrored = original.map((l) => ({ ...l, startPoint: { x: 20 - l.startPoint.x, y: l.startPoint.y }, endPoint: { x: 20 - l.endPoint.x, y: l.endPoint.y } }));
  expect(compareSymbolShapes(describeSymbolShape(original)!, describeSymbolShape(mirrored)!).score).toBeLessThan(0.96);
});
it('arc angle changes remain geometry differences', () => {
  const a = describeSymbolShape([{ type: 'ARC', center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI }])!;
  const b = describeSymbolShape([{ type: 'ARC', center: { x: 0, y: 0 }, radius: 5, startAngle: 0, endAngle: Math.PI / 2 }])!;
  expect(compareSymbolShapes(a, b).score).toBeLessThan(0.8);
});
it.each(['INSERT', 'SPLINE', 'ELLIPSE', 'HATCH', 'ATTACKER'])('rejects unsupported %s rather than comparing the other fragments', (type) => {
  expect(describeSymbolShape([...rectangle(), { type }])).toBeNull();
});
it.each([NaN, Infinity, -Infinity])('rejects nonfinite geometry %p', (x) => {
  const value = rectangle(); value[0].startPoint.x = x; expect(describeSymbolShape(value)).toBeNull();
});
it('does not compare a truncated large shape', () => {
  expect(describeSymbolShape(Array.from({ length: SYMBOL_SHAPE_LIMIT + 1 }, () => rectangle()[0]))).toBeNull();
  expect(describeSymbolShape([])).toBeNull();
});
it('does not mistake a bulged or wide polyline for straight strokes', () => {
  for (const patch of [{ bulge: 0.1 }, { startWidth: 2 }, { endWidth: 2 }]) {
    expect(describeSymbolShape([{ type: 'LWPOLYLINE', vertices: [{ x: 0, y: 0, ...patch }, { x: 1, y: 1 }] }])).toBeNull();
  }
});
it('bounds untrusted serialized geometry and removes unknown authority fields', () => {
  const shape = describeSymbolShape(rectangle())!;
  expect(readSymbolShape({ ...shape, confidence: 1, approved: true })).toEqual(shape);
  expect(readSymbolShape({ ...shape, lines: [[0, 0, Infinity, 1]] })).toBeUndefined();
  expect(readSymbolShape({ ...shape, lines: Array.from({ length: 100 }, () => [0, 0, 1, 1]) })).toBeUndefined();
  expect(readSymbolShape({ ...shape, version: 2 })).toBeUndefined();
});
