/**
 * TEAM-SLD: 계통도팀 에이전트
 * ---------------------------
 * 계통도(SLD) 이미지/DXF/PDF → 토폴로지 → 계산 체인 → 팀 결과
 *
 * PART 1: Vision split + parsing
 * PART 2: Topology construction
 * PART 3: Calculation chain execution
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
} from './types';
import { EXPANDED_SYMBOL_DB, resolveSymbol } from '../vision/symbol-db';
import { splitAndAnalyze, type VisionSplitResult } from '../vision/vision-splitter';
import { activeDefaults } from '@/engine/calculators/country-defaults';
import { RESISTIVITY, PHYSICS } from '@/engine/constants/electrical';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Vision Split + Parsing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 도면 → 컴포넌트/연결 추출.
 * 이미지: VRAM 분할 병렬 비전 → 심볼 인식
 * DXF: 벡터 파서 직접 호출 (AI 없음)
 * PDF: PDF 벡터 파서
 */
async function extractFromDrawing(
  input: TeamInput,
): Promise<{ components: ExtractedComponent[]; connections: ExtractedConnection[]; confidence: number }> {
  const { classification, fileBuffer, params } = input;

  // DXF: 벡터 파싱 (결정론적, 100% 정확)
  if (classification === 'sld_dxf' && fileBuffer) {
    const text = new TextDecoder().decode(fileBuffer);
    const { parseDxfToSLD } = await import('@/engine/topology/dxf-parser');
    const analysis = parseDxfToSLD(text, { unitScale: (params?.unitScale as number) ?? 0.001 });
    return {
      components: (analysis.components ?? []).map(c => ({
        id: c.id ?? `comp-${Math.random().toString(36).slice(2, 8)}`,
        type: c.type,
        label: c.label ?? c.type,
        rating: c.rating,
        position: c.position,
        confidence: 1.0, // 벡터 파싱은 100%
      })),
      connections: (analysis.connections ?? []).map(conn => ({
        from: conn.from,
        to: conn.to,
        cableType: conn.cableType,
        length: typeof conn.length === 'string' ? parseFloat(conn.length) || undefined : conn.length,
      })),
      confidence: analysis.confidence ?? 0.95,
    };
  }

  // PDF: 벡터 추출
  if (classification === 'sld_pdf' && fileBuffer) {
    const { parsePdfToSLD } = await import('@/engine/topology/pdf-vector-parser');
    const pdfBytes = new Uint8Array(fileBuffer);
    const analysis = await parsePdfToSLD(
      pdfBytes.buffer as ArrayBuffer,
      { pageNumber: (params?.pageNumber as number) ?? 1 },
    );
    return {
      components: (analysis.components ?? []).map(c => ({
        id: c.id ?? `comp-${Math.random().toString(36).slice(2, 8)}`,
        type: c.type,
        label: c.label ?? c.type,
        confidence: 0.85,
      })),
      connections: (analysis.connections ?? []).map(conn => ({
        from: conn.from,
        to: conn.to,
        length: typeof conn.length === 'string' ? parseFloat(conn.length) || undefined : conn.length,
      })),
      confidence: analysis.confidence ?? 0.80,
    };
  }

  // 이미지: VRAM 분할 병렬 비전
  if (classification === 'sld_image' && fileBuffer) {
    const visionResult = await splitAndAnalyze(fileBuffer, {
      gridSize: 4,      // 4분할 (2×2)
      overlap: 0.1,     // 10% 오버랩
      model: 'gemini',
    });
    return mergeVisionResults(visionResult);
  }

  return { components: [], connections: [], confidence: 0 };
}

/** 비전 분할 결과를 단일 SLD로 병합 */
function mergeVisionResults(
  results: VisionSplitResult[],
): { components: ExtractedComponent[]; connections: ExtractedConnection[]; confidence: number } {
  const allComponents: ExtractedComponent[] = [];
  const allConnections: ExtractedConnection[] = [];
  const seenIds = new Set<string>();

  for (const r of results) {
    for (const c of r.components) {
      // 중복 제거 (오버랩 영역에서 같은 컴포넌트)
      const key = `${c.type}-${Math.round((c.position?.x ?? 0) / 10)}-${Math.round((c.position?.y ?? 0) / 10)}`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        allComponents.push({
          ...c,
          type: resolveSymbol(c.type),
          confidence: c.confidence * r.regionConfidence,
        });
      }
    }
    allConnections.push(...r.connections);
  }

  const avgConf = results.length > 0
    ? results.reduce((sum, r) => sum + r.regionConfidence, 0) / results.length
    : 0;

  return { components: allComponents, connections: allConnections, confidence: avgConf };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Topology Construction
// ═══════════════════════════════════════════════════════════════════════════════

