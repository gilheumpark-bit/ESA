/**
 * ESVA Multi-Team Review — 병렬 다관점 검토 파이프라인
 * ─────────────────────────────────────────────────────
 * 허용전류팀 / 전압강하팀 / 보호계전팀 / 접지팀이 병렬로 검토.
 * 원본 패턴: eh-universe-web/packages/quill-engine/src/pipeline/pipeline.ts (8-team)
 *
 * PART 1: Types
 * PART 2: Review Teams
 * PART 3: Parallel Runner
 */

import { runDomainCheck, type CheckResult, type QualityDomain } from './quality-checklist';
import { detectByCategory, type GoodPatternResult, type GoodPatternCategory } from './good-patterns';

// =========================================================================
// PART 1 — Types
// =========================================================================

export interface ReviewTeam {
  id: string;
  name: string;
  /** 담당 도메인 */
  domain: QualityDomain;
  /** 우수패턴 탐지 카테고리 */
  goodPatternCategory: GoodPatternCategory;
  /** 이 팀의 검토가 필수인지 (false면 해당 파라미터 없을 때 스킵) */
  required: boolean;
  /** 이 팀의 검사/우수패턴이 참조하는 입력 파라미터 키 (스코프 판정용) */
  triggerParams: string[];
}

export interface TeamResult {
  team: ReviewTeam;
  /** 도메인 검사 결과 */
  checks: CheckResult[];
  /** 우수 패턴 탐지 결과 */
  goodPatterns: GoodPatternResult[];
  /** 팀 점수 (0~100) */
  score: number;
  /** 소요시간 (ms) */
  durationMs: number;
  /** 위반 요약 */
  findings: string[];
  /** 우수 사례 요약 */
  commendations: string[];
}

export interface MultiTeamReport {
  teams: TeamResult[];
  /** 전체 통과율 (%) */
  overallPassRate: number;
  /** 전체 우수패턴 가점 */
  totalBonus: number;
  /** 합산 점수 (기본 + 가점) */
  compositeScore: number;
  /** 총 소요시간 (ms) */
  totalDurationMs: number;
  /** 개별 팀 점수 요약 (UI 표시용) */
  teamScoreBreakdown: Array<{ teamId: string; teamName: string; score: number; domain: string }>;
  /** 핵심 발견사항 요약 (상위 5건) */
  topFindings: string[];
  /** 우수 사례 요약 (상위 3건) */
  topCommendations: string[];
}

// =========================================================================
// PART 2 — Review Teams
// =========================================================================

const TEAMS: ReviewTeam[] = [
  {
    id: 'TEAM-AMP', name: '허용전류 검토팀',
    domain: 'thermal', goodPatternCategory: 'efficiency', required: true,
    triggerParams: [
      'ambientTemp', 'tempCorrectionApplied', 'groupCount', 'groupCorrectionApplied',
      'powerFactor', 'highEfficiencyTransformer', 'allLED', 'ampacityMargin',
    ],
  },
  {
    id: 'TEAM-VD', name: '전압강하 검토팀',
    domain: 'code-compliance', goodPatternCategory: 'standards', required: true,
    triggerParams: [
      'voltageDropPercent', 'vdLimit', 'cableSize', 'standardVersion', 'crossCountryVerified',
    ],
  },
  {
    id: 'TEAM-PROT', name: '보호계전 검토팀',
    domain: 'protection', goodPatternCategory: 'safety', required: true,
    triggerParams: [
      'loadCurrent', 'breakerRating', 'wireAmpacity',
      'separateGroundConductor', 'dualGrounding', 'hasSPD', 'hasAFCI',
      'equipotentialBonding', 'vfdPower_kW', 'harmonicFilterInstalled',
    ],
  },
  {
    id: 'TEAM-GND', name: '접지 검토팀',
    domain: 'electrical-safety', goodPatternCategory: 'safety', required: false,
    triggerParams: [
      'hasGrounding', 'groundResistance', 'hasRCD', 'loadCurrent', 'wireAmpacity',
      'shortCircuitCurrent', 'breakerCapacity', 'hasEmergencyCircuit',
      'emergencyCircuitSeparateProtection', 'thdPercent', 'shortCircuitCurrent_kA',
      'arcFlashLabelApplied', 'separateGroundConductor', 'dualGrounding', 'hasSPD',
      'hasAFCI', 'equipotentialBonding', 'vfdPower_kW', 'harmonicFilterInstalled',
    ],
  },
  {
    id: 'TEAM-REL', name: '신뢰성 검토팀',
    domain: 'reliability', goodPatternCategory: 'reliability', required: false,
    triggerParams: [
      'loadCurrent', 'wireAmpacity', 'voltageDropPercent', 'vdLimit',
      'dualFeeder', 'emergencyGenerator', 'hasUPS', 'hasSPD',
      'groundResistance', 'equipotentialBonding',
    ],
  },
];

