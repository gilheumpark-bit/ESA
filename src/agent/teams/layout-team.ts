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
import { splitAndAnalyze } from '../vision/vision-splitter';
import { resolveSymbol } from '../vision/symbol-db';

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
  length: number;           // meters
  cableCount: number;
  cableSpec?: string;       // "HIV 2.5sq × 3C"
  conduitSize?: number;     // mm
}

/**
 * 평면도에서 레이아웃 요소 추출.
 * DXF: 벡터 파싱 (레이어 기반)
 * 이미지: VRAM 분할 비전
 */
async function extractLayoutElements(
  input: TeamInput,
): Promise<{ elements: LayoutElement[]; segments: WiringSegment[]; confidence: number }> {
  const { classification, fileBuffer } = input;

  if (classification === 'layout_dxf' && fileBuffer) {
    return parseDxfLayout(fileBuffer);
  }

  if (classification === 'layout_image' && fileBuffer) {
    return parseImageLayout(fileBuffer);
  }

  if (classification === 'layout_pdf' && fileBuffer) {
    return parsePdfLayout(fileBuffer);
  }

  return { elements: [], segments: [], confidence: 0 };
}

/** DXF 평면도 파싱 — 레이어별 요소 분류 */
async function parseDxfLayout(buffer: ArrayBuffer) {
  const text = new TextDecoder().decode(buffer);
  const elements: LayoutElement[] = [];
  const segments: WiringSegment[] = [];

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
    const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) * 0.001; // mm → m

    segments.push({
      from: `pt-${Math.round(x1)}-${Math.round(y1)}`,
      to: `pt-${Math.round(x2)}-${Math.round(y2)}`,
      method: layer.includes('TRAY') ? 'cable_tray' : 'conduit',
      length,
      cableCount: 1,
    });
  }

  return { elements, segments, confidence: 0.90 };
}

/** 이미지 평면도 파싱 — VRAM 분할 병렬 비전 */
async function parseImageLayout(buffer: ArrayBuffer) {
  const visionResults = await splitAndAnalyze(buffer, {
    gridSize: 8,      // 8분할 (높은 해상도 평면도)
    overlap: 0.15,
    model: 'gemini',
  });

  const elements: LayoutElement[] = [];
  const segments: WiringSegment[] = [];
  let idx = 0;

  for (const vr of visionResults) {
    for (const c of vr.components) {
      elements.push({
        id: `layout-${idx++}`,
        type: mapToLayoutType(c.type),
        label: c.label || c.type,
        position: c.position ?? { x: 0, y: 0 },
        rating: c.rating,
      });
    }
    for (const conn of vr.connections) {
      segments.push({
        from: conn.from,
        to: conn.to,
        method: 'conduit',
        length: conn.length ?? 5,
        cableCount: 1,
      });
    }
  }

  const avgConf = visionResults.length > 0
    ? visionResults.reduce((s, r) => s + r.regionConfidence, 0) / visionResults.length
    : 0;

  return { elements, segments, confidence: avgConf };
}

