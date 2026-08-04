/**
 * Merge overlapping region detections into original-coordinate entities.
 */

import { createHash } from 'node:crypto';

import type { EvidenceBounds } from '../vision/evidence-types';
import { hasDeviceClass } from './device-class';
import type { Certainty, LineNode, RelationEdge, SymbolNode, TextNode, UnresolvedItem } from './types-v3';

export interface RawSymbolHit {
  localId: string;
  type: string;
  label?: string;
  bounds: EvidenceBounds;
  confidence: number;
  pageIndex: number;
  regionId: string;
  certainty?: Certainty;
  sourceEvidenceIds?: string[];
}

export interface RawLineHit {
  localId: string;
  lineKind: LineNode['lineKind'];
  path: Array<{ x: number; y: number }>;
  junctions?: Array<{ x: number; y: number }>;
  crossovers?: Array<{ x: number; y: number }>;
  confidence: number;
  pageIndex: number;
  regionId: string;
  regionDisplayId?: string;
  regionDisplayIds?: string[];
  startAnchorId?: string;
  endAnchorId?: string;
  openEndReason?: 'page-edge' | 'device-boundary' | 'unresolved' | null;
  certainty?: Certainty;
  sourceEvidenceIds?: string[];
}

function evidenceRefs(
  hit: Pick<RawSymbolHit, 'sourceEvidenceIds' | 'pageIndex' | 'bounds' | 'regionId' | 'confidence'>,
  fallbackId: string,
) {
  const ids = hit.sourceEvidenceIds?.length ? [...new Set(hit.sourceEvidenceIds)] : [fallbackId];
  return ids.map((evidenceId) => ({
    evidenceId,
    pageIndex: hit.pageIndex,
    bounds: hit.bounds,
    regionId: hit.regionId,
    confidence: hit.confidence,
  }));
}

export function deduplicateSymbols(
  hits: RawSymbolHit[],
  tolerance = 24,
): SymbolNode[] {
  const kept: SymbolNode[] = [];
  const pageSequences = new Map<number, number>();
  const ordered = [...hits].sort((left, right) =>
    left.pageIndex - right.pageIndex
    || left.bounds.y - right.bounds.y
    || left.bounds.x - right.bounds.x
    || left.localId.localeCompare(right.localId));

  for (const hit of ordered) {
    const hitType = canonicalSymbolType(hit.type, hit.label);
    const dup = kept.find((k) => {
      // 명판이 같고 한쪽이 다른 쪽의 쪼개진 판독이면, 기존 겹침·근접 조건을
      // 못 넘겨도 같은 기기다. 조밀한 실도면에서는 같은 기기를 50px 밀려
      // 다시 읽으면 겹침이 0이 되어 종전 조건이 전부 빠져나갔다.
      if (typesCompatible(k.confirmedType ?? k.typeCandidates[0] ?? '', hitType)
        && labelsSameNameplate(k.rawLabel, hit.label)
        && k.evidence.some((evidence) => evidence.pageIndex === hit.pageIndex
          && sameNameplateSplitRead(evidence.bounds, hit.bounds))) {
        return true;
      }
      const samePhysicalBounds = k.evidence.some((evidence) => evidence.pageIndex === hit.pageIndex
        && (boundsNear(evidence.bounds, hit.bounds, tolerance)
          || boundsStronglyOverlap(evidence.bounds, hit.bounds)
          || boundsPartialReadOverlap(evidence.bounds, hit.bounds)));
      if (!samePhysicalBounds) return false;
      const sameType = k.typeCandidates.some((candidate) => typesCompatible(candidate, hitType));
      if (sameType || labelsEquivalent(k.rawLabel, hit.label)) return true;
      // 서로 다른 기기 몸체는 몸체 과반이 겹치게 그려지지 않는다(위
      // boundsStronglyOverlap 주석). 그 자리에 개폐·보호 계열끼리 타입만
      // 갈리면 별개 기기가 아니라 같은 글리프의 판독 충돌이므로 하나의
      // ambiguous 노드로 접는다.
      //
      // 두 겹침 조건을 모두 받는다.
      //  - 비슷한 크기의 강겹침: 같은 몸체를 두 번 읽은 경우.
      //  - 부분 판독(boundsPartialReadOverlap): 전체 판독이 79px 퓨즈 몸통을
      //    잡고 구획 재판독이 그 상단 17px 조각만 잡은 경우. 면적비가 6배라
      //    areasComparable 로는 걸러진다 — 그 가드는 포함 관계(모선 위 인라인
      //    기기)를 막으려던 것인데 정작 잡아야 할 부분 판독까지 막았다.
      //    중급 실측에서 breaker 오탐 12개 중 11개가 이 형태였다.
      return inSwitchgearFamily(hitType)
        && k.typeCandidates.every((candidate) => inSwitchgearFamily(candidate))
        && k.evidence.some((evidence) => evidence.pageIndex === hit.pageIndex
          && ((boundsStronglyOverlap(evidence.bounds, hit.bounds)
            && areasComparable(evidence.bounds, hit.bounds))
            || boundsPartialReadOverlap(evidence.bounds, hit.bounds)));
    });

    if (dup) {
      const previousMaxConfidence = Math.max(...dup.evidence.map((item) => item.confidence));
      const incoming = evidenceRefs(hit, `${dup.id}-e${dup.evidence.length}`)
        .filter((item) => !dup.evidence.some((existing) => existing.evidenceId === item.evidenceId));
      dup.evidence.push(...incoming);
      const typeConflict = !dup.typeCandidates.some((candidate) => typesCompatible(candidate, hitType));
      dup.typeCandidates = unique([...dup.typeCandidates, hitType]);
      if (typeConflict) {
        // 조각과 본체의 충돌은 대칭이 아니다. 79px 퓨즈 몸통을 확정으로 읽은
        // 판독과 그 상단 17px 조각을 breaker 로 읽은 판독이 충돌하면, 조각이
        // 본체 확정을 강등시켜선 안 된다 — 실측에서 이 강등이 물리 퓨즈
        // 카운트를 무너뜨렸다(count-register 는 confirmed 만 물리 수로 센다).
        // 반대로 조각으로 태어난 노드에 본체 확정 판독이 오면 본체가 이긴다.
        // 비슷한 크기끼리의 진짜 충돌만 ambiguous 로 내린다.
        const hitArea = hit.bounds.w * hit.bounds.h;
        const largestArea = Math.max(...dup.evidence.map((item) => item.bounds.w * item.bounds.h));
        const hitIsFragment = hitArea * 4 <= largestArea;
        const hitIsBody = largestArea * 4 <= hitArea;
        // 지정문자는 충돌도 이긴다. canonicalSymbolType 은 들어오는 판독 하나를
        // 정규화할 뿐이라, FU2 를 fuse 로 읽은 판독과 같은 자리를 switch 로 읽은
        // 판독이 만나면 지정문자를 쥐고도 ambiguous 로 무너졌다. 도면이 스스로
        // "FU2" 라고 선언한 것이 서로 어긋난 크롭 분류 둘보다 강한 근거다.
        //
        // 실측(2026-08-04, gemini·intermediate 5회): 매 실행 퓨즈 후보를 14~15개
        // 읽어 놓고 확정은 11~14개였다. 손실은 판독이 아니라 이 판정이었고,
        // 매번 라벨 FU2 노드가 ["fuse","switch"] 로 남아 있었다.
        //
        // **조각 보호를 건너뛰지 않는다.** 이 분기를 조각/본체 비대칭 판정
        // *앞*에 뒀더니 반토막 판독(26x37 · 정상 퓨즈는 31x79)까지 FU2 라벨만
        // 보고 확정으로 올려, 퓨즈가 15개 정답에 17개로 넘쳤다(2026-08-04 실측).
        // 지정문자는 **비슷한 크기끼리의 진짜 타입 충돌**을 푸는 데만 쓴다.
        const declaredType = designatorType(dup.rawLabel) ?? designatorType(hit.label);
        const designatorResolves = declaredType !== undefined
          && dup.typeCandidates.includes(declaredType)
          && !hitIsFragment && !hitIsBody;
        if (dup.confirmedType && hitIsFragment) {
          // 후보와 근거는 이미 보존됐다. 확정과 라벨은 본체 판독의 것을 유지한다.
        } else if (!dup.confirmedType && hitIsBody
          && (hit.certainty === 'confirmed' || hit.confidence >= 0.85)) {
          dup.confirmedType = hitType;
          dup.certainty = 'confirmed';
          dup.rawLabel = hit.label ?? dup.rawLabel;
        } else if (designatorResolves) {
          dup.confirmedType = declaredType;
          dup.certainty = 'confirmed';
          dup.rawLabel = dup.rawLabel ?? hit.label;
        } else {
          dup.confirmedType = undefined;
          dup.certainty = 'ambiguous';
          dup.rawLabel = dup.rawLabel ?? hit.label;
        }
      } else if (hit.confidence > previousMaxConfidence) {
        dup.rawLabel = hit.label ?? dup.rawLabel;
        if (hit.certainty === 'confirmed' || hit.confidence >= 0.85) {
          dup.confirmedType = hitType;
          dup.certainty = 'confirmed';
        }
      }
      continue;
    }

    const page = hit.pageIndex + 1;
    const seq = (pageSequences.get(hit.pageIndex) ?? 0) + 1;
    pageSequences.set(hit.pageIndex, seq);
    const displayId = `P${String(page).padStart(2, '0')}-S${String(seq).padStart(3, '0')}`;
    const id = stableId('sym', [hit.pageIndex, normalizeType(hitType), normalizeLabel(hit.label), boundsKey(hit.bounds)]);
    kept.push({
      id,
      displayId,
      typeCandidates: [hitType],
      confirmedType: hit.certainty === 'confirmed' ? hitType : undefined,
      rawLabel: hit.label,
      certainty: hit.certainty ?? (hit.confidence >= 0.85 ? 'confirmed' : 'ambiguous'),
      evidence: evidenceRefs(hit, `${id}-e0`),
    });
  }
  return kept;
}

