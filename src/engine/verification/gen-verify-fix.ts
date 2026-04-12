/**
 * ESVA Gen-Verify-Fix Loop — 자동 규격 상향 재검증 루프
 * ─────────────────────────────────────────────────────────
 * 계산 결과가 부적합 → 자동으로 규격 상향 → 재검증 → 적합할 때까지 반복.
 * 최대 N라운드, 수렴 감지, 비용 추적.
 * 원본 패턴: eh-universe-web/packages/quill-engine/src/pipeline/gen-verify-fix-loop.ts
 *
 * PART 1: Types
 * PART 2: Fix Strategy (자동 규격 상향)
 * PART 3: Loop Runner
 */

import { findMinCableSize, queryAmpacity, queryBreakerRating } from '@/engine/standards/kec/kec-table-query';
import type { ConductorMaterial, InsulationType, InstallationMethod } from '@/data/ampacity-tables/kec-ampacity';

// =========================================================================
// PART 1 — Types
// =========================================================================

export interface VerifyFixIteration {
  round: number;
  /** 시도한 규격 */
  attemptedSpec: Record<string, unknown>;
  /** 검증 결과 */
  compliant: boolean;
  /** 계산값 */
  calculatedValue: number;
  /** 기준값 */
  limitValue: number;
  unit: string;
  /** 적용된 수정 */
  fixApplied?: string;
}

export type StopReason =
  | 'compliant'        // 적합 달성
  | 'max-rounds'       // 최대 라운드 도달
  | 'no-candidate'     // 더 이상 상향할 규격 없음
  | 'no-improvement';  // 수렴 (개선 없음)

export interface VerifyFixResult {
  /** 최종 적합 여부 */
  finalCompliant: boolean;
  /** 최종 권장 규격 */
  recommendedSpec: Record<string, unknown>;
  /** 반복 이력 */
  iterations: VerifyFixIteration[];
  /** 정지 사유 */
  stopReason: StopReason;
  /** 총 라운드 */
  totalRounds: number;
}

// =========================================================================
// PART 2 — Fix Strategies
// =========================================================================

export interface CableFixContext {
  requiredCurrent: number;
  conductor: ConductorMaterial;
  insulation: InsulationType;
  installation: InstallationMethod;
  ambientTemp?: number;
  groupCount?: number;
  /** 현재 규격 (mm²) */
  currentSize: number;
  /** 전압강하율 기준 (%) — 제공 시 전압강하 검증도 수행 */
  vdLimit?: number;
}

/** 케이블 규격 자동 상향 전략 */
function findNextCableSize(
  currentSize: number,
  ctx: CableFixContext,
): { nextSize: number; ampacity: number } | null {
  const result = findMinCableSize(ctx.requiredCurrent, {
    conductor: ctx.conductor,
    insulation: ctx.insulation,
    installation: ctx.installation,
    ambientTemp: ctx.ambientTemp,
    groupCount: ctx.groupCount,
  });

  if (!result) return null;
  if (result.minSize <= currentSize) {
    // 이미 허용전류는 충족 — 전압강하 때문에 부적합인 경우 한 단계 더 상향
    const KEC_SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];
    const currentIdx = KEC_SIZES.indexOf(currentSize);
    if (currentIdx < 0 || currentIdx >= KEC_SIZES.length - 1) return null;
    const nextSize = KEC_SIZES[currentIdx + 1];
    const nextResult = queryAmpacity({
      size: nextSize,
      conductor: ctx.conductor,
      insulation: ctx.insulation,
      installation: ctx.installation,
      ambientTemp: ctx.ambientTemp,
      groupCount: ctx.groupCount,
    });
    if (!nextResult) return null;
    return { nextSize, ampacity: nextResult.correctedAmpacity };
  }

  return { nextSize: result.minSize, ampacity: result.correctedAmpacity };
}

