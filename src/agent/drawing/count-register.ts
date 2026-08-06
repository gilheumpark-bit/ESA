/**
 * symbolOccurrences vs physicalEquipmentCount — never mix into confirmed totals.
 */

import type {
  CountStatus,
  CrossPageRelation,
  EquipmentCountRow,
  SymbolNode,
  UnresolvedItem,
} from './types-v3';

export function buildEquipmentCounts(
  symbols: SymbolNode[],
  equipmentLinks: Map<string, string>, // symbolId -> equipmentId E###
  crossPage: CrossPageRelation[],
  unresolved: UnresolvedItem[],
): EquipmentCountRow[] {
  const kinds = new Map<string, SymbolNode[]>();
  for (const s of symbols) {
    const kind = normalizeKind(s.confirmedType ?? s.typeCandidates[0] ?? 'unknown');
    const list = kinds.get(kind) ?? [];
    list.push(s);
    kinds.set(kind, list);
  }

  const rows: EquipmentCountRow[] = [];
  for (const [equipmentKind, list] of kinds) {
    const confirmedList = list.filter((s) => s.certainty === 'confirmed');
    const ambiguousList = list.filter((s) => s.certainty === 'ambiguous');
    const unreadRelated = unresolved.filter(
      (u) =>
        (u.code === 'UNREADABLE_SYMBOL' || u.code === 'AMBIGUOUS_OCR')
        && list.some((s) => s.evidence[0] && boundsOverlapNote(s, u)),
    ).length;

    const symbolOccurrences = list.length;
    const physicalIds = new Set<string>();
    for (const s of confirmedList) {
      physicalIds.add(equipmentLinks.get(s.id) ?? s.id);
    }
    const hasCrossPageCandidates = crossPage.some(
      (c) => c.status === 'candidate' && list.some((s) => c.fromRef === s.id || c.toRef === s.id),
    );

    let physicalEquipmentCount: number | null = physicalIds.size;
    if (confirmedList.length === 0 && ambiguousList.length > 0) {
      physicalEquipmentCount = null;
    }

    const hasStructuralCoverageGap = unresolved.some((u) =>
      u.code === 'EMPTY_REGION_RESULT' || u.code === 'BOUNDARY_CLIP');
    const missingSuspected = unreadRelated + (hasStructuralCoverageGap ? 1 : 0);

    const countStatus = resolveCountStatus({
      ambiguous: ambiguousList.length,
      missingSuspected,
      hasCrossPageCandidates,
      failedUnresolved: unresolved.some((u) =>
        u.code === 'ROLE_CALL_FAILED' || u.code === 'HOLD_RESCAN_UNRESOLVED'),
    });

    rows.push({
      equipmentKind,
      confirmed: confirmedList.length,
      ambiguous: ambiguousList.length,
      missingSuspected,
      physicalEquipmentCount,
      symbolOccurrences,
      countStatus,
    });
  }

  return rows.sort((a, b) => a.equipmentKind.localeCompare(b.equipmentKind));
}

export function assignPhysicalEquipmentIds(
  symbols: SymbolNode[],
  crossPageConfirmed: CrossPageRelation[],
): Map<string, string> {
  const map = new Map<string, string>();
  let eSeq = 0;
  const parent = new Map<string, string>();

  const find = (id: string): string => {
    const p = parent.get(id);
    if (!p || p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const s of symbols) parent.set(s.id, s.id);
  for (const rel of crossPageConfirmed) {
    if (rel.status === 'confirmed') union(rel.fromRef, rel.toRef);
  }

  // A two/three-winding transformer is drawn as overlapping winding circles.
  // Keep every circle as traceable symbol evidence, but bind the overlapping
  // windings to one physical equipment ID for the quantity register.
  const windings = symbols.filter((symbol) =>
    symbol.certainty === 'confirmed' && isTransformerWinding(symbol));
  for (let leftIndex = 0; leftIndex < windings.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < windings.length; rightIndex += 1) {
      if (samePageBoundsOverlap(windings[leftIndex], windings[rightIndex])) {
        union(windings[leftIndex].id, windings[rightIndex].id);
      }
    }
  }

  // Same tag + type on different pages stays separate unless cross-page confirmed
  const roots = new Map<string, string>();
  for (const s of symbols) {
    if (s.certainty !== 'confirmed') continue;
    const root = find(s.id);
    if (!roots.has(root)) {
      roots.set(root, `E${String(++eSeq).padStart(3, '0')}`);
    }
    map.set(s.id, roots.get(root)!);
  }
  return map;
}