/**
 * 기기 몸체 안에 갇힌 확정 심볼을 표기 후보로 강등한다.
 *
 * 실측(저장된 실제 판독 20회, 확정 322개): 15개가 이 형태였다. 전부 퓨즈
 * 사각형 안에 인쇄된 단자 번호 "1"·"2" 를 모델이 `terminal` 기기로 읽은 것이다.
 * 원본 도면을 열어 확인했다 — 그 자리에 별개 단자대는 없다. 확정으로 남으면
 * 물리 기기 수가 부풀고, 검토자는 없는 단자대를 찾게 된다.
 *
 * 중복 병합기는 이걸 못 잡는다: 병합 조건이 **같은 기기의 두 번 판독**이라
 * 타입이 호환되거나 개폐 계열끼리여야 한다. terminal ⊄ fuse 는 둘 다 아니다.
 * 여기는 다른 질문이다 — "겹친 두 판독이 같은 기기인가"가 아니라
 * "작은 판독이 큰 기기의 **표기**인가".
 *
 * ■ 안전 방향 — 지우지 않고, 구조 기기는 건드리지 않는다
 *
 * 노드도 근거도 남는다. `ambiguous` 로 내려 물리 수에서 빠지고 확인 항목이
 * 붙을 뿐이다. 그리고 source·protection·load·bus 로 분류되는 심볼은 강등하지
 * 않는다 — 그 분류는 "경로에 보호기 없음" critical 소견의 입력이라,
 * 여기서 조용히 지우면 그 판정이 같이 사라진다(device-class 주석의 같은 논거).
 */
