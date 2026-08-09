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
import { classifyDevice, hasDeviceClass } from './device-class';
import { describeStandardRefs } from './rule-basis';

export interface RecommendationInput {
  symbols: SymbolNode[];
  relations: RelationEdge[];
  calculations: CalculationLink[];
  unresolved: UnresolvedItem[];
  hasGroundPath?: boolean;
  /**
   * 확정된 접지 선의 노드 ID. 접지망이 존재할 때 어느 기기가 그 망에
   * 닿지 않는지 지목하기 위해 쓴다. 접지 적합성 판정이 아니라 확인 요청이다 —
   * 어떤 기기가 접지 대상인지는 시공 조건이며 도면만으로 확정할 수 없다.
   */
  groundLineIds?: string[];
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
      aiDecision: group.supported
        ? 'ESA 판단: 결선 누락으로 분류합니다.'
        : 'ESA 잠정 판단: 결선 누락 가능성이 높지만 판독 범위 또는 기기 종류가 미확정입니다.',
      recommendedAction: '결선 누락을 우선 보완 대상으로 두고, 구획 경계와 페이지 참조 근거로 결론을 갱신합니다.',
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
          aiDecision: supported
            ? 'ESA 판단: 확정 전원-부하 경로에 보호기가 누락됐습니다.'
            : 'ESA 잠정 판단: 보호기 누락 가능성이 높지만 미확정 기기가 보호기일 가능성은 남아 있습니다.',
          recommendedAction: '보호기 누락을 우선 보완 대상으로 두고, 미확정 기기 종류가 결론을 바꾸는 경우에만 갱신합니다.',
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
        aiDecision: 'ESA 판단: 현재 근거로 보호기 정격 적합성은 확정할 수 없으며 용량 증설 필요로도 단정하지 않습니다.',
        recommendedAction:
          '현재 정격은 유지하고, 부하전류·케이블 허용전류·예상 단락전류가 갖춰지면 계산 영수증으로 재판정합니다.',
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
      aiDecision: supported
        ? 'ESA 판단: 전체 판독 범위에서 접지 표기가 누락됐습니다.'
        : 'ESA 잠정 판단: 접지 표기 누락 가능성이 있지만 전체 판독 근거가 완결되지 않았습니다.',
      recommendedAction: '접지 표기 누락을 보완 후보로 유지하고, 전체 구획 판독 근거가 결론을 바꿀 때만 갱신합니다.',
      requiredInputs: supported ? [] : ['접지 표기 근거', '전체 구획 판독 완료 증거'],
      standardRefs: ['KEC 142 접지시스템의 시설'],
      calcReceiptIds: [],
    }));
  }

  // 접지망은 있는데 **같은 종류 기기 중 일부만** 그 망에 닿는 경우.
  // "접지가 표현됐나" 이진값만으로는 "접지선은 있는데 이 반만 안 물려 있다"를
  // 못 잡는다. 다만 어떤 기기가 접지 대상인지는 시공 조건이라 우리가 정하지
  // 않는다. 그래서 "접지 안 된 기기 전부"가 아니라, 도면 스스로가 접지를
  // 표기한 종류 안에서의 불일치만 지목한다. 같은 종류 중 아무도 접지가 없으면
  // 그건 결함이 아니라 표기 관행이므로 침묵한다.
  const groundLineIds = new Set(input.groundLineIds ?? []);
  // 접지는 두 가지로 그려진다: 접지로 분류된 선, 그리고 보통 선으로 이어진
  // 접지 심볼. 실측 픽스처에서 모델이 `type: "ground"` 심볼을 내보내므로
  // 선만 보면 흔한 표기를 통째로 놓친다.
  const groundSymbolIds = new Set(confirmed.filter(isGroundSymbol).map((node) => node.id));
  if (input.hasGroundPath !== false && (groundLineIds.size > 0 || groundSymbolIds.size > 0)) {
    const grounded = new Set<string>();
    for (const relation of input.relations) {
      const viaLine = relation.lineId !== undefined && groundLineIds.has(relation.lineId);
      const viaSymbol = relation.certainty === 'confirmed'
        && (groundSymbolIds.has(relation.from) || groundSymbolIds.has(relation.to));
      if (!viaLine && !viaSymbol) continue;
      grounded.add(relation.from);
      grounded.add(relation.to);
    }

    const inconsistent = groupBy(
      confirmed.filter((node) => !isBusLike(node)),
      (node) => groundPeerKey(node),
    )
      // 접지 표기가 있는 종류만 본다. 근거 없는 기대를 만들지 않기 위해서다.
      .filter((peers) => peers.some((node) => grounded.has(node.id)))
      .flatMap((peers) => peers.filter((node) => !grounded.has(node.id) && !isGroundSymbol(node)))
      .sort((left, right) => left.displayId.localeCompare(right.displayId));

    if (inconsistent.length > 0) {
      out.push(rec(++seq, {
        // 접지 대상 여부를 우리가 정하지 않으므로 critical 로 올리지 않는다.
        severity: 'minor',
        problem: `동일 종류 기기 중 ${inconsistent.length}개만 판독된 접지망에 연결되어 있지 않습니다.`,
        relatedDisplayIds: inconsistent.slice(0, 40).map((node) => node.displayId),
        evidenceIds: unique(inconsistent.flatMap((node) => node.evidence.map((e) => e.evidenceId))),
        // 접지 대상 판단은 도면 밖 조건이므로 확정으로 올리지 않는다.
        status: 'HOLD',
        aiDecision: 'ESA 잠정 판단: 동일 종류의 다른 기기와 비교할 때 접지 표기 누락 후보입니다.',
        recommendedAction: '해당 기기만 접지 표기 보완 후보로 유지하고, 접지 대상 여부가 다르면 결론에서 제외합니다.',
        requiredInputs: ['기기별 접지 대상 여부', '접지 표기 근거'],
        standardRefs: ['KEC 142 접지시스템의 시설'],
        calcReceiptIds: [],
      }));
    }
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
    const requiredInputs = unique(group.flatMap(unresolvedVerificationInputs));
    const aiDecision = unresolvedAiDecision(u);
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
      aiDecision,
      recommendedAction: group.length === 1
        ? '해당 항목만 확정 관계·안전 계산에서 보류하고 나머지 분석은 유지합니다.'
        : `같은 원인의 ${group.length}건만 확정 관계·안전 계산에서 보류하고 나머지 분석은 유지합니다.`,
      requiredInputs: requiredInputs.length > 0
        ? requiredInputs
        : [unreadable ? '판독 결론을 바꾸는 고해상도 원본 근거' : '판정 결론을 바꾸는 원본 근거'],
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
      aiDecision: 'ESA 판단: 현재 입력만으로 계산 결과를 확정하지 않으며 임의 수치로 대체하지 않습니다.',
      recommendedAction: c.note ?? '결론 변경 입력이 완결되면 검증된 계산기로 재계산합니다.',
      requiredInputs: ['계산 필수 파라미터'],
      standardRefs: [],
      calcReceiptIds: c.receiptHash ? [c.receiptHash] : [],
    }));
  }

  return out.filter(hasRequiredLinks);
}

