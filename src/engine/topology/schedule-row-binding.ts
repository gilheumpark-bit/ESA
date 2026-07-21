/**
 * 분전반 일람표 행 결속 (PDF·DXF 공용 후보)
 * ─────────────────────────────────────────────
 * 정격 텍스트(예: "MCCB 4P-100/75")를 앵커로, 같은 행의 부하명·태그를 결속한다.
 *
 * 기하 계약(KIMM EE-039 실측·골든 파일럿):
 *  - 부하명: 앵커 **아래** dy ∈ [3, 9] · dx ∈ [-70, +70]
 *  - 태그(기존/SP/PNL/R번호): 같은 창 안, 앵커 대각 |dx| 20~60 부근
 *  - 헤더 블록(FROM·사용전압·케이블)은 dy ≥ +12라 창 밖 — 구판 오결속(|dy|≤3 우측만)의
 *    원인이던 헤더 텍스트가 구조적으로 배제된다(라이브 8/8 오탐 실측 후 재설계).
 *
 * 무발명 원칙: 확실치 않으면 결속하지 않는다(undefined) — 틀린 결속은 무결속보다 나쁘다.
 */

export interface RowText {
  x: number;
  y: number;
  text: string;
}

export interface RowBinding {
  load?: string;
  tag?: string;
}

const ROW_DY_MIN = 3;
const ROW_DY_MAX = 9;
const ROW_DX_MAX = 70;

const TAG_PATTERN = /^(기존|SP|PNL|R\d{1,3})$/;
// 다른 설비로 승격될 키워드 텍스트는 부하명이 아니다(별도 장치의 라벨).
const DEVICE_KEYWORD = /\b(TR|변압기|TRANSFORMER|XFMR|CB|ACB|VCB|MCCB|MCB|ELB|ELCB|차단기|누전차단기|BREAKER|GEN|GENERATOR|발전기|MCC|분전반결선|BUS|BUSBAR|모선|CAP|CAPACITOR|SW|DS|SWITCH|개폐기|CT|PT\b|METER|계기|UPS|OCR|RELAY|계전기)/i;
// 케이블·스펙 텍스트는 연결 결속용으로 보존한다.
const CABLE_SPEC = /\b(FR-CV|TFR-CV|FCV|CV|XLPE|HIV|HFIX|IV|VV)\b|\d+\s*(?:sq|mm2|㎟)|\d\s*-\s*\d{2,4}\s*\/\s*\d*C\b/i;

/** 자간 벌린 인쇄("S P A R E"·"P N L")를 축약하고 공백을 정돈한다. */
function normalizeCell(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (/^(?:\S\s)+\S$/.test(trimmed)) return trimmed.replace(/\s+/g, '');
  return trimmed;
}

export function bindScheduleRow(anchor: RowText, texts: readonly RowText[]): RowBinding {
  const candidates: Array<{ t: RowText; dx: number }> = [];
  for (const t of texts) {
    if (t === anchor || (t.x === anchor.x && t.y === anchor.y && t.text === anchor.text)) continue;
    const dy = t.y - anchor.y;
    const dx = t.x - anchor.x;
    if (dy < ROW_DY_MIN || dy > ROW_DY_MAX) continue;
    if (Math.abs(dx) > ROW_DX_MAX) continue;
    const trimmed = normalizeCell(t.text);
    if (trimmed.length < 2) continue;
    if (/^[\d\s./-]+$/.test(trimmed)) continue;
    candidates.push({ t: { ...t, text: trimmed }, dx });
  }
  if (candidates.length === 0) return {};

  const tagLike = candidates.filter((c) => TAG_PATTERN.test(c.t.text));
  const loadPool = candidates.filter(
    (c) => !tagLike.includes(c) && !DEVICE_KEYWORD.test(c.t.text) && !CABLE_SPEC.test(c.t.text),
  );

  let tag: string | undefined;
  let load: string | undefined;

  if (tagLike.length >= 2) {
    // 태그 칸과 부하 칸이 모두 태그형 문자열인 행(무명 "기존" 부하) —
    // 태그 열이 앵커에서 더 멀다(실측 |dx| 19~47 vs 부하 8~14).
    const sorted = [...tagLike].sort((a, b) => Math.abs(b.dx) - Math.abs(a.dx));
    tag = sorted[0].t.text;
    load = sorted[sorted.length - 1].t.text;
  } else if (tagLike.length === 1) {
    tag = tagLike[0].t.text;
  }

  if (load === undefined && loadPool.length > 0) {
    const nearest = [...loadPool].sort((a, b) => Math.abs(a.dx) - Math.abs(b.dx))[0];
    load = nearest.t.text;
  }

  return { load, tag };
}

// IDENTITY_SEAL: topology/schedule-row-binding | role=분전반 일람표 행 결속(부하명·태그) | inputs=anchor,texts | outputs=RowBinding