export function demoteContainedMarkings(symbols: SymbolNode[]): UnresolvedItem[] {
  const items: UnresolvedItem[] = [];
  for (const inner of symbols) {
    if (inner.certainty !== 'confirmed') continue;
    if (isStructuralDevice(inner)) continue;
    const innerRef = smallestEvidence(inner);
    if (!innerRef) continue;

    const host = symbols.find((outer) => outer.id !== inner.id
      && outer.certainty === 'confirmed'
      && outer.evidence.some((ref) => ref.pageIndex === innerRef.pageIndex
        && boundsContain(ref.bounds, innerRef.bounds)));
    if (!host) continue;

    inner.certainty = 'ambiguous';
    inner.confirmedType = undefined;
    const hostType = host.confirmedType ?? host.typeCandidates[0] ?? '미상';
    items.push({
      id: `contained-marking-${inner.id}`,
      code: 'UNREADABLE_SYMBOL',
      displayId: inner.displayId,
      pageIndex: innerRef.pageIndex,
      bounds: innerRef.bounds,
      candidates: unique(inner.typeCandidates),
      note: `${host.displayId}(${hostType}) 몸체 안에 갇힌 판독이라 물리 기기 수에서 뺐습니다.`,
      userConfirmItems: [{
        question: `${inner.displayId} 은 ${host.displayId}(${hostType}) 몸체 안에 있습니다.`
          + ' 별개 기기입니까, 아니면 그 기기의 표기입니까?',
        options: ['별개 기기', `${host.displayId} 의 표기`],
      }],
    });
  }
  return items;
}

/** 강등에서 제외할 구조 기기. 이 분류가 critical 소견의 입력이다. */
function isStructuralDevice(symbol: SymbolNode): boolean {
  return (['source', 'protection', 'load', 'bus'] as const)
    .some((cls) => hasDeviceClass(symbol, cls));
}

/** 가장 작은 근거 상자. 조각 판독이 섞여 있을 때 포함 판정을 낙관하지 않는다. */
function smallestEvidence(symbol: SymbolNode): SymbolNode['evidence'][number] | undefined {
  return [...symbol.evidence].sort((a, b) => a.bounds.w * a.bounds.h - b.bounds.w * b.bounds.h)[0];
}

/** inner 가 outer 안에 사실상 갇혀 있는가. 몸체는 조각보다 4배 이상 커야 한다. */
function boundsContain(outer: EvidenceBounds, inner: EvidenceBounds): boolean {
  const innerArea = inner.w * inner.h;
  if (innerArea <= 0 || outer.w * outer.h < innerArea * 4) return false;
  const overlapWidth = Math.max(0, Math.min(outer.x + outer.w, inner.x + inner.w) - Math.max(outer.x, inner.x));
  const overlapHeight = Math.max(0, Math.min(outer.y + outer.h, inner.y + inner.h) - Math.max(outer.y, inner.y));
  return (overlapWidth * overlapHeight) / innerArea >= 0.9;
}

export function deduplicateLines(hits: RawLineHit[], tolerance = 18): LineNode[] {
  const kept: LineNode[] = [];
  const pageSequences = new Map<number, number>();
  const ordered = [...hits].sort((left, right) =>
    left.pageIndex - right.pageIndex
    || (left.path[0]?.y ?? 0) - (right.path[0]?.y ?? 0)
    || (left.path[0]?.x ?? 0) - (right.path[0]?.x ?? 0)
    || left.localId.localeCompare(right.localId));
  for (const hit of ordered) {
    if (hit.path.length < 2) continue;
    const start = hit.path[0];
    const end = hit.path[hit.path.length - 1];
    const dup = kept.find((k) => {
      if (k.evidence[0]?.pageIndex !== hit.pageIndex) return false;
      // The same heavy conductor is often called `bus` in the full-page read
      // and `power` in a crop. Geometry, not that role-name disagreement,
      // identifies the physical line. Ground/control remain electrically
      // distinct and must never be folded into it.
      if (!lineKindsEquivalentForDedup(k.lineKind, hit.lineKind)) return false;
      const ks = k.path[0];
      const ke = k.path[k.path.length - 1];
      return (dist(ks, start) <= tolerance && dist(ke, end) <= tolerance)
        || (dist(ks, end) <= tolerance && dist(ke, start) <= tolerance)
        || substantiallyOverlappingSegments(ks, ke, start, end, tolerance);
    });
    if (dup) {
      const incoming = evidenceRefs({ ...hit, bounds: pathBounds(hit.path) }, `${dup.id}-e${dup.evidence.length}`)
        .filter((item) => !dup.evidence.some((existing) => existing.evidenceId === item.evidenceId));
      dup.evidence.push(...incoming);
      if (hit.lineKind === 'bus' || (dup.lineKind === 'unknown' && hit.lineKind !== 'unknown')) {
        dup.lineKind = hit.lineKind;
      }
      dup.junctions = mergePoints(dup.junctions, hit.junctions ?? [], tolerance);
      dup.crossovers = mergePoints(dup.crossovers, hit.crossovers ?? [], tolerance);
      if (dist(start, end) > dist(dup.path[0], dup.path[dup.path.length - 1])) {
        dup.path = hit.path.map((point) => ({ ...point }));
      }
      continue;
    }
    const page = hit.pageIndex + 1;
    const seq = (pageSequences.get(hit.pageIndex) ?? 0) + 1;
    pageSequences.set(hit.pageIndex, seq);
    const displayId = `P${String(page).padStart(2, '0')}-L${String(seq).padStart(3, '0')}`;
    const id = stableId('line', [hit.pageIndex, hit.lineKind, hit.path.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(';')]);
    kept.push({
      id,
      displayId,
      lineKind: hit.lineKind,
      path: hit.path,
      junctions: [...(hit.junctions ?? [])],
      crossovers: [...(hit.crossovers ?? [])],
      certainty: hit.certainty ?? (hit.confidence >= 0.8 ? 'confirmed' : 'ambiguous'),
      evidence: evidenceRefs({ ...hit, bounds: pathBounds(hit.path) }, `${id}-e0`),
    });
  }
  return kept;
}

