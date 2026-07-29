/**
 * Deterministic recommendation templates — no free-form VLM proposals.
 */

import type {
  CalculationLink,
  RecommendationStatus,
  RecommendationV3,
  RelationEdge,
  SymbolNode,
  UnresolvedItem,
} from './types-v3';
import { hasDeviceClass } from './device-class';

export interface RecommendationInput {
  symbols: SymbolNode[];
  relations: RelationEdge[];
  calculations: CalculationLink[];
  unresolved: UnresolvedItem[];
  hasGroundPath?: boolean;
  coverageEvidenceIds?: string[];
  coverageComplete?: boolean;
}

export function buildRecommendations(input: RecommendationInput): RecommendationV3[] {
  const out: RecommendationV3[] = [];
  let seq = 0;
  const confirmed = input.symbols.filter((s) => s.certainty === 'confirmed');

  // Orphan devices
  const connected = new Set<string>();
  for (const r of input.relations) {
    if (r.certainty !== 'confirmed') continue;
    connected.add(r.from);
    connected.add(r.to);
  }
  for (const s of confirmed) {
    if (!connected.has(s.id) && !isBusLike(s)) {
      const supported = input.coverageComplete === true;
      out.push(rec(++seq, {
        severity: 'major',
        problem: `${s.displayId} 장치가 확정 결선에 연결되지 않았습니다 (고아 장치).`,
        relatedDisplayIds: [s.displayId],
        evidenceIds: s.evidence.map((e) => e.evidenceId),
        status: supported ? 'SUPPORTED' : 'HOLD',
        recommendedAction: '결선 누락·구획 경계 잘림·페이지 참조를 확인하십시오.',
        requiredInputs: supported ? [] : ['전체 관련 구획 판독 완료'],
        standardRefs: ['ESA-SLD-RULE:ORPHAN-CONNECTION'],
        calcReceiptIds: [],
      }));
    }
  }

  // Power path without breaker
  const sources = confirmed.filter(isSource);
  const loads = confirmed.filter(isLoad);
  const adjacency = buildAdjacency(input.relations);
  const byId = new Map(confirmed.map((s) => [s.id, s]));
  for (const src of sources) {
    const paths = shortestPathsFrom(src.id, adjacency);
    for (const load of loads) {
      const path = paths.get(load.id);
      if (!path) continue;
      const hasProtection = path.some((id) => {
        const node = byId.get(id);
        return node ? isProtection(node) : false;
      });
      if (!hasProtection) {
        const supported = input.coverageComplete === true;
        out.push(rec(++seq, {
          severity: 'critical',
          problem: `${src.displayId} → ${load.displayId} 경로에 보호기가 확인되지 않습니다.`,
          relatedDisplayIds: [src.displayId, load.displayId],
          evidenceIds: path.flatMap((id) =>
            byId.get(id)?.evidence.map((e) => e.evidenceId) ?? []),
          status: supported ? 'SUPPORTED' : 'HOLD',
          recommendedAction: '경로상 차단기·퓨즈 존재 여부와 도면 누락을 재확인하십시오.',
          requiredInputs: supported ? [] : ['전체 관련 구획 판독 완료'],
          standardRefs: ['KEC 212 과전류에 대한 보호'],
          calcReceiptIds: [],
        }));
      }
    }
  }

  // Breaker rating without load current → HOLD not fake upsize
  for (const s of confirmed.filter(isProtection)) {
    const calc = input.calculations.find((c) =>
      c.evidenceIds.some((id) => s.evidence.some((e) => e.evidenceId === id)));
    const hasLoadCurrent = input.calculations.some((c) =>
      /load|current|flc/i.test(c.calculatorId) && c.value != null);
    if (!hasLoadCurrent) {
      out.push(rec(++seq, {
        severity: 'major',
        problem: `${s.displayId} 보호기 정격 적합성 판정 보류.`,
        relatedDisplayIds: [s.displayId],
        evidenceIds: s.evidence.map((e) => e.evidenceId),
        status: 'HOLD',
        recommendedAction:
          '부하전류, 케이블 허용전류, 예상 단락전류가 필요합니다. 용량 증설을 단정하지 않습니다.',
        requiredInputs: ['부하전류', '케이블 허용전류', '예상 단락전류'],
        standardRefs: [],
        calcReceiptIds: calc?.receiptHash ? [calc.receiptHash] : [],
      }));
    }
  }

  // Ground
  if (input.hasGroundPath === false) {
    const coverageEvidence = [...new Set(input.coverageEvidenceIds ?? [])];
    const supported = input.coverageComplete === true && coverageEvidence.length > 0;
    out.push(rec(++seq, {
      severity: 'critical',
      problem: '접지 경로가 확정 그래프에서 확인되지 않았습니다.',
      relatedDisplayIds: [],
      evidenceIds: coverageEvidence,
      status: supported ? 'SUPPORTED' : 'HOLD',
      recommendedAction: '접지 기호·접지선 표기를 확인하고 필요 시 재스캔하십시오.',
      requiredInputs: supported ? [] : ['접지 표기 근거', '전체 구획 판독 완료 증거'],
      standardRefs: ['KEC 142 접지시스템의 시설'],
      calcReceiptIds: [],
    }));
  }

  // Unreadable critical
  for (const u of input.unresolved) {
    if (u.code === 'UNREADABLE_TEXT' || u.code === 'UNREADABLE_SYMBOL' || u.code === 'LOW_RESOLUTION_HOLD') {
      out.push(rec(++seq, {
        severity: 'major',
        problem: `판독 불가 항목: ${u.code}${u.displayId ? ` (${u.displayId})` : ''}.`,
        relatedDisplayIds: u.displayId ? [u.displayId] : [],
        evidenceIds: [],
        status: 'HOLD',
        recommendedAction: u.recommendedUpload?.note
          ?? '더 높은 해상도로 재업로드하거나 사용자 확인이 필요합니다.',
        requiredInputs: u.userConfirmItems?.map((q) => q.question) ?? ['고해상도 원본 또는 수동 확인'],
        standardRefs: [],
        calcReceiptIds: [],
      }));
    }
  }

  for (const u of input.unresolved) {
    if (u.code === 'UNREADABLE_TEXT' || u.code === 'UNREADABLE_SYMBOL' || u.code === 'LOW_RESOLUTION_HOLD') continue;
    out.push(rec(++seq, {
      severity: u.code === 'LINE_CONTINUITY_UNCERTAIN'
        || u.code === 'HOLD_RESCAN_UNRESOLVED'
        || u.code === 'ELECTRICAL_LOGIC_CONFLICT'
        ? 'major'
        : 'minor',
      problem: `미해결 항목 ${u.displayId ?? u.id}: ${u.code}.`,
      relatedDisplayIds: u.displayId ? [u.displayId] : [],
      evidenceIds: [],
      status: 'HOLD',
      recommendedAction: u.note,
      requiredInputs: u.userConfirmItems?.map((item) => item.question) ?? ['원본 근거 재확인'],
      standardRefs: [],
      calcReceiptIds: [],
    }));
  }

  // Calculations that are HOLD
  for (const c of input.calculations) {
    if (c.compliant !== null) continue;
    out.push(rec(++seq, {
      severity: 'minor',
      problem: `${c.label} 계산이 입력 부족으로 HOLD입니다.`,
      relatedDisplayIds: [],
      evidenceIds: c.evidenceIds,
      status: 'CONDITIONAL',
      recommendedAction: c.note ?? '필수 입력을 보완한 뒤 재계산하십시오.',
      requiredInputs: ['계산 필수 파라미터'],
      standardRefs: [],
      calcReceiptIds: c.receiptHash ? [c.receiptHash] : [],
    }));
  }

  return out.filter(hasRequiredLinks);
}

