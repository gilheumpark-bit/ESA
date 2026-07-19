/**
 * Endpoint Snapping — 벡터 파서(DXF/PDF)의 연결 끝점을 실제 노드에 결속한다.
 *
 * 문제: 파서가 컴포넌트는 `comp_N`으로, 선분 끝점은 `node_at_x_y` 합성 id로
 * 만들어 엣지가 어떤 노드도 참조하지 않았다. buildTopologyFromSLD는 컴포넌트만
 * 노드로 추가하므로 모든 엣지가 허공(dangling)이고 모든 컴포넌트가 고립됐다.
 *
 * 해법(순수 기하 — 전기적 수치를 지어내지 않는다):
 *  1) 각 끝점을 허용반경 내 최근접 앵커(컴포넌트)로 스냅.
 *  2) 반경 밖 끝점은 접점(junction)으로 승격 — 같은 좌표는 같은 접점으로 병합.
 *     (도면에서 선-선 접합부는 전기적으로 모선/접점이며 실재하는 노드다.)
 *  3) 스냅 후 자기루프(from===to)가 된 0길이 엣지는 제거.
 *
 * 좌표계 무관: 호출자가 앵커 좌표를 주입한다(DXF=raw 도면좌표, PDF=raw pt).
 * 허용반경 기본값은 전체 점군 bbox 대각선의 5% — 도면 단위에 자동 비례.
 */

import type { SLDConnection } from '@/lib/sld-recognition';

export interface SnapAnchor {
  id: string;
  x: number;
  y: number;
}

export interface JunctionPoint {
  id: string;
  x: number;
  y: number;
}

export interface SnapResult {
  connections: SLDConnection[];
  /** 승격된 접점 노드(호출자가 자기 좌표계로 SLDComponent를 만들어 추가) */
  junctions: JunctionPoint[];
  stats: { snapped: number; junctioned: number; droppedSelfLoops: number };
}

const NODE_AT = /^node_at_(-?[\d.]+)_(-?[\d.]+)$/;

function parseNodeAt(id: string): { x: number; y: number } | null {
  const m = id.match(NODE_AT);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/**
 * 끝점 좌표 → 합성 노드 id.
 *
 * 구현은 `Math.round(x)`로 정수 격자에 붙였다. 도면 단위가 미터라 좌표가
 * 0.3~0.9 범위였던 픽스처에서 모든 끝점이 0/1로 뭉개져 결선 재현율이 0%가 됐다
 * (L3-02 unit-meter 기준선). 격자 크기를 좌표계에 고정하면 어떤 값을 고르든
 * 어떤 축척에서는 틀린다 — 정밀도를 보존하고, 근접 끝점 병합은 아래
 * 허용반경 군집화에 맡긴다.
 */
export function formatEndpointId(p: { x: number; y: number }): string {
  const fmt = (v: number) => String(Number(v.toFixed(6)));
  return `node_at_${fmt(p.x)}_${fmt(p.y)}`;
}

/** bbox 대각선 5% (점군이 퇴화하면 1 — 어떤 단위계든 0 반경은 피한다) */
function defaultTolerance(points: Array<{ x: number; y: number }>): number {
  if (points.length === 0) return 1;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY);
  return diag > 0 ? diag * 0.05 : 1;
}

export function snapConnectionEndpoints(
  anchors: SnapAnchor[],
  connections: SLDConnection[],
  options?: { tolerance?: number },
): SnapResult {
  // 끝점 좌표 수집(허용반경 산정에 앵커와 함께 사용)
  const endpointCoords: Array<{ x: number; y: number }> = [];
  for (const conn of connections) {
    const f = parseNodeAt(conn.from);
    const t = parseNodeAt(conn.to);
    if (f) endpointCoords.push(f);
    if (t) endpointCoords.push(t);
  }
  const tolerance =
    options?.tolerance ?? defaultTolerance([...anchors, ...endpointCoords]);

  const junctionByKey = new Map<string, JunctionPoint>();
  let snapped = 0;
  let junctioned = 0;

  const resolve = (endpointId: string): string => {
    const coords = parseNodeAt(endpointId);
    if (!coords) return endpointId; // 이미 comp id 등 실노드 — 그대로

    // 최근접 앵커
    let best: SnapAnchor | null = null;
    let bestDist = Infinity;
    for (const a of anchors) {
      const d = Math.hypot(a.x - coords.x, a.y - coords.y);
      if (d < bestDist) {
        bestDist = d;
        best = a;
      }
    }
    if (best && bestDist <= tolerance) {
      snapped += 1;
      return best.id;
    }

    // 접점 승격 — 같은 자리의 끝점들은 같은 노드.
    // 정확히 일치하는 좌표만 병합하면 부동소수 오차·미세 어긋남이 각각 별개
    // 접점이 된다. 허용반경 내 기존 접점이 있으면 그쪽으로 흡수한다.
    for (const existing of junctionByKey.values()) {
      if (Math.hypot(existing.x - coords.x, existing.y - coords.y) <= tolerance) {
        return existing.id;
      }
    }
    const key = `${coords.x}_${coords.y}`;
    const junction: JunctionPoint = { id: `junction_${key}`, x: coords.x, y: coords.y };
    junctionByKey.set(key, junction);
    junctioned += 1;
    return junction.id;
  };

  const out: SLDConnection[] = [];
  let droppedSelfLoops = 0;
  for (const conn of connections) {
    const from = resolve(conn.from);
    const to = resolve(conn.to);
    if (from === to) {
      droppedSelfLoops += 1; // 스냅으로 양끝이 같은 노드가 된 잔선(치수선 등)
      continue;
    }
    out.push({ ...conn, from, to });
  }

  return {
    connections: out,
    junctions: [...junctionByKey.values()],
    stats: { snapped, junctioned, droppedSelfLoops },
  };
}

// IDENTITY_SEAL: topology/endpoint-snap | role=파서 끝점→실노드 결속(스냅·접점 승격·자기루프 제거) | inputs=anchors+connections | outputs=SnapResult
