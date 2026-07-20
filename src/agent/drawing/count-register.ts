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

    const missingSuspected = unreadRelated
      + unresolved.filter((u) => u.code === 'EMPTY_REGION_RESULT' || u.code === 'BOUNDARY_CLIP').length > 0
      ? Math.max(unreadRelated, unresolved.some((u) => u.code === 'EMPTY_REGION_RESULT') ? 1 : 0)
      : 0;

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
  const t = type.toLowerCase();
  if (t.includes('vcb') || t === 'breaker') return 'VCB/breaker';
  if (t.includes('transformer') || t === 'tr') return 'transformer';
  if (t === 'pt' || t === 'ppt' || t.includes('voltage_transformer')) return 'PT/PPT';
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
