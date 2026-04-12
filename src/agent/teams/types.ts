/**
 * ESVA Team-Based Agent Types
 * ----------------------------
 * 4-Team architecture:
 *   TEAM-SLD     : 계통도팀 (Single-Line Diagram)
 *   TEAM-LAYOUT  : 평면도팀 (Floor Plan / Wiring Route)
 *   TEAM-STD     : 규정질의팀 (Standards & Regulations)
 *   TEAM-CONSENSUS: 합의+출력팀 (Consensus & Output)
 *
 * PART 1: Team identity types
 * PART 2: Input/output contracts
 * PART 3: Debate & consensus types
 * PART 4: Verification marking types
 * PART 5: Report types
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Team Identity
// ═══════════════════════════════════════════════════════════════════════════════

export type TeamId = 'TEAM-SLD' | 'TEAM-LAYOUT' | 'TEAM-STD' | 'TEAM-CONSENSUS';

export type InputClassification =
  | 'sld_image'        // 계통도 이미지 (PNG/JPG)
  | 'sld_dxf'          // 계통도 DXF 벡터
  | 'sld_pdf'          // 계통도 PDF 벡터
  | 'layout_image'     // 평면도 이미지
  | 'layout_dxf'       // 평면도 DXF
  | 'layout_pdf'       // 평면도 PDF
  | 'text_query'       // 텍스트 질의 (규정, 계산 등)
  | 'mixed';           // 도면 + 텍스트 혼합

export interface TeamConfig {
  id: TeamId;
  name: string;
  nameKo: string;
  description: string;
  acceptedInputs: InputClassification[];
  requiredForConsensus: boolean;
  timeoutMs: number;
  retryCount: number;
}

export interface TeamCapability {
  teamId: TeamId;
  tools: string[];
  dataScope: string[];
  canDebate: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Input/Output Contracts
// ═══════════════════════════════════════════════════════════════════════════════

export interface TeamInput {
  sessionId: string;
  classification: InputClassification;
  query?: string;
  fileBuffer?: ArrayBuffer;
  fileName?: string;
  mimeType?: string;
  params?: Record<string, unknown>;
  countryCode?: string;
  language?: string;
}

export interface ExtractedComponent {
  id: string;
  type: string;           // 'transformer' | 'breaker' | 'cable' | 'load' | 'bus' | ...
  label: string;
  rating?: string;        // "100A", "22.9kV", "630kVA"
  position?: { x: number; y: number };
  confidence: number;     // 0~1
}

export interface ExtractedConnection {
  from: string;
  to: string;
  cableType?: string;     // "XLPE 3C 35sq"
  length?: number;
  unit?: string;
}

export interface TeamResult {
  teamId: TeamId;
  success: boolean;
  components?: ExtractedComponent[];
  connections?: ExtractedConnection[];
  calculations?: CalculationEntry[];
  standards?: StandardEntry[];
  violations?: ViolationEntry[];
  recommendations?: RecommendationEntry[];
  confidence: number;
  durationMs: number;
  rawOutput?: string;
  error?: string;
}

export interface CalculationEntry {
  id: string;
  calculatorId: string;
  label: string;
  value: number;
  unit: string;
  formula?: string;
  compliant: boolean;
  standardRef?: string;
}

export interface StandardEntry {
  standard: string;       // 'KEC' | 'NEC' | 'IEC'
  clause: string;
  title: string;
  judgment: 'PASS' | 'FAIL' | 'HOLD' | 'BLOCK';
  note?: string;
}

export interface ViolationEntry {
  id: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  title: string;
  description: string;
  location?: string;      // 도면 위치 or 회로 구간
  standardRef?: string;
  suggestedFix?: string;
}

export interface RecommendationEntry {
  id: string;
  category: 'safety' | 'efficiency' | 'cost' | 'reliability';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  estimatedSaving?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Debate & Consensus
// ═══════════════════════════════════════════════════════════════════════════════

export type DebateVerdict = 'agree' | 'disagree' | 'abstain';

export interface DebateArgument {
  teamId: TeamId;
  topic: string;
  position: string;
  evidence: string[];       // 근거 목록 (KEC 조항, 계산 결과 등)
  verdict: DebateVerdict;
  confidence: number;
}

export interface DebateRound {
  roundNumber: number;
  topic: string;
  arguments: DebateArgument[];
  consensus: boolean;
  consensusPosition?: string;
  dissenters?: TeamId[];
}

export interface DebateResult {
  topic: string;
  rounds: DebateRound[];
  finalConsensus: boolean;
  finalPosition: string;
  totalRounds: number;
  maxRoundsReached: boolean;
  participatingTeams: TeamId[];
  dissenterReport?: string;
}

export interface ConsensusConfig {
  maxRounds: number;          // 최대 토론 라운드 (기본 3)
  requiredAgreement: number;  // 합의 필요 비율 (기본 0.67 = 2/3)
  tolerancePercent: number;   // 수치 오차 허용 범위 (기본 0.1%)
  escalateOnFailure: boolean; // 합의 실패 시 HITL 에스컬레이션
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Verification Marking (IDE-style Red/Yellow Lines)
// ═══════════════════════════════════════════════════════════════════════════════

export type MarkingSeverity = 'error' | 'warning' | 'info' | 'success';

export interface VerificationMarking {
  id: string;
  severity: MarkingSeverity;
  componentId?: string;       // 도면 요소 ID
  location: string;           // "TR-001 → MCC-001 구간" or "KEC 232.52"
  message: string;
  detail?: string;
  standardRef?: string;
  calculatedValue?: string;   // "전압강하 4.2%"
  limitValue?: string;        // "허용 3%"
  suggestedFix?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — ESVA Verified Report
// ═══════════════════════════════════════════════════════════════════════════════

export type VerifiedGrade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';
export type ReportVerdict = 'PASS' | 'CONDITIONAL' | 'FAIL';

export interface ESVAVerifiedReport {
  reportId: string;
  createdAt: string;          // ISO 8601
  version: string;            // "ESVA Report v1.0"

  // 프로젝트 정보
  projectName: string;
  projectType: string;        // "변전소", "수배전반", "동력설비" 등
  designer?: string;
  reviewer?: string;

  // 분석 결과
  verdict: ReportVerdict;
  grade: VerifiedGrade;
  compositeScore: number;     // 0~100

  // 팀별 결과
  teamResults: TeamResult[];

  // 합의 결과
  debateResults: DebateResult[];

  // 검증 마킹 (빨강/노랑)
  markings: VerificationMarking[];

  // 요약
  summary: ReportSummary;

  // 영수증 추적
  receiptIds: string[];
  hash: string;               // SHA-256 of entire report
}

export interface ReportSummary {
  totalComponents: number;
  totalConnections: number;
  totalCalculations: number;
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
  criticalViolations: ViolationEntry[];
  topRecommendations: RecommendationEntry[];
  appliedStandards: string[];  // ["KEC 2021", "NEC 2023"]
  estimatedCost?: string;
  // 간결 텍스트 요약
  textKo: string;
  textEn: string;
}

export interface ReportExportOptions {
  format: 'pdf' | 'excel' | 'html';
  language: 'ko' | 'en';
  includeMarkings: boolean;
  includeDebateLog: boolean;
  includeReceipts: boolean;
}
