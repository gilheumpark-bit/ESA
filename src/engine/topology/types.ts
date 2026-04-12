/**
 * ESVA Topology Graph Types
 * ──────────────────────────
 * SLD(단선결선도) VLM 추출 결과를 순회 가능한 그래프로 변환하기 위한 타입.
 */

import type { SLDComponent, SLDConnection, SLDComponentType } from '@/lib/sld-recognition';

// =========================================================================
// PART 1 — Graph Node / Edge
// =========================================================================

export interface TopologyNode {
  id: string;
  type: SLDComponentType;
  label: string;
  /** 정격 (kVA, kW, A 등) — 파싱된 숫자값 */
  ratingValue?: number;
  ratingUnit?: string;
  /** 전압 (V) */
  voltage?: number;
  /** 전류 (A) */
  current?: number;
  /** 원본 SLD 컴포넌트 참조 */
  raw: SLDComponent;
}

export interface TopologyEdge {
  id: string;
  from: string;
  to: string;
  /** 케이블 종류 (XLPE, CV, HIV 등) */
  cableType?: string;
  /** 선로 길이 (m) */
  length?: number;
  /** 도체 단면적 (mm²) */
  conductorSize?: number;
  /** 원본 SLD 연결 참조 */
  raw: SLDConnection;
}

// =========================================================================
// PART 2 — Path & Params
// =========================================================================

/** 두 노드 간 경로 */
export interface TopologyPath {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  /** 경로 총 길이 (m) */
  totalLength: number;
}

/** 경로에서 자동 추출한 계산 파라미터 */
export interface CalcParams {
  /** 경로 총 길이 (m) */
  totalLength_m: number;
  /** 최소 케이블 규격 (mm²) — 경로 중 가장 가는 것 */
  minCableSize_sq: number | null;
  /** 부하 전력 (kW) — 종단 노드 기준 */
  loadPower_kW: number | null;
  /** 전압 (V) — 시작 노드 기준 */
  voltage_V: number | null;
  /** 상 수 */
  phases: 1 | 3 | null;
  /** 케이블 종류 목록 */
  cableTypes: string[];
  /** 경로상 노드 ID 목록 */
  pathNodeIds: string[];
}

// =========================================================================
// PART 3 — Validation
// =========================================================================

export type ValidationIssueType =
  | 'ISOLATED_NODE'
  | 'MISSING_EDGE_TARGET'
  | 'DUPLICATE_EDGE'
  | 'LOOP_DETECTED'
  | 'MISSING_RATING';

export interface ValidationIssue {
  type: ValidationIssueType;
  nodeId?: string;
  edgeId?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    isolatedNodes: number;
    connectedComponents: number;
  };
}