function isTransformerWinding(symbol: SymbolNode): boolean {
  const type = (symbol.confirmedType ?? symbol.typeCandidates[0] ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return type === 'transformer_winding';
}

function samePageBoundsOverlap(left: SymbolNode, right: SymbolNode): boolean {
  const leftEvidence = left.evidence[0];
  const rightEvidence = right.evidence[0];
  if (!leftEvidence || !rightEvidence || leftEvidence.pageIndex !== rightEvidence.pageIndex) return false;
  const a = leftEvidence.bounds;
  const b = rightEvidence.bounds;
  return Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x)
    && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
}

function resolveCountStatus(input: {
  ambiguous: number;
  missingSuspected: number;
  hasCrossPageCandidates: boolean;
  failedUnresolved: boolean;
}): CountStatus {
  if (input.failedUnresolved || input.missingSuspected > 0) return 'HOLD';
  if (input.ambiguous > 0 || input.hasCrossPageCandidates) return 'CONDITIONAL';
  return 'COMPLETE';
}

function normalizeKind(type: string): string {
  // **구분자를 먼저 통일한다.** 모델은 같은 기기를 `current_transformer` 로도
  // `current transformer` 로도 낸다. 종전에는 밑줄형만 검사해서 공백형이
  // 아래 일반 분기 `includes('transformer')` 로 떨어졌고, **CT·ZCT 가
  // 전력변압기 대수에 합산**됐다.
  //
  // 실측(2026-08-06, KIMM p5 · PDF 3회): 한 회차에서 `current transformer`
  // 7개(`CTx3 160/5A`·`ZCT 200/1.5mA` 등)가 전력변압기로 세어져 5 대신 12 가
  // 나왔다. 회차마다 모델이 어느 형태를 내느냐에 따라 값이 흔들렸으므로
  // **이 결함이 계수 변동의 출처이기도 하다.**
  const t = type.toLowerCase().replace(/[\s-]+/g, '_');
  if (t.includes('vcb') || t === 'breaker') return 'VCB/breaker';
  // 계량·계측 기기를 전력변압기보다 **먼저** 가른다. 일반 분기가 앞에 있으면
  // `transformer_ct`·`transformer_vt` 가 `includes('transformer')` 에 걸려
  // 전력변압기 대수에 합산되고, 아래 PT 분기는 도달조차 못 한다.
  if (t === 'transformer_ct' || t === 'ct' || t.includes('current_transformer')) return 'CT';
  if (t === 'transformer_zct' || t === 'zct') return 'ZCT';
  if (t === 'transformer_gpt' || t === 'gpt') return 'GPT';
  // `potential_transformer`·`vt_pt` 를 여기서 잡지 않으면 아래 일반 분기의
  // `includes('transformer')` 에 걸려 **전력변압기 대수로 합산**된다.
  // `vt_pt` 는 중복 병합기가 PTx3·PPT 명판에 붙이는 정본 타입이다
  // (evidence-deduplicator 의 canonicalSymbolType).
  if (t === 'transformer_vt' || t === 'vt' || t === 'pt' || t === 'ppt' || t === 'vt_pt'
    || t.includes('voltage_transformer') || t.includes('potential_transformer')) return 'PT/PPT';
  // 계기용변성기 총칭. 전력변압기가 아니므로 대수에 섞으면 안 되지만, CT/PT 로
  // 특정할 근거도 없으므로 자기 종류로 남긴다.
  //
  // 실측(2026-08-05, KIMM 수변전 단선결선도 p5 · PDF 경로): 그래프의 전력변압기
  // 노드는 5~8개인데 `physicalEquipmentCount` 가 11 로 나왔다. 차이는
  // `instrument_transformer` 4 + `potential_transformer` 3 이 여기 합산된 것이었다.
  // 계기용변성기를 전력변압기로 세면 검토자는 없는 변압기를 찾게 된다.
  if (t === 'instrument_transformer' || t.includes('instrument_transformer')) return 'instrument transformer';
  if (t === 'metering_outfit' || t === 'mof') return 'MOF';
  // 건식·유입·단권은 모두 전력변압기라 함께 센다.
  if (t.includes('transformer') || t === 'tr') return 'transformer';
  return type;
}

function boundsOverlapNote(s: SymbolNode, u: UnresolvedItem): boolean {
  const b = s.evidence[0]?.bounds;
  if (!b || u.pageIndex !== s.evidence[0].pageIndex) return false;
  return !(
    b.x + b.w < u.bounds.x
    || u.bounds.x + u.bounds.w < b.x
    || b.y + b.h < u.bounds.y
    || u.bounds.y + u.bounds.h < b.y
  );
}
