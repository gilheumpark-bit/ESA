// ============================================================
// ESVA Saga Transaction Engine
// ============================================================
// AI 에이전트 파이프라인 중 오류 발생 시 보상 트랜잭션으로 안전 롤백.
// 각 단계에 execute + compensate 쌍을 정의하여
// 실패 시 역순으로 보상 실행.
// 원본: eh-universe-web/src/lib/noa/saga-transaction.ts

// ============================================================
// PART 1 — Types
// ============================================================

export interface SagaStep<T = unknown> {
  /** 단계 이름 (디버깅용) */
  name: string;
  /** 실행 함수 — 성공 시 결과 반환 */
  execute: () => Promise<T>;
  /** 보상 함수 — execute 성공 후 후속 단계 실패 시 호출 */
  compensate: (result: T) => Promise<void>;
}

export type SagaStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'COMPENSATING' | 'FAILED' | 'ROLLED_BACK';

export interface SagaResult {
  status: SagaStatus;
  completedSteps: string[];
  failedStep?: string;
  error?: string;
  /** 각 단계별 결과 */
  stepResults: Map<string, unknown>;
  /** 전체 소요 시간 (ms) */
  durationMs: number;
}

export interface SagaAuditEntry {
  timestamp: number;
  sagaId: string;
  status: SagaStatus;
  steps: string[];
  failedStep?: string;
  error?: string;
}

// ============================================================
// PART 2 — Saga Orchestrator
// ============================================================

let _sagaCounter = 0;

export class SagaOrchestrator {
  private steps: SagaStep[] = [];
  private auditLog: SagaAuditEntry[] = [];
  private readonly sagaId: string;

  constructor(name = 'unnamed') {
    this.sagaId = `saga-${name}-${++_sagaCounter}-${Date.now()}`;
  }

  /** 단계 추가 (execute + compensate 쌍) */
  addStep<T>(step: SagaStep<T>): this {
    this.steps.push(step as SagaStep);
    return this;
  }

  /** Saga 실행 — 실패 시 역순 보상 */
  async execute(): Promise<SagaResult> {
    const start = Date.now();
    const completedSteps: string[] = [];
    const stepResults = new Map<string, unknown>();
    const compensations: Array<() => Promise<void>> = [];

    for (const step of this.steps) {
      try {
        const result = await step.execute();
        completedSteps.push(step.name);
        stepResults.set(step.name, result);
        compensations.push(() => step.compensate(result));
      } catch (err) {
        const failedStep = step.name;
        const errorMsg = err instanceof Error ? err.message : String(err);

        this.recordAudit('COMPENSATING', completedSteps, failedStep, errorMsg);

        // 역순 보상
        for (let i = compensations.length - 1; i >= 0; i--) {
          try {
            await compensations[i]();
          } catch (compErr) {
            console.error(`[SAGA] Compensation failed for step ${completedSteps[i]}:`, compErr);
          }
        }

        const result: SagaResult = {
          status: 'ROLLED_BACK',
          completedSteps,
          failedStep,
          error: errorMsg,
          stepResults,
          durationMs: Date.now() - start,
        };
        this.recordAudit('ROLLED_BACK', completedSteps, failedStep, errorMsg);
        return result;
      }
    }

    const result: SagaResult = {
      status: 'COMPLETED',
      completedSteps,
      stepResults,
      durationMs: Date.now() - start,
    };
    this.recordAudit('COMPLETED', completedSteps);
    return result;
  }

  private recordAudit(status: SagaStatus, steps: string[], failedStep?: string, error?: string): void {
    this.auditLog.push({
      timestamp: Date.now(),
      sagaId: this.sagaId,
      status,
      steps: [...steps],
      failedStep,
      error,
    });
  }

  getAuditLog(): readonly SagaAuditEntry[] {
    return this.auditLog;
  }

  getId(): string {
    return this.sagaId;
  }
}

// ============================================================
// PART 3 — ESVA 계산 파이프라인용 Saga 빌더
// ============================================================

/** ESVA 계산 검증 Saga: 입력추출 → 법규조회 → 계산 → 검증 */
export function createCalcVerifySaga(config: {
  /** 입력 파라미터 추출 */
  extractParams: () => Promise<Record<string, number>>;
  /** KEC 법규 기준값 조회 */
  lookupStandard: (params: Record<string, number>) => Promise<Record<string, number>>;
  /** 확정적 계산 실행 */
  calculate: (params: Record<string, number>, standards: Record<string, number>) => Promise<{ result: number; unit: string }>;
  /** 결과 범위 검증 (물리법칙 가드레일) */
  verify: (result: { result: number; unit: string }) => Promise<boolean>;
}): SagaOrchestrator {
  const saga = new SagaOrchestrator('calc-verify');

  let params: Record<string, number> = {};
  let standards: Record<string, number> = {};

  saga.addStep({
    name: 'extract-params',
    execute: async () => {
      params = await config.extractParams();
      return params;
    },
    compensate: async () => { /* 추출은 부작용 없음 */ },
  });

  saga.addStep({
    name: 'lookup-standard',
    execute: async () => {
      standards = await config.lookupStandard(params);
      return standards;
    },
    compensate: async () => { /* 조회는 부작용 없음 */ },
  });

  saga.addStep({
    name: 'calculate',
    execute: async () => {
      return await config.calculate(params, standards);
    },
    compensate: async () => { /* 순수함수 — 롤백 불필요 */ },
  });

  saga.addStep({
    name: 'verify',
    execute: async () => {
      const calcResult = saga['steps'][2] as unknown;
      const valid = await config.verify(calcResult as { result: number; unit: string });
      if (!valid) throw new Error('ESVA-4099: 계산 결과가 물리적 허용 범위를 초과하여 검증 실패');
      return valid;
    },
    compensate: async () => { /* 검증 실패 시 이전 단계로 롤백됨 */ },
  });

  return saga;
}
