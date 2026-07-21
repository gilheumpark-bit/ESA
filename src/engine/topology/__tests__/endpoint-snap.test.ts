/**
 * endpoint-snap — 파서 끝점 결속 회귀 테스트.
 * 결함: comp_N ↔ node_at_x_y 불일치로 모든 엣지가 허공, 모든 컴포넌트 고립.
 */

import { snapConnectionEndpoints } from '../endpoint-snap';
import { buildTopologyFromSLD } from '../topology-graph';
import type { SLDAnalysis, SLDComponent, SLDConnection } from '@/lib/sld-recognition';

const comp = (id: string, x: number, y: number): SLDComponent => ({
  id, type: 'breaker', label: id, position: { x, y },
});
const conn = (id: string, from: string, to: string): SLDConnection => ({
  id, from, to, length: '1m', conductorSize: undefined, cableType: undefined,
});

describe('snapConnectionEndpoints', () => {
  test('허용반경 내 끝점은 컴포넌트로 스냅된다', () => {
    const r = snapConnectionEndpoints(
      [{ id: 'comp_1', x: 0, y: 0 }, { id: 'comp_2', x: 100, y: 0 }],
      [conn('c1', 'node_at_2_1', 'node_at_98_0')],
    );
    expect(r.connections[0].from).toBe('comp_1');
    expect(r.connections[0].to).toBe('comp_2');
    expect(r.stats.snapped).toBe(2);
    expect(r.junctions).toHaveLength(0);
  });

  test('반경 밖 끝점은 접점으로 승격되고 같은 좌표는 병합된다', () => {
    const r = snapConnectionEndpoints(
      [{ id: 'comp_1', x: 0, y: 0 }],
      [
        conn('c1', 'node_at_0_0', 'node_at_500_500'),
        conn('c2', 'node_at_500_500', 'node_at_1000_0'),
      ],
    );
    // 500,500은 두 엣지에서 같은 접점 하나로
    const junctionIds = r.junctions.map((j) => j.id);
    expect(junctionIds).toContain('junction_500_500');
    expect(r.connections[0].to).toBe('junction_500_500');
    expect(r.connections[1].from).toBe('junction_500_500');
    // 접점 수: 500_500, 1000_0 = 2
    expect(r.junctions).toHaveLength(2);
  });

  test('스냅으로 자기루프가 된 잔선은 제거된다', () => {
    const r = snapConnectionEndpoints(
      [{ id: 'comp_1', x: 0, y: 0 }],
      [conn('c1', 'node_at_1_0', 'node_at_0_1')], // 양끝 모두 comp_1로 스냅
      { tolerance: 2 }, // 점군이 퇴화(3점)라 자동반경이 무의미 — 명시 지정
    );
    expect(r.connections).toHaveLength(0);
    expect(r.stats.droppedSelfLoops).toBe(1);
  });

  test('이미 실노드 id인 끝점은 건드리지 않는다', () => {
    const r = snapConnectionEndpoints(
      [{ id: 'comp_1', x: 0, y: 0 }],
      [conn('c1', 'comp_1', 'node_at_900_900')],
    );
    expect(r.connections[0].from).toBe('comp_1');
    expect(r.connections[0].to).toBe('junction_900_900');
  });

  test('통합: 스냅+접점 승격 후 그래프에 허공 엣지·전면 고립이 없다', () => {
    const components = [comp('comp_1', 0, 0), comp('comp_2', 100, 0)];
    const raw: SLDConnection[] = [
      conn('c1', 'node_at_1_1', 'node_at_50_0'),   // comp_1 ↔ 접점
      conn('c2', 'node_at_50_0', 'node_at_99_1'),  // 접점 ↔ comp_2
    ];
    const r = snapConnectionEndpoints(
      components.map((c) => ({ id: c.id, x: c.position.x, y: c.position.y })),
      raw,
    );
    const all: SLDComponent[] = [
      ...components,
      ...r.junctions.map((j) => ({
        id: j.id, type: 'bus' as const, label: 'junction', position: { x: j.x, y: j.y },
      })),
    ];
    const sld = {
      components: all,
      connections: r.connections,
      suggestedCalculations: [],
      confidence: 1,
      rawDescription: 'test',
    } as unknown as SLDAnalysis;

    const graph = buildTopologyFromSLD(sld);
    const nodeIds = new Set(all.map((c) => c.id));
    for (const c of r.connections) {
      expect(nodeIds.has(c.from)).toBe(true); // 허공 참조 0
      expect(nodeIds.has(c.to)).toBe(true);
    }
    // comp_1 → comp_2 경로가 실제로 이어진다 (구현 전엔 전 노드 고립이라 불가능)
    const validation = graph.validate();
    const isolatedCount = validation.issues.filter((i: { type: string }) => i.type === 'ISOLATED_NODE').length;
    expect(isolatedCount).toBe(0);
  });
});
