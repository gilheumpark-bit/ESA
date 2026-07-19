/**
 * ESVA PDF Vector Parser — CAD 출력 PDF에서 벡터 데이터 추출
 * ──────────────────────────────────────────────────────────────
 * CAD에서 Plot한 PDF는 내부에 벡터 좌표가 살아있다.
 * VLM 없이 PDF 내부의 선(Line)/텍스트(Text) 좌표를 직접 스크래핑.
 * 결과는 DXF 파서와 동일한 SLDAnalysis 타입 → TopologyGraph 투입.
 *
 * PART 1: PDF 텍스트 + 좌표 추출 (pdfjs-dist)
 * PART 2: 선분 추출 (Operator Stream 파싱)
 * PART 3: SLD 변환 + 스펙 매핑
 */

import type { SLDComponent, SLDConnection, SLDAnalysis, SLDComponentType } from '@/lib/sld-recognition';
import { snapConnectionEndpoints, formatEndpointId, type SnapAnchor } from './endpoint-snap';
import { parseSpecText } from './spec-text';

// =========================================================================
// PART 1 — Types
// =========================================================================

interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontHeight: number;
}

interface PdfLineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  pageWidth: number;
  pageHeight: number;
}

export interface PdfParseOptions {
  /** 페이지 번호 (1-based, 기본: 1) */
  pageNumber?: number;
  /** 텍스트-심볼 매핑 최대 거리 (포인트, 기본: 30) */
  textProximityThreshold?: number;
  /** 최소 선 길이 (포인트, 기본: 10) — 짧은 장식선 무시 */
  minLineLength?: number;
}

// =========================================================================
// PART 2 — 심볼 키워드 매핑
// =========================================================================

const SYMBOL_KEYWORDS: Array<{ pattern: RegExp; type: SLDComponentType }> = [
  { pattern: /\b(TR|변압기|TRANSFORMER|XFMR)\b/i, type: 'transformer' },
  { pattern: /\b(CB|ACB|VCB|MCCB|차단기|BREAKER)\b/i, type: 'breaker' },
  { pattern: /\b(M|MOTOR|전동기|모터)\b/i, type: 'motor' },
  // 단독 'G'는 제외 — 국내 분전반 도면에서 단독 G는 접지 표기가 관례라,
  // 실도면 18페이지 전 장에 발전기 2대가 검출되는 오탐을 만들었다(라이브
  // 실측 발각 · DXF 파서 단일문자 그림자 결함의 동종).
  { pattern: /\b(GEN|GENERATOR|발전기)\b/i, type: 'generator' },
  { pattern: /\b(MCC|분전반|DB|DP|PANEL|SWGR)\b/i, type: 'panel' },
  { pattern: /\b(BUS|BUSBAR|모선)\b/i, type: 'bus' },
  { pattern: /\b(CAP|CAPACITOR|콘덴서)\b/i, type: 'capacitor' },
  { pattern: /\b(SW|DS|SWITCH|개폐기)\b/i, type: 'switch' },
  { pattern: /\b(CT|PT|METER|계기)\b/i, type: 'meter' },
  { pattern: /\b(UPS)\b/i, type: 'ups' },
  { pattern: /\b(OCR|OVR|RELAY|계전기)\b/i, type: 'relay' },
];

function detectComponentType(text: string): SLDComponentType {
  for (const { pattern, type } of SYMBOL_KEYWORDS) {
    if (pattern.test(text)) return type;
  }
  return 'load';
}

// =========================================================================
// PART 3 — 유클리디안 거리
// =========================================================================

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function lineLength(seg: PdfLineSegment): number {
  return Math.sqrt((seg.x2 - seg.x1) ** 2 + (seg.y2 - seg.y1) ** 2);
}

// =========================================================================
// PART 5 — Public API
// =========================================================================

/**
 * PDF 바이트 → SLDAnalysis 변환.
 * pdfjs-dist로 텍스트 좌표 추출 + 연산자 스트림에서 선분 추출.
 */