export function assignDisplayIdsForTexts(
  texts: Array<{
    text: string;
    bounds: EvidenceBounds;
    pageIndex: number;
    certainty: Certainty;
    confidence: number;
    candidates?: string[];
  }>,
): TextNode[] {
  const pageSequences = new Map<number, number>();
  return [...texts].sort((left, right) =>
    left.pageIndex - right.pageIndex
    || left.bounds.y - right.bounds.y
    || left.bounds.x - right.bounds.x
    || left.text.localeCompare(right.text)).map((t) => {
    const page = t.pageIndex + 1;
    const seq = (pageSequences.get(t.pageIndex) ?? 0) + 1;
    pageSequences.set(t.pageIndex, seq);
    const displayId = `P${String(page).padStart(2, '0')}-T${String(seq).padStart(3, '0')}`;
    const id = `txt-${t.pageIndex}-${seq}`;
    return {
      id,
      displayId,
      rawText: t.text,
      confirmedText: t.certainty === 'confirmed' ? t.text : undefined,
      candidates: t.candidates ?? [t.text],
      certainty: t.certainty,
      evidence: [{
        evidenceId: `${id}-e0`,
        pageIndex: t.pageIndex,
        bounds: t.bounds,
        confidence: t.confidence,
      }],
    };
  });
}

export function buildPageRelations(
  symbols: SymbolNode[],
  lines: LineNode[],
  pageIndex: number,
): RelationEdge[] {
  // 모호한 기기 후보도 선로 종단 후보로 연결해 사용자가 번호 관계를 검토할 수
  // 있게 한다. 단, 어느 한쪽이라도 미확정이면 관계 전체를 ambiguous로 유지한다.
  const pageSymbols = symbols.filter((s) => s.evidence[0]?.pageIndex === pageIndex && s.certainty !== 'unread');
  const pageLines = lines.filter((l) => l.evidence[0]?.pageIndex === pageIndex && l.certainty !== 'unread');
  const relations: RelationEdge[] = [];
  const relatedPairs = new Set<string>();
  let seq = 0;

  const appendRelation = (from: SymbolNode, to: SymbolNode, line: LineNode, certainty: Certainty): void => {
    const pairKey = [from.id, to.id].sort().join('|');
    if (relatedPairs.has(pairKey)) return;
    relatedPairs.add(pairKey);
    const page = pageIndex + 1;
    const displayId = `P${String(page).padStart(2, '0')}-R${String(++seq).padStart(3, '0')}`;
    relations.push({
      id: `rel-${pageIndex}-${seq}`,
      displayId,
      from: from.id,
      to: to.id,
      lineId: line.id,
      certainty,
      evidence: [...from.evidence, ...to.evidence, ...line.evidence],
    });
  };

  const endpointSymbols = new Map(pageLines.map((line) => {
    const start = nearestSymbol(pageSymbols, line.path[0]);
    const end = nearestSymbol(pageSymbols, line.path[line.path.length - 1]);
    return [line.id, { start, end }] as const;
  }));

  for (const line of pageLines) {
    const symbolsOnConductor = orderedSymbolsOnConductor(pageSymbols, line);
    for (let index = 1; index < symbolsOnConductor.length; index += 1) {
      const from = symbolsOnConductor[index - 1];
      const to = symbolsOnConductor[index];
      if (from.id === to.id) continue;
      appendRelation(
        from,
        to,
        line,
        line.certainty === 'confirmed' && from.certainty === 'confirmed' && to.certainty === 'confirmed'
          ? 'confirmed'
          : 'ambiguous',
      );
    }
  }

  // Precision crops often leave a small gap between a branch endpoint and the
  // bus segment seen in a neighboring crop. Trace only a perpendicular
  // endpoint-to-segment continuation, then attach the branch device to a
  // busbar already anchored elsewhere in that conductor component. Relations
  // created through this inferred bridge stay ambiguous.
  const adjacency = buildLineAdjacency(pageLines);
  for (const line of pageLines) {
    const direct = endpointSymbols.get(line.id);
    const directlyBound = [...new Map([direct?.start, direct?.end]
      .filter((symbol): symbol is SymbolNode => Boolean(symbol))
      .map((symbol) => [symbol.id, symbol])).values()];
    if (directlyBound.length !== 1 || isBusbar(directlyBound[0])) continue;
    const component = connectedLineIds(line.id, adjacency);
    const busbars = [...new Map(component.flatMap((lineId) => {
      const bound = endpointSymbols.get(lineId);
      return [bound?.start, bound?.end]
        .filter((symbol): symbol is SymbolNode => symbol !== null && symbol !== undefined)
        .filter(isBusbar);
    }).map((symbol) => [symbol.id, symbol])).values()];
    if (busbars.length === 0) continue;
    const targetPoint = direct?.start?.id === directlyBound[0].id
      ? line.path[line.path.length - 1]
      : line.path[0];
    const busbar = busbars.sort((left, right) => symbolDistance(left, targetPoint) - symbolDistance(right, targetPoint))[0];
    appendRelation(busbar, directlyBound[0], line, 'ambiguous');
  }

  // A precision grid can split one conductor into two valid crop-edge
  // fragments. When the geometry reconciler proves those fragments meet,
  // connect the devices observed across the whole conductor component. Use a
  // minimum spanning tree so a branched conductor yields the smallest useful
  // relation set rather than an all-to-all clique. These are always ambiguous:
  // the application joined the fragments; no reviewer saw the complete edge.
  const processedLineIds = new Set<string>();
  const lineById = new Map(pageLines.map((line) => [line.id, line]));
  for (const line of pageLines) {
    if (processedLineIds.has(line.id)) continue;
    const componentIds = connectedLineIds(line.id, adjacency);
    componentIds.forEach((id) => processedLineIds.add(id));
    if (componentIds.length < 2) continue;
    const componentLines = componentIds
      .map((id) => lineById.get(id))
      .filter((candidate): candidate is LineNode => candidate !== undefined);
    const symbolsByLine = new Map(componentLines.map((candidate) => {
      const bound = endpointSymbols.get(candidate.id);
      const boundSymbols = [
        ...orderedSymbolsOnConductor(pageSymbols, candidate),
        bound?.start,
        bound?.end,
      ].filter((symbol): symbol is SymbolNode => symbol !== null && symbol !== undefined);
      return [candidate.id, [...new Map(boundSymbols.map((symbol) => [symbol.id, symbol])).values()]] as const;
    }));
    const componentSymbols = [...new Map([...symbolsByLine.values()].flat()
      .map((symbol) => [symbol.id, symbol])).values()];
    if (componentSymbols.length < 2) continue;
    const symbolLineIds = new Map(componentSymbols.map((symbol) => [
      symbol.id,
      [...symbolsByLine.entries()]
        .filter(([, boundSymbols]) => boundSymbols.some((candidate) => candidate.id === symbol.id))
        .map(([lineId]) => lineId),
    ]));

    const parent = new Map(componentSymbols.map((symbol) => [symbol.id, symbol.id]));
    const find = (id: string): string => {
      const current = parent.get(id) ?? id;
      if (current === id) return id;
      const root = find(current);
      parent.set(id, root);
      return root;
    };
    const union = (left: string, right: string): void => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
    };

    for (let leftIndex = 0; leftIndex < componentSymbols.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < componentSymbols.length; rightIndex += 1) {
        const left = componentSymbols[leftIndex];
        const right = componentSymbols[rightIndex];
        if (relatedPairs.has([left.id, right.id].sort().join('|'))) union(left.id, right.id);
      }
    }

    const candidates = componentSymbols.flatMap((left, leftIndex) =>
      componentSymbols.slice(leftIndex + 1).map((right) => ({
        left,
        right,
        hops: shortestLineHops(symbolLineIds.get(left.id) ?? [], symbolLineIds.get(right.id) ?? [], adjacency),
        distance: dist(symbolCenter(left), symbolCenter(right)),
      })))
      .filter((candidate) => Number.isFinite(candidate.hops))
      .sort((a, b) => a.hops - b.hops || a.distance - b.distance || a.left.id.localeCompare(b.left.id) || a.right.id.localeCompare(b.right.id));
    for (const candidate of candidates) {
      if (find(candidate.left.id) === find(candidate.right.id)) continue;
      const relationLine = closestLineToSymbols(componentLines, candidate.left, candidate.right);
      appendRelation(candidate.left, candidate.right, relationLine, 'ambiguous');
      union(candidate.left.id, candidate.right.id);
    }
  }
  return relations;
}

