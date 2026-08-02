/**
 * ESVA Topology Graph — SLD를 순회 가능한 방향 그래프로 변환
 * ─────────────────────────────────────────────────────────────
 * VLM이 추출한 플랫 배열(components/connections)을 인접 리스트 그래프로 변환.
 * BFS 경로 탐색, 상류/하류 추적, 계산 파라미터 자동 추출.
 *
 * PART 1: SLD 출력 → 그래프 변환
 * PART 2: 경로 탐색 (BFS)
 * PART 3: 상류/하류 추적
 * PART 4: 계산 파라미터 추출
 * PART 5: 그래프 검증
 */

import type { SLDAnalysis, SLDComponent, SLDConnection } from '@/lib/sld-recognition';
import type {
  TopologyNode,
  TopologyEdge,
  TopologyPath,
  CalcParams,
  ValidationResult,
  ValidationIssue,
} from './types';

// =========================================================================
// PART 1 — Graph Class
// =========================================================================

export class TopologyGraph {
  private nodes: Map<string, TopologyNode> = new Map();
  private edges: Map<string, TopologyEdge> = new Map();
  /** 인접 리스트: nodeId → [{ edgeId, targetNodeId }] */
  private adjacency: Map<string, Array<{ edgeId: string; target: string }>> = new Map();
  /** 역방향 인접 리스트 (상류 추적용) */
  private reverseAdj: Map<string, Array<{ edgeId: string; source: string }>> = new Map();

  // ── Node/Edge 추가 ──

