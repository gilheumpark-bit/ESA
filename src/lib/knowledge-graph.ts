/**
 * Knowledge Graph — Electrical Engineering Concept Network
 *
 * In-memory graph (MVP) for concept relationships, standard cross-references,
 * and calculator discovery. Future: migrate to Neo4j or similar.
 *
 * PART 1: Types
 * PART 2: KnowledgeGraph class
 * PART 3: Pre-built core graph (~100 nodes)
 * PART 4: Public API helpers
 */

// ---------------------------------------------------------------------------
// PART 1 -- Types
// ---------------------------------------------------------------------------

export type NodeType = 'concept' | 'standard' | 'calculator' | 'document';

export type EdgeType =
  | 'RELATED_TO'
  | 'GOVERNED_BY'
  | 'EQUIVALENT_TO'
  | 'REQUIRES'
  | 'USED_IN';

export interface KGNode {
  id: string;
  type: NodeType;
  name_ko: string;
  name_en: string;
  properties?: Record<string, string | number | boolean>;
}

export interface KGEdge {
  from: string;
  to: string;
  type: EdgeType;
  weight: number;
}

export interface PathResult {
  path: string[];
  totalWeight: number;
}

// ---------------------------------------------------------------------------
// PART 2 -- KnowledgeGraph class
// ---------------------------------------------------------------------------

export class KnowledgeGraph {
  private nodes = new Map<string, KGNode>();
  private edges: KGEdge[] = [];
  /** Adjacency list: nodeId -> [{ to, type, weight }] */
  private adjacency = new Map<string, Array<{ to: string; type: EdgeType; weight: number }>>();

  // --- Mutation ---

  addNode(node: KGNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, []);
    }
  }

  addEdge(edge: KGEdge): void {
    this.edges.push(edge);
    // 양방향 연결
    if (!this.adjacency.has(edge.from)) this.adjacency.set(edge.from, []);
    if (!this.adjacency.has(edge.to)) this.adjacency.set(edge.to, []);
    this.adjacency.get(edge.from)!.push({ to: edge.to, type: edge.type, weight: edge.weight });
    this.adjacency.get(edge.to)!.push({ to: edge.from, type: edge.type, weight: edge.weight });
  }

  // --- Query ---

  getNode(id: string): KGNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): KGNode[] {
    return Array.from(this.nodes.values());
  }

  getNodesByType(type: NodeType): KGNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.type === type);
  }

  /**
   * Find nodes related to the given node within a certain depth (BFS).
   */
  findRelated(nodeId: string, depth: number = 2): KGNode[] {
    const visited = new Set<string>();
    const queue: Array<{ id: string; d: number }> = [{ id: nodeId, d: 0 }];
    visited.add(nodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.d >= depth) continue;

      const neighbors = this.adjacency.get(current.id) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.to)) {
          visited.add(neighbor.to);
          queue.push({ id: neighbor.to, d: current.d + 1 });
        }
      }
    }

    visited.delete(nodeId); // 자기 자신 제외
    return Array.from(visited)
      .map((id) => this.nodes.get(id))
      .filter((n): n is KGNode => n !== undefined);
  }

  /**
   * Find shortest path between two nodes (BFS, unweighted).
   */
  findPath(from: string, to: string): PathResult | null {
    if (from === to) return { path: [from], totalWeight: 0 };
    if (!this.nodes.has(from) || !this.nodes.has(to)) return null;

    const visited = new Set<string>();
    const parent = new Map<string, string>();
    const queue: string[] = [from];
    visited.add(from);

    while (queue.length > 0) {
      const current = queue.shift()!;

      const neighbors = this.adjacency.get(current) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.to)) {
          visited.add(neighbor.to);
          parent.set(neighbor.to, current);
          if (neighbor.to === to) {
            // 경로 역추적
            const path: string[] = [to];
            let node = to;
            while (parent.has(node)) {
              node = parent.get(node)!;
              path.unshift(node);
            }
            // 가중치 합산
            let totalWeight = 0;
            for (let i = 0; i < path.length - 1; i++) {
              const edge = this.edges.find(
                (e) =>
                  (e.from === path[i] && e.to === path[i + 1]) ||
                  (e.from === path[i + 1] && e.to === path[i]),
              );
              totalWeight += edge?.weight ?? 1;
            }
            return { path, totalWeight };
          }
          queue.push(neighbor.to);
        }
      }
    }

    return null; // 경로 없음
  }

  /**
   * Get edges by relationship type.
   */
  getEdgesByType(type: EdgeType): KGEdge[] {
    return this.edges.filter((e) => e.type === type);
  }

  /**
   * Search nodes by name (fuzzy, case-insensitive).
   */
  searchNodes(query: string): KGNode[] {
    const lower = query.toLowerCase();
    return Array.from(this.nodes.values()).filter(
      (n) =>
        n.name_ko.toLowerCase().includes(lower) ||
        n.name_en.toLowerCase().includes(lower) ||
        n.id.toLowerCase().includes(lower),
    );
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  get edgeCount(): number {
    return this.edges.length;
  }
}

