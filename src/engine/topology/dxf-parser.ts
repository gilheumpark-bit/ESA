/**
 * ESVA DXF Vector Parser — CAD 도면의 벡터 데이터를 정밀 추출
 * ──────────────────────────────────────────────────────────────
 * VLM(이미지 AI)의 공간 환각 없이, DXF 벡터 좌표에서 100% 정확한 거리/위치를 추출.
 * 결과는 기존 SLDComponent/SLDConnection 타입으로 변환 → TopologyGraph에 바로 투입.
 *
 * PART 1: DXF Entity → SLD 변환
 * PART 2: 심볼 블록 매핑 테이블
 * PART 3: 텍스트 스펙 파서
 * PART 4: Public API
 */

import DxfParserModule from 'dxf-parser';
import type { SLDComponent, SLDConnection, SLDAnalysis, SLDComponentType } from '@/lib/sld-recognition';
import { snapConnectionEndpoints } from './endpoint-snap';

// CJS/ESM interop: Node require는 생성자 함수를 직접 주지만 Turbopack 서버
// 런타임은 { default: 생성자 } namespace를 준다 — 라이브에서 "DxfParser is
// not a constructor"로 발각(플래그 OFF가 숨기던 잠복 버그). 양쪽 수용.
type DxfParserCtor = new () => { parseSync(content: string): unknown };
const DxfParser: DxfParserCtor =
  (DxfParserModule as unknown as { default?: DxfParserCtor }).default ??
  (DxfParserModule as unknown as DxfParserCtor);

// =========================================================================
// PART 1 — DXF Entity Types (dxf-parser 출력)
// =========================================================================

interface DxfEntity {
  type: string;
  layer?: string;
  handle?: string;
  startPoint?: { x: number; y: number; z?: number };
  endPoint?: { x: number; y: number; z?: number };
  vertices?: Array<{ x: number; y: number; z?: number }>;
  position?: { x: number; y: number; z?: number };
  text?: string;
  textHeight?: number;
  name?: string; // INSERT 블록명
  rotation?: number;
  radius?: number;
}

interface DxfParseResult {
  entities: DxfEntity[];
  blocks?: Record<string, { entities: DxfEntity[] }>;
}

// =========================================================================
// PART 2 — 심볼 블록 매핑 테이블
// =========================================================================

/** CAD 블록 이름 → 전기 심볼 타입 매핑 (대소문자 무시) */
const BLOCK_SYMBOL_MAP: Record<string, SLDComponentType> = {
  // 차단기류
  'cb': 'breaker', 'mccb': 'breaker', 'acb': 'breaker', 'vcb': 'breaker',
  'breaker': 'breaker', 'mcb': 'breaker', 'elcb': 'breaker',
  // 변압기류
  'tr': 'transformer', 'transformer': 'transformer', 'xfmr': 'transformer',
  // 전동기류
  'motor': 'motor', 'mtr': 'motor', 'm': 'motor',
  // 발전기류
  'gen': 'generator', 'generator': 'generator', 'g': 'generator',
  // 분전반/수배전반
  'panel': 'panel', 'mcc': 'panel', 'swgr': 'panel', 'switchgear': 'panel',
  'db': 'panel', 'dp': 'panel',
  // 부하
  'load': 'load', 'light': 'load', 'heater': 'load',
  // 기타
  'bus': 'bus', 'busbar': 'bus',
  'cap': 'capacitor', 'capacitor': 'capacitor',
  'sw': 'switch', 'switch': 'switch', 'ds': 'switch',
  'ct': 'meter', 'pt': 'meter', 'meter': 'meter',
  'ups': 'ups',
  'relay': 'relay', 'ocr': 'relay', 'ovr': 'relay',
};

function resolveBlockType(blockName: string): SLDComponentType {
  const lower = blockName.toLowerCase().replace(/[^a-z]/g, '');
  for (const [key, type] of Object.entries(BLOCK_SYMBOL_MAP)) {
    if (lower.includes(key)) return type;
  }
  return 'load'; // 미식별 블록은 부하로 기본 분류
}

// =========================================================================
// PART 3 — 텍스트 스펙 파서
// =========================================================================

interface ParsedSpec {
  cableType?: string;
  conductorSize?: number;
  voltage?: number;
  current?: number;
  power?: number;
  powerUnit?: string;
}

