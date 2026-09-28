import { createHash } from 'node:crypto';
import { deduplicateLines, buildPageRelations } from '@/agent/drawing/evidence-deduplicator';
import { buildConductorAdjacency } from '@/agent/drawing/terminal-path-resolver';
import { buildRecommendations } from '@/agent/drawing/recommendation-engine';
import type { SymbolNode } from '@/agent/drawing/types-v3';
import type { RawLineHit } from '@/agent/drawing/evidence-deduplicator';

// Restored from the unmerged 2026-09-08 review of PR #71 (archived commit
// c048dd5) and extended with the cases an adversarial review found open.
type Point = { x: number; y: number };
type EvidenceBounds = SymbolNode['evidence'][number]['bounds'];
const hit = (path: Point[], geometrySource: 'observed' | 'synthetic' = 'observed', localId: string = geometrySource): RawLineHit => ({
  localId, lineKind: 'power', geometrySource, path,
  junctions: [], crossovers: [], confidence: .95, pageIndex: 0,
  regionId: 'full', certainty: 'confirmed',
});
const device = (id: string, type: string, ports: Point[] | undefined, boxes: EvidenceBounds[],
  certainty: SymbolNode['certainty'] = 'confirmed'): SymbolNode => ({
  id, displayId: id, confirmedType: certainty === 'confirmed' ? type : undefined, typeCandidates: [type], certainty,
  ...(ports ? { ports } : {}),
  evidence: boxes.map((bounds, index) => ({ evidenceId: `${id}-${index}`, pageIndex: 0, bounds, confidence: .95 })),
});
const recommendationsFor = (devices: SymbolNode[], raw: RawLineHit[]) => {
  const relations = buildPageRelations(devices, deduplicateLines(raw), 0);
  return { relations, recommendations: buildRecommendations({
    symbols: devices, relations, calculations: [], unresolved: [], coverageComplete: true }) };
};
const missingProtector = (recommendations: ReturnType<typeof buildRecommendations>) =>
  recommendations.filter((item) => item.problem.includes('경로에 보호기') && item.status === 'SUPPORTED');

describe('line identity', () => {
  test.each([0, .125])('observed and synthetic lines on one path keep distinct stable IDs at offset %s', (offset) => {
    const path = [{ x: offset, y: 0 }, { x: 300 + offset, y: 0 }];
    const inputs = [hit(path, 'observed'), hit(path, 'synthetic')];
    const lines = deduplicateLines(inputs);
    expect(lines).toHaveLength(2);
    expect(new Set(lines.map((line) => line.id)).size).toBe(2);
    expect(buildConductorAdjacency(lines, .000001).size).toBe(2);
    expect(deduplicateLines([...inputs].reverse()).map((line) => line.id)).toEqual(lines.map((line) => line.id));
  });

  test('observed line IDs keep their previous rounded form', () => {
    const [line] = deduplicateLines([hit([{ x: 0.2, y: 0 }, { x: 299.7, y: 0.4 }])]);
    const previous = `line-${createHash('sha256').update(['0', 'power', '0,0;300,0'].join('|')).digest('hex').slice(0, 16)}`;
    expect(line.id).toBe(previous);
  });
});