  addNode(component: SLDComponent): void {
    const node: TopologyNode = {
      id: component.id,
      type: component.type,
      label: component.label ?? component.type,
      ratingValue: parseFloat(component.rating ?? '') || undefined,
      ratingUnit: extractUnit(component.rating),
      voltage: parseFloat(component.voltage ?? '') || undefined,
      current: parseFloat(component.current ?? '') || undefined,
      raw: component,
    };
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) this.adjacency.set(node.id, []);
    if (!this.reverseAdj.has(node.id)) this.reverseAdj.set(node.id, []);
  }

  addEdge(connection: SLDConnection): void {
    const edge: TopologyEdge = {
      id: connection.id,
      from: connection.from,
      to: connection.to,
      cableType: connection.cableType ?? undefined,
      length: parseFloat(connection.length ?? '') || undefined,
      conductorSize: parseFloat(connection.conductorSize ?? '') || undefined,
      raw: connection,
    };
    this.edges.set(edge.id, edge);

    // 순방향
    if (!this.adjacency.has(edge.from)) this.adjacency.set(edge.from, []);
    this.adjacency.get(edge.from)!.push({ edgeId: edge.id, target: edge.to });

    // 역방향
    if (!this.reverseAdj.has(edge.to)) this.reverseAdj.set(edge.to, []);
    this.reverseAdj.get(edge.to)!.push({ edgeId: edge.id, source: edge.from });
  }

  // ── Getters ──

  getNode(id: string): TopologyNode | undefined {
    return this.nodes.get(id);
  }

  getEdge(id: string): TopologyEdge | undefined {
    return this.edges.get(id);
  }

  getAllNodes(): TopologyNode[] {
    return Array.from(this.nodes.values());
  }

  getAllEdges(): TopologyEdge[] {
    return Array.from(this.edges.values());
  }

  // =========================================================================
  // PART 2 — BFS 경로 탐색
  // =========================================================================

  /**
   * BFS로 from → to 최단 경로를 찾는다.
   * 경로상의 노드/간선/총거리를 반환.
   */
  findPath(from: string, to: string): TopologyPath | null {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return null;
    if (from === to) {
      const node = this.nodes.get(from)!;
      return { nodes: [node], edges: [], totalLength: 0 };
    }

    // BFS
    const visited = new Set<string>();
    const parent = new Map<string, { nodeId: string; edgeId: string }>();
    const queue: string[] = [from];
    visited.add(from);

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const { edgeId, target } of this.adjacency.get(current) ?? []) {
        if (visited.has(target)) continue;
        visited.add(target);
        parent.set(target, { nodeId: current, edgeId });
        if (target === to) break;
        queue.push(target);
      }

      if (parent.has(to)) break;
    }

    if (!parent.has(to)) return null;

    // 경로 복원
    const pathNodes: TopologyNode[] = [];
    const pathEdges: TopologyEdge[] = [];
    let current = to;

    while (current !== from) {
      const p = parent.get(current)!;
      pathNodes.unshift(this.nodes.get(current)!);
      pathEdges.unshift(this.edges.get(p.edgeId)!);
      current = p.nodeId;
    }
    pathNodes.unshift(this.nodes.get(from)!);

    const totalLength = pathEdges.reduce((sum, e) => sum + (e.length ?? 0), 0);

    return { nodes: pathNodes, edges: pathEdges, totalLength };
  }

  // =========================================================================
  // PART 3 — 상류/하류 추적
  // =========================================================================

  /** 전원측 역추적 (부하 → 전원) */
  getUpstream(nodeId: string): TopologyNode[] {
    return this.bfsDirection(nodeId, 'reverse');
  }

  /** 부하측 순추적 (전원 → 부하) */
  getDownstream(nodeId: string): TopologyNode[] {
    return this.bfsDirection(nodeId, 'forward');
  }

  private bfsDirection(startId: string, direction: 'forward' | 'reverse'): TopologyNode[] {
    const result: TopologyNode[] = [];
    const visited = new Set<string>();
    const queue: string[] = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = direction === 'forward'
        ? (this.adjacency.get(current) ?? []).map(n => n.target)
        : (this.reverseAdj.get(current) ?? []).map(n => n.source);

      for (const next of neighbors) {
        if (visited.has(next)) continue;
        visited.add(next);
        const node = this.nodes.get(next);
        if (node) result.push(node);
        queue.push(next);
      }
    }

    return result;
  }

  // =========================================================================
  // PART 4 — 계산 파라미터 자동 추출
  // =========================================================================

  /**
   * 경로에서 계산기에 바로 대입할 수 있는 파라미터를 추출한다.
   * 이 값이 KEC 쿼리 엔진 + 계산기 엔진에 그대로 들어간다.
   */
  extractCalcParams(path: TopologyPath): CalcParams {
    const cableSizes = path.edges
      .map(e => e.conductorSize)
      .filter((s): s is number => s !== undefined && s > 0);

    const cableTypes = [...new Set(
      path.edges
        .map(e => e.cableType)
        .filter((t): t is string => t !== undefined),
    )];

    // 종단 노드의 부하 정보
    const endNode = path.nodes[path.nodes.length - 1];
    let loadPower: number | null = null;
    if (endNode?.ratingValue && endNode.ratingUnit) {
      if (endNode.ratingUnit === 'kW') loadPower = endNode.ratingValue;
      if (endNode.ratingUnit === 'kVA') loadPower = endNode.ratingValue * 0.8; // 역률 0.8 추정
      if (endNode.ratingUnit === 'HP') loadPower = endNode.ratingValue * 0.746;
    }

    // 시작 노드의 전압 정보
    const startNode = path.nodes[0];
    let voltage: number | null = startNode?.voltage ?? null;
    if (!voltage && startNode?.raw.voltage) {
      const v = parseFloat(startNode.raw.voltage);
      if (v > 100) voltage = v; // kV 단위인 경우
    }

    // 상 수 추정
    let phases: 1 | 3 | null = null;
    for (const node of path.nodes) {
      const props = node.raw.properties ?? {};
      const phaseStr = (props['phase'] ?? props['phases'] ?? '').toString();
      if (phaseStr.includes('3') || phaseStr.includes('삼상')) { phases = 3; break; }
      if (phaseStr.includes('1') || phaseStr.includes('단상')) { phases = 1; break; }
    }

    return {
      totalLength_m: path.totalLength,
      minCableSize_sq: cableSizes.length > 0 ? Math.min(...cableSizes) : null,
      loadPower_kW: loadPower,
      voltage_V: voltage,
      phases,
      cableTypes,
      pathNodeIds: path.nodes.map(n => n.id),
    };
  }

  // =========================================================================
  // PART 5 — 그래프 검증
  // =========================================================================

  /** 그래프 구조 무결성 검증 */
  validate(): ValidationResult {
    const issues: ValidationIssue[] = [];

    // 고립 노드 검사
    const connectedNodes = new Set<string>();
    for (const edge of this.edges.values()) {
      connectedNodes.add(edge.from);
      connectedNodes.add(edge.to);
    }
    for (const nodeId of this.nodes.keys()) {
      if (!connectedNodes.has(nodeId) && this.nodes.size > 1) {
        issues.push({ type: 'ISOLATED_NODE', nodeId, message: `노드 "${nodeId}"가 어떤 간선에도 연결되지 않았습니다.` });
      }
    }

    // 존재하지 않는 노드를 참조하는 간선
    for (const edge of this.edges.values()) {
      if (!this.nodes.has(edge.from)) {
        issues.push({ type: 'MISSING_EDGE_TARGET', edgeId: edge.id, message: `간선 "${edge.id}"의 출발 노드 "${edge.from}"를 찾을 수 없습니다.` });
      }
      if (!this.nodes.has(edge.to)) {
        issues.push({ type: 'MISSING_EDGE_TARGET', edgeId: edge.id, message: `간선 "${edge.id}"의 도착 노드 "${edge.to}"를 찾을 수 없습니다.` });
      }
    }

    // 차단기·개폐기·퓨즈는 선로 중간의 2단자 기기다. 한쪽 간선만 있으면
    // 구획 경계 절단 또는 VLM 연결 누락일 가능성이 높아 정상 회로로 확정하지 않는다.
    for (const node of this.nodes.values()) {
      if (!['breaker', 'switch', 'fuse'].includes(node.type)) continue;
      const incidentEdgeIds = new Set([
        ...(this.adjacency.get(node.id) ?? []).map(({ edgeId }) => edgeId),
        ...(this.reverseAdj.get(node.id) ?? []).map(({ edgeId }) => edgeId),
      ]);
      if (incidentEdgeIds.size < 2) {
        issues.push({
          type: 'DANGLING_INLINE_DEVICE',
          nodeId: node.id,
          message: `인라인 기기 "${node.label}"의 연결이 ${incidentEdgeIds.size}개뿐입니다. 양쪽 선로 또는 구획 경계 연계를 확인하세요.`,
        });
      }

      // VLM이 기호 양쪽 선분을 별도 간선으로 만들면서, 한 번 인쇄된 MW/MVAR를
      // 양쪽에 복제하는 경우가 있다. 같은 인라인 기기를 공유하는 간선에서만
      // 잡아 서로 다른 동률 피더를 중복으로 오인하지 않는다.
      const measurements = new Map<string, string[]>();
      for (const edgeId of incidentEdgeIds) {
        const edge = this.edges.get(edgeId);
        const active = edge?.raw.activePower?.replace(/\s+/g, '').toUpperCase();
        const reactive = edge?.raw.reactivePower?.replace(/\s+/g, '').toUpperCase();
        if (!active || !reactive) continue;
        const key = `${active}|${reactive}`;
        measurements.set(key, [...(measurements.get(key) ?? []), edgeId]);
      }
      for (const [measurement, edgeIds] of measurements) {
        if (edgeIds.length < 2) continue;
        issues.push({
          type: 'DUPLICATE_FLOW_MEASUREMENT',
          nodeId: node.id,
          edgeId: edgeIds[1],
          message: `전력 흐름 "${measurement}"이(가) 인라인 기기 "${node.label}" 양쪽 간선에 중복 배치됐습니다. 원도면 표기 위치를 확인하세요.`,
        });
      }
    }

    // 정격 누락 검사 (부하 노드)
    for (const node of this.nodes.values()) {
      if (['motor', 'load', 'ups'].includes(node.type) && !node.ratingValue) {
        issues.push({ type: 'MISSING_RATING', nodeId: node.id, message: `부하 노드 "${node.label}"의 정격이 누락되었습니다.` });
      }
    }

    // 연결 컴포넌트 수 (BFS)
    const visitedAll = new Set<string>();
    let componentCount = 0;
    for (const nodeId of this.nodes.keys()) {
      if (visitedAll.has(nodeId)) continue;
      componentCount++;
      const queue = [nodeId];
      visitedAll.add(nodeId);
      while (queue.length > 0) {
        const curr = queue.shift()!;
        for (const { target } of this.adjacency.get(curr) ?? []) {
          if (!visitedAll.has(target)) { visitedAll.add(target); queue.push(target); }
        }
        for (const { source } of this.reverseAdj.get(curr) ?? []) {
          if (!visitedAll.has(source)) { visitedAll.add(source); queue.push(source); }
        }
      }
    }

    const isolatedCount = this.nodes.size - connectedNodes.size;

    return {
      valid: issues.length === 0,
      issues,
      stats: {
        nodeCount: this.nodes.size,
        edgeCount: this.edges.size,
        isolatedNodes: isolatedCount > 0 ? isolatedCount : 0,
        connectedComponents: componentCount,
      },
    };
  }
}

