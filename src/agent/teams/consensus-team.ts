/**
 * TEAM-CONSENSUS: 합의+출력팀 에이전트
 * -------------------------------------
 * 다중팀 결과 병합 → 토론/재합의 → ESVA Verified 보고서 생성
 *
 * PART 1: Result merger
 * PART 2: Verification marking generator
 * PART 3: ESVA Verified report builder
 * PART 4: Team result assembly
 */

import type {
  TeamResult,
  VerificationMarking,
  ESVAVerifiedReport,
  ReportSummary,
  VerifiedGrade,
  ReportVerdict,
  ViolationEntry,
  RecommendationEntry,
} from './types';
import {
  runDebate,
  buildEscalation,
} from '../debate/debate-protocol';
import type { ConsensusConfig } from '../debate/types';
import { hashCanonicalValue } from '@/engine/receipt/receipt-hash';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Result Merger
// ═══════════════════════════════════════════════════════════════════════════════

interface MergedResults {
  allCalculations: TeamResult['calculations'];
  allStandards: TeamResult['standards'];
  allViolations: ViolationEntry[];
  allRecommendations: RecommendationEntry[];
  componentCount: number;
  connectionCount: number;
}

/** 판정 심각도 순위 — 같은 조항 키 병합 시 최악값 보존용 */
const JUDGMENT_RANK: Record<'PASS' | 'HOLD' | 'FAIL' | 'BLOCK', number> = {
  PASS: 0,
  HOLD: 1,
  FAIL: 2,
  BLOCK: 3,
};

