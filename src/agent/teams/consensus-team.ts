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

function mergeTeamResults(teamResults: TeamResult[]): MergedResults {
  const allCalculations: NonNullable<TeamResult['calculations']> = [];
  const allStandards: NonNullable<TeamResult['standards']> = [];
  const allViolations: ViolationEntry[] = [];
  const allRecommendations: RecommendationEntry[] = [];
  let componentCount = 0;
  let connectionCount = 0;

  // 중복 제거 Set
  const seenCalcIds = new Set<string>();
  const seenStdKeys = new Set<string>();

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
        const key = `${std.standard}-${std.clause}`;
        if (!seenStdKeys.has(key)) {
          seenStdKeys.add(key);
          allStandards.push(std);
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
  teamResults: TeamResult[],
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

  // 계산 결과 비적합 → 빨강
  for (const calc of merged.allCalculations ?? []) {
    if (!calc.compliant) {
      markings.push({
        id: `mark-${markIdx++}`,
        severity: 'error',
        location: calc.label,
        message: `${calc.label}: 기준 미달`,
        detail: `계산값 ${calc.value} ${calc.unit}`,
        standardRef: calc.standardRef,
        calculatedValue: `${calc.value} ${calc.unit}`,
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
    if (calc.compliant) {
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

  if (hasCritical || hasFail) return 'FAIL';
  if (merged.allViolations.length > 0) return 'CONDITIONAL';
  return 'PASS';
}

function computeScore(merged: MergedResults): number {
  const totalChecks =
    (merged.allCalculations?.length ?? 0) + (merged.allStandards?.length ?? 0);
  if (totalChecks === 0) return 50;

  const passedCalcs = (merged.allCalculations ?? []).filter(c => c.compliant).length;
  const passedStds = (merged.allStandards ?? []).filter(s =>
    s.judgment === 'PASS' || s.judgment === 'HOLD'
  ).length;

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
    (merged.allCalculations ?? []).filter(c => c.compliant).length +
    (merged.allStandards ?? []).filter(s => s.judgment === 'PASS').length;
  const failedChecks =
    (merged.allCalculations ?? []).filter(c => !c.compliant).length +
    (merged.allStandards ?? []).filter(s => s.judgment === 'FAIL' || s.judgment === 'BLOCK').length;

  const appliedStandards = [...new Set(
    (merged.allStandards ?? []).map(s => `${s.standard}`)
  )];

  const textKo = verdict === 'PASS'
    ? `전체 ${passedChecks + failedChecks}개 검증 항목 중 ${passedChecks}개 적합. 종합 ${score}점 (${computeGrade(score)}등급).`
    : `전체 ${passedChecks + failedChecks}개 검증 항목 중 ${failedChecks}개 부적합 발견. 종합 ${score}점. 수정 후 재검토 필요.`;

  const textEn = verdict === 'PASS'
    ? `${passedChecks} of ${passedChecks + failedChecks} checks passed. Score: ${score} (Grade ${computeGrade(score)}).`
    : `${failedChecks} of ${passedChecks + failedChecks} checks failed. Score: ${score}. Revision required.`;

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

  // Step 3: 검증 마킹
  const markings = generateMarkings(merged, input.teamResults);

  // Step 4: 점수 계산
  const score = computeScore(merged);
  const verdict = computeVerdict(merged);
  const grade = computeGrade(score);
  const summary = buildSummary(merged, verdict, score);

  // Step 5: 보고서 조립
  const reportId = `RPT-${Date.now().toString(36).toUpperCase()}`;
  const report: ESVAVerifiedReport = {
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
    receiptIds: [], // 영수증 ID는 export 시 생성
    hash: '', // SHA-256은 최종 확정 시 계산
  };

  // 에스컬레이션 경고
  if (escalation) {
    merged.allViolations.push({
      id: 'vio-escalation',
      severity: 'critical',
      title: '팀 간 합의 실패',
      description: escalation.reason,
      suggestedFix: escalation.suggestedAction,
    });
  }

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