/** 도면 텍스트에서 전기 스펙 추출 */
function parseSpecText(text: string): ParsedSpec {
  const spec: ParsedSpec = {};

  // 케이블 종류: CV, XLPE, HIV, FR-CV 등
  const cableMatch = text.match(/\b(FR-CV|CV|XLPE|HIV|TFR-CV|HFIX|IV|VV)\b/i);
  if (cableMatch) spec.cableType = cableMatch[1].toUpperCase();

  // 도체 단면적: 16sq, 25mm2, 4C 16sq 등
  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:sq|mm2|㎟)/i);
  if (sizeMatch) spec.conductorSize = parseFloat(sizeMatch[1]);

  // 전압: 22.9kV, 380V, 220V 등
  const voltMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:kV|V)/i);
  if (voltMatch) {
    const v = parseFloat(voltMatch[1]);
    const unit = voltMatch[0].toLowerCase();
    spec.voltage = unit.includes('kv') ? v * 1000 : v;
  }

  // 전류: 100A, 50AT 등
  const ampMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:A|AT)\b/);
  if (ampMatch) spec.current = parseFloat(ampMatch[1]);

  // 전력: 15kW, 100kVA, 10HP 등
  const pwrMatch = text.match(/(\d+(?:\.\d+)?)\s*(kW|kVA|HP|MW|MVA)/i);
  if (pwrMatch) {
    spec.power = parseFloat(pwrMatch[1]);
    spec.powerUnit = pwrMatch[2];
  }

  return spec;
}

// =========================================================================
// PART 4 — 유클리디안 거리 계산
// =========================================================================

function euclideanDist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** 폴리라인 총 길이 */
function polylineLength(vertices: Array<{ x: number; y: number }>): number {
  let total = 0;
  for (let i = 1; i < vertices.length; i++) {
    total += euclideanDist(vertices[i - 1], vertices[i]);
  }
  return total;
}

// =========================================================================
// PART 5 — Public API
// =========================================================================

/** DXF 파서 옵션 */
export interface DxfParseOptions {
  /** DXF 단위 → 미터 변환 계수 (기본: 1 = 이미 mm 단위) */
  unitScale?: number;
  /** 텍스트-심볼 매핑 최대 거리 (DXF 단위, 기본: 50) */
  textProximityThreshold?: number;
}

/**
 * DXF ASCII 문자열 → SLDAnalysis 변환.
 * VLM 없이 벡터 좌표에서 직접 추출 — 공간 환각 0%.
 */
