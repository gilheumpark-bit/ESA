import { describeSymbolShape, compareSymbolShapes, shapeTopology } from '../symbol-shape';
import { normalizeSymbolLines } from '../symbol-line-normalization';
import { rectangle, classifierLibrary, classificationDxf } from '@/engine/topology/test-support/symbol-classification-fixture';
import { fingerprintBlock } from '@/engine/topology/symbol-library';
import { parseDxfToSLD } from '@/engine/topology/dxf-parser';

function splitRectangle() {
  return [
    { type: 'LINE', startPoint: { x: 0, y: 0 }, endPoint: { x: 10, y: 0 } },
    { type: 'LINE', startPoint: { x: 10, y: 0 }, endPoint: { x: 20, y: 0 } },
    ...rectangle().slice(1),
  ];
}
it('accepts a line split without changing either original descriptor or exact fingerprint', () => {
  const original = describeSymbolShape(rectangle())!, split = describeSymbolShape(splitRectangle())!;
  const before = JSON.stringify(split);
  expect(split.lines).toHaveLength(5); expect(normalizeSymbolLines(split).lines).toHaveLength(4);
  expect(shapeTopology(original)).toBe(shapeTopology(split));
  expect(compareSymbolShapes(original, split).score).toBe(1);
  expect(fingerprintBlock(rectangle())).not.toBe(fingerprintBlock(splitRectangle()));
  expect(JSON.stringify(split)).toBe(before);
});
it('does not delete a real branch or T-junction', () => {
  const branched = describeSymbolShape([...splitRectangle(), { type: 'LINE', startPoint: { x: 10, y: 0 }, endPoint: { x: 10, y: 5 } }])!;
  expect(normalizeSymbolLines(branched).lines).toHaveLength(6);
  expect(compareSymbolShapes(describeSymbolShape(rectangle())!, branched).score).toBe(0);
});
it('does not erase a crossing at a proposed merged endpoint', () => {
  const shape = describeSymbolShape([...splitRectangle(), { type: 'LINE', startPoint: { x: 10, y: -5 }, endPoint: { x: 10, y: 5 } }])!;
  expect(normalizeSymbolLines(shape).lines).toHaveLength(6);
});
it('preserves a curve contact at the proposed join', () => {
  const shape = describeSymbolShape([...splitRectangle(), { type: 'CIRCLE', center: { x: 10, y: 5 }, radius: 5 }])!;
  expect(normalizeSymbolLines(shape).lines).toHaveLength(5);
});
it('does not close small gaps or straighten bends', () => {
  const gap = splitRectangle(); gap[1].startPoint.x += 0.01;
  const bend = splitRectangle(); bend[0].endPoint.y = 0.01; bend[1].startPoint.y = 0.01;
  for (const entities of [gap, bend]) expect(normalizeSymbolLines(describeSymbolShape(entities)!).lines).toHaveLength(5);
});
it('does not deduplicate overlapping strokes as though they were contiguous', () => {
  const shape = describeSymbolShape([...rectangle(), rectangle()[0]])!;
  expect(normalizeSymbolLines(shape).lines).toHaveLength(5);
});
it('is invariant to segment order and endpoint orientation', () => {
  const source = splitRectangle(), shuffled = source.reverse().map((line) => ({ ...line, startPoint: line.endPoint, endPoint: line.startPoint }));
  expect(normalizeSymbolLines(describeSymbolShape(shuffled)!)).toEqual(normalizeSymbolLines(describeSymbolShape(splitRectangle())!));
});
it('unifies a long chain of degree-two vertices without accumulating changes', () => {
  const entities = Array.from({ length: 40 }, (_, i) => ({ type: 'LINE', startPoint: { x: i, y: 0 }, endPoint: { x: i + 1, y: 0 } }));
  const normalized = normalizeSymbolLines(describeSymbolShape(entities)!);
  expect(normalized.lines).toHaveLength(1); expect(normalizeSymbolLines(normalized)).toEqual(normalized);
});
it('actual DXF repeat inference survives representation-only line splitting', () => {
  const source = classificationDxf();
  const needle = '0\nLINE\n8\n0\n10\n0\n20\n0\n11\n20.2\n21\n0\n';
  expect(source).toContain(needle);
  const split = source.replace(needle,
    '0\nLINE\n8\n0\n10\n0\n20\n0\n11\n10.1\n21\n0\n0\nLINE\n8\n0\n10\n10.1\n20\n0\n11\n20.2\n21\n0\n');
  const result = parseDxfToSLD(split, { symbolLibrary: classifierLibrary() });
  const candidate = result.components.find((item) => item.properties?.blockName === 'ZZ-B92')!;
  expect(candidate.type).toBe('unknown');
  expect(candidate.classification).toMatchObject({ selectedType: 'breaker', status: 'classified', method: 'family-context' });
  expect(candidate.rating).toBeUndefined(); expect(result.classificationStats?.additionalModelCalls).toBe(0);
});