function shortestLineHops(
  fromIds: readonly string[],
  toIds: readonly string[],
  adjacency: Map<string, Set<string>>,
): number {
  const targets = new Set(toIds);
  const visited = new Set<string>();
  let frontier = [...new Set(fromIds)];
  let hops = 0;
  while (frontier.length > 0) {
    if (frontier.some((id) => targets.has(id))) return hops;
    const next: string[] = [];
    for (const id of frontier) {
      if (visited.has(id)) continue;
      visited.add(id);
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visited.has(neighbor)) next.push(neighbor);
      }
    }
    frontier = [...new Set(next)];
    hops += 1;
  }
  return Number.POSITIVE_INFINITY;
}

function symbolCenter(symbol: SymbolNode): { x: number; y: number } {
  const bounds = symbol.evidence[0]?.bounds;
  return bounds
    ? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
    : { x: 0, y: 0 };
}

function closestLineToSymbols(lines: LineNode[], left: SymbolNode, right: SymbolNode): LineNode {
  const leftCenter = symbolCenter(left);
  const rightCenter = symbolCenter(right);
  return [...lines].sort((a, b) => {
    const score = (line: LineNode) =>
      projectPointOnPath(leftCenter, line.path).distance + projectPointOnPath(rightCenter, line.path).distance;
    return score(a) - score(b) || a.id.localeCompare(b.id);
  })[0];
}

function lineKindsEquivalentForDedup(
  left: LineNode['lineKind'],
  right: LineNode['lineKind'],
): boolean {
  if (left === right) return true;
  const conductorKinds = new Set<LineNode['lineKind']>(['bus', 'power', 'unknown']);
  return conductorKinds.has(left) && conductorKinds.has(right);
}

/**
 * Vision models commonly return one long polyline even when it passes through
 * one or more breakers. Binding only the two endpoints silently skips those
 * devices. Keep the endpoint candidates, add every symbol whose actual bounds
 * intersect the conductor, then order them by distance along the polyline so
 * the graph contains each adjacent electrical relationship.
 */
function orderedSymbolsOnConductor(symbols: SymbolNode[], line: LineNode): SymbolNode[] {
  const candidates = new Map<string, { symbol: SymbolNode; offset: number; distance: number }>();
  const append = (symbol: SymbolNode | null): void => {
    if (!symbol) return;
    const bounds = symbol.evidence[0]?.bounds;
    if (!bounds) return;
    const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
    const projection = projectPointOnPath(center, line.path);
    const previous = candidates.get(symbol.id);
    if (!previous || projection.distance < previous.distance) {
      candidates.set(symbol.id, { symbol, ...projection });
    }
  };

  append(nearestSymbol(symbols, line.path[0]));
  append(nearestSymbol(symbols, line.path[line.path.length - 1]));
  for (const symbol of symbols) {
    const bounds = symbol.evidence[0]?.bounds;
    // Deterministic raster fallback lines are intentionally ambiguous and can
    // sit a few antialias pixels above a roof/device boundary. Allow that
    // bounded gap only on ambiguous lines; confirmed reviewer geometry keeps
    // the strict two-pixel contact rule.
    const contactTolerance = line.certainty === 'confirmed' ? 2 : 10;
    if (bounds && pathIntersectsBounds(line.path, bounds, contactTolerance)) append(symbol);
  }

  return [...candidates.values()]
    .sort((left, right) => left.offset - right.offset || left.distance - right.distance || left.symbol.id.localeCompare(right.symbol.id))
    .map(({ symbol }) => symbol);
}

function projectPointOnPath(
  point: { x: number; y: number },
  path: LineNode['path'],
): { offset: number; distance: number } {
  let traversed = 0;
  let best = { offset: 0, distance: Number.POSITIVE_INFINITY };
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const lengthSquared = vx * vx + vy * vy;
    if (lengthSquared === 0) continue;
    const segmentLength = Math.sqrt(lengthSquared);
    const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSquared));
    const projected = { x: start.x + ratio * vx, y: start.y + ratio * vy };
    const distance = dist(point, projected);
    if (distance < best.distance) best = { offset: traversed + ratio * segmentLength, distance };
    traversed += segmentLength;
  }
  return best;
}

