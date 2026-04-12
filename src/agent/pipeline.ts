/**
 * ESVA DAG Pipeline Orchestrator — 강제 순서 상태기계
 * ─────────────────────────────────────────────────────
 * 도면 검토 전용 5단계 파이프라인. 이전 단계 완료 없이 다음 단계 진입 불가.
 *
 * [EXTRACT] → [LOOKUP] → [CALCULATE] → [VERIFY] → [REPORT]
 *
 * PART 1: Types & Pipeline Context
 * PART 2: Pipeline Step Definitions
 * PART 3: Pipeline Runner (DAG 강제)
 */

import { runGuardrails, type GuardrailResult } from './guardrails';
import { runVerifyFixLoop, type VerifyFixResult } from '@/engine/verification/gen-verify-fix';
import { runQualityChecklist, type QualityReport } from '@/engine/verification/quality-checklist';
import { runAudit, type AuditReport, type Grade } from '@/engine/verification/audit-engine';
import { runMultiTeamReview, type MultiTeamReport } from '@/engine/verification/multi-team-review';
import type { CalcParams } from '@/engine/topology';

// =========================================================================
// PART 1 — Types & Context
// =========================================================================

export type PipelineStage = 'EXTRACT' | 'LOOKUP' | 'CALCULATE' | 'VERIFY' | 'REPORT';

export interface PipelineContext {
  /** 현재 단계 */
  stage: PipelineStage;
  /** 추출된 계산 파라미터 */
  params: CalcParams | null;
  /** KEC 법규 조회 결과 */
  standards: StandardLookupResult | null;
  /** 계산 결과 */
  calculation: CalculationResult | null;
  /** 가드레일 검증 결과 */
  verification: GuardrailResult | null;
  /** 품질 체크리스트 */
  qualityReport: QualityReport | null;
  /** 종합 감사 */
  auditReport: AuditReport | null;
  /** 멀티팀 리뷰 */
  multiTeamReport: MultiTeamReport | null;
  /** 최종 리포트 */
  report: PipelineReport | null;
  /** 에러 (파이프라인 중단 시) */
  error: PipelineError | null;
  /** 단계별 소요시간 (ms) */
  timing: Partial<Record<PipelineStage, number>>;
}

export interface StandardLookupResult {
  /** 조회된 허용전류 (A) */
  ampacity?: number;
  /** 전압강하 기준 (%) */
  vdLimit?: number;
  /** 차단기 후보 */
  breakerCandidates?: number[];
  /** 적용된 KEC 조항 */
  appliedClauses: string[];
}

export interface CalculationResult {
  /** 계산기 ID */
  calculatorId: string;
  /** 계산 결과값 */
  value: number;
  /** 단위 */
  unit: string;
  /** 적합/부적합 */
  compliant: boolean;
  /** 수식 전개 (LaTeX) */
  formula: string;
}

export interface PipelineReport {
  /** 최종 판정 */
  verdict: 'PASS' | 'FAIL' | 'HOLD';
  /** 종합 감사 등급 (A~F) */
  grade: Grade;
  /** 요약 (1문장) */
  summary: string;
  /** 계산 파라미터 (투명성) */
  params: CalcParams;
  /** 적용 법규 */
  appliedClauses: string[];
  /** 계산 결과 */
  calculation: CalculationResult;
  /** 가드레일 위반 (있으면) */
  warnings: string[];
  /** 멀티팀 리뷰 합산 점수 */
  compositeScore: number;
  /** 자동 규격 상향 결과 (부적합 시) */
  autoFix?: VerifyFixResult;
  /** 개선 권고 (부적합 시) */
  recommendation?: string;
}

export interface PipelineError {
  stage: PipelineStage;
  code: string;
  message: string;
  /** HITL 요청 여부 — true면 사용자 수동 입력 필요 */
  requiresHumanInput: boolean;
  /** 누락된 파라미터 (HITL 시 사용자에게 요청할 항목) */
  missingParams?: string[];
}

// =========================================================================
// PART 2 — Pipeline Step Interface
// =========================================================================

export interface PipelineStep {
  stage: PipelineStage;
  /** 실행 — context를 읽고 결과를 반환 */
  execute: (ctx: PipelineContext) => Promise<PipelineContext>;
  /** 사전 검증 — 이전 단계 결과가 충분한지 확인 */
  validate: (ctx: PipelineContext) => PipelineError | null;
}

// ── EXTRACT 단계 ──

