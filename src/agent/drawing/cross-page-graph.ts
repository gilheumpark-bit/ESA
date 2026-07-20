/**
 * Cross-page relation merge — label-only matches stay candidates.
 */

import type { CrossPageRelation, EvidenceRef, SymbolNode, TextNode } from './types-v3';

export interface PageRefHit {
  pageIndex: number;
  text: string;
  targetPageHint?: number;
  bounds: { x: number; y: number; w: number; h: number };
  confidence: number;
}

const REF_PATTERNS: RegExp[] = [
  /TO\s+SHEET\s+(\d+)/i,
  /FROM\s+([A-Z0-9_-]+)/i,
  /→\s*P?(\d+)/i,
  /(?:TO|참조)\s*시트\s*(\d+)/i,
];

export function extractPageRefHits(texts: TextNode[]): PageRefHit[] {
  const hits: PageRefHit[] = [];
  for (const t of texts) {
    if (t.certainty !== 'confirmed' || !t.confirmedText) continue;
    const raw = t.confirmedText;
    for (const re of REF_PATTERNS) {
      const m = raw.match(re);
      if (!m) continue;
      const hint = m[1] && /^\d+$/.test(m[1]) ? Number(m[1]) - 1 : undefined;
      hits.push({
        pageIndex: t.evidence[0]?.pageIndex ?? 0,
        text: raw,
        targetPageHint: hint,
        bounds: t.evidence[0]?.bounds ?? { x: 0, y: 0, w: 0, h: 0 },
        confidence: t.evidence[0]?.confidence ?? 0.5,
      });
    }
  }
  return hits;
}

export function reconcileCrossPage(
  symbols: SymbolNode[],
  texts: TextNode[],
  pageRefs: PageRefHit[],
): CrossPageRelation[] {
  const relations: CrossPageRelation[] = [];
  let seq = 0;

  // Explicit sheet references
  for (const ref of pageRefs) {
    if (ref.targetPageHint == null || ref.targetPageHint < 0) continue;
    const sourceSymbols = symbols.filter(
      (s) => s.evidence[0]?.pageIndex === ref.pageIndex && s.certainty === 'confirmed',
    );
    const targetSymbols = symbols.filter(
      (s) => s.evidence[0]?.pageIndex === ref.targetPageHint && s.certainty === 'confirmed',
    );
    if (sourceSymbols.length === 0 || targetSymbols.length === 0) {
      relations.push(makeRel(++seq, ref.pageIndex, ref.targetPageHint, 'hold', 'orphan-ref', {
        fromRef: `page-ref:${ref.text}`,
        toRef: `page:${ref.targetPageHint}`,
        evidence: [refEvidence(ref)],
      }));
      continue;
    }
    // Best-effort: match by shared tag text in vicinity / same raw label
    const pair = findCompatiblePair(sourceSymbols, targetSymbols, texts);
    if (!pair) {
      relations.push(makeRel(++seq, ref.pageIndex, ref.targetPageHint, 'candidate', 'ref-no-device-match', {
        fromRef: sourceSymbols[0].id,
        toRef: targetSymbols[0].id,
        evidence: [refEvidence(ref), ...sourceSymbols[0].evidence, ...targetSymbols[0].evidence],
      }));
      continue;
    }
    relations.push(makeRel(++seq, ref.pageIndex, ref.targetPageHint, 'confirmed', 'sheet-ref+compatible', {
      fromRef: pair.from.id,
      toRef: pair.to.id,
      evidence: [refEvidence(ref), ...pair.from.evidence, ...pair.to.evidence],
    }));
  }

  // Same tag across pages without explicit ref → candidate only (AC-07)
  const byTag = new Map<string, SymbolNode[]>();
  for (const s of symbols) {
    if (s.certainty !== 'confirmed' || !s.rawLabel) continue;
    if (!isSpecificEquipmentTag(s.rawLabel)) continue;
    const key = `${normalize(s.rawLabel)}|${normalize(s.confirmedType ?? s.typeCandidates[0] ?? '')}`;
    const list = byTag.get(key) ?? [];
    list.push(s);
    byTag.set(key, list);
  }
  for (const group of byTag.values()) {
    const pages = new Set(group.map((g) => g.evidence[0]?.pageIndex ?? 0));
    if (pages.size < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const pa = a.evidence[0]?.pageIndex ?? 0;
        const pb = b.evidence[0]?.pageIndex ?? 0;
        if (pa === pb) continue;
        const hasExplicit = relations.some(
          (r) =>
            r.status === 'confirmed'
            && ((r.fromRef === a.id && r.toRef === b.id) || (r.fromRef === b.id && r.toRef === a.id)),
        );
        if (hasExplicit) continue;
        const voltageStatus = voltageCompatibility(a, b, texts);
        if (voltageStatus === 'conflict') {
          relations.push(makeRel(++seq, pa, pb, 'hold', 'label-match-voltage-conflict', {
            fromRef: a.id,
            toRef: b.id,
            evidence: [...a.evidence, ...b.evidence],
          }));
          continue;
        }
        relations.push(makeRel(++seq, pa, pb, 'candidate', voltageStatus === 'unknown'
          ? 'same-label-voltage-unknown'
          : 'same-label-no-page-ref', {
          fromRef: a.id,
          toRef: b.id,
          evidence: [...a.evidence, ...b.evidence],
        }));
      }
    }
  }

  return relations;
}

