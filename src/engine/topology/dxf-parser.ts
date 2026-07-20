/**
 * ESVA DXF Vector Parser — CAD 도면의 벡터 데이터를 정밀 추출
 * ──────────────────────────────────────────────────────────────
 * VLM(이미지 AI)의 공간 추정을 피하고 DXF에 기록된 벡터 좌표를 직접 읽는다.
 * 커스텀 블록·외부 참조·손상 엔티티의 의미 인식까지 보장하는 것은 아니다.
 * 결과는 기존 SLDComponent/SLDConnection 타입으로 변환 → TopologyGraph에 바로 투입.
 *
 * PART 1: DXF Entity → SLD 변환
 * PART 2: 심볼 블록 매핑 테이블
 * PART 3: 텍스트 스펙 파서
 * PART 4: Public API
 */

import DxfParserModule from 'dxf-parser';
import type { SLDComponent, SLDConnection, SLDAnalysis, SLDComponentType } from '@/lib/sld-recognition';
import { snapConnectionEndpoints, formatEndpointId as endpointId } from './endpoint-snap';
import { parseSpecText, type ParsedSpec } from './spec-text';

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
  /** CIRCLE/ARC 중심 — dxf-parser는 position이 아니라 center로 준다 */
  center?: { x: number; y: number; z?: number };
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
  'db': 'panel', 'dp': 'panel', 'cubicle': 'panel',
  // 부하
  'load': 'load', 'light': 'load', 'heater': 'load',
  // 기타
  'bus': 'bus', 'busbar': 'bus',
  'cap': 'capacitor', 'capacitor': 'capacitor',
  'sw': 'switch', 'switch': 'switch', 'ds': 'switch', 'ats': 'switch',
  'ct': 'meter', 'pt': 'meter', 'meter': 'meter',
  'ups': 'ups',
  'relay': 'relay', 'ocr': 'relay', 'ovr': 'relay',
};

/** 긴 키 우선 — 짧은 키가 긴 키를 가리는 것을 막는다 */
const SYMBOL_KEYS_BY_LENGTH = Object.keys(BLOCK_SYMBOL_MAP).sort((a, b) => b.length - a.length);

/**
 * 블록명 → 심볼 타입.
 *
 * 구현은 `lower.includes(key)`를 삽입순으로 훑었다. 짧은 키가 긴 키를 가려
 * 실측에서 대량 오분류가 났다(픽스처 15장 기준선):
 *   MCC → 'm'에 먼저 걸려 motor (panel이어야 함)
 *   METER → 'm' → motor · SWGR/LIGHT → 'g' → generator
 *   MTR-* → 'tr' → transformer · LOAD-B → 'db' → panel
 * 단일 글자 키('m','g')가 사실상 만능 와일드카드로 작동한 것이 원인이다.
 *
 * 그래서 이름을 토큰으로 끊고 단계적으로 좁힌다. 1글자 키는 **완전한 토큰일 때만**
 * 유효하다("M-1"은 모터, "MCC-1"은 모터가 아니다).
 */
function resolveBlockType(blockName: string): SLDComponentType {
  const lower = blockName.toLowerCase();
  const tokens = lower.split(/[^a-z]+/).filter(Boolean);

  // 1) 토큰 완전 일치 — 1글자 키가 유효한 유일한 경로
  for (const token of tokens) {
    const hit = BLOCK_SYMBOL_MAP[token];
    if (hit) return hit;
  }

  // 2) 토큰 접두 일치 (MCCB1 → mccb) — 2글자 이상 키만
  for (const token of tokens) {
    for (const key of SYMBOL_KEYS_BY_LENGTH) {
      if (key.length >= 2 && token.startsWith(key)) return BLOCK_SYMBOL_MAP[key];
    }
  }

  // 3) 부분 문자열 (MAINBUS → bus) — 3글자 이상 키만, 오검출 여지가 가장 크므로 마지막
  for (const key of SYMBOL_KEYS_BY_LENGTH) {
    if (key.length >= 3 && lower.includes(key)) return BLOCK_SYMBOL_MAP[key];
  }

  return 'load'; // 미식별 블록은 부하로 기본 분류
}

/**
 * 결선 추출에서 제외할 레이어.
 * 치수선·해칭·도면틀은 선분이지 전선이 아니다. 실측에서 이들이 전부 결선으로
 * 잡혀 결선 정밀도가 11%까지 떨어졌다(L2-05 layer-noise 기준선).
 */
const DEFAULT_IGNORED_LAYERS =
  /^(dim|dimension|hatch|frame|border|title|titleblock|note|grid|axis|center|centre|hidden|defpoints|viewport)/i;

// =========================================================================
// PART 3 — 텍스트 스펙 파서
// =========================================================================

// 스펙 파싱은 PDF 파서와 공유한다 (spec-text.ts) — 복사본이 갈라지지 않도록.

// =========================================================================
// PART 4 — 유클리디안 거리 계산
// =========================================================================

