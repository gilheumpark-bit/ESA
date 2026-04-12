/**
 * Debate Protocol Types
 * ---------------------
 * 에이전트 간 토론/재합의 메커니즘 타입 정의.
 * "입은 AI가 열지만, 머리는 법전이 지배한다"
 */

export { type DebateArgument, type DebateRound, type DebateResult, type DebateVerdict, type ConsensusConfig } from '../teams/types';

/** 토론 주제 카테고리 */
export type DebateTopic =
  | 'cable_sizing'          // 케이블 선정 적정성
  | 'breaker_coordination'  // 보호 협조
  | 'voltage_drop'          // 전압강하 판정
  | 'grounding'             // 접지 방식
  | 'ampacity'              // 허용전류 적정성
  | 'wiring_method'         // 배선 공법
  | 'cost_optimization'     // 비용 최적화
  | 'safety_compliance'     // 안전 적합성
  | 'custom';               // 사용자 정의

/** 토론 중 각 팀이 제시하는 수치 증거 */
export interface NumericalEvidence {
  parameter: string;      // "voltage_drop_percent"
  value: number;          // 4.2
  unit: string;           // "%"
  source: string;         // "TEAM-SLD 토폴로지 계산"
  formula?: string;       // "VD = √3 × I × L × (R cosθ + X sinθ)"
}

/** 토론에서 참조되는 기준서 근거 */
export interface RegulatoryEvidence {
  standard: string;       // "KEC"
  clause: string;         // "232.52"
  edition: string;        // "2021"
  requirement: string;    // "분기회로 전압강하 ≤ 3%"
  judgment: 'PASS' | 'FAIL';
}

/** 확장된 토론 인수 (수치 + 기준서 근거 포함) */
export interface DetailedArgument {
  teamId: string;
  topic: DebateTopic;
  position: string;
  numericalEvidence: NumericalEvidence[];
  regulatoryEvidence: RegulatoryEvidence[];
  verdict: 'agree' | 'disagree' | 'abstain';
  confidence: number;
  reasoning: string;
}

/** 불일치 시 에스컬레이션 정보 */
export interface EscalationInfo {
  reason: string;
  dissentingTeams: string[];
  divergencePercent: number;  // 수치 불일치 비율
  requiresHumanReview: boolean;
  suggestedAction: string;
}
