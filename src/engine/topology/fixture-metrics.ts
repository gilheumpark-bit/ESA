/**
 * 도면 픽스처 대조 — 정답 라벨 vs 파서 출력
 * ──────────────────────────────────────────
 * "파싱 성공"은 지표가 아니다. 예외 없이 끝나는 것과 맞게 읽는 것은 다르다.
 * 여기서는 재현율·정밀도·타입 정확도·고아율을 낸다.
 *
 * 매칭 원칙: 파서는 컴포넌트 이름을 보장하지 않으므로(블록명 미상·접점 승격 등)
 * **위치로 먼저 맞추고** 그 다음 타입·라벨을 비교한다. 정답 좌표는 우리가 작도한
 * 값이라 오차가 0이어야 정상이며, 허용오차는 반올림 여유분만 준다.
 */

import type { SLDAnalysis, SLDComponent } from '@/lib/sld-recognition';

// =========================================================================
// PART 1 — 라벨 스키마
// =========================================================================

export interface ExpectedNode {
  name: string;
  type: string;
  x: number;
  y: number;
  rating?: string;
  voltage?: string;
  current?: string;
}

export interface ExpectedEdge {
  from: string;
  to: string;
}

export interface DrawingLabel {
  id: string;
  source: string;
  license: string;
  tier: '초' | '중' | '고';
  fileDifficulty: string[];
  description: string;
  labelMode: 'full' | 'sampled';
  coordScale: number;
  expected: {
    nodeCount: number;
    edgeCount: number;
    nodes: ExpectedNode[];
    edges: ExpectedEdge[];
  };
  invariants: {
    orphanNodes: number;
    danglingEdges: number;
    selfLoops: number;
  };
}

// =========================================================================
// PART 2 — 측정 결과
// =========================================================================

export interface DrawingMetrics {
  id: string;
  tier: string;
  difficulty: string[];

  nodeRecall: number;
  nodePrecision: number;
  edgeRecall: number;
  edgePrecision: number;
  /** 위치가 맞은 노드 중 타입까지 맞은 비율 (위치 매칭 0이면 null) */
  typeAccuracy: number | null;
  /** 결선이 하나도 없는 노드 비율 */
  orphanRate: number;

  /** 스펙(정격/전압/전류) 라벨이 있는 노드 중 실제로 추출된 비율 (해당 없으면 null) */
  specRecall: number | null;

  counts: {
    expectedNodes: number;
    parsedNodes: number;
    matchedNodes: number;
    expectedEdges: number;
    parsedEdges: number;
    matchedEdges: number;
    typeCorrect: number;
    orphans: number;
    danglingEdges: number;
    selfLoops: number;
  };

  /** 사람이 읽을 실패 목록 — 상위 N개 */
  misses: string[];
}

// =========================================================================
// PART 3 — 대조
// =========================================================================

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * 위치 허용오차. 우리가 작도한 좌표와 파서 좌표는 원칙적으로 동일하다.
 * 접점 승격 노드가 격자 반올림(Math.round)을 거치므로 그 여유만 준다.
 */
function positionTolerance(label: DrawingLabel): number {
  return Math.max(2, 2 * label.coordScale);
}