function euclideanDist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * 심볼 간 최근접 거리의 중앙값 — 도면의 "한 칸" 크기.
 *
 * 근접 임계를 bbox 대각선 비율로 잡으면 세로로 긴 단선도에서 무너진다:
 * 세로 200·가로 15인 도면의 대각선 3%는 6이라, 심볼 옆 15만큼 떨어진 정격
 * 텍스트가 전부 미결합됐다(스펙 재현율 0%). 도면의 전체 크기가 아니라
 * **심볼이 놓인 간격**이 텍스트가 얼마나 떨어져 있을지를 결정한다.
 */
function medianSymbolSpacing(components: Array<{ position: { x: number; y: number } }>): number {
  if (components.length < 2) return 0;
  const nearest: number[] = [];
  for (let i = 0; i < components.length; i++) {
    let best = Infinity;
    for (let j = 0; j < components.length; j++) {
      if (i === j) continue;
      const d = euclideanDist(components[i].position, components[j].position);
      if (d > 0 && d < best) best = d;
    }
    if (Number.isFinite(best)) nearest.push(best);
  }
  if (!nearest.length) return 0;
  nearest.sort((a, b) => a - b);
  return nearest[Math.floor(nearest.length / 2)];
}

/** 텍스트-심볼 근접 임계 = 심볼 간격의 60%. 이웃 심볼로 넘어가기 전까지만 허용. */
function drawingProximity(
  components: Array<{ position: { x: number; y: number } }>,
  texts: Array<{ x: number; y: number }>,
): number {
  const spacing = medianSymbolSpacing(components);
  if (spacing > 0) return spacing * 0.6;

  // 심볼이 0~1개면 간격을 잴 수 없다 — 텍스트까지 포함한 범위로 대체
  const pts = [...components.map((c) => c.position), ...texts];
  if (pts.length < 2) return 50;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY);
  return diag > 0 ? diag * 0.1 : 50;
}

/**
 * 행 정렬 인출 — 정격표를 도면 옆 열에 몰아 쓰고 인출선으로 잇는 실무 관례.
 * 근접 반경 밖이어도 **높이가 겹치는 심볼이 정확히 하나뿐**이면 그 심볼의 것으로 본다.
 * 후보가 둘 이상이면 귀속을 지어내지 않고 포기한다.
 */
function rowAlignedComponent(
  text: { x: number; y: number },
  components: SLDComponent[],
  band: number,
): SLDComponent | null {
  const inBand = components.filter((c) => Math.abs(c.position.y - text.y) <= band);
  return inBand.length === 1 ? inBand[0] : null;
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
  /** DXF 좌표 1단위 → 미터 변환 계수. 미지정·헤더 단위 없음이면 물리 길이를 만들지 않는다. */
  unitScale?: number;
  /** 텍스트-심볼 매핑 최대 거리 (DXF 단위, 기본: 도면 bbox 대각선의 3%) */
  textProximityThreshold?: number;
  /** 결선 추출에서 제외할 레이어 (기본: 치수·해칭·도면틀류) */
  ignoreLayers?: RegExp;
}

const DXF_UNIT_SCALE_M: Partial<Record<number, number>> = {
  1: 0.0254,
  2: 0.3048,
  4: 0.001,
  5: 0.01,
  6: 1,
  10: 0.9144,
};

function resolveUnitScale(dxfContent: string, requested: unknown): number | undefined {
  if (typeof requested === 'number' && Number.isFinite(requested) && requested > 0 && requested <= 1_000) {
    return requested;
  }
  const match = dxfContent.match(/\$INSUNITS\s*\r?\n\s*70\s*\r?\n\s*(\d+)/);
  return match ? DXF_UNIT_SCALE_M[Number(match[1])] : undefined;
}

/**
 * DXF ASCII 문자열 → SLDAnalysis 변환.
 * VLM 없이 벡터 좌표에서 직접 추출 — 공간 환각 0%.
 */