function mergeTeamResults(teamResults: TeamResult[]): MergedResults {
  const allCalculations: NonNullable<TeamResult['calculations']> = [];
  const allStandards: NonNullable<TeamResult['standards']> = [];
  const allViolations: ViolationEntry[] = [];
  const allRecommendations: RecommendationEntry[] = [];
  let componentCount = 0;
  let connectionCount = 0;

  // 중복 제거 — standards는 키→인덱스 맵(최악 판정 교체를 위해)
  const seenCalcIds = new Set<string>();
  const seenStdKeys = new Map<string, number>();

  for (const tr of teamResults) {
    componentCount += tr.components?.length ?? 0;
    connectionCount += tr.connections?.length ?? 0;

    if (tr.calculations) {
      for (const calc of tr.calculations) {
        if (!seenCalcIds.has(calc.id)) {
          seenCalcIds.add(calc.id);
          allCalculations.push(calc);
        }
      }
    }

    if (tr.standards) {
      for (const std of tr.standards) {
        // 같은 조항 키의 중복은 제거하되 **최악 판정을 보존**한다.
        //
        // 종전에는 먼저 온 행이 무조건 이겨서, 같은 조항이 인스턴스마다 다른
        // 판정을 낼 때(변압기 2대 중 1대만 위반 등) 뒤에 온 FAIL이 병합표에서
        // 사라지고 hasFail 판정까지 놓쳤다 — 독립 심사가 실행 재현으로 발각.
        // KEC 232.52(결선마다 같은 clause) 등 기존 행도 같은 결함이었다.
        // 병합표는 "조항별 최악 상태" 요약이고, 인스턴스 전량은 각 팀 결과에
        // 원본대로 남는다.
        const key = `${std.standard}-${std.clause}`;
        const existingIdx = seenStdKeys.get(key);
        if (existingIdx === undefined) {
          seenStdKeys.set(key, allStandards.length);
          allStandards.push(std);
        } else if (JUDGMENT_RANK[std.judgment] > JUDGMENT_RANK[allStandards[existingIdx].judgment]) {
          allStandards[existingIdx] = std;
        }
      }
    }

    if (tr.violations) allViolations.push(...tr.violations);
    if (tr.recommendations) allRecommendations.push(...tr.recommendations);
  }

  return {
    allCalculations,
    allStandards,
    allViolations,
    allRecommendations,
    componentCount,
    connectionCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Verification Marking Generator (빨강/노랑/초록)
// ═══════════════════════════════════════════════════════════════════════════════

function generateMarkings(
  merged: MergedResults,
  _teamResults: TeamResult[],
): VerificationMarking[] {
  const markings: VerificationMarking[] = [];
  let markIdx = 0;

  // 위반사항 → 빨강 (error) or 노랑 (warning)
  for (const v of merged.allViolations) {
    markings.push({
      id: `mark-${markIdx++}`,
      severity: v.severity === 'critical' ? 'error' : v.severity === 'major' ? 'warning' : 'info',
      componentId: v.id,
      location: v.location ?? '미지정',
      message: v.title,
      detail: v.description,
      standardRef: v.standardRef,
      suggestedFix: v.suggestedFix,
    });
  }

  // 계산 결과 비적합 → 빨강 (null=HOLD는 제외)
  for (const calc of merged.allCalculations ?? []) {
    if (calc.compliant === false) {
      markings.push({
        id: `mark-${markIdx++}`,
        severity: 'error',
        location: calc.label,
        message: `${calc.label}: 기준 미달`,
        detail: `계산값 ${calc.value} ${calc.unit}`,
        standardRef: calc.standardRef,
        calculatedValue: `${calc.value} ${calc.unit}`,
      });
    } else if (calc.compliant === null) {
      markings.push({
        id: `mark-${markIdx++}`,
        severity: 'warning',
        location: calc.label,
        message: `${calc.label}: 판정 보류(HOLD)`,
        detail: calc.note ?? `계산값 ${calc.value} ${calc.unit} — 미검증`,
        standardRef: calc.standardRef,
        calculatedValue: Number.isFinite(calc.value) ? `${calc.value} ${calc.unit}` : undefined,
      });
    }
  }

  // 기준서 FAIL → 빨강
  for (const std of merged.allStandards ?? []) {
    if (std.judgment === 'FAIL' || std.judgment === 'BLOCK') {
      markings.push({
        id: `mark-${markIdx++}`,
        severity: 'error',
        location: `${std.standard} ${std.clause}`,
        message: `${std.title}: ${std.judgment}`,
        detail: std.note,
        standardRef: `${std.standard} ${std.clause}`,
      });
    }
  }

  // 적합 항목 → 초록
  for (const calc of merged.allCalculations ?? []) {
    if (calc.compliant === true) {
      markings.push({
        id: `mark-${markIdx++}`,
        severity: 'success',
        location: calc.label,
        message: `${calc.label}: 적합`,
        calculatedValue: `${calc.value} ${calc.unit}`,
        standardRef: calc.standardRef,
      });
    }
  }

  return markings;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — ESVA Verified Report Builder
// ═══════════════════════════════════════════════════════════════════════════════

function computeGrade(score: number): VerifiedGrade {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function computeVerdict(merged: MergedResults): ReportVerdict {
  const hasCritical = merged.allViolations.some(v => v.severity === 'critical');
  const hasFail = (merged.allStandards ?? []).some(s => s.judgment === 'FAIL' || s.judgment === 'BLOCK');
  const hasCalcFail = (merged.allCalculations ?? []).some(c => c.compliant === false);
  const hasHold =
    (merged.allCalculations ?? []).some(c => c.compliant === null) ||
    (merged.allStandards ?? []).some(s => s.judgment === 'HOLD');

  if (hasCritical || hasFail || hasCalcFail) return 'FAIL';
  if (merged.allViolations.length > 0 || hasHold) return 'CONDITIONAL';
  return 'PASS';
}

function computeScore(merged: MergedResults): number {
  const calcs = merged.allCalculations ?? [];
  const stds = merged.allStandards ?? [];
  // HOLD/미검증은 분모에서 제외 — 빈 데이터 고득점 방지
  const scoredCalcs = calcs.filter(c => c.compliant !== null);
  const scoredStds = stds.filter(s => s.judgment !== 'HOLD');
  const totalChecks = scoredCalcs.length + scoredStds.length;
  if (totalChecks === 0) {
    // 전부 HOLD면 점수 0 — "검증됨" 오인 차단
    return calcs.length + stds.length > 0 ? 0 : 50;
  }

  const passedCalcs = scoredCalcs.filter(c => c.compliant === true).length;
  const passedStds = scoredStds.filter(s => s.judgment === 'PASS').length;

  const passRate = (passedCalcs + passedStds) / totalChecks;

  // 위반 감점
  const criticalPenalty = merged.allViolations.filter(v => v.severity === 'critical').length * 15;
  const majorPenalty = merged.allViolations.filter(v => v.severity === 'major').length * 5;

  return Math.max(0, Math.min(100, Math.round(passRate * 100 - criticalPenalty - majorPenalty)));
}

function buildSummary(
  merged: MergedResults,
  verdict: ReportVerdict,
  score: number,
): ReportSummary {
  const passedChecks =
    (merged.allCalculations ?? []).filter(c => c.compliant === true).length +
    (merged.allStandards ?? []).filter(s => s.judgment === 'PASS').length;
  const failedChecks =
    (merged.allCalculations ?? []).filter(c => c.compliant === false).length +
    (merged.allStandards ?? []).filter(s => s.judgment === 'FAIL' || s.judgment === 'BLOCK').length;
  const holdChecks =
    (merged.allCalculations ?? []).filter(c => c.compliant === null).length +
    (merged.allStandards ?? []).filter(s => s.judgment === 'HOLD').length;

  const appliedStandards = [...new Set(
    (merged.allStandards ?? []).map(s => `${s.standard}`)
  )];

  const totalJudged = passedChecks + failedChecks + holdChecks;
  const textKo =
    verdict === 'PASS'
      ? `전체 ${totalJudged}개 항목 중 ${passedChecks}개 적합. 종합 ${score}점 (${computeGrade(score)}등급).`
      : verdict === 'CONDITIONAL'
        ? `전체 ${totalJudged}개 항목 중 적합 ${passedChecks}·부적합 ${failedChecks}·보류(HOLD) ${holdChecks}. 종합 ${score}점. 추가 입력·수동 검증 필요.`
        : `전체 ${totalJudged}개 항목 중 ${failedChecks}개 부적합 발견(HOLD ${holdChecks}). 종합 ${score}점. 수정 후 재검토 필요.`;

  const textEn =
    verdict === 'PASS'
      ? `${passedChecks} of ${totalJudged} checks passed. Score: ${score} (Grade ${computeGrade(score)}).`
      : verdict === 'CONDITIONAL'
        ? `${passedChecks} pass / ${failedChecks} fail / ${holdChecks} hold of ${totalJudged}. Score: ${score}. Further verification required.`
        : `${failedChecks} of ${totalJudged} checks failed (${holdChecks} hold). Score: ${score}. Revision required.`;

  return {
    totalComponents: merged.componentCount,
    totalConnections: merged.connectionCount,
    totalCalculations: merged.allCalculations?.length ?? 0,
    passedChecks,
    failedChecks,
    warningChecks: merged.allViolations.filter(v => v.severity === 'major').length,
    criticalViolations: merged.allViolations.filter(v => v.severity === 'critical'),
    topRecommendations: merged.allRecommendations.slice(0, 5),
    appliedStandards,
    textKo,
    textEn,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Team Result Assembly
// ═══════════════════════════════════════════════════════════════════════════════

export interface ConsensusTeamInput {
  sessionId: string;
  projectName: string;
  projectType: string;
  teamResults: TeamResult[];
  consensusConfig?: ConsensusConfig;
}

/**
 * 합의+출력팀 메인 실행.
 * 1. 다중팀 결과 병합
 * 2. 불일치 탐지 → 토론 → 재합의
 * 3. 검증 마킹 생성
 * 4. ESVA Verified 보고서 조립
 */
export async function executeConsensusTeam(
  input: ConsensusTeamInput,
): Promise<{ teamResult: TeamResult; report: ESVAVerifiedReport }> {
  const start = Date.now();

  // Step 1: 병합
  const merged = mergeTeamResults(input.teamResults);

  // Step 2: 토론 (불일치 항목이 있을 때만)
  const debateResults = runDebate(input.teamResults, input.consensusConfig);
  const escalation = buildEscalation(debateResults);

  // Step 2.5: 표준 도면 패턴 매칭 + 비용 산출
  try {
    const allComponentTypes = input.teamResults
      .flatMap(tr => tr.components ?? [])
      .map(c => c.type);
    if (allComponentTypes.length > 0) {
      const { matchStandardDrawing } = await import('@/data/standard-drawings/standard-drawing-db');
      const patternMatch = matchStandardDrawing(allComponentTypes);
      if (patternMatch.length > 0 && patternMatch[0].matchScore > 0.5) {
        const best = patternMatch[0];
        if (best.missingComponents.length > 0) {
          for (const missing of best.missingComponents) {
            merged.allViolations.push({
              id: `vio-pattern-${missing}`,
              severity: 'major',
              title: `표준 도면 대비 누락: ${missing}`,
              description: `${best.templateName} 기준 "${missing}" 필수 요소 미확인`,
              suggestedFix: `${missing} 추가 설치 검토`,
            });
          }
        }
      }

      // 비용 산출
      const { getUnitPrice, estimateProjectCost } = await import('@/data/unit-prices/unit-price-db');
      const costItems = allComponentTypes.map(type => ({
        item: type,
        price: getUnitPrice(type),
        quantity: 1,
      }));
      const costEstimate = estimateProjectCost(costItems);
      if (costEstimate.grandTotal > 0) {
        merged.allRecommendations.push({
          id: 'rec-cost',
          category: 'cost',
          title: '개산 견적',
          description: `자재비 ${(costEstimate.materialTotal / 10000).toFixed(0)}만원 + 노무비 ${(costEstimate.laborTotal / 10000).toFixed(0)}만원 = 합계 ${(costEstimate.grandTotal / 10000).toFixed(0)}만원 (부가세 별도)`,
          impact: 'medium',
          estimatedSaving: `총 ${(costEstimate.grandTotal / 10000).toFixed(0)}만원`,
        });
      }
    }
  } catch { /* 패턴 매칭/견적 실패해도 보고서 생성은 계속 */ }

  // 에스컬레이션(팀 간 합의 실패) 위반은 반드시 점수·판정·마킹·요약 계산 "전에"
  // 반영해야 한다. 이전에는 report 조립 이후에 push되어, 합의 실패가 verdict/score/
  // summary/markings 어디에도 안 잡히고 PASS로 표시되는 버그가 있었다.
  if (escalation) {
    merged.allViolations.push({
      id: 'vio-escalation',
      severity: 'critical',
      title: '팀 간 합의 실패',
      description: escalation.reason,
      suggestedFix: escalation.suggestedAction,
    });
  }

  // Step 3: 검증 마킹
  const markings = generateMarkings(merged, input.teamResults);

  // Step 4: 점수 계산
  const score = computeScore(merged);
  const verdict = computeVerdict(merged);
  const grade = computeGrade(score);
  const summary = buildSummary(merged, verdict, score);

  // Step 5: 보고서 조립
  const reportId = `RPT-${crypto.randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`;
  const evidenceIds = [...new Set([
    ...input.teamResults.map(result => `team:${result.teamId}`),
    ...(merged.allCalculations ?? []).map(calculation => `calculation:${calculation.id}`),
    ...merged.allViolations.map(violation => `violation:${violation.id}`),
  ])];
  const reportClaim: Omit<ESVAVerifiedReport, 'hash'> = {
    reportId,
    createdAt: new Date().toISOString(),
    version: 'ESVA Report v1.0',
    projectName: input.projectName,
    projectType: input.projectType,
    verdict,
    grade,
    compositeScore: score,
    teamResults: input.teamResults,
    debateResults,
    markings,
    summary,
    // 합의 실패 시 사람 검토 필요 신호를 리포트에 노출 (이전엔 debate 결과의
    // requiresHumanReview를 읽는 production 코드가 0이라 아무 데도 전달 안 됐음).
    requiresHumanReview: !!escalation,
    evidenceIds,
  };
  const report: ESVAVerifiedReport = {
    ...reportClaim,
    hash: await hashCanonicalValue(reportClaim),
  };

  const teamResult: TeamResult = {
    teamId: 'TEAM-CONSENSUS',
    success: true,
    calculations: merged.allCalculations,
    standards: merged.allStandards,
    violations: merged.allViolations,
    recommendations: merged.allRecommendations,
    confidence: score / 100,
    durationMs: Date.now() - start,
  };

  return { teamResult, report };
}
