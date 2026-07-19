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
import { resolveSymbol } from '../vision/symbol-db';
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

  // 트랜스포머 → 도면 표기 전사만 (용량 적합성은 계산기 미실행 → HOLD)
  const transformers = components.filter(c => c.type === 'transformer');
  for (const tr of transformers) {
    if (tr.rating) {
      calculations.push({
        id: `calc-tr-${tr.id}`,
        calculatorId: 'transformer-capacity',
        label: `${tr.label} 용량 (도면 표기)`,
        value: parseFloat(tr.rating) || 0,
        unit: 'kVA',
        compliant: null,
        note: '도면 인식 값 전사 — transformer-capacity 계산기·부하 조건 미적용. 수동 검증 또는 /calc 경로 필요.',
        standardRef: 'KEC 311.1',
      });
      standards.push({
        standard: 'KEC',
        clause: '311.1',
        title: '변압기 용량',
        judgment: 'HOLD',
        note: `${tr.label}: 표기 ${tr.rating} — 적합성 미판정`,
      });
    }
  }

  // 케이블 구간 → 부하전류가 연결에 있을 때만 간이 VD; 없으면 HOLD (가정 100A 금지)
  for (const conn of connections) {
    if (conn.length && conn.length > 0) {
      const vdEstimate = estimateVoltageDrop(conn);
      if (vdEstimate == null) {
        calculations.push({
          id: `calc-vd-${conn.from}-${conn.to}`,
          calculatorId: 'voltage-drop',
          label: `${conn.from} → ${conn.to} 전압강하`,
          value: NaN,
          unit: '%',
          formula: 'VD = (√3 × I × L × R) / V × 100',
          compliant: null,
          note: '부하전류(I) 미추출 — 가정값 사용 금지. 토폴로지·명판 전류 입력 후 재계산.',
          standardRef: 'KEC 232.52',
        });
        standards.push({
          standard: 'KEC',
          clause: '232.52',
          title: '전압강하',
          judgment: 'HOLD',
          note: `${conn.from}→${conn.to}: 전류 미상, 판정 보류`,
        });
        continue;
      }

      const { vd, currentA, assumed } = vdEstimate;
      const limit = activeDefaults().vdBranch;
      // 전류가 도면에서 온 경우에만 PASS/FAIL; 추정 전류면 수치만 참고 HOLD
      const compliant: boolean | null = assumed ? null : vd <= limit;
      calculations.push({
        id: `calc-vd-${conn.from}-${conn.to}`,
        calculatorId: 'voltage-drop',
        label: `${conn.from} → ${conn.to} 전압강하`,
        value: Math.round(vd * 100) / 100,
        unit: '%',
        formula: 'VD = (√3 × I × L × R) / V × 100',
        compliant,
        note: assumed
          ? `참고 추정(I=${currentA}A 미검증). 정밀 계산기 경로 필요.`
          : `I=${currentA}A, 한도 ${limit}%`,
        standardRef: 'KEC 232.52',
      });

      standards.push({
        standard: 'KEC',
        clause: '232.52',
        title: '전압강하',
        judgment: compliant === null ? 'HOLD' : compliant ? 'PASS' : 'FAIL',
        note: `${vd.toFixed(2)}% (허용: ${limit}%)`,
      });

      if (compliant === false) {
        violations.push({
          id: `vio-vd-${conn.from}-${conn.to}`,
          severity: 'critical',
          title: '전압강하 기준 초과',
          description: `${conn.from} → ${conn.to} 구간 전압강하 ${vd.toFixed(2)}% > 허용 ${limit}%`,
          location: `${conn.from} → ${conn.to}`,
          standardRef: 'KEC 232.52',
          suggestedFix: '케이블 굵기 증가 또는 배전반 위치 변경 검토',
        });
      }
    }
  }

  // 차단기 → 도면 표기 전사만 (협조·선정 검증 미실행 → HOLD)
  const breakers = components.filter(c => c.type === 'breaker');
  for (const br of breakers) {
    if (br.rating) {
      const rating = parseFloat(br.rating);
      calculations.push({
        id: `calc-br-${br.id}`,
        calculatorId: 'breaker-sizing',
        label: `${br.label} 차단기 정격 (도면 표기)`,
        value: rating,
        unit: 'A',
        compliant: null,
        note: '도면 표기 전사 — 부하전류·허용전류·차단용량 검증 없음. 수동 검증 필요.',
        standardRef: 'KEC 212.3',
      });
      standards.push({
        standard: 'KEC',
        clause: '212.3',
        title: '차단기 정격',
        judgment: 'HOLD',
        note: `${br.label}: 표기 ${rating}A — 적합성 미판정`,
      });
    }
  }

  return { calculations, standards, violations };
}

