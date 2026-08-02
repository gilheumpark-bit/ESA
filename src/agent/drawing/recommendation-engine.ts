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
  const orphanGroups = new Map<string, { symbols: SymbolNode[]; supported: boolean; pageIndex: number }>();
  for (const s of confirmed.filter((node) => !connected.has(node.id) && !isBusLike(node))) {
    // 종류가 확정되지 않았으면 «모선 제외» 판정 자체가 추측 위에 서 있다.
    // 소견을 버리지는 않되 SUPPORTED 로 확정하지 않는다.
    const supported = input.coverageComplete === true && hasConfirmedType(s);
    const pageIndex = s.evidence[0]?.pageIndex ?? 0;
    const key = `${pageIndex}:${supported ? 'SUPPORTED' : 'HOLD'}`;
    const group = orphanGroups.get(key) ?? { symbols: [], supported, pageIndex };
    group.symbols.push(s);
    orphanGroups.set(key, group);
  }
  for (const group of orphanGroups.values()) {
    const displayIds = unique(group.symbols.map((s) => s.displayId));
    const evidenceIds = unique(group.symbols.flatMap((s) => s.evidence.map((e) => e.evidenceId)));
    out.push(rec(++seq, {
      severity: 'major',
      problem: displayIds.length === 1
        ? `${displayIds[0]} 장치가 확정 결선에 연결되지 않았습니다 (고아 장치).`
        : `${group.pageIndex + 1}페이지의 장치 ${displayIds.length}개가 확정 결선에 연결되지 않았습니다 (고아 장치).`,
      relatedDisplayIds: displayIds,
      evidenceIds,
      status: group.supported ? 'SUPPORTED' : 'HOLD',
      recommendedAction: '결선 누락·구획 경계 잘림·페이지 참조를 확인하십시오.',
      requiredInputs: group.supported ? [] : missingSupportInputs(input, group.symbols),
      standardRefs: ['ESA-SLD-RULE:ORPHAN-CONNECTION'],
      calcReceiptIds: [],
    }));
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
        // «보호기가 없다» 는 결론은 경로상 모든 기기의 종류가 확정됐을 때만
        // 성립한다. 종류 미확정 기기가 하나라도 있으면 그것이 보호기일 수
        // 있으므로, critical 소견은 남기되 HOLD 로 둔다.
        const pathNodes = path
          .map((id) => byId.get(id))
          .filter((node): node is SymbolNode => node !== undefined);
        const supported = input.coverageComplete === true
          && hasConfirmedType(src)
          && hasConfirmedType(load)
          && pathNodes.every(hasConfirmedType);
        out.push(rec(++seq, {
          severity: 'critical',
          problem: `${src.displayId} → ${load.displayId} 경로에 보호기가 확인되지 않습니다.`,
          relatedDisplayIds: [src.displayId, load.displayId],
          evidenceIds: path.flatMap((id) =>
            byId.get(id)?.evidence.map((e) => e.evidenceId) ?? []),
          status: supported ? 'SUPPORTED' : 'HOLD',
          recommendedAction: '경로상 차단기·퓨즈 존재 여부와 도면 누락을 재확인하십시오.',
          requiredInputs: supported ? [] : missingSupportInputs(input, [src, load, ...pathNodes]),
          standardRefs: ['KEC 212 과전류에 대한 보호'],
          calcReceiptIds: [],
        }));
      }
    }
  }

  // Breaker rating without load current → HOLD not fake upsize
  for (const s of confirmed.filter(isProtection)) {
    // **이 기기의 근거에 결박된 계산만 본다.** 예전에는 결박된 계산(`calc`)을
    // 구해 놓고 판정은 문서 전역 `some()` 으로 했다. 그러면 도면 어딘가에
    // 부하전류 계산이 하나만 있어도 **근거가 전혀 없는 다른 차단기 전부**의
    // 보류 소견이 통째로 사라진다 — 주의를 누락하는 방향이라 위험하다.
    const deviceEvidence = new Set(s.evidence.map((e) => e.evidenceId));
    const deviceCalcs = input.calculations.filter((c) =>
      c.evidenceIds.some((id) => deviceEvidence.has(id)));
    const calc = deviceCalcs[0];
    const hasLoadCurrent = deviceCalcs.some((c) =>
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

  // 미해결 항목은 원본 ledger 에 개별 보존된다. 제안 화면에서는 동일 페이지와
  // 원인별로 묶어 수백 개 카드가 핵심 안전 소견을 밀어내지 않게 한다.
  const unresolvedGroups = groupUnresolved(input.unresolved);
  for (const group of unresolvedGroups) {
    const [u] = group;
    const unreadable = u.code === 'UNREADABLE_TEXT'
      || u.code === 'UNREADABLE_SYMBOL'
      || u.code === 'LOW_RESOLUTION_HOLD';
    const displayIds = unique(group.flatMap((item) => item.displayId ? [item.displayId] : []));
    const requiredInputs = unique(group.flatMap((item) =>
      item.userConfirmItems?.map((question) => question.question) ?? []));
    const firstAction = unreadable
      ? u.recommendedUpload?.note ?? '더 높은 해상도로 재업로드하거나 사용자 확인이 필요합니다.'
      : u.note;
    out.push(rec(++seq, {
      severity: unreadable
        || u.code === 'LINE_CONTINUITY_UNCERTAIN'
        || u.code === 'HOLD_RESCAN_UNRESOLVED'
        || u.code === 'ELECTRICAL_LOGIC_CONFLICT'
        ? 'major'
        : 'minor',
      problem: group.length === 1
        ? unreadable
          ? `판독 불가 항목: ${u.code}${u.displayId ? ` (${u.displayId})` : ''}.`
          : `미해결 항목 ${u.displayId ?? u.id}: ${u.code}.`
        : `${u.pageIndex + 1}페이지의 ${u.code} 미해결 항목 ${group.length}건.`,
      relatedDisplayIds: displayIds,
      evidenceIds: [],
      status: 'HOLD',
      recommendedAction: group.length === 1
        ? firstAction
        : `${firstAction} 외 ${group.length - 1}건 — 미해결 항목 목록에서 개별 번호와 근거를 확인하십시오.`,
      requiredInputs: requiredInputs.length > 0
        ? requiredInputs
        : [unreadable ? '고해상도 원본 또는 수동 확인' : '원본 근거 재확인'],
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
/**
 * 기기 종류가 확정됐는지 판정한다.
 *
 * `confirmedType` 은 선택 필드다. `certainty: 'confirmed'` 인 기호라도 종류가
 * 비어 있을 수 있고, 그때 분류 함수들은 `typeCandidates[0]`(확정되지 않은
 * 1순위 추측)으로 내려간다. 그 추측이 critical 소견(«보호기 미확인»)의
 * 입력이 되므로, 추측 위에 선 소견은 SUPPORTED 로 확정하지 않는다.
 */
function hasConfirmedType(s: SymbolNode): boolean {
  return typeof s.confirmedType === 'string' && s.confirmedType.trim().length > 0;
}

/** SUPPORTED 로 올리지 못한 사유를 사용자가 채울 수 있는 항목으로 돌려준다. */
function missingSupportInputs(input: RecommendationInput, nodes: SymbolNode[]): string[] {
  const needed: string[] = [];
  if (input.coverageComplete !== true) needed.push('전체 관련 구획 판독 완료');
  const unconfirmed = [...new Set(
    nodes.filter((n) => !hasConfirmedType(n)).map((n) => n.displayId),
  )];
  if (unconfirmed.length > 0) needed.push(`기기 종류 확정: ${unconfirmed.join(', ')}`);
  return needed.length > 0 ? needed : ['원본 근거 재확인'];
}

function groupUnresolved(items: UnresolvedItem[]): UnresolvedItem[][] {
  const groups = new Map<string, UnresolvedItem[]>();
  for (const item of items) {
    const key = `${item.pageIndex}:${item.code}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

const isSource = (s: SymbolNode) => hasDeviceClass(s, 'source');
const isLoad = (s: SymbolNode) => hasDeviceClass(s, 'load');
const isProtection = (s: SymbolNode) => hasDeviceClass(s, 'protection');
const isBusLike = (s: SymbolNode) => hasDeviceClass(s, 'bus');

export type { RecommendationStatus };