// ---------------------------------------------------------------------------
// PART 3 -- Pre-built core graph (~100 nodes)
// ---------------------------------------------------------------------------

function buildCoreGraph(): KnowledgeGraph {
  const g = new KnowledgeGraph();

  // === CONCEPTS (50+) ===
  const concepts: Array<[string, string, string]> = [
    ['c-voltage-drop', '전압강하', 'Voltage Drop'],
    ['c-current', '전류', 'Electric Current'],
    ['c-voltage', '전압', 'Voltage'],
    ['c-resistance', '저항', 'Resistance'],
    ['c-impedance', '임피던스', 'Impedance'],
    ['c-power', '전력', 'Electric Power'],
    ['c-power-factor', '역률', 'Power Factor'],
    ['c-reactive-power', '무효전력', 'Reactive Power'],
    ['c-apparent-power', '피상전력', 'Apparent Power'],
    ['c-short-circuit', '단락전류', 'Short Circuit Current'],
    ['c-overcurrent', '과전류', 'Overcurrent'],
    ['c-grounding', '접지', 'Grounding/Earthing'],
    ['c-ground-resistance', '접지저항', 'Ground Resistance'],
    ['c-cable-sizing', '전선 선정', 'Cable Sizing'],
    ['c-ampacity', '허용전류', 'Ampacity'],
    ['c-conductor', '도체', 'Conductor'],
    ['c-insulation', '절연', 'Insulation'],
    ['c-transformer', '변압기', 'Transformer'],
    ['c-circuit-breaker', '차단기', 'Circuit Breaker'],
    ['c-fuse', '퓨즈', 'Fuse'],
    ['c-rcd', '누전차단기', 'RCD/GFCI'],
    ['c-motor', '전동기', 'Motor'],
    ['c-motor-starting', '전동기 기동', 'Motor Starting'],
    ['c-capacitor', '콘덴서', 'Capacitor'],
    ['c-inductor', '인덕터', 'Inductor'],
    ['c-frequency', '주파수', 'Frequency'],
    ['c-harmonics', '고조파', 'Harmonics'],
    ['c-surge', '서지', 'Surge'],
    ['c-spd', '서지보호장치', 'Surge Protective Device'],
    ['c-lightning', '뇌보호', 'Lightning Protection'],
    ['c-demand-factor', '수요율', 'Demand Factor'],
    ['c-diversity-factor', '부등률', 'Diversity Factor'],
    ['c-load-factor', '부하율', 'Load Factor'],
    ['c-pv', '태양광 발전', 'Photovoltaic'],
    ['c-ess', '에너지저장장치', 'Energy Storage System'],
    ['c-ups', '무정전전원장치', 'UPS'],
    ['c-emergency-power', '비상전원', 'Emergency Power'],
    ['c-generator', '발전기', 'Generator'],
    ['c-switchgear', '개폐장치', 'Switchgear'],
    ['c-busbar', '모선', 'Busbar'],
    ['c-panelboard', '분전반', 'Panelboard'],
    ['c-mcc', '전동기제어반', 'Motor Control Center'],
    ['c-conduit', '전선관', 'Conduit'],
    ['c-cable-tray', '케이블트레이', 'Cable Tray'],
    ['c-illumination', '조도', 'Illumination'],
    ['c-lux', '럭스', 'Lux'],
    ['c-arc-flash', '아크 플래시', 'Arc Flash'],
    ['c-selectivity', '보호 협조', 'Selectivity/Coordination'],
    ['c-single-line', '단선도', 'Single Line Diagram'],
    ['c-three-phase', '3상', 'Three Phase'],
  ];

  for (const [id, ko, en] of concepts) {
    g.addNode({ id, type: 'concept', name_ko: ko, name_en: en });
  }

  // === STANDARDS (15+) ===
  const standards: Array<[string, string, string, Record<string, string>?]> = [
    ['s-kec', '한국전기설비기술기준', 'KEC (Korean Electrical Code)', { country: 'KR', year: '2021' }],
    ['s-kec-140', 'KEC 140조 접지', 'KEC Clause 140 Grounding', { parent: 's-kec' }],
    ['s-kec-210', 'KEC 210조 계량설비', 'KEC Clause 210 Metering', { parent: 's-kec' }],
    ['s-kec-220', 'KEC 220조 분전반', 'KEC Clause 220 Distribution', { parent: 's-kec' }],
    ['s-kec-230', 'KEC 230조 전동기', 'KEC Clause 230 Motors', { parent: 's-kec' }],
    ['s-kec-232', 'KEC 232조 보호장치', 'KEC Clause 232 Protection', { parent: 's-kec' }],
    ['s-kec-310', 'KEC 310조 변압기', 'KEC Clause 310 Transformers', { parent: 's-kec' }],
    ['s-kec-520', 'KEC 520조 태양광', 'KEC Clause 520 PV Systems', { parent: 's-kec' }],
    ['s-nec', 'NEC (미국전기규정)', 'NEC (National Electrical Code)', { country: 'US', year: '2023' }],
    ['s-nec-210', 'NEC Article 210 분기회로', 'NEC Article 210 Branch Circuits', { parent: 's-nec' }],
    ['s-nec-240', 'NEC Article 240 과전류보호', 'NEC Article 240 Overcurrent', { parent: 's-nec' }],
    ['s-nec-250', 'NEC Article 250 접지', 'NEC Article 250 Grounding', { parent: 's-nec' }],
    ['s-nec-310', 'NEC Article 310 도체', 'NEC Article 310 Conductors', { parent: 's-nec' }],
    ['s-iec', 'IEC 국제전기기술위원회', 'IEC (International Electrotechnical Commission)', { year: '2024' }],
    ['s-iec-60364', 'IEC 60364 저압설비', 'IEC 60364 Low Voltage Installations'],
    ['s-iec-61936', 'IEC 61936 고압설비', 'IEC 61936 High Voltage Installations'],
    ['s-jis', 'JIS 일본산업규격', 'JIS (Japanese Industrial Standards)', { country: 'JP' }],
    ['s-jis-c-3005', 'JIS C 3005 전선', 'JIS C 3005 Wires and Cables', { parent: 's-jis' }],
  ];

  for (const [id, ko, en, props] of standards) {
    g.addNode({ id, type: 'standard', name_ko: ko, name_en: en, properties: props });
  }

  // === CALCULATORS (10+) ===
  const calcs: Array<[string, string, string]> = [
    ['calc-voltage-drop', '전압강하 계산기', 'Voltage Drop Calculator'],
    ['calc-cable-sizing', '전선 선정 계산기', 'Cable Sizing Calculator'],
    ['calc-short-circuit', '단락전류 계산기', 'Short Circuit Calculator'],
    ['calc-demand-load', '수요전력 계산기', 'Demand Load Calculator'],
    ['calc-power-factor', '역률 보정 계산기', 'Power Factor Correction Calculator'],
    ['calc-transformer-sizing', '변압기 용량 계산기', 'Transformer Sizing Calculator'],
    ['calc-breaker-sizing', '차단기 선정 계산기', 'Breaker Sizing Calculator'],
    ['calc-grounding', '접지저항 계산기', 'Grounding Resistance Calculator'],
    ['calc-motor-starting', '전동기 기동 계산기', 'Motor Starting Calculator'],
    ['calc-illumination', '조도 계산기', 'Illumination Calculator'],
    ['calc-conduit-fill', '전선관 충전율 계산기', 'Conduit Fill Calculator'],
    ['calc-arc-flash', '아크 플래시 계산기', 'Arc Flash Calculator'],
  ];

  for (const [id, ko, en] of calcs) {
    g.addNode({ id, type: 'calculator', name_ko: ko, name_en: en });
  }

  // === EDGES ===
  // 개념 → 개념 관계
  const conceptEdges: Array<[string, string, EdgeType, number]> = [
    ['c-voltage-drop', 'c-current', 'RELATED_TO', 0.9],
    ['c-voltage-drop', 'c-resistance', 'RELATED_TO', 0.9],
    ['c-voltage-drop', 'c-cable-sizing', 'RELATED_TO', 0.95],
    ['c-voltage-drop', 'c-impedance', 'RELATED_TO', 0.8],
    ['c-current', 'c-voltage', 'RELATED_TO', 0.95],
    ['c-current', 'c-resistance', 'RELATED_TO', 0.95],
    ['c-power', 'c-voltage', 'RELATED_TO', 0.95],
    ['c-power', 'c-current', 'RELATED_TO', 0.95],
    ['c-power', 'c-power-factor', 'RELATED_TO', 0.9],
    ['c-power-factor', 'c-reactive-power', 'RELATED_TO', 0.95],
    ['c-power-factor', 'c-apparent-power', 'RELATED_TO', 0.95],
    ['c-power-factor', 'c-capacitor', 'RELATED_TO', 0.85],
    ['c-short-circuit', 'c-overcurrent', 'RELATED_TO', 0.9],
    ['c-short-circuit', 'c-circuit-breaker', 'RELATED_TO', 0.95],
    ['c-short-circuit', 'c-impedance', 'RELATED_TO', 0.85],
    ['c-overcurrent', 'c-fuse', 'RELATED_TO', 0.9],
    ['c-overcurrent', 'c-circuit-breaker', 'RELATED_TO', 0.95],
    ['c-grounding', 'c-ground-resistance', 'RELATED_TO', 0.95],
    ['c-grounding', 'c-rcd', 'RELATED_TO', 0.85],
    ['c-cable-sizing', 'c-ampacity', 'RELATED_TO', 0.95],
    ['c-cable-sizing', 'c-conductor', 'RELATED_TO', 0.9],
    ['c-cable-sizing', 'c-insulation', 'RELATED_TO', 0.8],
    ['c-transformer', 'c-power', 'RELATED_TO', 0.85],
    ['c-transformer', 'c-voltage', 'RELATED_TO', 0.9],
    ['c-motor', 'c-motor-starting', 'RELATED_TO', 0.95],
    ['c-motor', 'c-current', 'RELATED_TO', 0.85],
    ['c-surge', 'c-spd', 'RELATED_TO', 0.95],
    ['c-surge', 'c-lightning', 'RELATED_TO', 0.9],
    ['c-pv', 'c-ess', 'RELATED_TO', 0.8],
    ['c-emergency-power', 'c-generator', 'RELATED_TO', 0.9],
    ['c-emergency-power', 'c-ups', 'RELATED_TO', 0.9],
    ['c-panelboard', 'c-switchgear', 'RELATED_TO', 0.85],
    ['c-panelboard', 'c-busbar', 'RELATED_TO', 0.8],
    ['c-selectivity', 'c-circuit-breaker', 'RELATED_TO', 0.9],
    ['c-selectivity', 'c-fuse', 'RELATED_TO', 0.85],
    ['c-illumination', 'c-lux', 'RELATED_TO', 0.95],
    ['c-harmonics', 'c-frequency', 'RELATED_TO', 0.85],
    ['c-harmonics', 'c-power-factor', 'RELATED_TO', 0.75],
    ['c-three-phase', 'c-power', 'RELATED_TO', 0.85],
    ['c-conduit', 'c-cable-tray', 'RELATED_TO', 0.8],
    ['c-conduit', 'c-conductor', 'RELATED_TO', 0.85],
  ];

  // 개념 → 규격 관계 (GOVERNED_BY)
  const governedByEdges: Array<[string, string, number]> = [
    ['c-voltage-drop', 's-kec-232', 0.95],
    ['c-grounding', 's-kec-140', 0.95],
    ['c-grounding', 's-nec-250', 0.95],
    ['c-overcurrent', 's-kec-232', 0.9],
    ['c-overcurrent', 's-nec-240', 0.9],
    ['c-cable-sizing', 's-kec-232', 0.9],
    ['c-cable-sizing', 's-nec-310', 0.9],
    ['c-transformer', 's-kec-310', 0.95],
    ['c-motor', 's-kec-230', 0.95],
    ['c-panelboard', 's-kec-220', 0.9],
    ['c-pv', 's-kec-520', 0.95],
    ['c-ampacity', 's-nec-310', 0.95],
    ['c-ampacity', 's-iec-60364', 0.85],
    ['c-short-circuit', 's-iec-60364', 0.85],
  ];

  // 개념 → 계산기 관계 (USED_IN)
  const usedInEdges: Array<[string, string, number]> = [
    ['c-voltage-drop', 'calc-voltage-drop', 0.99],
    ['c-cable-sizing', 'calc-cable-sizing', 0.99],
    ['c-short-circuit', 'calc-short-circuit', 0.99],
    ['c-demand-factor', 'calc-demand-load', 0.95],
    ['c-power-factor', 'calc-power-factor', 0.99],
    ['c-transformer', 'calc-transformer-sizing', 0.99],
    ['c-circuit-breaker', 'calc-breaker-sizing', 0.99],
    ['c-ground-resistance', 'calc-grounding', 0.99],
    ['c-motor-starting', 'calc-motor-starting', 0.99],
    ['c-illumination', 'calc-illumination', 0.99],
    ['c-conduit', 'calc-conduit-fill', 0.99],
    ['c-arc-flash', 'calc-arc-flash', 0.99],
    ['c-current', 'calc-voltage-drop', 0.8],
    ['c-ampacity', 'calc-cable-sizing', 0.9],
    ['c-impedance', 'calc-short-circuit', 0.85],
  ];

  // 개념 → 규격 관계 추가 (GOVERNED_BY — 교차참조 강화)
  const governedByEdges2: Array<[string, string, number]> = [
    // KEC 세부 조항 매핑
    ['c-ampacity', 's-kec-232', 0.95],       // 허용전류 → KEC 232
    ['c-insulation', 's-kec-232', 0.8],       // 절연 → KEC 232
    ['c-conductor', 's-kec-232', 0.85],       // 도체 → KEC 232
    ['c-circuit-breaker', 's-kec-232', 0.9],  // 차단기 → KEC 232
    ['c-fuse', 's-kec-232', 0.85],            // 퓨즈 → KEC 232
    ['c-surge', 's-kec-140', 0.8],            // 서지 → KEC 140 접지
    ['c-spd', 's-kec-140', 0.85],             // SPD → KEC 140
    ['c-rcd', 's-kec-232', 0.9],              // RCD → KEC 232
    ['c-demand-factor', 's-kec-220', 0.9],    // 수요율 → KEC 220
    ['c-switchgear', 's-kec-310', 0.9],       // 수배전 → KEC 310
    ['c-ess', 's-kec-520', 0.85],             // ESS → KEC 520
    ['c-emergency-power', 's-kec-220', 0.8],  // 비상전원 → KEC 220
    ['c-harmonics', 's-iec-60364', 0.8],      // 고조파 → IEC 60364
    ['c-arc-flash', 's-nec-240', 0.85],       // 아크플래시 → NEC 240
    ['c-selectivity', 's-kec-232', 0.9],      // 보호협조 → KEC 232
    ['c-motor-starting', 's-kec-230', 0.9],   // 기동 → KEC 230
    ['c-frequency', 's-iec-60364', 0.75],     // 주파수 → IEC 60364
    ['c-lightning', 's-kec-140', 0.85],        // 뇌보호 → KEC 140
    ['c-ups', 's-kec-520', 0.8],              // UPS → KEC 520
    ['c-generator', 's-kec-310', 0.85],       // 발전기 → KEC 310
    // NEC 세부 매핑
    ['c-voltage-drop', 's-nec-210', 0.85],    // 전압강하 → NEC 210
    ['c-circuit-breaker', 's-nec-240', 0.9],  // 차단기 → NEC 240
    ['c-motor', 's-nec-310', 0.8],            // 전동기 → NEC 310
    ['c-conductor', 's-nec-310', 0.9],        // 도체 → NEC 310
    ['c-illumination', 's-iec-60364', 0.75],  // 조도 → IEC 60364
  ];

  // 규격 간 등가 관계 (EQUIVALENT_TO — KEC↔NEC↔IEC 다국가 매핑)
  const equivalentEdges: Array<[string, string, number]> = [
    // KEC ↔ NEC
    ['s-kec-140', 's-nec-250', 0.85],     // 접지
    ['s-kec-232', 's-nec-240', 0.8],      // 보호/과전류
    ['s-kec-232', 's-nec-310', 0.8],      // 허용전류/도체
    ['s-kec-220', 's-nec-210', 0.8],      // 분전/분기회로
    ['s-kec-230', 's-nec-310', 0.75],     // 전동기/도체
    ['s-kec-310', 's-nec-310', 0.7],      // 변압기/도체
    ['s-kec-520', 's-nec-310', 0.65],     // 태양광/도체
    // KEC ↔ IEC
    ['s-kec', 's-iec-60364', 0.9],         // 전체 기준 등가
    ['s-kec-140', 's-iec-60364', 0.85],    // 접지
    ['s-kec-232', 's-iec-60364', 0.85],    // 보호
    ['s-kec-310', 's-iec-61936', 0.8],     // 고압설비
    ['s-kec-520', 's-iec-60364', 0.75],    // 태양광
    // NEC ↔ IEC
    ['s-nec-310', 's-iec-60364', 0.8],     // 도체/설비
    ['s-nec-240', 's-iec-60364', 0.8],     // 과전류보호
    ['s-nec-250', 's-iec-60364', 0.85],    // 접지
    ['s-nec-210', 's-iec-60364', 0.75],    // 분기회로
    // KEC ↔ JIS
    ['s-kec', 's-jis', 0.7],               // 전체 기준
    ['s-kec-232', 's-jis-c-3005', 0.7],    // 전선 규격
    ['s-nec-310', 's-jis-c-3005', 0.65],   // 도체/전선
    // IEC ↔ JIS
    ['s-iec-60364', 's-jis', 0.75],        // 저압설비
  ];

  // 계산기 의존 관계 (REQUIRES — 확장)
  const requiresEdges: Array<[string, string, number]> = [
    ['calc-cable-sizing', 'calc-voltage-drop', 0.7],
    ['calc-breaker-sizing', 'calc-short-circuit', 0.8],
    ['calc-transformer-sizing', 'calc-demand-load', 0.75],
    ['calc-motor-starting', 'calc-voltage-drop', 0.7],    // 전동기 기동 → 전압강하
    ['calc-motor-starting', 'calc-cable-sizing', 0.65],    // 전동기 기동 → 케이블
    ['calc-arc-flash', 'calc-short-circuit', 0.9],         // 아크플래시 → 단락전류
    ['calc-grounding', 'calc-short-circuit', 0.6],         // 접지 → 단락전류
    ['calc-conduit-fill', 'calc-cable-sizing', 0.7],       // 전선관 → 케이블
    ['calc-illumination', 'calc-demand-load', 0.5],        // 조도 → 부하
    ['calc-power-factor', 'calc-demand-load', 0.65],       // 역률 → 부하
  ];

  // 엣지 등록
  for (const [from, to, type, weight] of conceptEdges) {
    g.addEdge({ from, to, type, weight });
  }
  for (const [from, to, weight] of governedByEdges) {
    g.addEdge({ from, to, type: 'GOVERNED_BY', weight });
  }
  for (const [from, to, weight] of governedByEdges2) {
    g.addEdge({ from, to, type: 'GOVERNED_BY', weight });
  }
  for (const [from, to, weight] of usedInEdges) {
    g.addEdge({ from, to, type: 'USED_IN', weight });
  }
  for (const [from, to, weight] of equivalentEdges) {
    g.addEdge({ from, to, type: 'EQUIVALENT_TO', weight });
  }
  for (const [from, to, weight] of requiresEdges) {
    g.addEdge({ from, to, type: 'REQUIRES', weight });
  }

  return g;
}

// ---------------------------------------------------------------------------
// PART 4 -- Public API helpers
// ---------------------------------------------------------------------------

/** Singleton core graph instance */
let _coreGraph: KnowledgeGraph | null = null;

/**
 * Get the pre-built core knowledge graph (lazy singleton).
 */
export function getCoreGraph(): KnowledgeGraph {
  if (!_coreGraph) {
    _coreGraph = buildCoreGraph();
  }
  return _coreGraph;
}

/**
 * Find standards related to a concept.
 */
export function getRelatedStandards(conceptId: string): KGNode[] {
  const g = getCoreGraph();
  const related = g.findRelated(conceptId, 2);
  return related.filter((n) => n.type === 'standard');
}

/**
 * Find calculators related to a concept.
 */
export function getRelatedCalculators(conceptId: string): KGNode[] {
  const g = getCoreGraph();
  const related = g.findRelated(conceptId, 2);
  return related.filter((n) => n.type === 'calculator');
}

/**
 * Search the knowledge graph by text (supports Korean and English).
 */
export function searchKnowledgeGraph(query: string): KGNode[] {
  const g = getCoreGraph();
  return g.searchNodes(query);
}
