/**
 * TEAM-LAYOUT: 평면도팀 에이전트
 * -------------------------------
 * 평면도 → 배선 경로 추출 → 전선관 계산 → 거리 산출
 *
 * PART 1: Floor plan parsing
 * PART 2: Wiring route extraction
 * PART 3: Conduit & distance calculation
 * PART 4: Team result assembly
 */

import type {
  TeamInput,
  TeamResult,
  ExtractedComponent,
  ExtractedConnection,
  CalculationEntry,
  StandardEntry,
  ViolationEntry,
  RecommendationEntry,
} from './types';
import { mergeVisionSplitResults, splitAndAnalyze } from '../vision/vision-splitter';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Floor Plan Parsing
// ═══════════════════════════════════════════════════════════════════════════════

/** 평면도 요소 타입 */
type LayoutElementType =
  | 'outlet'         // 콘센트
  | 'light'          // 조명
  | 'switch'         // 스위치
  | 'panel'          // 분전반
  | 'fire_detector'  // 화재감지기
  | 'emergency_light'// 비상등
  | 'motor'          // 전동기
  | 'hvac'           // 공조
  | 'ev_charger'     // 전기차 충전기
  | 'cable_tray'     // 케이블트레이
  | 'conduit'        // 전선관
  | 'junction_box'   // 정션박스
  | 'unknown';

interface LayoutElement {
  id: string;
  type: LayoutElementType;
  label: string;
  room?: string;            // 설치 공간 (사무실, 복도, 등)
  floor?: number;           // 층수
  position: { x: number; y: number };
  rating?: string;
  circuitId?: string;       // 소속 회로 번호
}

interface WiringSegment {
  from: string;
  to: string;
  method: 'conduit' | 'cable_tray' | 'exposed' | 'underground';
  length?: number;          // metres; explicit evidence or scaled geometry only
  lengthSource?: 'drawing_geometry' | 'explicit_annotation' | 'scaled_estimate';
  cableCount?: number;
  cableSpec?: string;       // "HIV 2.5sq × 3C"
}

interface LayoutExtraction {
  elements: LayoutElement[];
  segments: WiringSegment[];
  confidence: number;
  coordinateScaleM?: number;
  scaleSource?: string;
}

function positiveScale(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1_000
    ? value
    : undefined;
}

const DXF_UNIT_SCALE_M: Partial<Record<number, number>> = {
  1: 0.0254, // inch
  2: 0.3048, // foot
  4: 0.001,  // millimetre
  5: 0.01,   // centimetre
  6: 1,      // metre
  10: 0.9144,// yard
};

function dxfHeaderScale(text: string): number | undefined {
  const match = text.match(/\$INSUNITS\s*\r?\n\s*70\s*\r?\n\s*(\d+)/);
  return match ? DXF_UNIT_SCALE_M[Number(match[1])] : undefined;
}

/**
 * 평면도에서 레이아웃 요소 추출.
 * DXF: 벡터 파싱 (레이어 기반)
 * 이미지: VRAM 분할 비전
 */
async function extractLayoutElements(
  input: TeamInput,
): Promise<LayoutExtraction> {
  const { classification, fileBuffer } = input;

  if (classification === 'layout_dxf' && fileBuffer) {
    return parseDxfLayout(fileBuffer, input.params);
  }

  if (classification === 'layout_image' && fileBuffer) {
    return parseImageLayout(fileBuffer, input);
  }

  if (classification === 'layout_pdf' && fileBuffer) {
    return parsePdfLayout(fileBuffer, input.params);
  }

  return { elements: [], segments: [], confidence: 0 };
}

