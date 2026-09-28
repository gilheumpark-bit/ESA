import { deduplicateLines, buildPageRelations } from '@/agent/drawing/evidence-deduplicator';
import { buildConductorAdjacency } from '@/agent/drawing/terminal-path-resolver';
import { buildRecommendations } from '@/agent/drawing/recommendation-engine';
import type { SymbolNode } from '@/agent/drawing/types-v3';
import type { RawLineHit } from '@/agent/drawing/evidence-deduplicator';

// Restored from the unmerged 2026-09-08 review of PR #71 (archived commit c048dd5).
const hit = (geometrySource: 'observed' | 'synthetic', offset = 0): RawLineHit => ({
  localId: geometrySource, lineKind: 'power', geometrySource,
  path: [{ x: offset, y: 0 }, { x: 300 + offset, y: 0 }],
  junctions: [], crossovers: [], confidence: .95, pageIndex: 0,
  regionId: 'full', certainty: 'confirmed',
});
const symbol = (id: string, x: number, type: string): SymbolNode => ({
  id, displayId: id, confirmedType: type, typeCandidates: [type], certainty: 'confirmed',
  ports: [{ x, y: 0 }], evidence: [{ evidenceId: id, pageIndex: 0,
    bounds: { x: x - 5, y: -10, w: 10, h: 10 }, confidence: .95 }],
});

test.each([0, .125])('observed and synthetic lines keep distinct stable IDs at offset %s', (offset) => {
  const inputs = [hit('observed', offset), hit('synthetic', offset)];
  const lines = deduplicateLines(inputs);
  expect(lines).toHaveLength(2);
  expect(new Set(lines.map((line) => line.id)).size).toBe(2);
  expect(buildConductorAdjacency(lines, .000001).size).toBe(2);
  expect(deduplicateLines([...inputs].reverse()).map((line) => line.id)).toEqual(lines.map((line) => line.id));
});

test('a breaker without ports on the line cannot be bypassed or reported as a missing protector', () => {
  // C touches the conductor only at its body boundary; without terminal evidence
  // that contact is an unmodelled device, not proof that A reaches B around it.
  const devices = [symbol('A', 0, 'source'), symbol('B', 300, 'load'),
    { ...symbol('C', 150, 'breaker'), ports: undefined }];
  const relations = buildPageRelations(devices, deduplicateLines([hit('observed')]), 0);
  expect(relations.filter((relation) => relation.terminalPath)).toHaveLength(0);
  expect(relations.some((relation) => relation.from === 'A' && relation.to === 'C')).toBe(true);
  expect(buildRecommendations({ symbols: devices, relations, calculations: [], unresolved: [], coverageComplete: true })
    .filter((item) => item.problem.includes('경로에 보호기') && item.status === 'SUPPORTED')).toHaveLength(0);
});
