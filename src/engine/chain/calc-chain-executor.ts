/**
 * ESVA Calculation Chain Executor — 연쇄 계산 자동 실행
 * ──────────────────────────────────────────────────────
 * SLD 분석에서 생성된 CalcChain을 순서대로 자동 실행.
 * 앞 단계 결과가 뒷 단계의 입력이 되는 종속 실행.
 * 예: 부하계산 → 변압기 용량 → 단락전류 → 케이블 선정 → 전압강하
 *
 * PART 1: Types
 * PART 2: Chain Executor
 * PART 3: Result Aggregator
 */

import { CALCULATOR_REGISTRY } from '@engine/calculators';

// =========================================================================
// PART 1 — Types
// =========================================================================

export interface ChainStep {
  id: string;
  calculatorId: string;
  /** 이 단계의 입력 (직접 지정 + 이전 단계 결과 참조) */
  inputs: Record<string, unknown>;
  /** 이전 단계 결과에서 가져올 필드 매핑: { thisInputName: "prevStepId.outputField" } */
  dependsOn?: Record<string, string>;
}

export interface ChainStepResult {
  stepId: string;
  calculatorId: string;
  success: boolean;
  outputs: Record<string, unknown>;
  error?: string;
  durationMs: number;
  /** 적용된 기준 */
  standardRef?: string;
}

export interface ChainResult {
  /** 전체 성공 여부 (모든 단계 성공) */
  success: boolean;
  steps: ChainStepResult[];
  /** 실패한 단계 ID (있으면) */
  failedAt?: string;
  /** 총 소요 시간 (ms) */
  totalDurationMs: number;
  /** 요약: 최종 단계 결과 */
  summary: Record<string, unknown>;
}

// =========================================================================
// PART 2 — Chain Executor
// =========================================================================

/**
 * 계산 체인을 순차 실행한다.
 * 각 단계는 이전 단계의 출력을 dependsOn 매핑으로 참조.
 * 한 단계 실패 시 즉시 중단.
 */
export async function executeCalcChain(steps: ChainStep[]): Promise<ChainResult> {
  const totalStart = Date.now();
  const results: ChainStepResult[] = [];
  const outputMap = new Map<string, Record<string, unknown>>();

  for (const step of steps) {
    const stepStart = Date.now();

    try {
      // 종속성 해소: 이전 단계 결과를 현재 입력에 주입
      const resolvedInputs = { ...step.inputs };

      if (step.dependsOn) {
        for (const [inputKey, ref] of Object.entries(step.dependsOn)) {
          const [prevStepId, outputField] = ref.split('.');
          const prevOutputs = outputMap.get(prevStepId);
          if (prevOutputs && outputField in prevOutputs) {
            resolvedInputs[inputKey] = prevOutputs[outputField];
          }
        }
      }

      // 계산기 조회 + 실행
      const entry = CALCULATOR_REGISTRY.get(step.calculatorId);
      if (!entry) {
        throw new Error(`계산기 "${step.calculatorId}" 미등록`);
      }

      const calcResult = entry.calculator(resolvedInputs);
      const outputs = typeof calcResult === 'object' && calcResult !== null
        ? calcResult as Record<string, unknown>
        : { result: calcResult };

      outputMap.set(step.id, outputs);

      results.push({
        stepId: step.id,
        calculatorId: step.calculatorId,
        success: true,
        outputs,
        durationMs: Date.now() - stepStart,
        standardRef: (outputs as { standardRef?: string }).standardRef,
      });
    } catch (err) {
      results.push({
        stepId: step.id,
        calculatorId: step.calculatorId,
        success: false,
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - stepStart,
      });

      return {
        success: false,
        steps: results,
        failedAt: step.id,
        totalDurationMs: Date.now() - totalStart,
        summary: {},
      };
    }
  }

  // 마지막 단계의 출력을 요약으로 사용
  const lastResult = results[results.length - 1];
  const summary = lastResult?.success ? lastResult.outputs : {};

  return {
    success: true,
    steps: results,
    totalDurationMs: Date.now() - totalStart,
    summary,
  };
}

// =========================================================================
// PART 3 — 프리셋 체인 빌더
// =========================================================================

/** 수배전반 검토 체인: 부하합계 → 변압기 → 단락전류 → 차단기 → 케이블 → 전압강하 */
export function buildSubstationReviewChain(
  inputs: {
    totalLoad_kW: number;
    demandFactor: number;
    powerFactor: number;
    voltage_V: number;
    cableLength_m: number;
    phase: '1' | '3';
  },
): ChainStep[] {
  return [
    {
      id: 'step-1-demand',
      calculatorId: 'max-demand',
      inputs: {
        loads: JSON.stringify([{ name: 'total', kW: inputs.totalLoad_kW, qty: 1, demandFactor: inputs.demandFactor }]),
        diversityFactor: 1.0,
        powerFactor: inputs.powerFactor,
      },
    },
    {
      id: 'step-2-transformer',
      calculatorId: 'transformer-capacity',
      inputs: {
        demandFactor: inputs.demandFactor,
        powerFactor: inputs.powerFactor,
        growthPercent: 20,
      },
      dependsOn: { totalLoad: 'step-1-demand.maxDemand_kW' },
    },
    {
      id: 'step-3-short-circuit',
      calculatorId: 'short-circuit',
      inputs: {
        secondaryVoltage: inputs.voltage_V,
        phase: inputs.phase,
      },
      dependsOn: {
        transformerKVA: 'step-2-transformer.selectedCapacity_kVA',
        impedancePercent: 'step-2-transformer.impedancePercent',
      },
    },
    {
      id: 'step-4-breaker',
      calculatorId: 'breaker-sizing',
      inputs: {
        voltage: inputs.voltage_V,
      },
      dependsOn: {
        loadCurrent: 'step-1-demand.maxDemand_A',
        shortCircuitCurrent: 'step-3-short-circuit.shortCircuitCurrent_kA',
      },
    },
    {
      id: 'step-5-cable',
      calculatorId: 'cable-sizing',
      inputs: {
        voltage: inputs.voltage_V,
        length: inputs.cableLength_m,
        conductor: 'Cu',
        insulation: 'XLPE',
        powerFactor: inputs.powerFactor,
        phase: inputs.phase,
      },
      dependsOn: { current: 'step-1-demand.maxDemand_A' },
    },
    {
      id: 'step-6-voltage-drop',
      calculatorId: 'voltage-drop',
      inputs: {
        voltage: inputs.voltage_V,
        length: inputs.cableLength_m,
        powerFactor: inputs.powerFactor,
        phase: inputs.phase,
        conductor: 'Cu',
      },
      dependsOn: {
        current: 'step-1-demand.maxDemand_A',
        cableSize: 'step-5-cable.selectedSize_mm2',
      },
    },
  ];
}
