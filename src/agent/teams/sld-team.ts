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

  // 계통전압(V)은 변압기 2차측 등 컴포넌트 정격에서 1회 산출 (없으면 null)
  const systemVoltage = resolveSystemVoltage(components);

  // 케이블 구간 → 전압강하 계산
  for (const conn of connections) {
    if (conn.length && conn.length > 0) {
      // 부하전류는 하류 노드(부하/전동기)의 정격에서 추출 (임의 가정 금지)
      const loadCurrent = resolveLoadCurrent(conn, components);
      const vd = loadCurrent != null && systemVoltage != null
        ? estimateVoltageDrop(conn, loadCurrent, systemVoltage)
        : null;

      // 부하전류/계통전압 미상 → PASS/FAIL 판정 불가, Hold + RFI (임의 100A/380V 가정 금지)
      if (vd == null) {
        standards.push({
          standard: 'KEC',
          clause: '232.52',
          title: '전압강하',
          judgment: 'HOLD',
          note: '부하전류/계통전압 미상 — RFI 필요',
        });
        continue;
      }

      const vdLimit = activeDefaults().vdBranch; // 국가별 VD 한도 (KR=3%, IEC=4%)
      const compliant = vd <= vdLimit;
      calculations.push({
        id: `calc-vd-${conn.from}-${conn.to}`,
        calculatorId: 'voltage-drop',
        label: `${conn.from} → ${conn.to} 전압강하`,
        value: Math.round(vd * 100) / 100,
        unit: '%',
        formula: 'VD% = (√3 × I × L × R) / V × 100',
        compliant,
        standardRef: 'KEC 232.52',
      });

      standards.push({
        standard: 'KEC',
        clause: '232.52',
        title: '전압강하',
        judgment: compliant ? 'PASS' : 'FAIL',
        note: `${vd.toFixed(2)}% (허용: ${vdLimit}%)`,
      });

      if (!compliant) {
        violations.push({
          id: `vio-vd-${conn.from}-${conn.to}`,
          severity: 'critical',
          title: '전압강하 기준 초과',
          description: `${conn.from} → ${conn.to} 구간 전압강하 ${vd.toFixed(2)}% > 허용 ${vdLimit}%`,
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

/**
 * 하류 노드(부하/전동기)의 정격에서 연속 부하전류(A)를 추출한다.
 * 정격이 없거나 "…A" 형식이 아니면 null (임의 100A 가정 금지).
 */
function resolveLoadCurrent(
  conn: ExtractedConnection,
  components: ExtractedComponent[],
): number | null {
  const downstream = components.find(c => c.id === conn.to);
  if (!downstream?.rating) return null;
  const m = downstream.rating.match(/(\d+(?:\.\d+)?)\s*a\b/i);
  return m ? parseFloat(m[1]) : null;
}

/**
 * 계통 선간전압(V)을 컴포넌트 정격에서 추출한다.
 * 변압기 2차측 등에서 파싱된 전압 중 최소값(이용전압)을 보수적으로 채택.
 * 전압 정보가 없으면 null → 호출부에서 Hold+RFI (임의 380V 가정 금지).
 * NOTE: 국가별 공칭전압은 CalcDefaults에 nominalVoltage 필드 추가 후 우선 사용 예정.
 */
function resolveSystemVoltage(components: ExtractedComponent[]): number | null {
  let minVoltage: number | null = null;
  for (const c of components) {
    if (!c.rating) continue;
    const kv = c.rating.match(/(\d+(?:\.\d+)?)\s*kv\b/i);
    const v = c.rating.match(/(\d+(?:\.\d+)?)\s*v\b/i);
    const parsed = kv ? parseFloat(kv[1]) * 1000 : v ? parseFloat(v[1]) : null;
    if (parsed != null && parsed > 0 && (minVoltage == null || parsed < minVoltage)) {
      minVoltage = parsed;
    }
  }
  return minVoltage;
}

/**
 * 간이 전압강하 추정 (정밀 계산은 calc engine 사용).
 * 부하전류(current)와 계통전압(voltage)은 호출부에서 실제값을 주입한다.
 * 둘 중 하나라도 미상(≤0)이면 null 반환 → 호출부에서 Hold+RFI 처리.
 */
function estimateVoltageDrop(
  conn: ExtractedConnection,
  current: number,
  voltage: number,
): number | null {
  if (!(current > 0) || !(voltage > 0)) return null;
  // 상수는 top-level import로 가져옴 (ELECTRICAL_CONSTANTS)
  const length = conn.length ?? 10;
  const cableSpec = conn.cableType ?? '35sq';
  // 소수 단면적(2.5sq, 1.5sq, 0.75sq 등, KS C IEC 60228) 파싱 지원
  const sizeMatch = cableSpec.match(/(\d+(?:\.\d+)?)\s*sq/i);
  const size = sizeMatch ? parseFloat(sizeMatch[1]) : 35;
  const resistance = RESISTIVITY.CU_20C / size; // Ω/m per conductor
  // VD% = (√3 × I × L × R) / V × 100 — 부하전류·계통전압은 인자로 주입 (임의 가정 금지)
  const vd = (PHYSICS.SQRT3 * current * length * resistance) / voltage * 100;
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