function createExtractStep(
  extractor: (ctx: PipelineContext) => Promise<CalcParams>,
): PipelineStep {
  return {
    stage: 'EXTRACT',
    validate: () => null, // 첫 단계 — 사전 조건 없음
    execute: async (ctx) => {
      const params = await extractor(ctx);

      // 필수 파라미터 검증
      const missing: string[] = [];
      if (params.totalLength_m <= 0) missing.push('선로 거리(m)');
      if (!params.voltage_V) missing.push('전압(V)');

      if (missing.length > 0) {
        return {
          ...ctx, stage: 'EXTRACT', params,
          error: {
            stage: 'EXTRACT', code: 'ESVA-4001',
            message: `파라미터 추출 불완전: ${missing.join(', ')}`,
            requiresHumanInput: true, missingParams: missing,
          },
        };
      }

      return { ...ctx, stage: 'EXTRACT', params };
    },
  };
}

// ── LOOKUP 단계 ──

function createLookupStep(
  lookup: (params: CalcParams) => Promise<StandardLookupResult>,
): PipelineStep {
  return {
    stage: 'LOOKUP',
    validate: (ctx) => {
      if (!ctx.params) return {
        stage: 'LOOKUP', code: 'ESVA-4010',
        message: 'EXTRACT 단계가 완료되지 않았습니다.',
        requiresHumanInput: false,
      };
      return null;
    },
    execute: async (ctx) => {
      const standards = await lookup(ctx.params!);
      return { ...ctx, stage: 'LOOKUP', standards };
    },
  };
}

// ── CALCULATE 단계 ──

function createCalculateStep(
  calculate: (params: CalcParams, standards: StandardLookupResult) => Promise<CalculationResult>,
): PipelineStep {
  return {
    stage: 'CALCULATE',
    validate: (ctx) => {
      if (!ctx.params) return { stage: 'CALCULATE', code: 'ESVA-4020', message: 'EXTRACT 미완료.', requiresHumanInput: false };
      if (!ctx.standards) return { stage: 'CALCULATE', code: 'ESVA-4021', message: 'LOOKUP 미완료.', requiresHumanInput: false };
      return null;
    },
    execute: async (ctx) => {
      const calculation = await calculate(ctx.params!, ctx.standards!);
      return { ...ctx, stage: 'CALCULATE', calculation };
    },
  };
}

// ── VERIFY 단계 ──

const verifyStep: PipelineStep = {
  stage: 'VERIFY',
  validate: (ctx) => {
    if (!ctx.calculation) return { stage: 'VERIFY', code: 'ESVA-4030', message: 'CALCULATE 미완료.', requiresHumanInput: false };
    return null;
  },
  execute: async (ctx) => {
    const flatParams: Record<string, unknown> = {
      ...ctx.params,
      ...ctx.calculation,
      voltageDropPercent: ctx.calculation!.unit === '%' ? ctx.calculation!.value : undefined,
      current_A: ctx.calculation!.unit === 'A' ? ctx.calculation!.value : undefined,
    };

    // 1) 물리법칙 가드레일
    const verification = runGuardrails(flatParams);
    if (!verification.passed) {
      const blockViolations = verification.violations.filter(v => v.severity === 'BLOCK');
      return {
        ...ctx, stage: 'VERIFY', verification,
        qualityReport: null, auditReport: null, multiTeamReport: null,
        error: {
          stage: 'VERIFY', code: 'ESVA-4099',
          message: `물리법칙 가드레일 차단: ${blockViolations.map(v => v.message).join('; ')}`,
          requiresHumanInput: true,
          missingParams: blockViolations.map(v => v.param),
        },
      };
    }

    // 2) 품질 체크리스트 + 감사 + 멀티팀 리뷰 (가드레일 통과 후)
    const qualityReport = runQualityChecklist(flatParams);
    const auditReport = runAudit(flatParams);
    const multiTeamReport = await runMultiTeamReview(flatParams);

    return {
      ...ctx, stage: 'VERIFY', verification,
      qualityReport, auditReport, multiTeamReport,
    };
  },
};

// ── REPORT 단계 ──