/** Reject proposals that lack evidence and calc/standard links when claiming SUPPORTED. */
export function hasRequiredLinks(r: RecommendationV3): boolean {
  if (r.aiDecision.trim().length === 0) return false;
  if (r.status === 'REJECTED') return true;
  if (r.status === 'HOLD') return true;
  if (r.status === 'SUPPORTED') {
    return r.evidenceIds.length > 0
      && (r.calcReceiptIds.length > 0 || describeStandardRefs(r.standardRefs).length > 0);
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

/** SUPPORTED 로 올리지 못한 사유를 결론 변경 조건으로 돌려준다. */
function missingSupportInputs(input: RecommendationInput, nodes: SymbolNode[]): string[] {
  const needed: string[] = [];
  if (input.coverageComplete !== true) needed.push('전체 관련 구획 판독 완료');
  const unconfirmed = [...new Set(
    nodes.filter((n) => !hasConfirmedType(n)).map((n) => n.displayId),
  )];
  if (unconfirmed.length > 0) needed.push(`기기 종류 확정: ${unconfirmed.join(', ')}`);
  return needed.length > 0 ? needed : ['원본 근거 재확인'];
}

/**
 * 새 결과는 선언형 verificationItems 만 쓴다. 이전 저장 결과의 질문 문구는
 * 그대로 노출하지 않고 도면 번호·후보로 최소 확인 대상을 재구성한다.
 */
function unresolvedVerificationInputs(item: UnresolvedItem): string[] {
  const declared = item.verificationItems
    ?.map((verification) => verification.target.trim())
    .filter(Boolean) ?? [];
  if (declared.length > 0) return declared;

  const identity = item.displayId ?? item.id;
  const candidates = unique((item.candidates ?? []).map((candidate) => candidate.trim()).filter(Boolean));
  return candidates.length > 0
    ? [`${identity} 판독 후보 (${candidates.join(' / ')})를 가르는 원본 근거`]
    : [`${identity} 결론 변경 근거`];
}

function unresolvedAiDecision(item: UnresolvedItem): string {
  const identity = item.displayId ?? item.id;
  const candidates = unique((item.candidates ?? []).map((candidate) => candidate.trim()).filter(Boolean));
  if (candidates.length > 0) {
    return `ESA 잠정 판독: ${identity}의 우선 후보는 ${candidates[0]}입니다. 안전 판정 입력에는 확정값으로 사용하지 않습니다.`;
  }
  if (item.code === 'LINE_CONTINUITY_UNCERTAIN') {
    return `ESA 판단: ${identity} 선로의 연결 관계는 현재 근거로 확정할 수 없어 해당 선만 보류합니다.`;
  }
  return `ESA 판단: ${identity}은 현재 근거로 판독 불가이며 해당 항목만 보류합니다.`;
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

function groupBy<T>(items: readonly T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return [...groups.values()];
}

/**
 * 접지 표기를 비교할 "같은 종류" 의 정의.
 *
 * 확정 종류가 있으면 그것으로 묶는다. 없으면 분류 어휘가 뽑은 근거 문자열로
 * 묶되, 그것마저 없는 기기는 각자 고유 키를 받아 비교 대상에서 빠진다 —
 * 종류를 모르는 기기를 한 덩어리로 묶으면 없는 불일치가 생긴다.
 */
function groundPeerKey(node: SymbolNode): string {
  const confirmedType = node.confirmedType?.trim().toLowerCase();
  if (confirmedType) return `type:${confirmedType}`;
  const basis = classifyDevice(node).basis.trim().toLowerCase();
  return basis ? `basis:${basis}` : `unknown:${node.id}`;
}

const isSource = (s: SymbolNode) => hasDeviceClass(s, 'source');
const isLoad = (s: SymbolNode) => hasDeviceClass(s, 'load');
const isProtection = (s: SymbolNode) => hasDeviceClass(s, 'protection');
const isBusLike = (s: SymbolNode) => hasDeviceClass(s, 'bus');

/**
 * 접지 심볼 판별.
 *
 * `DeviceClass` 에 'ground' 를 더하지 않는 이유: 그 열거는 "경로에 보호기 없음"
 * critical 소견의 입력이라, 항목을 늘리면 그 판정의 동작이 같이 흔들린다.
 * 접지는 여기서만 쓰므로 여기서만 정의한다.
 *
 * 매칭 규칙은 device-class 와 같은 규율을 따른다 — 라틴 약호는 토큰 전체
 * 일치(`PE` 가 `PEAK` 안에서 걸리지 않게), 한국어는 복합어 부분 일치.
 * `E1` 같은 접지극 번호는 일반 기기 태그와 구분되지 않아 제외한다.
 */
const GROUND_LATIN_TOKENS = new Set(['ground', 'grounding', 'earth', 'earthing', 'gnd', 'pe', 'peg', 'fg']);
const GROUND_KOREAN_WORDS = ['접지', '대지', '등전위'];

function isGroundSymbol(node: SymbolNode): boolean {
  const basis = node.confirmedType ?? node.rawLabel ?? node.typeCandidates?.[0] ?? '';
  if (!basis) return false;
  if (GROUND_KOREAN_WORDS.some((word) => basis.includes(word))) return true;
  const tokens = new Set(basis.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean));
  return [...GROUND_LATIN_TOKENS].some((token) => tokens.has(token));
}

export type { RecommendationStatus };