// =========================================================================
// Factory — SLD 분석 결과 → TopologyGraph 변환
// =========================================================================

/** SLDAnalysis(VLM 출력)를 TopologyGraph로 변환 */
export function buildTopologyFromSLD(sld: SLDAnalysis): TopologyGraph {
  const graph = new TopologyGraph();
  // annotation은 도면에서 읽어 보존할 문자 근거이지 전기 노드가 아니다.
  // 그래프에 넣으면 더 많은 문자를 정확히 읽은 모델일수록 고립 노드와
  // connectedComponents 수가 늘어나는 역방향 판정이 된다.
  const annotationIds = new Set(
    sld.components
      .filter((component) => component.type === 'annotation')
      .map((component) => component.id),
  );
  for (const comp of sld.components) {
    if (!annotationIds.has(comp.id)) graph.addNode(comp);
  }
  for (const conn of sld.connections) {
    if (!annotationIds.has(conn.from) && !annotationIds.has(conn.to)) graph.addEdge(conn);
  }
  return graph;
}

// ── Helpers ──

function extractUnit(rating?: string | null): string | undefined {
  if (!rating) return undefined;
  const match = rating.match(/(kVA|kW|kV|V|A|kA|HP|MVA|MW)/i);
  return match ? match[1] : undefined;
}