const reportStep: PipelineStep = {
  stage: 'REPORT',
  validate: (ctx) => {
    if (!ctx.verification) return { stage: 'REPORT', code: 'ESVA-4040', message: 'VERIFY 미완료.', requiresHumanInput: false };
    return null;
  },
  execute: async (ctx) => {
    const calc = ctx.calculation!;
    const warnings = (ctx.verification?.violations ?? [])
      .filter(v => v.severity === 'WARN')
      .map(v => v.message);

    const auditGrade = ctx.auditReport?.overallGrade ?? 'C';
    const compositeScore = ctx.multiTeamReport?.compositeScore ?? 0;
    const verdict = calc.compliant && auditGrade !== 'F' ? 'PASS' : 'FAIL';
    const summary = calc.compliant
      ? `${calc.calculatorId} 검토 결과 KEC 기준 적합 (${calc.value}${calc.unit}, 등급 ${auditGrade})`
      : `${calc.calculatorId} 검토 결과 KEC 기준 부적합 (${calc.value}${calc.unit}, 등급 ${auditGrade})`;

    // 부적합 시 자동 규격 상향 루프 실행
    let autoFix: VerifyFixResult | undefined;
    if (!calc.compliant) {
      try {
        autoFix = await runVerifyFixLoop(
          { cableSize: ctx.params!.minCableSize_sq ?? 0 },
          {
            maxRounds: 5,
            verify: async (spec) => ({
              compliant: (spec['cableSize'] as number) > (ctx.params!.minCableSize_sq ?? 0),
              calculatedValue: calc.value,
              limitValue: ctx.standards?.vdLimit ?? 5,
              unit: calc.unit,
            }),
            fix: async (spec) => {
              const sizes = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];
              const curr = spec['cableSize'] as number;
              const idx = sizes.indexOf(curr);
              if (idx < 0 || idx >= sizes.length - 1) return null;
              return { cableSize: sizes[idx + 1] };
            },
          },
        );
      } catch { /* 자동 수정 실패는 비치명적 */ }
    }

    const report: PipelineReport = {
      verdict,
      grade: auditGrade,
      summary,
      params: ctx.params!,
      appliedClauses: ctx.standards?.appliedClauses ?? [],
      calculation: calc,
      warnings,
      compositeScore,
      autoFix,
      recommendation: autoFix?.finalCompliant
        ? `케이블 규격을 ${autoFix.recommendedSpec['cableSize']}sq로 상향하면 기준 적합합니다.`
        : calc.compliant ? undefined : '케이블 규격 상향 또는 선로 경로 재검토를 권장합니다.',
    };

    return { ...ctx, stage: 'REPORT', report };
  },
};

// =========================================================================
// PART 3 — Pipeline Runner (DAG 강제)
// =========================================================================

export interface PipelineConfig {
  /** 파라미터 추출 함수 */
  extractor: (ctx: PipelineContext) => Promise<CalcParams>;
  /** KEC 법규 조회 함수 */
  lookup: (params: CalcParams) => Promise<StandardLookupResult>;
  /** 확정적 계산 함수 */
  calculate: (params: CalcParams, standards: StandardLookupResult) => Promise<CalculationResult>;
}

/**
 * 5단계 DAG 파이프라인을 실행한다.
 * 각 단계는 이전 단계의 validate를 통과해야만 진행 가능.
 * 어떤 단계에서든 에러 발생 시 즉시 중단 + 사유 반환.
 */
export async function runCalcPipeline(config: PipelineConfig): Promise<PipelineContext> {
  const STAGE_ORDER: PipelineStage[] = ['EXTRACT', 'LOOKUP', 'CALCULATE', 'VERIFY', 'REPORT'];

  const steps: PipelineStep[] = [
    createExtractStep(config.extractor),
    createLookupStep(config.lookup),
    createCalculateStep(config.calculate),
    verifyStep,
    reportStep,
  ];

  let ctx: PipelineContext = {
    stage: 'EXTRACT',
    params: null,
    standards: null,
    calculation: null,
    verification: null,
    qualityReport: null,
    auditReport: null,
    multiTeamReport: null,
    report: null,
    error: null,
    timing: {},
  };

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stageName = STAGE_ORDER[i];

    // 사전 검증 — 이전 단계 완료 확인
    const validationError = step.validate(ctx);
    if (validationError) {
      return { ...ctx, error: validationError };
    }

    // 실행
    const start = Date.now();
    try {
      ctx = await step.execute(ctx);
      ctx.timing[stageName] = Date.now() - start;
    } catch (err) {
      ctx.timing[stageName] = Date.now() - start;
      return {
        ...ctx,
        error: {
          stage: stageName,
          code: 'ESVA-9000',
          message: err instanceof Error ? err.message : String(err),
          requiresHumanInput: false,
        },
      };
    }

    // 에러 발생 시 즉시 중단
    if (ctx.error) return ctx;
  }

  return ctx;
}

/** 빈 PipelineContext 생성 */
export function createEmptyContext(): PipelineContext {
  return {
    stage: 'EXTRACT',
    params: null,
    standards: null,
    calculation: null,
    verification: null,
    qualityReport: null,
    auditReport: null,
    multiTeamReport: null,
    report: null,
    error: null,
    timing: {},
  };
}
