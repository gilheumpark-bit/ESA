/**
 * Deterministic recommendation templates — no free-form VLM proposals.
 */

import { KNOWN_CLAUSES, isKnownCitation } from '@engine/standards/citation-registry';

import type {
  CalculationLink,
  RecommendationStatus,
  RecommendationV3,
  RelationEdge,
  SymbolNode,
  UnresolvedItem,
} from './types-v3';

/** 내부 그래프 규칙 식별자 접두사 — 기준서 조항인 척하지 않는다. */
const INTERNAL_RULE_PREFIX = 'ESA-SLD-RULE:';

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
      // 종류가 확정되지 않았으면 모선 제외 판정 자체가 추측 위에 서 있다.
      // 소견을 버리지는 않되 SUPPORTED로 확정하지 않는다.
      const supported = input.coverageComplete === true && hasConfirmedType(s);
      out.push(rec(++seq, {
        severity: 'major',
        problem: `${s.displayId} 장치가 확정 결선에 연결되지 않았습니다 (고아 장치).`,
        relatedDisplayIds: [s.displayId],
        evidenceIds: s.evidence.map((e) => e.evidenceId),
        status: supported ? 'SUPPORTED' : 'HOLD',
        recommendedAction: '결선 누락·구획 경계 잘림·페이지 참조를 확인하십시오.',
        requiredInputs: supported ? [] : missingSupportInputs(input, [s]),
        standardRefs: ['ESA-SLD-RULE:ORPHAN-CONNECTION'],
        calcReceiptIds: [],
      }));
    }
  }

  // Power path without breaker
  const sources = confirmed.filter(isSource);
  const loads = confirmed.filter(isLoad);
  for (const src of sources) {
    for (const load of loads) {
      const path = findPath(src.id, load.id, input.relations);
      if (!path) continue;
      const hasProtection = path.some((id) => {
        const node = confirmed.find((s) => s.id === id);
        return node ? isProtection(node) : false;
      });
      if (!hasProtection) {
        // "보호기가 없다"는 결론은 경로상 모든 기기의 종류가 확정됐을 때만
        // 성립한다. 종류 미확정 기기가 하나라도 있으면 그것이 보호기일 수
        // 있으므로, critical 소견은 남기되 HOLD로 둔다.
        const pathNodes = path
          .map((id) => confirmed.find((s) => s.id === id))
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
            confirmed.find((s) => s.id === id)?.evidence.map((e) => e.evidenceId) ?? []),
          status: supported ? 'SUPPORTED' : 'HOLD',
          recommendedAction: '경로상 차단기·퓨즈 존재 여부와 도면 누락을 재확인하십시오.',
          requiredInputs: supported ? [] : missingSupportInputs(input, [src, load, ...pathNodes]),
          standardRefs: [`${INTERNAL_RULE_PREFIX}PROTECTION-ON-PATH`],
          calcReceiptIds: [],
        }));
      }
    }
  }

  // Breaker rating without load current → HOLD not fake upsize
  for (const s of confirmed.filter(isProtection)) {
    // 이 기기의 근거에 결박된 계산만 본다. 예전에는 결박된 계산(calc)을
    // 구해놓고 판정은 문서 전역 some()으로 했다. 그러면 도면 어딘가에
    // 부하전류 계산이 하나만 있어도 근거가 전혀 없는 다른 차단기들의
    // 보류 소견이 통째로 사라진다 — 주의를 누락하는 방향의 결함이었다.
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
      standardRefs: [`${INTERNAL_RULE_PREFIX}GROUND-PATH`],
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

/**
 * 표준 근거 문자열이 실제로 근거 구실을 하는지 판정한다.
 *
 * 예전에는 `standardRefs`에 아무 문자열이나 들어가도 SUPPORTED 승인 근거로
 * 인정됐다. `'KEC 접지'` 같은 자유 문구는 조항 번호가 아니라 사용자가 원문을
 * 찾아갈 수 없고, 근거 없이 확정 소견을 통과시킨다.
 *
 * 허용하는 형태는 둘뿐이다.
 *   1. `ESA-SLD-RULE:*` — ESA 자체 그래프 규칙. 기준서인 척하지 않으므로 정직하다.
 *   2. 인용 레지스트리에서 해석되는 실제 조항(예: `KEC 232.52`).
 */
export function isStructuredStandardRef(ref: string): boolean {
  if (ref.startsWith(INTERNAL_RULE_PREFIX)) return ref.length > INTERNAL_RULE_PREFIX.length;
  for (const standard of Object.keys(KNOWN_CLAUSES)) {
    const prefix = `${standard} `;
    if (ref.startsWith(prefix) && isKnownCitation(standard, ref.slice(prefix.length))) return true;
  }
  return false;
}

/** Reject proposals that lack evidence and calc/standard links when claiming SUPPORTED. */
export function hasRequiredLinks(r: RecommendationV3): boolean {
  if (r.status === 'REJECTED') return true;
  if (r.status === 'HOLD') return true;
  if (r.status === 'SUPPORTED') {
    return r.evidenceIds.length > 0
      && (r.calcReceiptIds.length > 0 || r.standardRefs.some(isStructuredStandardRef));
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

function findPath(from: string, to: string, relations: RelationEdge[]): string[] | null {
  const adj = new Map<string, string[]>();
  for (const r of relations) {
    if (r.certainty !== 'confirmed') continue;
    adj.set(r.from, [...(adj.get(r.from) ?? []), r.to]);
    adj.set(r.to, [...(adj.get(r.to) ?? []), r.from]);
  }
  const q: string[][] = [[from]];
  const seen = new Set([from]);
  while (q.length) {
    const path = q.shift()!;
    const cur = path[path.length - 1];
    if (cur === to) return path;
    for (const n of adj.get(cur) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      q.push([...path, n]);
    }
  }
  return null;
}

/**
 * 기기 종류가 확정됐는지 판정한다.
 *
 * `confirmedType`은 선택 필드다. `certainty: 'confirmed'`인 기호라도 종류가
 * 비어 있을 수 있고, 그때 분류 함수들은 `typeCandidates[0]`(확정되지 않은
 * 1순위 추측)으로 내려간다. 그 추측이 critical 소견("보호기 미확인")의
 * 입력이 되므로, 추측 위에 선 소견은 SUPPORTED로 확정하지 않는다.
 */
function hasConfirmedType(s: SymbolNode): boolean {
  return typeof s.confirmedType === 'string' && s.confirmedType.trim().length > 0;
}

/** SUPPORTED로 올리지 못한 사유를 사용자가 채울 수 있는 항목으로 돌려준다. */
function missingSupportInputs(input: RecommendationInput, nodes: SymbolNode[]): string[] {
  const needed: string[] = [];
  if (input.coverageComplete !== true) needed.push('전체 관련 구획 판독 완료');
  const unconfirmed = [...new Set(
    nodes.filter((n) => !hasConfirmedType(n)).map((n) => n.displayId),
  )];
  if (unconfirmed.length > 0) needed.push(`기기 종류 확정: ${unconfirmed.join(', ')}`);
  return needed.length > 0 ? needed : ['원본 근거 재확인'];
}

function isSource(s: SymbolNode): boolean {
  const t = (s.confirmedType ?? s.typeCandidates[0] ?? '').toLowerCase();
  return /source|incoming|grid|utility|generator|gen/.test(t);
}

function isLoad(s: SymbolNode): boolean {
  const t = (s.confirmedType ?? s.typeCandidates[0] ?? '').toLowerCase();
  return /load|motor|mcc|panel|feeder/.test(t);
}

function isProtection(s: SymbolNode): boolean {
  const t = (s.confirmedType ?? s.typeCandidates[0] ?? '').toLowerCase();
  return /breaker|vcb|acb|mccb|fuse|cb|rcd/.test(t);
}

function isBusLike(s: SymbolNode): boolean {
  const t = (s.confirmedType ?? s.typeCandidates[0] ?? '').toLowerCase();
  return /bus|bar/.test(t);
}

export type { RecommendationStatus };