export async function parsePdfToSLD(
  pdfBytes: ArrayBuffer,
  options: PdfParseOptions = {},
): Promise<SLDAnalysis> {
  const { pageNumber = 1, textProximityThreshold = 30, minLineLength = 10 } = options;

  // pdfjs-dist 동적 임포트 (서버 번들 최소화).
  // 반드시 legacy 빌드 — 기본 빌드는 모듈 최상위에서 new DOMMatrix()를 실행해
  // Node 런타임에서는 임포트 자체가 터진다(라이브 실측으로 발각: 모든 PDF
  // 업로드가 500 "DOMMatrix is not defined"). 이 임포트는 사용자 입력과 무관한
  // 서버 구성 문제라 아래 try(입력 흡수) 밖에 둔다.
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // 손상·비PDF·페이지 범위 초과는 사용자 입력 문제지 서버 장애가 아니다.
  // 여기서 흡수하지 않으면 라우트가 500을 내며 내부 오류 문자열까지 노출한다
  // (DXF 파서와 동일 계약으로 맞춤 — 파싱 실패는 예외가 아니라 결과다).
  let doc: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;
  let page: Awaited<ReturnType<typeof doc.getPage>>;
  try {
    doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
    page = await doc.getPage(pageNumber);
  } catch (err) {
    return {
      components: [],
      connections: [],
      suggestedCalculations: [],
      confidence: 0,
      rawDescription: `PDF parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const viewport = page.getViewport({ scale: 1.0 });

  // 텍스트 추출
  const textContent = await page.getTextContent();
  const texts: PdfTextItem[] = textContent.items
    .filter((item): item is typeof item & { str: string; transform: number[] } =>
      'str' in item && typeof (item as { str?: unknown }).str === 'string')
    .map((item) => {
      const tx = item.transform;
      return {
        text: item.str,
        x: tx[4],
        y: viewport.height - tx[5], // PDF Y축 반전
        width: tx[0] * item.str.length * 0.6,
        height: Math.abs(tx[3]),
        fontHeight: Math.abs(tx[3]),
      };
    })
    .filter(t => t.text.trim().length > 0);

  // 연산자 스트림에서 선분 추출.
  //
  // 실도면 실측(한국기계연구원 분전반결선도·대산 교재)에서 단독 moveTo/lineTo
  // op는 0건 — pdfjs v4+는 모든 경로를 constructPath(OPS=91) 하나로 묶어
  // [paintOp, Float32Array[](DrawOPS 인터리브), minMax] 형태로 내보낸다.
  // 기존 fn===13/14 직독은 실제 CAD PDF에서 선분 0개를 반환하며 사문이었다.
  // DrawOPS 코드/좌표 소비폭은 pdfjs 소스(makePathFromDrawOPS) 원문 기준:
  // moveTo:0(2) lineTo:1(2) curveTo:2(6) quadraticCurveTo:3(4) closePath:4(0).
  //
  // 좌표는 현재 CTM 기준 로컬 좌표라(실측: 음수 좌표 페이지 존재) save/restore/
  // transform 스택을 추적해 절대 좌표로 환원해야 텍스트 좌표와 같은 공간에서
  // 스냅·근접 매핑이 성립한다. 칠하기 전용(fill)·클립 전용(endPath) 경로는
  // 면/마스크지 결선이 아니므로 stroke 계열 paint일 때만 선분으로 채택한다.
  const opList = await page.getOperatorList();
  const OPS = pdfjsLib.OPS;
  const STROKE_PAINTS = new Set<number>([
    OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke,
    OPS.closeFillStroke, OPS.closeEOFillStroke,
  ]);
  const lines: PdfLineSegment[] = [];
  const pushSeg = (x1: number, y1: number, x2: number, y2: number) => {
    const seg: PdfLineSegment = {
      x1, y1: viewport.height - y1,
      x2, y2: viewport.height - y2,
      pageWidth: viewport.width, pageHeight: viewport.height,
    };
    if (lineLength(seg) >= minLineLength) lines.push(seg);
  };

  type Mtx = [number, number, number, number, number, number];
  let ctm: Mtx = [1, 0, 0, 1, 0, 0];
  const ctmStack: Mtx[] = [];
  const mul = (m1: Mtx, m2: Mtx): Mtx => [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
  const apply = (x: number, y: number) => ({
    x: ctm[0] * x + ctm[2] * y + ctm[4],
    y: ctm[1] * x + ctm[3] * y + ctm[5],
  });

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i] as unknown[];

    if (fn === OPS.save) { ctmStack.push(ctm); continue; }
    if (fn === OPS.restore) { ctm = ctmStack.pop() ?? [1, 0, 0, 1, 0, 0]; continue; }
    if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
      ctm = mul(ctm, args.slice(0, 6) as Mtx);
      continue;
    }
    if (fn !== OPS.constructPath || !args) continue;

    const paintOp = args[0] as number;
    if (!STROKE_PAINTS.has(paintOp)) continue;
    const subpaths = args[1];
    if (!Array.isArray(subpaths)) continue;

    for (const raw of subpaths) {
      const path = raw as ArrayLike<number>;
      let cur = { x: 0, y: 0 };
      let start = { x: 0, y: 0 };
      let k = 0;
      while (k < path.length) {
        const code = path[k++];
        if (code === 0) { // moveTo
          cur = apply(path[k], path[k + 1]); k += 2; start = cur;
        } else if (code === 1) { // lineTo
          const next = apply(path[k], path[k + 1]); k += 2;
          pushSeg(cur.x, cur.y, next.x, next.y);
          cur = next;
        } else if (code === 2) { // curveTo — 심볼 원호는 결선이 아님, 현재점만 이동
          cur = apply(path[k + 4], path[k + 5]); k += 6;
        } else if (code === 3) { // quadraticCurveTo
          cur = apply(path[k + 2], path[k + 3]); k += 4;
        } else if (code === 4) { // closePath — 시작점으로의 실제 변
          pushSeg(cur.x, cur.y, start.x, start.y);
          cur = start;
        } else {
          break; // 미지 코드 — 좌표 폭을 모르므로 이 서브패스 중단(오독 방지)
        }
      }
    }
  }

  // SLD 변환
  const components: SLDComponent[] = [];
  const connections: SLDConnection[] = [];
  // 컴포넌트 position은 0-100 정규화 좌표지만 선분 끝점은 raw pt 좌표라
  // 스냅은 raw 공간에서 해야 한다 — raw 앵커를 병행 수집한다.
  const rawAnchors: SnapAnchor[] = [];
  let compIdx = 0;
  let connIdx = 0;

  // 텍스트 중 심볼 키워드를 포함한 것 → 컴포넌트.
  // 부하(load) 승격은 스펙 증거(전압/전류/용량 파싱 성공)가 있을 때만 —
  // 이전의 "큰 글씨(fontHeight>8)면 부하" 규칙은 실도면 표제란("자격종목"·
  // "척도"·"국가기술자격 실기시험문제")을 부하 설비로 환각해 부하계산
  // 제안까지 오염시켰다(박문각 실기 도면 라이브 실측 발각).
  const usedTexts = new Set<number>();
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    const type = detectComponentType(t.text);
    const specProbe = parseSpecText(t.text);
    const hasSpecEvidence = Boolean(specProbe.voltage || specProbe.current || specProbe.power);
    if (type !== 'load' || hasSpecEvidence) {
      const spec = specProbe;
      rawAnchors.push({ id: `comp_${compIdx + 1}`, x: t.x, y: t.y });
      components.push({
        id: `comp_${++compIdx}`,
        type,
        label: t.text.slice(0, 50),
        position: { x: Math.round(t.x / viewport.width * 100), y: Math.round(t.y / viewport.height * 100) },
        voltage: spec.voltage ? `${spec.voltage}V` : undefined,
        current: spec.current ? `${spec.current}A` : undefined,
        rating: spec.power ? `${spec.power}${spec.powerUnit}` : undefined,
      });
      usedTexts.add(i);
    }
  }

  // 선분 → 연결 (일정 길이 이상)
  const ptToMeter = 0.000352778; // 1pt = 0.352778mm
  for (const seg of lines) {
    const lengthM = lineLength(seg) * ptToMeter;
    if (lengthM < 0.01) continue; // 1cm 미만 무시

    connections.push({
      id: `conn_${++connIdx}`,
      from: formatEndpointId({ x: seg.x1, y: seg.y1 }),
      to: formatEndpointId({ x: seg.x2, y: seg.y2 }),
      length: `${Math.round(lengthM * 100) / 100}m`,
      conductorSize: undefined,
      cableType: undefined,
    });
  }

  // 미사용 텍스트 중 케이블 스펙 → 가장 가까운 연결에 매핑
  for (let i = 0; i < texts.length; i++) {
    if (usedTexts.has(i)) continue;
    const t = texts[i];
    const spec = parseSpecText(t.text);
    if (!spec.conductorSize && !spec.cableType) continue;

    let closestConn: SLDConnection | null = null;
    let closestDist = textProximityThreshold;

    for (const conn of connections) {
      const fromCoords = parseNodeCoords(conn.from);
      const toCoords = parseNodeCoords(conn.to);
      if (!fromCoords || !toCoords) continue;
      const mid = { x: (fromCoords.x + toCoords.x) / 2, y: (fromCoords.y + toCoords.y) / 2 };
      const d = dist({ x: t.x, y: t.y }, mid);
      if (d < closestDist) { closestDist = d; closestConn = conn; }
    }

    if (closestConn) {
      if (spec.conductorSize) closestConn.conductorSize = `${spec.conductorSize}sq`;
      if (spec.cableType) closestConn.cableType = spec.cableType;
    }
  }

  // 끝점 결속(raw 공간) — comp_N ↔ node_at 불일치로 전 엣지가 허공이던 결함 수리.
  const snap = snapConnectionEndpoints(rawAnchors, connections);
  for (const j of snap.junctions) {
    components.push({
      id: j.id,
      type: 'bus',
      label: '접점 (junction)',
      position: {
        x: Math.round((j.x / viewport.width) * 100),
        y: Math.round((j.y / viewport.height) * 100),
      },
      properties: { synthetic: 'junction' },
    });
  }

  // confidence는 상수가 아니라 추출 증거에서 파생한다 — 상수 0.85는 선분 0개
  // 스캔본(결선 해석 불가)까지 "성공 0.85"로 보고하는 정직성 결함이었다
  // (라이브 실측 발각). 등급 근거:
  //   0    — 아무것도 못 읽음(라우트가 400으로 번역)
  //   0.3  — 텍스트만 있고 기하 0 → 스캔/이미지 도면 추정, 결선 구조 없음
  //   0.55 — 선분은 있으나 결속(스냅) 0 → 위치 신뢰 낮음
  //   0.85 — 구조 성립(DXF 0.95보다 낮게, VLM 0.5~0.7보다 높게 유지)
  // 결속 우세 판정: 끝점이 실제 설비 앵커에 붙은 수(snapped)가 합성 접점
  // 수(junctioned) 이하면, 추출된 선형은 설비에 닿지 않는 표 격자·표제란
  // 테두리일 가능성이 크다(실측: 실기시험 도면 표제란 격자가 snapped 7 vs
  // junctioned 68로 결선 행세 — 실제 분전반 도면은 525 vs 47로 역전).
  // 상수 임계 발명 없이 두 증거량의 비교만 쓴다.
  const anchored = snap.stats.snapped > snap.stats.junctioned;
  const structureNote =
    lines.length === 0 ? ' — 기하(선분) 0: 스캔/이미지 도면 추정, 결선 해석 불가'
    : snap.connections.length === 0 ? ' — 선분은 있으나 결속 0: 배치만 참고'
    : !anchored ? ' — 결선 끝점이 설비보다 합성 접점에 주로 붙음: 표 격자/장식선 의심, 배치만 참고'
    : '';
  const confidence =
    components.length === 0 && texts.length === 0 && lines.length === 0 ? 0
    : lines.length === 0 ? 0.3
    : snap.connections.length === 0 ? 0.55
    : !anchored ? 0.55
    : 0.85;

  return {
    components,
    connections: snap.connections,
    suggestedCalculations: [],
    confidence,
    rawDescription: `PDF vector parsed (page ${pageNumber}): ${components.length} components, ${snap.connections.length} connections (snapped ${snap.stats.snapped}, junctions ${snap.stats.junctioned}, dropped ${snap.stats.droppedSelfLoops}), ${texts.length} text items, ${lines.length} line segments${structureNote}`,
  };
}

function parseNodeCoords(nodeId: string): { x: number; y: number } | null {
  const match = nodeId.match(/node_at_(-?\d+)_(-?\d+)/);
  if (!match) return null;
  return { x: parseInt(match[1]), y: parseInt(match[2]) };
}
