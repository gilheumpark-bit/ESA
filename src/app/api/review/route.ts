/**
 * ESVA Design Review API — /api/review
 * ──────────────────────────────────────
 * POST: 설계 파라미터 → DAG 파이프라인 실행 → 5단계 검증 → 종합 리포트.
 * 이것이 ESVA의 핵심: 추출→법규→계산→가드레일→감사 강제 순서 파이프라인.
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { runCalcPipeline, type PipelineConfig } from '@/agent/pipeline';
import { queryAmpacity, queryBreakerRating } from '@/engine/standards/kec/kec-table-query';
import { apiLog, createRequestTimer } from '@/lib/api-logger';
import type { CalcParams } from '@/engine/topology';

export const runtime = 'nodejs';

interface ReviewRequestBody {
  /** 수동 입력 또는 SLD에서 추출된 파라미터 */
  params: {
    totalLength_m: number;
    cableSize_sq?: number;
    loadPower_kW?: number;
    voltage_V: number;
    current_A?: number;
    phases?: 1 | 3;
    conductor?: 'Cu' | 'Al';
    insulation?: 'PVC' | 'XLPE' | 'MI';
    installation?: 'conduit' | 'tray' | 'directBuried' | 'freeAir';
    powerFactor?: number;
    maxVoltageDropPercent?: number;
  };
}

function isFiniteInRange(value: unknown, minExclusive: number, maxInclusive: number): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value > minExclusive
    && value <= maxInclusive;
}

function validateReviewParams(params: ReviewRequestBody['params'] | undefined): string | null {
  if (!params) return '설계 검토 params가 필수입니다.';
  if (!isFiniteInRange(params.voltage_V, 0, 1_000_000)) return 'voltage_V는 0보다 큰 유한값이어야 합니다.';
  if (!isFiniteInRange(params.totalLength_m, 0, 1_000_000)) return 'totalLength_m는 0보다 큰 유한값이어야 합니다.';
  if (!isFiniteInRange(params.cableSize_sq, 0, 1_000_000)) return 'cableSize_sq는 필수이며 0보다 커야 합니다.';
  if (!isFiniteInRange(params.maxVoltageDropPercent, 0, 20)) return 'maxVoltageDropPercent는 필수이며 0 초과 20 이하이어야 합니다.';
  if (params.phases !== 1 && params.phases !== 3) return 'phases는 1 또는 3이어야 합니다.';
  if (params.conductor !== 'Cu' && params.conductor !== 'Al') return 'conductor는 Cu 또는 Al이어야 합니다.';
  if (!['PVC', 'XLPE', 'MI'].includes(params.insulation ?? '')) return '지원되는 insulation이 필수입니다.';
  if (!['conduit', 'tray', 'directBuried', 'freeAir'].includes(params.installation ?? '')) return '지원되는 installation이 필수입니다.';

  const hasCurrent = isFiniteInRange(params.current_A, 0, 10_000_000);
  const hasLoad = isFiniteInRange(params.loadPower_kW, 0, 1_000_000_000);
  if (params.current_A !== undefined && !hasCurrent) return 'current_A는 0보다 큰 유한값이어야 합니다.';
  if (params.loadPower_kW !== undefined && !hasLoad) return 'loadPower_kW는 0보다 큰 유한값이어야 합니다.';
  if (!hasCurrent && !hasLoad) return 'current_A 또는 loadPower_kW 중 하나는 필수입니다.';
  if (!hasCurrent && (!isFiniteInRange(params.powerFactor, 0, 1))) {
    return '부하전력으로 전류를 산출할 때 powerFactor가 필수입니다.';
  }
  return null;
}

