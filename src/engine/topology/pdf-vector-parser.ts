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
  { pattern: /\b(G|GEN|GENERATOR|발전기)\b/i, type: 'generator' },
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
// PART 3 — 스펙 텍스트 파서 (DXF 파서와 공유 가능한 로직)
// =========================================================================

interface ParsedSpec {
  cableType?: string;
  conductorSize?: number;
  voltage?: number;
  current?: number;
  power?: number;
  powerUnit?: string;
}

function parseSpecText(text: string): ParsedSpec {
  const spec: ParsedSpec = {};
  const cableMatch = text.match(/\b(FR-CV|CV|XLPE|HIV|TFR-CV|HFIX|IV|VV)\b/i);
  if (cableMatch) spec.cableType = cableMatch[1].toUpperCase();
  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:sq|mm2|㎟)/i);
  if (sizeMatch) spec.conductorSize = parseFloat(sizeMatch[1]);
  const voltMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:kV|V)/i);
  if (voltMatch) {
    const v = parseFloat(voltMatch[1]);
    spec.voltage = voltMatch[0].toLowerCase().includes('kv') ? v * 1000 : v;
  }
  const ampMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:A|AT)\b/);
  if (ampMatch) spec.current = parseFloat(ampMatch[1]);
  const pwrMatch = text.match(/(\d+(?:\.\d+)?)\s*(kW|kVA|HP|MW|MVA)/i);
  if (pwrMatch) { spec.power = parseFloat(pwrMatch[1]); spec.powerUnit = pwrMatch[2]; }
  return spec;
}

// =========================================================================
// PART 4 — 유클리디안 거리
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

  // pdfjs-dist 동적 임포트 (서버 번들 최소화)
  const pdfjsLib = await import('pdfjs-dist');

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
  const page = await doc.getPage(pageNumber);
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

  // 연산자 스트림에서 선분 추출
  const opList = await page.getOperatorList();
  const lines: PdfLineSegment[] = [];
  let currentX = 0, currentY = 0;

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    // moveTo (OPS.moveTo = 13)
    if (fn === 13 && args.length >= 2) {
      currentX = args[0] as number;
      currentY = viewport.height - (args[1] as number);
    }
    // lineTo (OPS.lineTo = 14)
    if (fn === 14 && args.length >= 2) {
      const newX = args[0] as number;
      const newY = viewport.height - (args[1] as number);
      const seg: PdfLineSegment = {
        x1: currentX, y1: currentY,
        x2: newX, y2: newY,
        pageWidth: viewport.width, pageHeight: viewport.height,
      };
      if (lineLength(seg) >= minLineLength) {
        lines.push(seg);
      }
      currentX = newX;
      currentY = newY;
    }
  }

  // SLD 변환
  const components: SLDComponent[] = [];
  const connections: SLDConnection[] = [];
  let compIdx = 0;
  let connIdx = 0;

  // 텍스트 중 심볼 키워드를 포함한 것 → 컴포넌트
  const usedTexts = new Set<number>();
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    const type = detectComponentType(t.text);
    if (type !== 'load' || t.fontHeight > 8) { // 큰 텍스트 or 심볼 키워드
      const spec = parseSpecText(t.text);
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
      from: `node_at_${Math.round(seg.x1)}_${Math.round(seg.y1)}`,
      to: `node_at_${Math.round(seg.x2)}_${Math.round(seg.y2)}`,
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

  return {
    components,
    connections,
    suggestedCalculations: [],
    confidence: 0.85, // PDF 벡터는 DXF(0.95)보다 약간 낮지만 VLM(0.5~0.7)보다 높음
    rawDescription: `PDF vector parsed (page ${pageNumber}): ${components.length} components, ${connections.length} connections, ${texts.length} text items, ${lines.length} line segments`,
  };
}

function parseNodeCoords(nodeId: string): { x: number; y: number } | null {
  const match = nodeId.match(/node_at_(-?\d+)_(-?\d+)/);
  if (!match) return null;
  return { x: parseInt(match[1]), y: parseInt(match[2]) };
}