/** 차단기 자동 상향 전략 */
function findNextBreakerRating(
  currentRating: number,
  loadCurrent: number,
  wireAmpacity?: number,
): number | null {
  const result = queryBreakerRating(loadCurrent, wireAmpacity);
  const next = result.candidates.find(r => r > currentRating);
  return next ?? null;
}

// =========================================================================
// PART 3 — Loop Runner
// =========================================================================

export interface LoopConfig {
  maxRounds: number;
  /** 검증 함수: 현재 규격 → { compliant, value, limit, unit } */
  verify: (spec: Record<string, unknown>) => Promise<{
    compliant: boolean;
    calculatedValue: number;
    limitValue: number;
    unit: string;
  }>;
  /** 수정 함수: 현재 규격 → 다음 규격 (null이면 더 이상 상향 불가) */
  fix: (spec: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
}

/**
 * Gen-Verify-Fix 루프 실행.
 * 1. 현재 규격으로 검증
 * 2. 부적합 → fix()로 규격 상향
 * 3. 상향된 규격으로 재검증
 * 4. 적합 or 최대 라운드 or 후보 소진까지 반복
 */
export async function runVerifyFixLoop(
  initialSpec: Record<string, unknown>,
  config: LoopConfig,
): Promise<VerifyFixResult> {
  const iterations: VerifyFixIteration[] = [];
  let currentSpec = { ...initialSpec };
  let prevValue = Infinity;

  for (let round = 1; round <= config.maxRounds; round++) {
    const result = await config.verify(currentSpec);

    iterations.push({
      round,
      attemptedSpec: { ...currentSpec },
      compliant: result.compliant,
      calculatedValue: result.calculatedValue,
      limitValue: result.limitValue,
      unit: result.unit,
    });

    if (result.compliant) {
      return {
        finalCompliant: true,
        recommendedSpec: currentSpec,
        iterations,
        stopReason: 'compliant',
        totalRounds: round,
      };
    }

    // 수렴 감지: 이전과 개선 없음
    if (Math.abs(result.calculatedValue - prevValue) < 0.001) {
      return {
        finalCompliant: false,
        recommendedSpec: currentSpec,
        iterations,
        stopReason: 'no-improvement',
        totalRounds: round,
      };
    }
    prevValue = result.calculatedValue;

    // 자동 수정
    const nextSpec = await config.fix(currentSpec);
    if (!nextSpec) {
      return {
        finalCompliant: false,
        recommendedSpec: currentSpec,
        iterations,
        stopReason: 'no-candidate',
        totalRounds: round,
      };
    }

    // 수정 내역 기록
    iterations[iterations.length - 1].fixApplied =
      `규격 변경: ${JSON.stringify(diffKeys(currentSpec, nextSpec))}`;

    currentSpec = nextSpec;
  }

  return {
    finalCompliant: false,
    recommendedSpec: currentSpec,
    iterations,
    stopReason: 'max-rounds',
    totalRounds: config.maxRounds,
  };
}

/** 케이블 규격 자동 상향 루프 (편의 래퍼) */
export async function runCableVerifyFix(
  ctx: CableFixContext,
  verify: (size: number) => Promise<{ compliant: boolean; value: number; limit: number; unit: string }>,
  maxRounds = 5,
): Promise<VerifyFixResult> {
  return runVerifyFixLoop(
    { cableSize: ctx.currentSize },
    {
      maxRounds,
      verify: async (spec) => {
        const r = await verify(spec['cableSize'] as number);
        return { compliant: r.compliant, calculatedValue: r.value, limitValue: r.limit, unit: r.unit };
      },
      fix: async (spec) => {
        const current = spec['cableSize'] as number;
        const next = findNextCableSize(current, ctx);
        if (!next) return null;
        return { cableSize: next.nextSize };
      },
    },
  );
}

// ── Helper ──

function diffKeys(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(b)) {
    if (a[key] !== b[key]) diff[key] = { from: a[key], to: b[key] };
  }
  return diff;
}

// suppress unused import warnings — these are part of the public API
void findNextBreakerRating;