/** DXF 평면도 파싱 — 레이어별 요소 분류 */
async function parseDxfLayout(buffer: ArrayBuffer, params?: Record<string, unknown>): Promise<LayoutExtraction> {
  const text = new TextDecoder().decode(buffer);
  const elements: LayoutElement[] = [];
  const segments: WiringSegment[] = [];
  const callerScale = positiveScale(params?.unitScale);
  const headerScale = dxfHeaderScale(text);
  const coordinateScaleM = callerScale ?? headerScale;
  const scaleSource = callerScale
    ? '요청 unitScale'
    : headerScale
      ? 'DXF $INSUNITS'
      : undefined;

  // DXF 레이어 → 요소 타입 매핑
  const LAYER_MAP: Record<string, LayoutElementType> = {
    LIGHTING: 'light',
    LIGHT: 'light',
    RECEPTACLE: 'outlet',
    OUTLET: 'outlet',
    SWITCH: 'switch',
    PANEL: 'panel',
    FIRE: 'fire_detector',
    EMERGENCY: 'emergency_light',
    CONDUIT: 'conduit',
    CABLE_TRAY: 'cable_tray',
    MOTOR: 'motor',
    HVAC: 'hvac',
    EV: 'ev_charger',
  };

  // 간이 DXF 파싱 (INSERT/POINT 엔티티)
  const entityRegex = /INSERT\n[\s\S]*?LAYER\n\s*(\S+)[\s\S]*?10\n\s*([\d.-]+)\n\s*20\n\s*([\d.-]+)/g;
  let match;
  let idx = 0;

  while ((match = entityRegex.exec(text)) !== null) {
    const layer = match[1].toUpperCase();
    const x = parseFloat(match[2]);
    const y = parseFloat(match[3]);

    let type: LayoutElementType = 'unknown';
    for (const [key, val] of Object.entries(LAYER_MAP)) {
      if (layer.includes(key)) { type = val; break; }
    }

    if (type !== 'unknown') {
      elements.push({
        id: `layout-${idx++}`,
        type,
        label: `${type}-${idx}`,
        position: { x, y },
      });
    }
  }

  // LINE 엔티티 → 배선 경로 추출
  const lineRegex = /LINE\n[\s\S]*?LAYER\n\s*(CONDUIT|CABLE_TRAY|WIRING)[\s\S]*?10\n\s*([\d.-]+)\n\s*20\n\s*([\d.-]+)[\s\S]*?11\n\s*([\d.-]+)\n\s*21\n\s*([\d.-]+)/g;
  let lineMatch;

  while ((lineMatch = lineRegex.exec(text)) !== null) {
    const layer = lineMatch[1].toUpperCase();
    const x1 = parseFloat(lineMatch[2]);
    const y1 = parseFloat(lineMatch[3]);
    const x2 = parseFloat(lineMatch[4]);
    const y2 = parseFloat(lineMatch[5]);
    const coordinateLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

    segments.push({
      from: `pt-${Math.round(x1)}-${Math.round(y1)}`,
      to: `pt-${Math.round(x2)}-${Math.round(y2)}`,
      method: layer.includes('TRAY') ? 'cable_tray' : 'conduit',
      ...(coordinateScaleM
        ? { length: coordinateLength * coordinateScaleM, lengthSource: 'drawing_geometry' as const }
        : {}),
    });
  }

  return {
    elements,
    segments,
    confidence: elements.length > 0 ? 0.65 : 0,
    coordinateScaleM,
    scaleSource,
  };
}

/** 이미지 평면도 파싱 — VRAM 분할 병렬 비전 */
async function parseImageLayout(buffer: ArrayBuffer, input: TeamInput): Promise<LayoutExtraction> {
  const provider = input.vision?.provider
    ?? (process.env.GOOGLE_GENERATIVE_AI_API_KEY ? 'gemini'
      : process.env.OPENAI_API_KEY ? 'openai'
        : process.env.ANTHROPIC_API_KEY ? 'claude'
          : 'gemini');
  const visionResults = await splitAndAnalyze(buffer, {
    gridSize: 8,      // 8분할 (높은 해상도 평면도)
    overlap: 0.15,
    model: provider,
    modelName: input.vision?.model,
    apiKey: input.vision?.apiKey,
  });
  const merged = mergeVisionSplitResults(visionResults);

  const elements: LayoutElement[] = merged.components.map(c => ({
    id: c.id,
    type: mapToLayoutType(c.type),
    label: c.label || c.type,
    position: c.position ?? { x: 0, y: 0 },
    rating: c.rating,
  }));
  const segments: WiringSegment[] = merged.connections.map(conn => ({
    from: conn.from,
    to: conn.to,
    method: 'conduit',
    ...(typeof conn.length === 'number' && Number.isFinite(conn.length) && conn.length > 0
      ? { length: conn.length, lengthSource: 'explicit_annotation' as const }
      : {}),
    ...(conn.cableType ? { cableSpec: conn.cableType } : {}),
  }));
  const coordinateScaleM = positiveScale(input.params?.metersPerCoordinateUnit);

  return {
    elements,
    segments,
    confidence: merged.confidence,
    coordinateScaleM,
    scaleSource: coordinateScaleM ? '요청 metersPerCoordinateUnit' : undefined,
  };
}

/** PDF 평면도 파싱 */
async function parsePdfLayout(buffer: ArrayBuffer, params?: Record<string, unknown>): Promise<LayoutExtraction> {
  // PDF 벡터 추출 후 레이아웃 요소 분류
  const { parsePdfToSLD } = await import('@/engine/topology/pdf-vector-parser');
  const bytes = new Uint8Array(buffer);
  const pageNumber = typeof params?.pageNumber === 'number' ? params.pageNumber : 1;
  const analysis = await parsePdfToSLD(bytes.buffer as ArrayBuffer, { pageNumber });

  const elements: LayoutElement[] = (analysis.components ?? []).map((c, i) => ({
    id: `layout-${i}`,
    type: mapToLayoutType(c.type),
    label: c.label ?? c.type,
    position: c.position ?? { x: 0, y: 0 },
  }));

  const coordinateScaleM = positiveScale(params?.metersPerCoordinateUnit);
  return {
    elements,
    segments: [],
    confidence: analysis.confidence ?? (elements.length > 0 ? 0.6 : 0),
    coordinateScaleM,
    scaleSource: coordinateScaleM ? '요청 metersPerCoordinateUnit' : undefined,
  };
}