function pathIntersectsBounds(path: LineNode['path'], bounds: EvidenceBounds, tolerance: number): boolean {
  const expanded = {
    x: bounds.x - tolerance,
    y: bounds.y - tolerance,
    w: bounds.w + tolerance * 2,
    h: bounds.h + tolerance * 2,
  };
  for (let index = 1; index < path.length; index += 1) {
    if (segmentIntersectsBounds(path[index - 1], path[index], expanded)) return true;
  }
  return false;
}

function segmentIntersectsBounds(
  start: { x: number; y: number },
  end: { x: number; y: number },
  bounds: EvidenceBounds,
): boolean {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  if (maxX < bounds.x || minX > bounds.x + bounds.w || maxY < bounds.y || minY > bounds.y + bounds.h) return false;
  if (pointInsideBounds(start, bounds) || pointInsideBounds(end, bounds)) return true;

  const edges = [
    [{ x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.w, y: bounds.y }],
    [{ x: bounds.x + bounds.w, y: bounds.y }, { x: bounds.x + bounds.w, y: bounds.y + bounds.h }],
    [{ x: bounds.x + bounds.w, y: bounds.y + bounds.h }, { x: bounds.x, y: bounds.y + bounds.h }],
    [{ x: bounds.x, y: bounds.y + bounds.h }, { x: bounds.x, y: bounds.y }],
  ] as const;
  return edges.some(([edgeStart, edgeEnd]) => segmentsIntersect(start, end, edgeStart, edgeEnd));
}

function pointInsideBounds(point: { x: number; y: number }, bounds: EvidenceBounds): boolean {
  return point.x >= bounds.x && point.x <= bounds.x + bounds.w
    && point.y >= bounds.y && point.y <= bounds.y + bounds.h;
}

function segmentsIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean {
  const orientation = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return ((o1 <= 0 && o2 >= 0) || (o1 >= 0 && o2 <= 0))
    && ((o3 <= 0 && o4 >= 0) || (o3 >= 0 && o4 <= 0));
}

function buildLineAdjacency(lines: LineNode[], tolerance = 55): Map<string, Set<string>> {
  const adjacency = new Map(lines.map((line) => [line.id, new Set<string>()]));
  for (let leftIndex = 0; leftIndex < lines.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < lines.length; rightIndex += 1) {
      const left = lines[leftIndex];
      const right = lines[rightIndex];
      if (!lineKindsConnect(left.lineKind, right.lineKind) || !expandedBoundsIntersect(pathBounds(left.path), pathBounds(right.path), tolerance)) continue;
      if (!linesMeet(left.path, right.path, tolerance)) continue;
      adjacency.get(left.id)?.add(right.id);
      adjacency.get(right.id)?.add(left.id);
    }
  }
  return adjacency;
}

function connectedLineIds(startId: string, adjacency: Map<string, Set<string>>): string[] {
  const visited = new Set<string>();
  const pending = [startId];
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    for (const neighbor of adjacency.get(id) ?? []) pending.push(neighbor);
  }
  return [...visited];
}

function linesMeet(left: LineNode['path'], right: LineNode['path'], tolerance: number): boolean {
  return endpointMeetsPath(left[0], directionAt(left, 0), right, tolerance)
    || endpointMeetsPath(left[left.length - 1], directionAt(left, left.length - 1), right, tolerance)
    || endpointMeetsPath(right[0], directionAt(right, 0), left, tolerance)
    || endpointMeetsPath(right[right.length - 1], directionAt(right, right.length - 1), left, tolerance);
}

function directionAt(path: LineNode['path'], index: number): { x: number; y: number } {
  const adjacentIndex = index === 0 ? 1 : path.length - 2;
  return { x: path[index].x - path[adjacentIndex].x, y: path[index].y - path[adjacentIndex].y };
}