export async function POST(req: NextRequest) {
  const blocked = applyRateLimit(req, 'calculate');
  if (blocked) return blocked;

  const timer = createRequestTimer();

  try {
    const body: ReviewRequestBody = await req.json();
    const p = body.params;

    const validationError = validateReviewParams(p);
    if (validationError) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4001', message: validationError } },
        { status: 400 },
      );
    }

    // DAG 파이프라인 설정
    const config: PipelineConfig = {
      // EXTRACT: 요청 파라미터를 CalcParams로 변환
      extractor: async () => ({
        totalLength_m: p.totalLength_m,
        minCableSize_sq: p.cableSize_sq ?? null,
        loadPower_kW: p.loadPower_kW ?? null,
        voltage_V: p.voltage_V,
        phases: (p.phases as 1 | 3) ?? null,
        cableTypes: p.insulation ? [p.insulation] : [],
        pathNodeIds: [],
      }),

      // LOOKUP: KEC 법규 조회
      lookup: async (params: CalcParams) => {
        const conductor = p.conductor!;
        const insulation = p.insulation!;
        const installation = p.installation!;
        const appliedClauses: string[] = [];

        // 허용전류 조회
        let ampacity: number | undefined;
        if (params.minCableSize_sq) {
          const result = queryAmpacity({
            size: params.minCableSize_sq,
            conductor, insulation, installation,
          });
          if (result) {
            ampacity = result.correctedAmpacity;
            appliedClauses.push('KEC 232.3');
          }
        }

        // 차단기 후보
        const loadCurrent = p.current_A ?? (params.loadPower_kW
          ? (params.loadPower_kW * 1000) / (params.voltage_V! * (params.phases === 3 ? 1.732 : 1) * (p.powerFactor ?? 0.85))
          : undefined);

        let breakerCandidates: number[] | undefined;
        if (loadCurrent) {
          const br = queryBreakerRating(loadCurrent, ampacity);
          breakerCandidates = br.candidates.slice(0, 5);
          appliedClauses.push('KEC 212.3');
        }

        return {
          ampacity,
          vdLimit: p.maxVoltageDropPercent,
          breakerCandidates,
          appliedClauses,
        };
      },

      // CALCULATE: 전압강하 계산
      calculate: async (params: CalcParams, standards) => {
        const I = p.current_A ?? (params.loadPower_kW
          ? (params.loadPower_kW * 1000) / (params.voltage_V! * (params.phases === 3 ? 1.732 : 1) * (p.powerFactor ?? 0.85))
          : 0);
        const A = params.minCableSize_sq!;
        const L = params.totalLength_m;
        const rho = p.conductor === 'Al' ? 0.029 : 0.018;
        const k = params.phases === 3 ? 1.732 : 2;

        const vd = (k * I * L * rho) / A;
        const vdPercent = (vd / params.voltage_V!) * 100;
        const compliant = vdPercent <= (standards.vdLimit ?? 5);

        return {
          calculatorId: 'voltage-drop',
          value: Math.round(vdPercent * 100) / 100,
          unit: '%',
          compliant,
          formula: `e = ${k === 1.732 ? '√3' : '2'} × ${I.toFixed(1)}A × ${L}m × ${rho} / ${A}mm² = ${vd.toFixed(2)}V (${vdPercent.toFixed(2)}%)`,
        };
      },
    };

    // 파이프라인 실행
    const result = await runCalcPipeline(config);

    apiLog({
      level: result.error ? 'warn' : 'info',
      event: 'design-review',
      route: '/api/review',
      durationMs: timer.elapsed(),
      meta: {
        stage: result.stage,
        hasError: !!result.error,
        grade: result.report?.grade,
        verdict: result.report?.verdict,
      },
    });

    return NextResponse.json({
      success: !result.error,
      stage: result.stage,
      report: result.report,
      error: result.error,
      timing: result.timing,
      qualityScore: result.multiTeamReport?.compositeScore,
      auditGrade: result.auditReport?.overallGrade,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Design review failed';
    apiLog({ level: 'error', event: 'design-review', route: '/api/review', error: message, durationMs: timer.elapsed() });
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-4999', message: '설계 검토를 완료하지 못했습니다.' } },
      { status: 500 },
    );
  }
}
