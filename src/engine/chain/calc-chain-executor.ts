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
import { CALCULATOR_PARAMS } from '@/lib/calculator-params';
import { coerceCalculatorInput } from '@/lib/calc-intent-bridge';

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
          if (!prevOutputs) {
            throw new Error(`"${step.id}" 가 참조한 단계 "${prevStepId}" 의 결과가 없다`);
          }
          const value = readOutput(prevOutputs, outputField);
          if (value === undefined) {
            throw new Error(`"${prevStepId}" 결과에 "${outputField}" 가 없다`);
          }
          resolvedInputs[inputKey] = value;
        }
      }

      // 계산기 조회 + 실행
      const entry = CALCULATOR_REGISTRY.get(step.calculatorId);
      if (!entry) {
        throw new Error(`계산기 "${step.calculatorId}" 미등록`);
      }

      // 폼·chat 과 같은 변환기를 쓴다. 이걸 건너뛰고 계산기를 직접 부르면
      // 기본값이 안 채워져 "efficiency must be between 0.01 and 1, got undefined"
      // 처럼 죽는다 — 체인이 한 번도 실행된 적 없던 이유 중 하나다(실측 2026-07-26).
      const { input: coerced, invalid } = coerceCalculatorInput(
        CALCULATOR_PARAMS[step.calculatorId] ?? [],
        resolvedInputs,
      );
      if (invalid.length > 0) {
        throw new Error(`입력을 숫자로 읽지 못했다: ${invalid.join(', ')}`);
      }

      const calcResult = entry.calculator(coerced);
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

/**
 * 앞 단계 결과에서 값을 꺼낸다.
 *
 * 계산기 결과는 `{ value, unit, additionalOutputs: { key: { value, unit } } }`
 * 모양이라, 최상위 키만 보면 부가 출력을 하나도 못 읽는다 — 체인의 dependsOn
 * 참조가 전부 조용히 빈손으로 돌아갔다(실측 2026-07-26). 최상위 → 부가 출력
 * 순으로 찾고, `{ value }` 로 감싸인 것은 벗겨서 준다.
 */
function readOutput(outputs: Record<string, unknown>, field: string): unknown {
  if (field in outputs) return unwrap(outputs[field]);
  const additional = outputs.additionalOutputs;
  if (additional && typeof additional === 'object' && field in additional) {
    return unwrap((additional as Record<string, unknown>)[field]);
  }
  return undefined;
}

function unwrap(value: unknown): unknown {
  if (value && typeof value === 'object' && 'value' in value) {
    return (value as { value: unknown }).value;
  }
  return value;
}

// =========================================================================
// PART 3 — 프리셋 체인 빌더
// =========================================================================

/**
 * 수배전 검토 체인: 부하합계·변압기 선정 → 단락전류 → 차단기 → 케이블 → 전압강하.
 *
 * 앞선 판(2026-07-26 이전)은 한 번도 실행된 적이 없었다. 호출처 0·테스트 0 인
 * 채로 다른 계산기 API 를 상대로 쓰여 있어서, 돌려 보면 1단계에서 즉사했다
 * (`loads` 항목을 `kW` 라 썼는데 계산기는 `ratedPower` 를 받는다). 그 아래
 * 단계도 `growthPercent`↔`growthMargin`, `secondaryVoltage`↔`systemVoltage`,
 * `transformerKVA`↔`transformerCapacity` 로 전부 어긋나 있었다.
 *
 * 이번 판은 각 계산기를 **실제로 돌려 얻은 입출력 이름**으로만 엮는다.
 *
 * 시작점을 substation-capacity 로 바꿨다. 앞선 판은 max-demand → 
 * transformer-capacity 로 열었는데, 그 둘 중 어느 쪽도 **전류**를 내주지 않아
 * 뒤의 차단기·케이블·전압강하가 쓸 부하전류가 사슬에 없었다. substation-capacity
 * 는 부하합계·변압기 선정·모선 정격전류를 한 번에 낸다(실측: 부하 500kW·수용률
 * 0.7 → 486.11kVA · transformerSize 500kVA · busRating 738.6A ·
 * incomingCurrent 12.3A. 486110/(√3×380)=738.6, /(√3×22900)=12.3 로 확인).
 */
export function buildSubstationReviewChain(
  inputs: {
    totalLoad_kW: number;
    demandFactor: number;
    powerFactor: number;
    /** 2차(부하) 전압. 차단기·케이블·전압강하가 이 전압을 쓴다. */
    voltage_V: number;
    cableLength_m: number;
    /** 1차 수전 전압. 생략하면 substation-capacity 기본값(22.9kV). */
    systemVoltage_V?: number;
  },
): ChainStep[] {
  return [
    {
      id: 'step-1-substation',
      calculatorId: 'substation-capacity',
      inputs: {
        loads: [{
          name: '전체',
          kW: inputs.totalLoad_kW,
          pf: inputs.powerFactor,
          demandFactor: inputs.demandFactor,
        }],
        secondaryVoltage: inputs.voltage_V,
        ...(inputs.systemVoltage_V === undefined ? {} : { systemVoltage: inputs.systemVoltage_V }),
      },
    },
    {
      id: 'step-2-short-circuit',
      calculatorId: 'short-circuit',
      inputs: {
        systemVoltage: inputs.voltage_V,
        cableLength: inputs.cableLength_m,
      },
      dependsOn: { transformerCapacity: 'step-1-substation.transformerSize' },
    },
    {
      id: 'step-3-breaker',
      calculatorId: 'breaker-sizing',
      inputs: { voltage: inputs.voltage_V },
      dependsOn: {
        loadCurrent: 'step-1-substation.busRating',
        shortCircuitCurrent: 'step-2-short-circuit.shortCircuitCurrent_kA',
      },
    },
    {
      id: 'step-4-cable',
      calculatorId: 'cable-sizing',
      inputs: {
        voltage: inputs.voltage_V,
        length: inputs.cableLength_m,
        powerFactor: inputs.powerFactor,
      },
      dependsOn: { current: 'step-1-substation.busRating' },
    },
    {
      id: 'step-5-voltage-drop',
      calculatorId: 'voltage-drop',
      inputs: {
        voltage: inputs.voltage_V,
        length: inputs.cableLength_m,
        powerFactor: inputs.powerFactor,
      },
      dependsOn: {
        current: 'step-1-substation.busRating',
        // cable-sizing 의 대표값이 선정 굵기다(additionalOutputs.minimumSize 와 같은 값).
        cableSize: 'step-4-cable.value',
      },
    },
  ];
}
