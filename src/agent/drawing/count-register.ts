/**
 * symbolOccurrences vs physicalEquipmentCount — never mix into confirmed totals.
 */

import { canonicalDeviceType } from './device-vocabulary';
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

/**
 * 닫힌 어휘 → 계수 버킷.
 *
 * 종전에는 이 함수가 날 문자열의 철자를 직접 알았다. 그래서 모델이 새 철자를
 * 낼 때마다 여기서 새는 구멍이 생겼다 —
 *
 *   24차  `instrument_transformer` 가 전력변압기 대수에 합산
 *   26차  `current transformer`(공백형)이 밑줄형 검사를 빠져나가 CT 가 전력변압기로
 *
 * 이제 철자를 아는 곳은 `device-vocabulary` 하나이고, 여기는 **닫힌 어휘에서
 * 버킷으로만** 옮긴다. 어휘에 없는 값은 `'other'` 로 오고, 그때는 추측하지 않고
 * 날 문자열을 그대로 보여 준다.
 */
function normalizeKind(type: string): string {
  const canonical = canonicalDeviceType(type);
  switch (canonical) {
    case 'breaker': return 'VCB/breaker';
    // 계기용변성기는 전력변압기 대수에 절대 섞지 않는다. 섞으면 검토자가
    // 없는 변압기를 찾는다(24차 실측: 그래프 5~8대인데 계수 11).
    case 'current_transformer': return 'CT';
    case 'zero_sequence_ct': return 'ZCT';
    case 'ground_potential_transformer': return 'GPT';
    case 'voltage_transformer': return 'PT/PPT';
    case 'instrument_transformer': return 'instrument transformer';
    case 'metering_outfit': return 'MOF';
    // 건식·유입·단권은 모두 전력변압기라 함께 센다. 권선 기호도 여기다 —
    // 2권선 변압기는 원 두 개로 그려지고 `assignPhysicalEquipmentIds` 가 그
    // 원들을 한 대로 묶으므로, 버킷이 갈리면 묶을 대상이 사라진다.
    case 'transformer': case 'transformer_winding': return 'transformer';
    // 모르는 것은 아는 척하지 않는다 — 날 문자열 그대로 남긴다.
    case 'other': return type;
    default: return canonical;
  }
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