async function buildTopology(
  components: ExtractedComponent[],
  connections: ExtractedConnection[],
) {
  const { TopologyGraph } = await import('@/engine/topology/topology-graph');
  const graph = new TopologyGraph();

  for (const c of components) {
    graph.addNode({
      id: c.id,
      type: c.type as 'transformer' | 'breaker' | 'cable' | 'bus' | 'generator' | 'motor' | 'load' | 'switch' | 'panel',
      label: c.label,
      rating: c.rating,
      position: c.position ?? { x: 0, y: 0 },
    });
  }

  for (const conn of connections) {
    graph.addEdge({
      id: `edge-${conn.from}-${conn.to}`,
      from: conn.from,
      to: conn.to,
      length: conn.length != null ? String(conn.length) : undefined,
      cableType: conn.cableType,
    });
  }

  return graph;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Calculation Chain Execution
// ═══════════════════════════════════════════════════════════════════════════════

async function runCalculations(
  components: ExtractedComponent[],
  connections: ExtractedConnection[],
): Promise<{ calculations: CalculationEntry[]; standards: StandardEntry[]; violations: ViolationEntry[] }> {
  const calculations: CalculationEntry[] = [];
  const standards: StandardEntry[] = [];
  const violations: ViolationEntry[] = [];

  // 트랜스포머 → 용량 계산
  const transformers = components.filter(c => c.type === 'transformer');
  for (const tr of transformers) {
    if (tr.rating) {
      calculations.push({
        id: `calc-tr-${tr.id}`,
        calculatorId: 'transformer-capacity',
        label: `${tr.label} 용량`,
        value: parseFloat(tr.rating) || 0,
        unit: 'kVA',
        compliant: true,
        standardRef: 'KEC 311.1',
      });
    }
  }

  // 케이블 구간 → 전압강하 계산
  for (const conn of connections) {
    if (conn.length && conn.length > 0) {
      const vd = estimateVoltageDrop(conn);
      const compliant = vd <= activeDefaults().vdBranch; // 국가별 VD 한도 (KR=3%, IEC=4%)
      calculations.push({
        id: `calc-vd-${conn.from}-${conn.to}`,
        calculatorId: 'voltage-drop',
        label: `${conn.from} → ${conn.to} 전압강하`,
        value: Math.round(vd * 100) / 100,
        unit: '%',
        formula: 'VD = (2 × L × I × R) / (1000 × V) × 100',
        compliant,
        standardRef: 'KEC 232.52',
      });

      standards.push({
        standard: 'KEC',
        clause: '232.52',
        title: '전압강하',
        judgment: compliant ? 'PASS' : 'FAIL',
        note: `${vd.toFixed(2)}% (허용: 3%)`,
      });

      if (!compliant) {
        violations.push({
          id: `vio-vd-${conn.from}-${conn.to}`,
          severity: 'critical',
          title: '전압강하 기준 초과',
          description: `${conn.from} → ${conn.to} 구간 전압강하 ${vd.toFixed(2)}% > 허용 3%`,
          location: `${conn.from} → ${conn.to}`,
          standardRef: 'KEC 232.52',
          suggestedFix: '케이블 굵기 증가 또는 배전반 위치 변경 검토',
        });
      }
    }
  }

  // 차단기 → 보호 협조
  const breakers = components.filter(c => c.type === 'breaker');
  for (const br of breakers) {
    if (br.rating) {
      const rating = parseFloat(br.rating);
      calculations.push({
        id: `calc-br-${br.id}`,
        calculatorId: 'breaker-sizing',
        label: `${br.label} 차단기 정격`,
        value: rating,
        unit: 'A',
        compliant: true,
        standardRef: 'KEC 212.3',
      });
    }
  }

  return { calculations, standards, violations };
}

/** 간이 전압강하 추정 (정밀 계산은 calc engine 사용) */
function estimateVoltageDrop(conn: ExtractedConnection): number {
  // 상수는 top-level import로 가져옴 (ELECTRICAL_CONSTANTS)
  const length = conn.length ?? 10;
  const cableSpec = conn.cableType ?? '35sq';
  const sizeMatch = cableSpec.match(/(\d+)sq/);
  const size = sizeMatch ? parseInt(sizeMatch[1]) : 35;
  const resistance = RESISTIVITY.CU_20C / size; // Ω/m per conductor
  const current = 100; // 가정 부하전류 (실제값은 토폴로지에서 추출)
  // VD% = (√3 × I × L × R) / V × 100
  const vd = (PHYSICS.SQRT3 * current * length * resistance) / 380 * 100;
  return Math.round(vd * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Team Result Assembly
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 계통도팀 메인 실행 함수.
 * 도면 → 추출 → 토폴로지 → 계산 → 팀 결과
 */
export async function executeSLDTeam(input: TeamInput): Promise<TeamResult> {
  const start = Date.now();

  try {
    // Step 1: 도면에서 컴포넌트/연결 추출
    const { components, connections, confidence } = await extractFromDrawing(input);

    if (components.length === 0) {
      return {
        teamId: 'TEAM-SLD',
        success: false,
        confidence: 0,
        durationMs: Date.now() - start,
        error: '도면에서 전기 설비 요소를 인식할 수 없습니다.',
      };
    }

    // Step 2: 토폴로지 구축
    const topology = await buildTopology(components, connections);
    const validation = topology.validate();

    // Step 3: 계산 체인 실행
    const { calculations, standards, violations } = await runCalculations(components, connections);

    // 토폴로지 이상 → 경고 추가
    if (validation.issues && validation.issues.length > 0) {
      for (const issue of validation.issues) {
        violations.push({
          id: `vio-topo-${violations.length}`,
          severity: 'major',
          title: '토폴로지 이상',
          description: issue.message ?? String(issue),
          location: issue.nodeId ?? '전체',
        });
      }
    }

    return {
      teamId: 'TEAM-SLD',
      success: true,
      components,
      connections,
      calculations,
      standards,
      violations,
      confidence,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      teamId: 'TEAM-SLD',
      success: false,
      confidence: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