// =========================================================================
// PART 3 — Parallel Runner
// =========================================================================

/**
 * 5개 검토팀이 병렬로 검토를 수행한다.
 * 각 팀은 독립적으로 도메인 검사 + 우수 패턴 탐지를 실행.
 */
export async function runMultiTeamReview(
  params: Record<string, unknown>,
): Promise<MultiTeamReport> {
  const totalStart = Date.now();

  // 선택 팀 스코프 판정: 필수 팀은 항상, 선택 팀은 관련 입력 파라미터가 있을 때만 실행.
  // (선택 팀의 도메인 검사는 파라미터 부재 시 fail-closed로 낮은 점수를 내 baseScore를 왜곡함)
  const activeTeams = TEAMS.filter(
    t => t.required || t.triggerParams.some(k => params[k] !== undefined),
  );

  // 병렬 실행
  const teamResults = await Promise.all(
    activeTeams.map(async (team) => {
      const start = Date.now();

      const checks = runDomainCheck(team.domain, params);
      const goodPatterns = detectByCategory(team.goodPatternCategory, params);

      const passed = checks.filter(c => c.passed).length;
      const total = checks.length;
      const score = total > 0 ? Math.round((passed / total) * 100) : 100;

      const findings = checks
        .filter(c => !c.passed)
        .map(c => `[${c.severity.toUpperCase()}] ${c.title}`);

      const commendations = goodPatterns
        .filter(gp => gp.detected)
        .map(gp => `[+${gp.bonus}] ${gp.title}`);

      const result: TeamResult = {
        team,
        checks,
        goodPatterns,
        score,
        durationMs: Date.now() - start,
        findings,
        commendations,
      };

      return result;
    }),
  );

  // 집계
  const allChecks = teamResults.flatMap(t => t.checks);
  const totalChecks = allChecks.length;
  const passedChecks = allChecks.filter(c => c.passed).length;
  const overallPassRate = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;

  // 팀 간 우수패턴 중복 제거: TEAM-PROT/TEAM-GND가 같은 'safety' 카테고리를 공유하므로
  // patternId 기준으로 dedup하지 않으면 동일 패턴 가점이 팀마다 이중 계산됨.
  const detectedPatterns = new Map<string, GoodPatternResult>();
  for (const t of teamResults) {
    for (const gp of t.goodPatterns) {
      if (gp.detected) detectedPatterns.set(gp.patternId, gp);
    }
  }
  const totalBonus = [...detectedPatterns.values()].reduce((s, gp) => s + gp.bonus, 0);

  // 합산 점수: 기본 점수(0~100) + 가점(최대 20점 cap)
  const baseScore = teamResults.reduce((sum, t) => sum + t.score, 0) / teamResults.length;
  const cappedBonus = Math.min(totalBonus, 20);
  const compositeScore = Math.min(100, Math.round(baseScore + cappedBonus));

  // 개별 팀 점수 분해 (UI 표시용)
  const teamScoreBreakdown = teamResults.map(t => ({
    teamId: t.team.id,
    teamName: t.team.name,
    score: t.score,
    domain: t.team.domain,
  }));

  // 핵심 발견사항 상위 5건
  const topFindings = teamResults
    .flatMap(t => t.findings)
    .slice(0, 5);

  // 우수 사례 상위 3건
  const topCommendations = teamResults
    .flatMap(t => t.commendations)
    .slice(0, 3);

  return {
    teams: teamResults,
    overallPassRate,
    totalBonus,
    compositeScore,
    totalDurationMs: Date.now() - totalStart,
    teamScoreBreakdown,
    topFindings,
    topCommendations,
  };
}

/** 검토팀 목록 조회 (UI 표시용) */
export function getReviewTeams(): ReviewTeam[] {
  return [...TEAMS];
}