function mapToLayoutType(raw: string): LayoutElementType {
  const map: Record<string, LayoutElementType> = {
    outlet: 'outlet', receptacle: 'outlet', 콘센트: 'outlet',
    light: 'light', lighting: 'light', 조명: 'light',
    switch: 'switch', 스위치: 'switch',
    panel: 'panel', 분전반: 'panel',
    motor: 'motor', 전동기: 'motor',
    fire: 'fire_detector', smoke: 'fire_detector',
    emergency: 'emergency_light',
    ev: 'ev_charger', charger: 'ev_charger',
  };
  return map[raw.toLowerCase()] ?? 'unknown';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Wiring Route Extraction
// ═══════════════════════════════════════════════════════════════════════════════

/** 분전반 → 각 부하 최단 배선 경로 산출 (맨해튼 거리 기반) */
function computeWiringRoutes(
  elements: LayoutElement[],
  segments: WiringSegment[],
  coordinateScaleM?: number,
): WiringSegment[] {
  const panels = elements.filter(e => e.type === 'panel');
  const loads = elements.filter(e =>
    ['outlet', 'light', 'motor', 'hvac', 'ev_charger'].includes(e.type)
  );

  if (panels.length === 0 || loads.length === 0 || !coordinateScaleM) return segments;

  const routes: WiringSegment[] = [...segments];

  for (const load of loads) {
    const alreadyConnected = routes.some(route =>
      (route.from === load.id && panels.some(panel => panel.id === route.to)) ||
      (route.to === load.id && panels.some(panel => panel.id === route.from))
    );
    if (alreadyConnected) continue;

    // 가장 가까운 분전반 찾기 (유클리드 거리)
    let nearestPanel = panels[0];
    let minDist = Infinity;

    for (const p of panels) {
      const dist = Math.sqrt(
        (p.position.x - load.position.x) ** 2 +
        (p.position.y - load.position.y) ** 2
      );
      if (dist < minDist) {
        minDist = dist;
        nearestPanel = p;
      }
    }

    // 맨해튼 거리 (실제 배선은 벽 따라 직각 경로)
    const manhattanDist =
      Math.abs(nearestPanel.position.x - load.position.x) +
      Math.abs(nearestPanel.position.y - load.position.y);
    const routeLength = manhattanDist * coordinateScaleM;

    routes.push({
      from: nearestPanel.id,
      to: load.id,
      method: 'conduit',
      length: Math.round(routeLength * 100) / 100,
      lengthSource: 'scaled_estimate',
    });
  }

  return routes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Conduit & Distance Calculation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 배선 설계 설정 — 하드코딩 대신 중앙 관리.
 * 국가/표준별 변경 시 이 블록만 수정.
 */
const LAYOUT_CONFIG = {
  /** 전압강하 경고 거리 (m) */
  vdWarningDistance: 50,
  /** 케이블트레이 권장 거리 (m) */
  trayRecommendDistance: 30,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Team Result Assembly
// ═══════════════════════════════════════════════════════════════════════════════

export async function executeLayoutTeam(input: TeamInput): Promise<TeamResult> {
  const start = Date.now();

  try {
    // Step 1: 평면도 요소 추출
    const {
      elements,
      segments,
      confidence,
      coordinateScaleM,
      scaleSource,
    } = await extractLayoutElements(input);

    if (elements.length === 0) {
      return {
        teamId: 'TEAM-LAYOUT',
        success: false,
        confidence: 0,
        durationMs: Date.now() - start,
        error: '평면도에서 전기 설비 요소를 인식할 수 없습니다.',
      };
    }

    // Step 2: 배선 경로 계산
    const routes = computeWiringRoutes(elements, segments, coordinateScaleM);

    // Step 3: 전선관 계산 + 거리 산출
    const calculations: CalculationEntry[] = [];
    const standards: StandardEntry[] = [];
    const violations: ViolationEntry[] = [];
    const recommendations: RecommendationEntry[] = [];

    let totalWiringLength = 0;
    let measuredRouteCount = 0;

    for (const route of routes) {
      if (route.cableSpec) {
        standards.push({
          standard: 'KEC',
          clause: '232.31',
          title: '전선관 산정 보류',
          judgment: 'HOLD',
          note: `${route.from}→${route.to}: ${route.cableSpec} 표기는 추출했지만 제조사 외경·실제 본수·시공 조건이 없어 호칭을 산정하지 않음`,
        });
      }

      if (typeof route.length !== 'number' || !Number.isFinite(route.length) || route.length <= 0) continue;
      totalWiringLength += route.length;
      measuredRouteCount++;

      // 50m는 권장 휴리스틱이지 강제 조항 판정이 아님 → HOLD + 권고만
      calculations.push({
        id: `calc-dist-${route.from}-${route.to}`,
        calculatorId: 'wiring-distance',
        label: `${route.from} → ${route.to} 배선 거리`,
        value: route.length,
        unit: 'm',
        compliant: null,
        note: route.lengthSource === 'scaled_estimate'
          ? '제공된 좌표 축척으로 계산한 직교 경로 추정값 — 실제 배선 경로와 현장 검측 필요.'
          : route.length > LAYOUT_CONFIG.vdWarningDistance
          ? '권장 분기 거리 50m 초과 — 규정 PASS/FAIL 아님. 전압강하·중간 분전반 검토 권고.'
          : route.lengthSource === 'explicit_annotation'
            ? '도면 표기 길이를 비전 모델이 전사한 값 — 원도면 대조 필요.'
            : '도면 좌표와 확인된 단위로 산출한 값 — 현장 경로와 별도 확인.',
      });

      if (route.length > LAYOUT_CONFIG.vdWarningDistance) {
        recommendations.push({
          id: `rec-dist-${route.from}-${route.to}`,
          category: 'safety',
          title: '장거리 분기 전압강하 검토',
          description: `${route.from} → ${route.to} 구간 ${route.length.toFixed(1)}m. 강제 위반 판정이 아니라 전압강하·중간 분전반 검토가 필요한 권고 항목입니다.`,
          impact: 'high',
        });
      }
    }

    // 통계 요약
    standards.push({
      standard: 'KEC',
      clause: '232.31',
      title: '배선 경로·전선관 검토',
      judgment: 'HOLD',
      note: routes.length === 0
        ? `요소 ${elements.length}개를 인식했으나 연결 경로를 확인하지 못함${scaleSource ? ` · 좌표 단위: ${scaleSource}` : ' · 좌표 축척/단위 미확인'}`
        : `경로 ${routes.length}개 중 길이 근거 ${measuredRouteCount}개${measuredRouteCount > 0 ? ` · 합계 ${totalWiringLength.toFixed(1)}m` : ''}${scaleSource ? ` · 좌표 단위: ${scaleSource}` : ' · 좌표 축척/단위 미확인'}`,
    });

    // 장거리 전선관 구간 안내
    //
    // 절감률(구 '자재비 15~25%')은 근거 없는 상수였다. 도면 내용과 무관하게
    // 항상 같은 숫자가 나갔고 출처도 계산 근거도 없었다. 자재 단가·시공 조건에
    // 따라 갈리는 값이라 여기서 추정하지 않는다 — 구간 사실만 제시하고
    // 비교 판단은 견적 단계로 넘긴다.
    const longConduitRoutes = routes.filter(
      (r): r is WiringSegment & { length: number } =>
        r.method === 'conduit' && typeof r.length === 'number' && r.length > LAYOUT_CONFIG.trayRecommendDistance,
    );
    if (longConduitRoutes.length > 0) {
      const longest = Math.max(...longConduitRoutes.map(r => r.length));
      recommendations.push({
        id: 'rec-tray',
        category: 'cost',
        title: '케이블트레이 적용 검토',
        description:
          `30m 초과 전선관 구간 ${longConduitRoutes.length}개(최장 ${longest.toFixed(1)}m). ` +
          '장거리 구간은 케이블트레이가 대안이 될 수 있으나, 절감 여부는 자재 단가·시공 조건에 따라 달라지므로 견적 대조 필요.',
        impact: 'medium',
      });
    }

    const components: ExtractedComponent[] = elements.map(e => ({
      id: e.id,
      type: e.type,
      label: e.label,
      rating: e.rating,
      position: e.position,
      confidence,
    }));

    const connections: ExtractedConnection[] = routes.map(r => ({
      from: r.from,
      to: r.to,
      ...(r.cableSpec ? { cableType: r.cableSpec } : {}),
      ...(typeof r.length === 'number' ? { length: r.length, unit: 'm' } : {}),
    }));

    return {
      teamId: 'TEAM-LAYOUT',
      success: true,
      components,
      connections,
      calculations,
      standards,
      violations,
      recommendations,
      confidence,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      teamId: 'TEAM-LAYOUT',
      success: false,
      confidence: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