export function parseDxfToSLD(
  dxfContent: string,
  options: DxfParseOptions = {},
): SLDAnalysis {
  const { unitScale = 0.001, textProximityThreshold = 50 } = options; // mm → m

  const parser = new DxfParser();
  const dxf = parser.parseSync(dxfContent) as DxfParseResult | null;
  if (!dxf || !dxf.entities) {
    return { components: [], connections: [], suggestedCalculations: [], confidence: 0, rawDescription: 'DXF parse failed' };
  }

  const components: SLDComponent[] = [];
  const connections: SLDConnection[] = [];
  const texts: Array<{ text: string; x: number; y: number; spec: ParsedSpec }> = [];

  let compIdx = 0;
  let connIdx = 0;

  // Pass 1: 엔티티 분류
  for (const entity of dxf.entities) {
    switch (entity.type) {
      // ── INSERT (블록 참조) → 심볼 컴포넌트 ──
      case 'INSERT': {
        if (!entity.position || !entity.name) break;
        const type = resolveBlockType(entity.name);
        components.push({
          id: `comp_${++compIdx}`,
          type,
          label: entity.name,
          position: { x: entity.position.x, y: entity.position.y },
          properties: { blockName: entity.name, layer: entity.layer ?? '' },
        });
        break;
      }

      // ── CIRCLE → 심볼 (모터/발전기 등 원형 심볼) ──
      case 'CIRCLE': {
        if (!entity.position) break;
        components.push({
          id: `comp_${++compIdx}`,
          type: 'motor', // 원형 심볼은 기본 모터 분류
          label: entity.layer ?? 'CIRCLE',
          position: { x: entity.position.x, y: entity.position.y },
          properties: { radius: String(entity.radius ?? 0), layer: entity.layer ?? '' },
        });
        break;
      }

      // ── LINE → 연결 (케이블) ──
      case 'LINE': {
        // dxf-parser 라이브러리는 LINE을 vertices[2]로 준다(startPoint/endPoint
        // 아님) — 기존 분기는 항상 skip돼 LINE 연결이 한 번도 추출되지 않았다
        // (플래그 OFF가 숨기던 잠복 사망 경로). 두 형태 모두 수용.
        const lineStart = entity.vertices?.[0] ?? entity.startPoint;
        const lineEnd = entity.vertices?.[1] ?? entity.endPoint;
        if (!lineStart || !lineEnd) break;
        const length = euclideanDist(lineStart, lineEnd) * unitScale;
        connections.push({
          id: `conn_${++connIdx}`,
          from: `node_at_${Math.round(lineStart.x)}_${Math.round(lineStart.y)}`,
          to: `node_at_${Math.round(lineEnd.x)}_${Math.round(lineEnd.y)}`,
          length: `${Math.round(length * 100) / 100}m`,
          conductorSize: undefined,
          cableType: undefined,
        });
        break;
      }

      // ── LWPOLYLINE/POLYLINE → 연결 (경로) ──
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        if (!entity.vertices || entity.vertices.length < 2) break;
        const length = polylineLength(entity.vertices) * unitScale;
        const start = entity.vertices[0];
        const end = entity.vertices[entity.vertices.length - 1];
        connections.push({
          id: `conn_${++connIdx}`,
          from: `node_at_${Math.round(start.x)}_${Math.round(start.y)}`,
          to: `node_at_${Math.round(end.x)}_${Math.round(end.y)}`,
          length: `${Math.round(length * 100) / 100}m`,
          conductorSize: undefined,
          cableType: undefined,
        });
        break;
      }

      // ── TEXT/MTEXT → 스펙 텍스트 수집 ──
      case 'TEXT':
      case 'MTEXT': {
        if (!entity.text || !entity.position) break;
        const spec = parseSpecText(entity.text);
        texts.push({
          text: entity.text,
          x: entity.position.x,
          y: entity.position.y,
          spec,
        });
        break;
      }
    }
  }

  // Pass 2: 텍스트를 가장 가까운 컴포넌트/연결에 매핑 (유클리디안 거리)
  for (const t of texts) {
    // 컴포넌트 매핑
    let closestComp: SLDComponent | null = null;
    let closestDist = textProximityThreshold;

    for (const comp of components) {
      const dist = euclideanDist({ x: t.x, y: t.y }, comp.position);
      if (dist < closestDist) {
        closestDist = dist;
        closestComp = comp;
      }
    }

    if (closestComp) {
      if (t.spec.voltage) closestComp.voltage = `${t.spec.voltage}V`;
      if (t.spec.current) closestComp.current = `${t.spec.current}A`;
      if (t.spec.power) closestComp.rating = `${t.spec.power}${t.spec.powerUnit}`;
      if (!closestComp.label || closestComp.label === closestComp.type) {
        closestComp.label = t.text.slice(0, 50);
      }
      continue;
    }

    // 연결 매핑 (케이블 스펙)
    if (t.spec.conductorSize || t.spec.cableType) {
      for (const conn of connections) {
        // 연결의 중점과 텍스트 거리
        const fromCoords = parseNodeCoords(conn.from);
        const toCoords = parseNodeCoords(conn.to);
        if (!fromCoords || !toCoords) continue;
        const mid = { x: (fromCoords.x + toCoords.x) / 2, y: (fromCoords.y + toCoords.y) / 2 };
        if (euclideanDist({ x: t.x, y: t.y }, mid) < textProximityThreshold * 2) {
          if (t.spec.conductorSize) conn.conductorSize = `${t.spec.conductorSize}sq`;
          if (t.spec.cableType) conn.cableType = t.spec.cableType;
          break;
        }
      }
    }
  }

  // Pass 3: 끝점 결속 — comp_N ↔ node_at_x_y 불일치로 전 엣지가 허공이던 결함 수리.
  // 반경 내 끝점은 컴포넌트로 스냅, 밖은 접점(bus) 승격, 자기루프 제거.
  const snap = snapConnectionEndpoints(
    components.map((c) => ({ id: c.id, x: c.position.x, y: c.position.y })),
    connections,
  );
  for (const j of snap.junctions) {
    components.push({
      id: j.id,
      type: 'bus',
      label: '접점 (junction)',
      position: { x: j.x, y: j.y },
      properties: { synthetic: 'junction' },
    });
  }

  return {
    components,
    connections: snap.connections,
    suggestedCalculations: [],
    confidence: 0.95, // 벡터 파싱은 VLM보다 높은 신뢰도
    rawDescription: `DXF parsed: ${components.length} components, ${snap.connections.length} connections (snapped ${snap.stats.snapped}, junctions ${snap.stats.junctioned}, dropped ${snap.stats.droppedSelfLoops}), ${texts.length} text labels`,
  };
}

// ── Helper ──

function parseNodeCoords(nodeId: string): { x: number; y: number } | null {
  const match = nodeId.match(/node_at_(-?\d+)_(-?\d+)/);
  if (!match) return null;
  return { x: parseInt(match[1]), y: parseInt(match[2]) };
}