export function compareToLabel(
  label: DrawingLabel,
  parsed: SLDAnalysis,
  options: { maxMisses?: number } = {},
): DrawingMetrics {
  const maxMisses = options.maxMisses ?? 12;
  const tol = positionTolerance(label);
  const misses: string[] = [];

  const parsedComps = parsed.components ?? [];
  const parsedConns = parsed.connections ?? [];

  // ── 노드 매칭: 기대 노드 ← 가장 가까운 미사용 파서 컴포넌트 ──
  const usedParsed = new Set<string>();
  const expectedToParsed = new Map<string, SLDComponent>();

  for (const exp of label.expected.nodes) {
    let best: SLDComponent | null = null;
    let bestDist = tol;
    for (const comp of parsedComps) {
      if (usedParsed.has(comp.id)) continue;
      const d = dist(exp, comp.position);
      if (d <= bestDist) {
        bestDist = d;
        best = comp;
      }
    }
    if (best) {
      usedParsed.add(best.id);
      expectedToParsed.set(exp.name, best);
    } else if (misses.length < maxMisses) {
      misses.push(`노드 누락: ${exp.name}(${exp.type}) @(${exp.x},${exp.y})`);
    }
  }

  const matchedNodes = expectedToParsed.size;

  // ── 타입 정확도 ──
  let typeCorrect = 0;
  for (const exp of label.expected.nodes) {
    const comp = expectedToParsed.get(exp.name);
    if (!comp) continue;
    if (comp.type === exp.type) typeCorrect++;
    else if (misses.length < maxMisses) {
      misses.push(`타입 오분류: ${exp.name} 기대=${exp.type} 실제=${comp.type}`);
    }
  }

  // ── 결선 매칭 ──
  const parsedEdgeKeys = new Set<string>();
  let selfLoops = 0;
  let danglingEdges = 0;
  const compIds = new Set(parsedComps.map((c) => c.id));

  for (const conn of parsedConns) {
    if (conn.from === conn.to) selfLoops++;
    if (!compIds.has(conn.from) || !compIds.has(conn.to)) danglingEdges++;
    parsedEdgeKeys.add(`${conn.from}|${conn.to}`);
    parsedEdgeKeys.add(`${conn.to}|${conn.from}`);
  }

  let matchedEdges = 0;
  for (const exp of label.expected.edges) {
    const a = expectedToParsed.get(exp.from);
    const b = expectedToParsed.get(exp.to);
    if (!a || !b) {
      if (misses.length < maxMisses) {
        misses.push(`결선 대조불가(끝 노드 미매칭): ${exp.from}→${exp.to}`);
      }
      continue;
    }
    if (parsedEdgeKeys.has(`${a.id}|${b.id}`)) matchedEdges++;
    else if (misses.length < maxMisses) {
      misses.push(`결선 누락: ${exp.from}→${exp.to}`);
    }
  }

  // ── 고아 노드 ──
  const connected = new Set<string>();
  for (const conn of parsedConns) {
    connected.add(conn.from);
    connected.add(conn.to);
  }
  const orphans = parsedComps.filter((c) => !connected.has(c.id)).length;

  // ── 스펙 추출 ──
  const specNodes = label.expected.nodes.filter((n) => n.rating || n.voltage || n.current);
  let specHit = 0;
  for (const exp of specNodes) {
    const comp = expectedToParsed.get(exp.name);
    if (!comp) continue;
    const ratingOk = !exp.rating || comp.rating === exp.rating;
    const voltageOk = !exp.voltage || comp.voltage === exp.voltage;
    const currentOk = !exp.current || comp.current === exp.current;
    if (ratingOk && voltageOk && currentOk) specHit++;
    else if (misses.length < maxMisses) {
      misses.push(
        `스펙 미추출: ${exp.name} 기대=${exp.rating ?? exp.voltage ?? exp.current} ` +
        `실제=${comp.rating ?? comp.voltage ?? comp.current ?? '없음'}`,
      );
    }
  }

  const safeDiv = (n: number, d: number) => (d === 0 ? 1 : n / d);

  return {
    id: label.id,
    tier: label.tier,
    difficulty: label.fileDifficulty,
    nodeRecall: safeDiv(matchedNodes, label.expected.nodes.length),
    nodePrecision: safeDiv(matchedNodes, parsedComps.length),
    edgeRecall: safeDiv(matchedEdges, label.expected.edges.length),
    edgePrecision: safeDiv(matchedEdges, parsedConns.length),
    typeAccuracy: matchedNodes === 0 ? null : typeCorrect / matchedNodes,
    orphanRate: parsedComps.length === 0 ? 0 : orphans / parsedComps.length,
    specRecall: specNodes.length === 0 ? null : specHit / specNodes.length,
    counts: {
      expectedNodes: label.expected.nodes.length,
      parsedNodes: parsedComps.length,
      matchedNodes,
      expectedEdges: label.expected.edges.length,
      parsedEdges: parsedConns.length,
      matchedEdges,
      typeCorrect,
      orphans,
      danglingEdges,
      selfLoops,
    },
    misses,
  };
}

/** 백분율 문자열 (보고용) */
export function pct(v: number | null): string {
  return v === null ? ' n/a ' : `${(v * 100).toFixed(1)}%`;
}

// IDENTITY_SEAL: topology/fixture-metrics | role=도면 픽스처 정답 대조 | inputs=label,parsed | outputs=metrics
