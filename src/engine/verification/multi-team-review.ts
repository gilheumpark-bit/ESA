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
}

// =========================================================================
// PART 2 — Review Teams
// =========================================================================

const TEAMS: ReviewTeam[] = [
  {
    id: 'TEAM-AMP', name: '허용전류 검토팀',
    domain: 'thermal', goodPatternCategory: 'efficiency', required: true,
  },
  {
    id: 'TEAM-VD', name: '전압강하 검토팀',
    domain: 'code-compliance', goodPatternCategory: 'standards', required: true,
  },
  {
    id: 'TEAM-PROT', name: '보호계전 검토팀',
    domain: 'protection', goodPatternCategory: 'safety', required: true,
  },
  {
    id: 'TEAM-GND', name: '접지 검토팀',
    domain: 'electrical-safety', goodPatternCategory: 'safety', required: false,
  },
  {
    id: 'TEAM-REL', name: '신뢰성 검토팀',
    domain: 'reliability', goodPatternCategory: 'reliability', required: false,
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

  // 병렬 실행
  const teamResults = await Promise.all(
    TEAMS.map(async (team) => {
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

  const totalBonus = teamResults.reduce(
    (sum, t) => sum + t.goodPatterns.filter(gp => gp.detected).reduce((s, gp) => s + gp.bonus, 0), 0,
  );

  // 합산 점수: 기본 점수(0~100) + 가점(최대 20점 cap)
  const baseScore = teamResults.reduce((sum, t) => sum + t.score, 0) / teamResults.length;
  const cappedBonus = Math.min(totalBonus, 20);
  const compositeScore = Math.min(100, Math.round(baseScore + cappedBonus));

  return {
    teams: teamResults,
    overallPassRate,
    totalBonus,
    compositeScore,
    totalDurationMs: Date.now() - totalStart,
  };
}

/** 검토팀 목록 조회 (UI 표시용) */
export function getReviewTeams(): ReviewTeam[] {
  return [...TEAMS];
}