describe('portless devices on a confirmed conductor', () => {
  const source = device('A', 'source', [{ x: 0, y: 0 }], [{ x: -5, y: -10, w: 10, h: 10 }]);
  const load = device('B', 'load', [{ x: 300, y: 0 }], [{ x: 295, y: -10, w: 10, h: 10 }]);
  const line = hit([{ x: 0, y: 0 }, { x: 300, y: 0 }]);

  test.each([0, .25, 1, 2])('a breaker %spx from the line cannot be bypassed or reported missing', (gap) => {
    const breaker = device('C', 'breaker', undefined, [{ x: 145, y: -10 - gap, w: 10, h: 10 }]);
    const { relations, recommendations } = recommendationsFor([source, load, breaker], [line]);
    expect(relations.filter((relation) => relation.terminalPath)).toHaveLength(0);
    expect(relations.some((relation) => relation.from === 'A' && relation.to === 'C')).toBe(true);
    expect(missingProtector(recommendations)).toHaveLength(0);
  });

  test.each([0, 1, 2])('the same holds on a vertical conductor with a %spx gap', (gap) => {
    const top = device('A', 'source', [{ x: 0, y: 0 }], [{ x: -5, y: -10, w: 10, h: 10 }]);
    const bottom = device('B', 'load', [{ x: 0, y: 300 }], [{ x: -5, y: 300, w: 10, h: 10 }]);
    const breaker = device('C', 'breaker', undefined, [{ x: gap, y: 145, w: 10, h: 10 }]);
    const { relations, recommendations } = recommendationsFor([top, bottom, breaker], [hit([{ x: 0, y: 0 }, { x: 0, y: 300 }])]);
    expect(relations.filter((relation) => relation.terminalPath)).toHaveLength(0);
    expect(missingProtector(recommendations)).toHaveLength(0);
  });

  test('any evidence box that touches the line blocks the proof, not only the largest', () => {
    const breaker = device('C', 'breaker', undefined, [
      { x: 145, y: -10, w: 10, h: 10 },
      { x: 120, y: -80, w: 60, h: 60 },
    ]);
    const { relations, recommendations } = recommendationsFor([source, load, breaker], [line]);
    expect(relations.filter((relation) => relation.terminalPath)).toHaveLength(0);
    expect(missingProtector(recommendations)).toHaveLength(0);
  });

  test('a device beyond the contact tolerance is neither attached nor an obstacle', () => {
    const breaker = device('C', 'breaker', undefined, [{ x: 145, y: -13, w: 10, h: 10 }]);
    const { relations } = recommendationsFor([source, load, breaker], [line]);
    expect(relations.some((relation) => relation.from === 'C' || relation.to === 'C')).toBe(false);
    expect(relations.filter((relation) => relation.terminalPath).map((relation) => `${relation.from}->${relation.to}`)).toEqual(['A->B']);
  });

  test('an ambiguous portless mark makes the connection uncertain, not an orphan finding', () => {
    const mark = device('X', 'unknown mark', undefined, [{ x: 200, y: 0, w: 8, h: 8 }], 'ambiguous');
    const { recommendations } = recommendationsFor([source, load, mark],
      [hit([{ x: 0, y: 0 }, { x: 150, y: 0 }], 'observed', 'left'), hit([{ x: 150, y: 0 }, { x: 300, y: 0 }], 'observed', 'right')]);
    const orphan = recommendations.filter((item) => item.problem.includes('고아 장치'));
    expect(orphan.filter((item) => item.status === 'SUPPORTED')).toHaveLength(0);
    expect(orphan.flatMap((item) => item.requiredInputs)).toContain('미확정 결선 확인: A, B');
  });

  test('a portless single-feeder busbar keeps the feeder connected', () => {
    const devices = [
      device('TR1', 'source', [{ x: 100, y: 100 }], [{ x: 90, y: 80, w: 20, h: 20 }]),
      device('BUS1', 'busbar', undefined, [{ x: 50, y: 197, w: 350, h: 6 }]),
      device('Q1', 'breaker', [{ x: 300, y: 300 }, { x: 300, y: 340 }], [{ x: 290, y: 300, w: 20, h: 40 }]),
      device('M1', 'motor', [{ x: 300, y: 500 }], [{ x: 290, y: 500, w: 20, h: 20 }]),
    ];
    const bar = { ...hit([{ x: 50, y: 200 }, { x: 400, y: 200 }], 'observed', 'bar'), lineKind: 'bus' as const };
    const { relations, recommendations } = recommendationsFor(devices, [
      hit([{ x: 100, y: 100 }, { x: 100, y: 200 }], 'observed', 'drop'), bar,
      hit([{ x: 300, y: 200 }, { x: 300, y: 300 }], 'observed', 'feeder'),
      hit([{ x: 300, y: 340 }, { x: 300, y: 500 }], 'observed', 'cable'),
    ]);
    expect(relations.filter((relation) => relation.certainty === 'confirmed').map((relation) => `${relation.from}->${relation.to}`))
      .toEqual(expect.arrayContaining(['TR1->BUS1', 'BUS1->Q1', 'Q1->M1']));
    expect(recommendations.filter((item) => item.status === 'SUPPORTED')).toHaveLength(0);
  });
});
