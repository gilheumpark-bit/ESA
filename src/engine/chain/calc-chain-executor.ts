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
          // ref 형식: "stepId.field" 또는 "stepId.additionalOutputs.key.value" 등 점(.) 경로 지원
          const segments = ref.split('.');
          const prevStepId = segments[0];
          const path = segments.slice(1);
          const prevOutputs = outputMap.get(prevStepId);

          // 실패 경로 명시화: 조용히 누락시키지 않고 오류를 던져 잘못된 배선을 즉시 노출한다.
          if (!prevOutputs) {
            throw new Error(`dependsOn "${inputKey}" references unknown step "${prevStepId}"`);
          }

          // 점 경로를 따라 중첩 출력(additionalOutputs.key.value 등)까지 탐색
          let cursor: unknown = prevOutputs;
          for (const seg of path) {
            if (cursor !== null && typeof cursor === 'object' && seg in (cursor as Record<string, unknown>)) {
              cursor = (cursor as Record<string, unknown>)[seg];
            } else {
              throw new Error(`step "${prevStepId}" has no output field "${path.join('.')}"`);
            }
          }
          resolvedInputs[inputKey] = cursor;
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

/**
 * 수배전반 검토 체인: 부하합계 → 변압기 → 케이블 → 단락전류 → 차단기 → 전압강하
 *
 * 각 스텝은 실제 계산기 계약(입력/출력 필드명)에 정확히 맞춘다.
 * 어떤 계산기도 전력→전류(kW→A)를 유도하지 않으므로, 설계전류는 빌드 시점에
 * 3상/단상 전력식으로 산출하여 전류가 필요한 스텝에 리터럴로 주입한다.
 *   3상: I = P×1000 / (√3 × V × pf),  단상: I = P×1000 / (V × pf)
 */
export function buildSubstationReviewChain(
  inputs: {
    totalLoad_kW: number;
    demandFactor: number;
    powerFactor: number;
    voltage_V: number;
    cableLength_m: number;
    phase: '1' | '3';
    /** 변압기 임피던스(%) — 변압기 계산기는 %Z를 산출하지 않으므로 설계값을 지정. 기본 5% */
    impedancePercent?: number;
    /** 변압기 효율 — 필수 입력. 기본 0.98 */
    efficiency?: number;
  },
): ChainStep[] {
  const isThreePhase = inputs.phase === '3';
  const phaseNum: 1 | 3 = isThreePhase ? 3 : 1;
  const impedancePercent = inputs.impedancePercent ?? 5;
  const efficiency = inputs.efficiency ?? 0.98;

  // 빌드 시점 설계전류 산출 (kW→A 유도 계산기가 없으므로 리터럴로 주입)
  const demandLoad_kW = inputs.totalLoad_kW * inputs.demandFactor;
  const current_A = isThreePhase
    ? (demandLoad_kW * 1000) / (Math.sqrt(3) * inputs.voltage_V * inputs.powerFactor)
    : (demandLoad_kW * 1000) / (inputs.voltage_V * inputs.powerFactor);

  return [
    {
      // 부하합계: value = 수요부하(kW, 수용률 반영)
      id: 'step-1-demand',
      calculatorId: 'max-demand',
      inputs: {
        loads: [
          { name: 'total', ratedPower: inputs.totalLoad_kW, demandFactor: inputs.demandFactor },
        ],
        diversityFactor: 1.0,
      },
    },
    {
      // 변압기 용량: step-1 value는 이미 수요부하이므로 demandFactor=1.0로 이중 감쇠 방지
      id: 'step-2-transformer',
      calculatorId: 'transformer-capacity',
      inputs: {
        powerFactor: inputs.powerFactor,
        efficiency,
        demandFactor: 1.0,
        growthMargin: 0.2,
      },
      dependsOn: { totalLoad: 'step-1-demand.value' },
    },
    {
      // 케이블 선정: value = 선정 굵기(mm²). 설계전류는 리터럴 주입
      id: 'step-3-cable',
      calculatorId: 'cable-sizing',
      inputs: {
        current: current_A,
        voltage: inputs.voltage_V,
        length: inputs.cableLength_m,
        conductor: 'Cu',
        insulation: 'XLPE',
        powerFactor: inputs.powerFactor,
        phase: phaseNum,
      },
    },
    {
      // 단락전류: 변압기 표준용량(additionalOutputs.selectedStandard.value) + 선정 케이블 굵기 참조
      id: 'step-4-short-circuit',
      calculatorId: 'short-circuit',
      inputs: {
        systemVoltage: inputs.voltage_V,
        impedancePercent,
        cableLength: inputs.cableLength_m,
        conductor: 'Cu',
      },
      dependsOn: {
        transformerCapacity: 'step-2-transformer.additionalOutputs.selectedStandard.value',
        cableSize: 'step-3-cable.value',
      },
    },
    {
      // 차단기: 설계전류 리터럴 + 단락전류(kA) + 케이블 보정 허용전류로 협조 검토
      id: 'step-5-breaker',
      calculatorId: 'breaker-sizing',
      inputs: {
        loadCurrent: current_A,
        voltage: inputs.voltage_V,
      },
      dependsOn: {
        shortCircuitCurrent: 'step-4-short-circuit.value',
        cableAmpacity: 'step-3-cable.additionalOutputs.correctedAmpacity.value',
      },
    },
    {
      // 전압강하: 선정 케이블 굵기 참조 + 설계전류 리터럴
      id: 'step-6-voltage-drop',
      calculatorId: 'voltage-drop',
      inputs: {
        current: current_A,
        voltage: inputs.voltage_V,
        length: inputs.cableLength_m,
        powerFactor: inputs.powerFactor,
        phase: phaseNum,
        conductor: 'Cu',
      },
      dependsOn: {
        cableSize: 'step-3-cable.value',
      },
    },
  ];
}