function endpointMeetsPath(
  point: { x: number; y: number },
  direction: { x: number; y: number },
  path: LineNode['path'],
  tolerance: number,
): boolean {
  const directionLength = Math.hypot(direction.x, direction.y);
  if (directionLength === 0) return false;
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const lengthSquared = vx * vx + vy * vy;
    if (lengthSquared === 0) continue;
    const projection = Math.max(0, Math.min(1, ((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSquared));
    const closest = { x: start.x + projection * vx, y: start.y + projection * vy };
    if (dist(point, closest) > tolerance) continue;
    if (projection <= 0.05 || projection >= 0.95) return true;
    const segmentLength = Math.sqrt(lengthSquared);
    const parallelRatio = Math.abs(direction.x * vx + direction.y * vy) / (directionLength * segmentLength);
    if (parallelRatio <= 0.35) return true;
  }
  return false;
}

function lineKindsConnect(left: LineNode['lineKind'], right: LineNode['lineKind']): boolean {
  if (left === right) return true;
  const powerKinds = new Set<LineNode['lineKind']>(['power', 'bus', 'unknown']);
  return powerKinds.has(left) && powerKinds.has(right);
}

function expandedBoundsIntersect(left: EvidenceBounds, right: EvidenceBounds, tolerance: number): boolean {
  return left.x - tolerance <= right.x + right.w
    && left.x + left.w + tolerance >= right.x
    && left.y - tolerance <= right.y + right.h
    && left.y + left.h + tolerance >= right.y;
}

function isBusbar(symbol: SymbolNode): boolean {
  return [symbol.confirmedType, ...symbol.typeCandidates]
    .filter((value): value is string => Boolean(value))
    .some((value) => ['bus', 'busbar'].includes(normalizeType(value)));
}

function symbolDistance(symbol: SymbolNode, point: { x: number; y: number }): number {
  const bounds = symbol.evidence[0]?.bounds;
  if (!bounds) return Number.POSITIVE_INFINITY;
  const dx = Math.max(bounds.x - point.x, 0, point.x - (bounds.x + bounds.w));
  const dy = Math.max(bounds.y - point.y, 0, point.y - (bounds.y + bounds.h));
  return Math.hypot(dx, dy);
}

export function findUnboundLineItems(
  lines: LineNode[],
  relations: RelationEdge[],
): UnresolvedItem[] {
  const bound = new Set(relations.map((relation) => relation.lineId).filter(Boolean));
  return lines.filter((line) => line.certainty === 'confirmed' && !bound.has(line.id)).map((line) => {
    const evidence = line.evidence[0];
    return {
      id: `unbound-${line.id}`,
      code: 'LINE_CONTINUITY_UNCERTAIN' as const,
      displayId: line.displayId,
      pageIndex: evidence?.pageIndex ?? 0,
      regionId: evidence?.regionId,
      bounds: evidence?.bounds ?? pathBounds(line.path),
      userConfirmItems: [{ question: `${line.displayId} 선로의 양쪽 연결 장치를 확인하십시오.` }],
      note: '선로의 양쪽 종단 장치를 모두 확정하지 못해 관계 설명을 보류했습니다.',
    };
  });
}

function nearestSymbol(symbols: SymbolNode[], point: { x: number; y: number }, max = 80): SymbolNode | null {
  let best: SymbolNode | null = null;
  let bestD = max;
  for (const s of symbols) {
    const b = s.evidence[0]?.bounds;
    if (!b) continue;
    const dx = Math.max(b.x - point.x, 0, point.x - (b.x + b.w));
    const dy = Math.max(b.y - point.y, 0, point.y - (b.y + b.h));
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function boundsNear(a: EvidenceBounds, b: EvidenceBounds, tol: number): boolean {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return Math.hypot(ac.x - bc.x, ac.y - bc.y) <= tol;
}

function labelsEquivalent(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return normalizeLabel(a) === normalizeLabel(b);
}

/**
 * 두 라벨이 같은 명판을 가리키는가. 같은 기기를 두 번 읽으면 한쪽은
 * 명판 전체를, 다른 쪽은 앞부분만 잡는다("MOLD TR-3" vs
 * "MOLD TR-3 6.6KV/380.220V 3 1000KVA"). 그래서 동등이 아니라 접두 관계를 본다.
 *
 * 숫자를 가르는 접두는 거절한다 — "TR-1" 은 "TR-10" 의 접두지만 다른 기기다.
 */
function labelsSameNameplate(a?: string, b?: string): boolean {
  // `normalizeLabel` 은 공백을 지운다. 여기서는 지우면 안 된다 — 명판의
  // 필드 경계가 사라져 "MOLD TR-3" + " 6.6KV…" 가 "TR-36.6KV" 로 붙고,
  // 아래 숫자 가드가 이걸 "TR-3" vs "TR-36" 처럼 읽어 버린다.
  const left = nameplateText(a);
  const right = nameplateText(b);
  // 홑 숫자 라벨("1")은 기기명이 아니라 단자 번호다. 명판 취급하지 않는다.
  if (left.length < 2 || right.length < 2) return false;
  if (!/[A-Z]/.test(left) || !/[A-Z]/.test(right)) return false;
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (!longer.startsWith(shorter)) return false;
  // 짧은 쪽이 끝난 자리에서 긴 쪽이 곧바로 숫자로 이어지면 같은 명판이
  // 아니다 — "TR-1" 은 "TR-10" 의 접두이지만 다른 기기다.
  return !/[0-9]/.test(longer.charAt(shorter.length));
}

/** 명판 비교용 정규화. 공백은 하나로 줄이되 **없애지 않는다**(필드 경계). */
function nameplateText(value?: string): string {
  return value?.trim().toUpperCase().replace(/\s+/g, ' ') ?? '';
}

/**
 * 같은 명판을 두 번 읽은 것인가, 아니면 같은 이름의 반복 기기 두 대인가.
 *
 * 실측(2026-08-05, 실행 6회 · 근접쌍 24건)으로 갈렸다:
 *
 * | | 면적비 | 겹침 | |
 * |---|---|---|---|
 * | 진짜 반복(FU3~FU6 · MCCB 피더 행) 11쌍 | **1.00** | 0% | 병합 금지 |
 * | 쪼개진 판독 13쌍 | 1.05~5.33 | 0~23% | 병합 |
 *
 * 진짜 반복 기기는 같은 도장을 찍은 것이라 면적비가 정확히 1.00 이고 서로
 * 겹치지 않는다. 쪼개진 판독은 크기가 다르거나(≥1.5배) 겹친다. 이 두 신호
 * 중 하나라도 서면 같은 기기로 접는다.
 */
function sameNameplateSplitRead(a: EvidenceBounds, b: EvidenceBounds): boolean {
  const overlapWidth = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapHeight = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  // 근접: 서로의 짧은 변만큼도 안 떨어져 있어야 한다. 도면 반대편의
  // 같은 이름 기기(TR-1 이 두 반에 하나씩)를 접지 않기 위한 결박이다.
  if (Math.max(0, -overlapWidth) > Math.min(a.w, b.w)) return false;
  if (Math.max(0, -overlapHeight) > Math.min(a.h, b.h)) return false;

  const areaA = a.w * a.h;
  const areaB = b.w * b.h;
  if (areaA <= 0 || areaB <= 0) return false;
  const areaRatio = Math.max(areaA, areaB) / Math.min(areaA, areaB);
  return areaRatio >= 1.5 || (overlapWidth > 0 && overlapHeight > 0);
}

function typesCompatible(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normalizeType(canonicalSymbolType(a)) === normalizeType(canonicalSymbolType(b));
}

function boundsStronglyOverlap(a: EvidenceBounds, b: EvidenceBounds): boolean {
  const overlapWidth = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const overlapHeight = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const smallerArea = Math.min(a.w * a.h, b.w * b.h);
  // Full-page and overlap-padded crops can shift the same glyph by roughly a
  // third of its height. Distinct physical symbols do not overlap their drawn
  // bodies, so a majority-area overlap is a stronger identity signal than the
  // shifted centers while still preserving adjacent repeated devices.
  return smallerArea > 0 && (overlapWidth * overlapHeight) / smallerArea >= 0.5;
}

function boundsPartialReadOverlap(a: EvidenceBounds, b: EvidenceBounds): boolean {
  const overlapWidth = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const overlapHeight = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  if (overlapWidth <= 0 || overlapHeight <= 0) return false;
  const areaA = a.w * a.h;
  const areaB = b.w * b.h;
  const smallerArea = Math.min(areaA, areaB);
  if (smallerArea <= 0 || (overlapWidth * overlapHeight) / smallerArea < 0.2) return false;
  const smaller = areaA <= areaB ? a : b;
  const larger = areaA <= areaB ? b : a;
  const isPartialGlyph = smaller.h / larger.h <= 0.5 || smaller.w / larger.w <= 0.5;
  if (!isPartialGlyph) return false;
  const smallerCenter = { x: smaller.x + smaller.w / 2, y: smaller.y + smaller.h / 2 };
  const largerCenter = { x: larger.x + larger.w / 2, y: larger.y + larger.h / 2 };
  return dist(smallerCenter, largerCenter) <= Math.max(larger.w, larger.h) * 0.8;
}

/**
 * IEC 60617 지정문자가 선언하는 기기 종류. 숫자가 붙은 것만 인정해
 * "FUSE" 같은 일반 단어를 지정문자로 오인하지 않는다.
 */
function designatorType(label?: string): string | undefined {
  const compact = normalizeLabel(label);
  if (/^FU\d/.test(compact)) return 'fuse';
  if (/^QS\d/.test(compact)) return 'switch';
  if (/^QF\d/.test(compact)) return 'breaker';
  return undefined;
}

function canonicalSymbolType(value: string, label?: string): string {
  const normalized = normalizeType(value);
  const compactLabel = normalizeLabel(label);
  // IEC 60617 기기 지정문자는 도면 자신의 기기 선언이다. 크롭 분류가
  // 스위치기어 계열 안에서 흔들릴 때 지정문자가 이긴다 — 중급 공개 결선도에서
  // FU* 퓨즈가 breaker로, QS1이 breaker/스위치 중복으로 오탐된 실측이 근거다
  // (docs/VALIDATION_EVIDENCE.md 7차, 기호축 69%). vt_pt 명판 우선과 같은
  // 원칙이며, 숫자가 붙은 지정문자만 인정해 FUSE 같은 일반 단어를 잡지 않는다.
  const declared = designatorType(label);
  if (declared) return declared;
  if (normalized === 'breaker' || normalized === 'circuitbreaker') return 'breaker';
  // 채점기(scripts/lib/local-drawing-receipt.mjs)와 같은 단로기 계열 접기.
  // 병합 쪽만 안 접으면 QS1이 disconnector/switch 두 노드로 남는다.
  if (['switch', 'disconnector', 'disconnectswitch', 'switchdisconnector', 'isolator', 'isolatorswitch'].includes(normalized)) {
    return 'switch';
  }
  if (['transformer', 'transformerwinding', 'powertransformer', 'distributiontransformer'].includes(normalized)) {
    // PTx3 / PPT / VT nameplates identify instrument transformers, not a
    // power transformer. Prefer the explicit label over a broad crop type.
    if (/^(?:PT|PPT|VT)X?\d+/.test(compactLabel)) return 'vt_pt';
    return 'transformer';
  }
  if (['load', 'houseload', 'residentialload', 'house'].includes(normalized)) return 'load';
  return value.trim();
}

/**
 * 서로 오인되는 개폐·보호 기기 계열. 같은 자리에서 이 계열끼리 타입이
 * 갈리면 별개 기기가 아니라 같은 글리프의 판독 충돌이다.
 */
const SWITCHGEAR_CONFUSABLE_TYPES = new Set(['breaker', 'fuse', 'switch']);

function inSwitchgearFamily(type: string): boolean {
  return SWITCHGEAR_CONFUSABLE_TYPES.has(normalizeType(canonicalSymbolType(type)));
}

function areasComparable(a: EvidenceBounds, b: EvidenceBounds): boolean {
  const areaA = a.w * a.h;
  const areaB = b.w * b.h;
  if (areaA <= 0 || areaB <= 0) return false;
  return Math.max(areaA, areaB) / Math.min(areaA, areaB) <= 4;
}

function normalizeType(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function normalizeLabel(value?: string): string {
  return value?.trim().toUpperCase().replace(/\s+/g, '') ?? '';
}

function boundsKey(bounds: EvidenceBounds): string {
  return [bounds.x, bounds.y, bounds.w, bounds.h].map((value) => Math.round(value)).join(',');
}

function stableId(prefix: string, parts: Array<string | number>): string {
  return `${prefix}-${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16)}`;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function substantiallyOverlappingSegments(
  aStart: { x: number; y: number },
  aEnd: { x: number; y: number },
  bStart: { x: number; y: number },
  bEnd: { x: number; y: number },
  tolerance: number,
): boolean {
  const ax = aEnd.x - aStart.x;
  const ay = aEnd.y - aStart.y;
  const bx = bEnd.x - bStart.x;
  const by = bEnd.y - bStart.y;
  const aLength = Math.hypot(ax, ay);
  const bLength = Math.hypot(bx, by);
  if (aLength === 0 || bLength === 0) return false;

  // Same axis within about six degrees.
  const crossRatio = Math.abs(ax * by - ay * bx) / (aLength * bLength);
  if (crossRatio > 0.1) return false;

  const perpendicularDistance = (point: { x: number; y: number }) =>
    Math.abs(ax * (aStart.y - point.y) - (aStart.x - point.x) * ay) / aLength;
  if (perpendicularDistance(bStart) > tolerance || perpendicularDistance(bEnd) > tolerance) return false;

  const ux = ax / aLength;
  const uy = ay / aLength;
  const b0 = (bStart.x - aStart.x) * ux + (bStart.y - aStart.y) * uy;
  const b1 = (bEnd.x - aStart.x) * ux + (bEnd.y - aStart.y) * uy;
  const overlap = Math.max(0, Math.min(aLength, Math.max(b0, b1)) - Math.max(0, Math.min(b0, b1)));
  return overlap / Math.min(aLength, bLength) >= 0.75;
}

function pathBounds(path: Array<{ x: number; y: number }>): EvidenceBounds {
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function mergePoints(
  current: Array<{ x: number; y: number }>,
  incoming: Array<{ x: number; y: number }>,
  tolerance: number,
): Array<{ x: number; y: number }> {
  const merged = current.map((point) => ({ ...point }));
  for (const point of incoming) {
    if (!merged.some((existing) => dist(existing, point) <= tolerance)) merged.push({ ...point });
  }
  return merged;
}