function findCompatiblePair(
  sources: SymbolNode[],
  targets: SymbolNode[],
  texts: TextNode[],
): { from: SymbolNode; to: SymbolNode } | null {
  for (const from of sources) {
    for (const to of targets) {
      const typeOk = typesCompatible(
        from.confirmedType ?? from.typeCandidates[0] ?? '',
        to.confirmedType ?? to.typeCandidates[0] ?? '',
      );
      if (!typeOk) continue;
      if (voltageCompatibility(from, to, texts) !== 'compatible') continue;
      if (from.rawLabel && to.rawLabel && normalize(from.rawLabel) === normalize(to.rawLabel)) {
        return { from, to };
      }
    }
  }
  // sheet ref with single confirmed device each side
  if (sources.length === 1 && targets.length === 1) {
    const from = sources[0];
    const to = targets[0];
    if (typesCompatible(
      from.confirmedType ?? from.typeCandidates[0] ?? '',
      to.confirmedType ?? to.typeCandidates[0] ?? '',
    ) && voltageCompatibility(from, to, texts) === 'compatible') {
      return { from, to };
    }
  }
  return null;
}

function voltageCompatibility(a: SymbolNode, b: SymbolNode, texts: TextNode[]): 'compatible' | 'conflict' | 'unknown' {
  const va = nearbyVoltage(a, texts);
  const vb = nearbyVoltage(b, texts);
  if (va == null || vb == null) return 'unknown';
  return Math.abs(va - vb) / Math.max(va, vb) < 0.15 ? 'compatible' : 'conflict';
}

function nearbyVoltage(s: SymbolNode, texts: TextNode[]): number | null {
  const b = s.evidence[0]?.bounds;
  const page = s.evidence[0]?.pageIndex;
  if (!b || page == null) return null;
  for (const t of texts) {
    if (t.evidence[0]?.pageIndex !== page) continue;
    const tb = t.evidence[0].bounds;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const tx = tb.x + tb.w / 2;
    const ty = tb.y + tb.h / 2;
    if (Math.hypot(cx - tx, cy - ty) > 120) continue;
    if (t.certainty !== 'confirmed' || !t.confirmedText) continue;
    const m = t.confirmedText.match(/(\d+(?:\.\d+)?)\s*kV/i);
    if (m) return Number(m[1]);
  }
  return null;
}

function makeRel(
  seq: number,
  fromPage: number,
  toPage: number,
  status: CrossPageRelation['status'],
  reason: string,
  rest: { fromRef: string; toRef: string; evidence: EvidenceRef[] },
): CrossPageRelation {
  return {
    id: `xr-${seq}`,
    displayId: `XR${String(seq).padStart(3, '0')}`,
    fromPage,
    toPage,
    fromRef: rest.fromRef,
    toRef: rest.toRef,
    status,
    reason,
    evidence: rest.evidence,
  };
}

function refEvidence(ref: PageRefHit): EvidenceRef {
  return {
    evidenceId: `pageref-${ref.pageIndex}-${ref.text.slice(0, 12)}`,
    pageIndex: ref.pageIndex,
    bounds: ref.bounds,
    confidence: ref.confidence,
  };
}

function normalize(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, '');
}

function isSpecificEquipmentTag(label: string): boolean {
  const compact = label.trim().toUpperCase();
  if (/^(?:접점\s*\(JUNCTION\)|JUNCTION|BUS|BUSBAR|모선)$/.test(compact)) return false;
  // Cross-page inference needs an identifier such as VCB-1, TR_01 or MCCB1.
  // Ratings/descriptions (for example "MCCB 3P-50/50") are repeated across
  // panels but do not identify the same physical device.
  return /^(?:[\p{L}]{1,12}(?:[-_][\p{L}\d]+)+|[\p{L}]{1,8}\d{1,4})$/u.test(compact);
}

function typesCompatible(a: string, b: string): boolean {
  if (!a || !b) return false;
  return canonicalType(a) === canonicalType(b);
}

function canonicalType(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const aliases: Record<string, string> = {
    voltagetransformer: 'pt',
    potentialtransformer: 'pt',
    circuitbreaker: 'breaker',
  };
  return aliases[normalized] ?? normalized;
}
