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

export interface RecommendationInput {
  symbols: SymbolNode[];
  relations: RelationEdge[];
  calculations: CalculationLink[];
  unresolved: UnresolvedItem[];
  hasGroundPath?: boolean;
}

export function buildRecommendations(input: RecommendationInput): RecommendationV3[] {
  const out: RecommendationV3[] = [];
  let seq = 0;
  const confirmed = input.symbols.filter((s) => s.certainty === 'confirmed');
  const confIds = new Set(confirmed.map((s) => s.id));

  // Orphan devices
  const connected = new Set<string>();
  for (const r of input.relations) {
    if (r.certainty !== 'confirmed') continue;
    connected.add(r.from);
    connected.add(r.to);
  }
  for (const s of confirmed) {
    if (!connected.has(s.id) && !isBusLike(s)) {
      out.push(rec(++seq, {
        severity: 'major',
        problem: `${s.displayId} 장치가 확정 결선에 연결되지 않았습니다 (고아 장치).`,
        relatedDisplayIds: [s.displayId],
        evidenceIds: s.evidence.map((e) => e.evidenceId),
        status: 'SUPPORTED',
        recommendedAction: '결선 누락·구획 경계 잘림·페이지 참조를 확인하십시오.',
        requiredInputs: [],
        standardRefs: [],
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
        out.push(rec(++seq, {
          severity: 'critical',
          problem: `${src.displayId} → ${load.displayId} 경로에 보호기가 확인되지 않습니다.`,
          relatedDisplayIds: [src.displayId, load.displayId],
          evidenceIds: path.flatMap((id) =>
            confirmed.find((s) => s.id === id)?.evidence.map((e) => e.evidenceId) ?? []),
          status: 'SUPPORTED',
          recommendedAction: '경로상 차단기·퓨즈 존재 여부와 도면 누락을 재확인하십시오.',
          requiredInputs: [],
          standardRefs: ['KEC 보호 일반'],
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
    out.push(rec(++seq, {
      severity: 'critical',
      problem: '접지 경로가 확정 그래프에서 확인되지 않았습니다.',
      relatedDisplayIds: [],
      evidenceIds: [],
      status: confIds.size > 0 ? 'SUPPORTED' : 'HOLD',
      recommendedAction: '접지 기호·접지선 표기를 확인하고 필요 시 재스캔하십시오.',
      requiredInputs: confIds.size > 0 ? [] : ['접지 표기 근거'],
      standardRefs: ['KEC 접지'],
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
      && (r.calcReceiptIds.length > 0 || r.standardRefs.length > 0 || r.requiredInputs.length === 0);
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