export function parseDxfToSLD(
  dxfContent: string,
  options: DxfParseOptions = {},
): SLDAnalysis {
  const { ignoreLayers = DEFAULT_IGNORED_LAYERS } = options;
  const unitScale = resolveUnitScale(dxfContent, options.unitScale);

  // dxf-parser는 형식이 아닌 입력에서 결과를 반환하지 않고 **예외를 던진다**
  // ("Empty file" 등). 아래 실패 분기는 null 반환만 가정하고 있어 사용자가 다른
  // 파일을 올리면 라우트가 500으로 터졌다(적대 테스트에서 발각). 파싱 실패는
  // 예외가 아니라 결과다 — 여기서 흡수해 confidence 0으로 내린다.
  let dxf: DxfParseResult | null = null;
  let parseError: string | null = null;
  try {
    dxf = new DxfParser().parseSync(dxfContent) as DxfParseResult | null;
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }
  if (!dxf || !dxf.entities) {
    return {
      components: [],
      connections: [],
      suggestedCalculations: [],
      confidence: 0,
      rawDescription: `DXF parse failed${parseError ? `: ${parseError}` : ''}`,
    };
  }

  const isIgnoredLayer = (layer?: string) => !!layer && ignoreLayers.test(layer);

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
        // dxf-parser는 CIRCLE 중심을 center로 준다(position 아님) — 기존 분기는
        // 항상 skip돼 원형 심볼이 한 번도 컴포넌트가 되지 않았다. LINE의
        // vertices 불일치와 동일 계열이며 픽스처 기준선에서 발각.
        const center = entity.position ?? entity.center;
        if (!center) break;
        if (isIgnoredLayer(entity.layer)) break;
        components.push({
          id: `comp_${++compIdx}`,
          // 원만으로는 모터/발전기를 가릴 수 없다. Pass 2에서 근접 텍스트로 재판정한다.
          type: 'motor',
          label: entity.layer ?? 'CIRCLE',
          position: { x: center.x, y: center.y },
          properties: {
            radius: String(entity.radius ?? 0),
            layer: entity.layer ?? '',
            shape: 'circle',
          },
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
        if (isIgnoredLayer(entity.layer)) break;
        const length = unitScale == null ? undefined : euclideanDist(lineStart, lineEnd) * unitScale;
        connections.push({
          id: `conn_${++connIdx}`,
          from: endpointId(lineStart),
          to: endpointId(lineEnd),
          ...(length == null ? {} : { length: `${Math.round(length * 100) / 100}m` }),
          conductorSize: undefined,
          cableType: undefined,
        });
        break;
      }

      // ── LWPOLYLINE/POLYLINE → 연결 (경로) ──
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        if (!entity.vertices || entity.vertices.length < 2) break;
        if (isIgnoredLayer(entity.layer)) break;
        const length = unitScale == null ? undefined : polylineLength(entity.vertices) * unitScale;
        const start = entity.vertices[0];
        const end = entity.vertices[entity.vertices.length - 1];
        connections.push({
          id: `conn_${++connIdx}`,
          from: endpointId(start),
          to: endpointId(end),
          ...(length == null ? {} : { length: `${Math.round(length * 100) / 100}m` }),
          conductorSize: undefined,
          cableType: undefined,
        });
        break;
      }

      // ── TEXT/MTEXT → 스펙 텍스트 수집 ──
      case 'TEXT':
      case 'MTEXT': {
        // dxf-parser는 TEXT 삽입점을 startPoint로 준다(position 아님) — 기존
        // 분기는 항상 skip돼 정격·전압·전류·케이블 스펙이 한 번도 추출된 적이
        // 없다(픽스처 기준선 스펙 재현율 0%).
        const anchor = entity.position ?? entity.startPoint;
        if (!entity.text || !anchor) break;
        const spec = parseSpecText(entity.text);
        texts.push({
          text: entity.text,
          x: anchor.x,
          y: anchor.y,
          spec,
        });
        break;
      }
    }
  }

  // Pass 2: 텍스트를 가장 가까운 컴포넌트/연결에 매핑 (유클리디안 거리)
  //
  // 근접 임계는 고정 50이었다. 도면 단위가 미터면 50이 도면 전체를 덮고,
  // 대형 도면에서는 인출선 하나 길이도 안 된다. 도면 크기에 비례시킨다.
  const textProximityThreshold =
    options.textProximityThreshold ?? drawingProximity(components, texts);

  const rowBand = textProximityThreshold * 0.7;

  for (const t of texts) {
    // 컴포넌트 매핑 — ① 근접 반경, ② 실패 시 행 정렬 인출
    let closestComp: SLDComponent | null = null;
    let closestDist = textProximityThreshold;

    for (const comp of components) {
      const dist = euclideanDist({ x: t.x, y: t.y }, comp.position);
      if (dist < closestDist) {
        closestDist = dist;
        closestComp = comp;
      }
    }

    // 케이블 스펙 텍스트는 심볼이 아니라 선로에 붙는다 — 행 정렬로 끌어오지 않는다
    const isCableSpec = !!(t.spec.conductorSize || t.spec.cableType);
    if (!closestComp && !isCableSpec) {
      closestComp = rowAlignedComponent(t, components, rowBand);
    }

    if (closestComp) {
      if (t.spec.voltage) closestComp.voltage = `${t.spec.voltage}V`;
      if (t.spec.current) closestComp.current = `${t.spec.current}A`;
      if (t.spec.power) closestComp.rating = `${t.spec.power}${t.spec.powerUnit}`;
      const isCircle = closestComp.properties?.shape === 'circle';
      if (!closestComp.label || closestComp.label === closestComp.type || isCircle) {
        closestComp.label = t.text.slice(0, 50);
      }
      // 원만으로는 모터/발전기를 가릴 수 없다. 붙은 이름표가 어휘에 있으면
      // 그쪽을 따른다 (M-1 → motor, G-1 → generator).
      if (isCircle) {
        closestComp.type = resolveBlockType(t.text);
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