/** PDF 평면도 파싱 */
async function parsePdfLayout(buffer: ArrayBuffer) {
  // PDF 벡터 추출 후 레이아웃 요소 분류
  const { parsePdfToSLD } = await import('@/engine/topology/pdf-vector-parser');
  const bytes = new Uint8Array(buffer);
  const analysis = await parsePdfToSLD(bytes.buffer as ArrayBuffer, { pageNumber: 1 });

  const elements: LayoutElement[] = (analysis.components ?? []).map((c, i) => ({
    id: `layout-${i}`,
    type: mapToLayoutType(c.type),
    label: c.label ?? c.type,
    position: c.position ?? { x: 0, y: 0 },
  }));

  return { elements, segments: [], confidence: 0.75 };
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
): WiringSegment[] {
  const panels = elements.filter(e => e.type === 'panel');
  const loads = elements.filter(e =>
    ['outlet', 'light', 'motor', 'hvac', 'ev_charger'].includes(e.type)
  );

  if (panels.length === 0 || loads.length === 0) return segments;

  const routes: WiringSegment[] = [...segments];

  for (const load of loads) {
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
    const routeLength = manhattanDist * 0.001 * 1.15; // mm→m, 1.15배 여유

    routes.push({
      from: nearestPanel.id,
      to: load.id,
      method: 'conduit',
      length: Math.round(routeLength * 100) / 100,
      cableCount: load.type === 'motor' ? 4 : 3, // 동력: 4C, 전등: 3C
      cableSpec: load.type === 'motor' ? 'HIV 6sq × 4C' : 'HIV 2.5sq × 3C',
    });
  }

  return routes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Conduit & Distance Calculation
// ═══════════════════════════════════════════════════════════════════════════════

/** KEC 기준 전선관 충전율 (KEC 232.31) — 전선 3본 이상: 40% */
const CONDUIT_FILL_RATE = 0.40; // 전선 단면적 합 / 전선관 단면적 ≤ 40%

/** 케이블 외경 테이블 (mm) — KEC 표준 */
const CABLE_OD: Record<string, number> = {
  'HIV 1.5sq': 3.8, 'HIV 2.5sq': 4.5, 'HIV 4sq': 5.3,
  'HIV 6sq': 6.2, 'HIV 10sq': 7.8, 'HIV 16sq': 9.2,
  'HIV 25sq': 11.0, 'HIV 35sq': 12.6, 'HIV 50sq': 14.6,
  'XLPE 6sq': 10.2, 'XLPE 10sq': 11.5, 'XLPE 16sq': 12.8,
  'XLPE 25sq': 14.5, 'XLPE 35sq': 16.2, 'XLPE 50sq': 18.0,
};

/** 표준 전선관 규격 (mm 내경) */
const STANDARD_CONDUIT_SIZES = [16, 22, 28, 36, 42, 54, 70, 82, 92, 104];

function calculateConduitSize(cableSpec: string, cableCount: number): number {
  const baseName = cableSpec.replace(/\s*×\s*\d+C/, '').trim();
  const od = CABLE_OD[baseName] ?? 5.0;
  const totalArea = cableCount * Math.PI * (od / 2) ** 2;
  const requiredArea = totalArea / CONDUIT_FILL_RATE;
  const requiredDiameter = Math.sqrt(requiredArea * 4 / Math.PI);

  // 표준 규격 중 최소 만족 크기
  return STANDARD_CONDUIT_SIZES.find(s => s >= requiredDiameter)
    ?? STANDARD_CONDUIT_SIZES[STANDARD_CONDUIT_SIZES.length - 1];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Team Result Assembly
// ═══════════════════════════════════════════════════════════════════════════════

export async function executeLayoutTeam(input: TeamInput): Promise<TeamResult> {
  const start = Date.now();

  try {
    // Step 1: 평면도 요소 추출
    const { elements, segments, confidence } = await extractLayoutElements(input);

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
    const routes = computeWiringRoutes(elements, segments);

    // Step 3: 전선관 계산 + 거리 산출
    const calculations: CalculationEntry[] = [];
    const standards: StandardEntry[] = [];
    const violations: ViolationEntry[] = [];
    const recommendations: RecommendationEntry[] = [];

    let totalWiringLength = 0;

    for (const route of routes) {
      totalWiringLength += route.length;

      if (route.cableSpec) {
        const conduitSize = calculateConduitSize(route.cableSpec, route.cableCount);
        route.conduitSize = conduitSize;

        calculations.push({
          id: `calc-conduit-${route.from}-${route.to}`,
          calculatorId: 'conduit-sizing',
          label: `${route.from} → ${route.to} 전선관`,
          value: conduitSize,
          unit: 'mm',
          compliant: true,
          standardRef: 'KEC 232.31',
        });
      }

      calculations.push({
        id: `calc-dist-${route.from}-${route.to}`,
        calculatorId: 'wiring-distance',
        label: `${route.from} → ${route.to} 배선 거리`,
        value: route.length,
        unit: 'm',
        compliant: route.length <= 50, // 분기 회로 50m 이내 권장
        standardRef: 'KEC 232.52',
      });

      if (route.length > 50) {
        violations.push({
          id: `vio-dist-${route.from}-${route.to}`,
          severity: 'major',
          title: '배선 거리 과다',
          description: `${route.from} → ${route.to} 구간 ${route.length.toFixed(1)}m > 권장 50m`,
          location: `${route.from} → ${route.to}`,
          standardRef: 'KEC 232.52',
          suggestedFix: '중간 분전반 추가 또는 케이블 굵기 증가 검토',
        });
      }
    }

    // 통계 요약
    standards.push({
      standard: 'KEC',
      clause: '232.31',
      title: '전선관 선정',
      judgment: violations.length === 0 ? 'PASS' : 'HOLD',
      note: `총 ${routes.length}개 경로, 총 배선 길이 ${totalWiringLength.toFixed(1)}m`,
    });

    // 비용 최적화 제안
    if (routes.some(r => r.method === 'conduit' && r.length > 30)) {
      recommendations.push({
        id: 'rec-tray',
        category: 'cost',
        title: '케이블트레이 적용 검토',
        description: '30m 이상 구간은 전선관 대신 케이블트레이가 시공비 절감 가능',
        impact: 'medium',
        estimatedSaving: '자재비 15~25% 절감',
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
      cableType: r.cableSpec,
      length: r.length,
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