/** Reject proposals that lack evidence and calc/standard links when claiming SUPPORTED. */
export function hasRequiredLinks(r: RecommendationV3): boolean {
  if (r.status === 'REJECTED') return true;
  if (r.status === 'HOLD') return true;
  if (r.status === 'SUPPORTED') {
    return r.evidenceIds.length > 0
      && (r.calcReceiptIds.length > 0 || r.standardRefs.length > 0);
  }
  // CONDITIONAL may lack calc but must state required inputs
  return r.requiredInputs.length > 0 || r.evidenceIds.length > 0;
}

function rec(
  seq: number,
  partial: Omit<RecommendationV3, 'id' | 'priority'>,
): RecommendationV3 {
  return {
    id: `REC-${String(seq).padStart(3, '0')}`,
    priority: seq,
    ...partial,
  };
}

/**
 * 확정 결선만으로 인접 리스트를 만든다. 이전에는 (전원, 부하) 조합마다 이걸
 * 다시 만들었다 — 그래프는 그대로인데 조합 수만큼 재구축했다.
 */
function buildAdjacency(relations: RelationEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  const push = (k: string, v: string) => {
    const list = adj.get(k);
    if (list) list.push(v);
    else adj.set(k, [v]);
  };
  for (const r of relations) {
    if (r.certainty !== 'confirmed') continue;
    push(r.from, r.to);
    push(r.to, r.from);
  }
  return adj;
}

/**
 * 한 출발점에서 도달 가능한 모든 노드까지의 최단 경로를 한 번의 BFS 로 얻는다.
 *
 * 이전 구현은 큐에 경로 배열을 통째로 복사해 쌓고(`q.push([...path, n])`),
 * 부하마다 그래프를 다시 탐색했다. parent 맵으로 바꾸면 노드당 상수 저장이고
 * 전원당 1회 탐색이면 충분하다. **행동은 같다** — 방문 표시 시점(큐에 넣을 때)과
 * 이웃 순회 순서가 동일하므로 재구성된 최단 경로가 기존 반환값과 일치한다.
 * `q.shift()` 도 인덱스 순회로 바꿔 O(n) 이동을 없앴다.
 */
function shortestPathsFrom(from: string, adj: Map<string, string[]>): Map<string, string[]> {
  const parent = new Map<string, string | null>([[from, null]]);
  const queue: string[] = [from];
  for (let head = 0; head < queue.length; head += 1) {
    for (const next of adj.get(queue[head]) ?? []) {
      if (parent.has(next)) continue;
      parent.set(next, queue[head]);
      queue.push(next);
    }
  }

  const paths = new Map<string, string[]>();
  for (const node of parent.keys()) {
    const path: string[] = [];
    for (let cur: string | null | undefined = node; cur != null; cur = parent.get(cur)) {
      path.unshift(cur);
    }
    paths.set(node, path);
  }
  return paths;
}

// 분류는 device-class.ts 의 어휘 계층 한 곳에서 결정한다. 판정 지점마다 정규식을
// 돌리면 규칙이 갈라지고, 앵커 없는 부분 문자열이 무관한 토큰 안쪽에서 걸린다.
const isSource = (s: SymbolNode) => hasDeviceClass(s, 'source');
const isLoad = (s: SymbolNode) => hasDeviceClass(s, 'load');
const isProtection = (s: SymbolNode) => hasDeviceClass(s, 'protection');
const isBusLike = (s: SymbolNode) => hasDeviceClass(s, 'bus');

export type { RecommendationStatus };