/**
 * 간이 전압강하 추정.
 * 부하전류를 연결 메타에서 얻지 못하면 null — 가정 100A 사용 금지.
 */
function estimateVoltageDrop(
  conn: ExtractedConnection,
): { vd: number; currentA: number; assumed: boolean } | null {
  const length = conn.length ?? 10;
  const cableSpec = conn.cableType ?? '35sq';
  const sizeMatch = cableSpec.match(/(\d+)sq/);
  const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 35;
  const resistance = RESISTIVITY.CU_20C / size; // Ω/m per conductor

  // ExtractedConnection에 전류 필드가 없으므로 cableType 내 "100A" 패턴만 인정
  const ampMatch = cableSpec.match(/(\d+(?:\.\d+)?)\s*A\b/i);
  if (!ampMatch) {
    return null;
  }
  const currentA = parseFloat(ampMatch[1]);
  if (!Number.isFinite(currentA) || currentA <= 0) return null;

  const vd = (PHYSICS.SQRT3 * currentA * length * resistance) / 380 * 100;
  return { vd: Math.round(vd * 100) / 100, currentA, assumed: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3.5 — 사내 규정(커스텀 룰셋) 평가
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 라우트에서 린트 통과한 룰셋을 추출 결과에 대조한다.
 * 판정 자체는 engine(custom-rules)이 하고, 여기서는 파이프라인 데이터를
 * 평가 컨텍스트로 사영하고 결과를 리포트 타입으로 매핑만 한다.
 *
 * voltageDropPercent는 실전류 기반 계산이 있을 때만 제공한다 —
 * 추정치로 사내 기준 PASS/FAIL을 내면 거짓 판정이다(KEC 경로와 동일 원칙).
 */
async function runCustomRules(
  ruleSet: NonNullable<TeamInput['customRuleSet']>,
  components: ExtractedComponent[],
  connections: ExtractedConnection[],
  userParams: Record<string, unknown> | undefined,
): Promise<{ standards: StandardEntry[]; violations: ViolationEntry[] }> {
  const { evaluateCustomRules } = await import('@/engine/standards/custom-rules');
  const { parseSpecText } = await import('@/engine/topology/spec-text');

  const numericParams: Record<string, number> = {};
  for (const [k, v] of Object.entries(userParams ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v)) numericParams[k] = v;
  }

  const findings = evaluateCustomRules(ruleSet, {
    components: components.map(c => ({ id: c.id, type: c.type, label: c.label, rating: c.rating })),
    connections: connections.map(conn => {
      const spec = conn.cableType ? parseSpecText(conn.cableType) : {};
      const vd = estimateVoltageDrop(conn); // 실전류 표기가 있을 때만 non-null
      return {
        from: conn.from,
        to: conn.to,
        lengthM: conn.length,
        conductorSizeSq: spec.conductorSize,
        currentA: vd?.currentA,
        voltageDropPercent: vd && !vd.assumed ? vd.vd : undefined,
      };
    }),
    userParams: numericParams,
  });

  const label = ruleSet.standardLabel ?? '사내규정';
  const standards: StandardEntry[] = [];
  const violations: ViolationEntry[] = [];

  findings.forEach((f, i) => {
    standards.push({
      standard: label,
      clause: f.article,
      title: f.title,
      judgment: f.judgment,
      note: `${f.target}: ${f.note}`,
    });
    if (f.judgment === 'FAIL') {
      violations.push({
        id: `vio-rule-${f.article}-${i}`,
        severity: f.severity,
        title: `[${label}] ${f.title}`,
        description: `${f.target}: ${f.note}`,
        location: f.target,
        standardRef: `${label} ${f.article}${ruleSet.basedOn ? ` (기반: ${ruleSet.basedOn})` : ''}`,
        // 시정 안내는 룰 저자가 제공한 것만 — 엔진이 지어내지 않는다
        ...(f.remedy ? { suggestedFix: f.remedy } : {}),
      });
    }
  });

  return { standards, violations };
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

    // Step 3.5: 사내 규정 평가 (첨부된 경우) — KEC 행과 나란히 리포트에 합류
    if (input.customRuleSet) {
      const custom = await runCustomRules(input.customRuleSet, components, connections, input.params);
      standards.push(...custom.standards);
      violations.push(...custom.violations);
    }

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
