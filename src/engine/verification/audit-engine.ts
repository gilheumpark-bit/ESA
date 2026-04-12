/**
 * ESVA Audit Engine — 도면 감리 종합 등급 산출
 * ─────────────────────────────────────────────
 * 다영역 감사 결과를 A~F 등급으로 집계.
 * 원본 패턴: eh-universe-web/packages/quill-engine/src/audit/audit-engine.ts
 *
 * PART 1: Types
 * PART 2: Audit Areas (검사 영역 16개)
 * PART 3: Grading Engine
 */

import { runQualityChecklist, type QualityReport, type QualityDomain } from './quality-checklist';

// =========================================================================
// PART 1 — Types
// =========================================================================

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface AuditArea {
  id: string;
  name: string;
  domain: QualityDomain;
  weight: number; // 0~1, 합계=1
}

export interface AuditAreaResult {
  area: AuditArea;
  score: number;   // 0~100
  grade: Grade;
  findings: string[];
}

export interface AuditReport {
  /** 종합 등급 */
  overallGrade: Grade;
  /** 종합 점수 (0~100) */
  overallScore: number;
  /** 영역별 결과 */
  areas: AuditAreaResult[];
  /** 품질 체크리스트 상세 */
  qualityReport: QualityReport;
  /** critical 위반 시 자동 F */
  hasCriticalViolation: boolean;
  /** 감리 일시 */
  auditedAt: string;
}

// =========================================================================
// PART 2 — Audit Areas
// =========================================================================

const AUDIT_AREAS: AuditArea[] = [
  // 전기안전 (가중치 높음)
  { id: 'AUD-ES-01', name: '접지 시스템', domain: 'electrical-safety', weight: 0.12 },
  { id: 'AUD-ES-02', name: '감전 보호', domain: 'electrical-safety', weight: 0.10 },
  { id: 'AUD-ES-03', name: '화재 방지', domain: 'electrical-safety', weight: 0.10 },

  // 보호계전
  { id: 'AUD-PR-01', name: '과전류 보호', domain: 'protection', weight: 0.10 },
  { id: 'AUD-PR-02', name: '단락 보호', domain: 'protection', weight: 0.08 },
  { id: 'AUD-PR-03', name: '보호 협조', domain: 'protection', weight: 0.06 },

  // 열적
  { id: 'AUD-TH-01', name: '허용전류 적정성', domain: 'thermal', weight: 0.08 },
  { id: 'AUD-TH-02', name: '온도 보정', domain: 'thermal', weight: 0.04 },

  // 법규적합성
  { id: 'AUD-CC-01', name: '전압강하 기준', domain: 'code-compliance', weight: 0.08 },
  { id: 'AUD-CC-02', name: '표준 규격 사용', domain: 'code-compliance', weight: 0.06 },
  { id: 'AUD-CC-03', name: '기준서 트레이서빌리티', domain: 'code-compliance', weight: 0.04 },

  // 신뢰성
  { id: 'AUD-RL-01', name: '설계 여유율', domain: 'reliability', weight: 0.06 },
  { id: 'AUD-RL-02', name: '부하 균형', domain: 'reliability', weight: 0.04 },
  { id: 'AUD-RL-03', name: '이중화/백업', domain: 'reliability', weight: 0.04 },
];

// =========================================================================
// PART 3 — Grading Engine
// =========================================================================

function scoreToGrade(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * 종합 감리 감사를 실행한다.
 * 품질 체크리스트 + 가중 영역별 점수 → A~F 등급.
 * critical 위반 1건 이상이면 자동 F.
 */
export function runAudit(params: Record<string, unknown>): AuditReport {
  const qualityReport = runQualityChecklist(params);

  // 영역별 점수 (도메인 점수를 기반으로 분배)
  const areas: AuditAreaResult[] = AUDIT_AREAS.map(area => {
    const domainScore = qualityReport.scores[area.domain] ?? 0;
    const grade = scoreToGrade(domainScore);

    const domainResults = qualityReport.results.filter(r => r.domain === area.domain && !r.passed);
    const findings = domainResults.map(r => `[${r.severity.toUpperCase()}] ${r.title}`);

    return { area, score: domainScore, grade, findings };
  });

  // 가중 종합 점수
  const weightedScore = areas.reduce(
    (sum, a) => sum + a.score * a.area.weight, 0,
  );
  const totalWeight = AUDIT_AREAS.reduce((sum, a) => sum + a.weight, 0);
  const overallScore = Math.round(weightedScore / totalWeight);

  // Critical 위반 시 자동 F
  const hasCritical = qualityReport.criticalCount > 0;
  const overallGrade = hasCritical ? 'F' : scoreToGrade(overallScore);

  return {
    overallGrade,
    overallScore: hasCritical ? Math.min(overallScore, 39) : overallScore,
    areas,
    qualityReport,
    hasCriticalViolation: hasCritical,
    auditedAt: new Date().toISOString(),
  };
}

/** 감사 영역 목록 조회 (UI 표시용) */
export function getAuditAreas(): AuditArea[] {
  return [...AUDIT_AREAS];
}

/** 등급 표시명 */
export function gradeDisplayName(grade: Grade): string {
  const map: Record<Grade, string> = {
    A: '우수 (Excellent)',
    B: '양호 (Good)',
    C: '보통 (Fair)',
    D: '미흡 (Poor)',
    F: '부적합 (Fail)',
  };
  return map[grade];
}
