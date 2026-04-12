// ============================================================
// ARI Engine — Adaptive Reliability Index + Circuit Breaker
// ============================================================
// BYOK 멀티 프로바이더 환경에서 AI 프로바이더 건강도 추적 및 자동 라우팅.
// EMA 기반 점수, 서킷 브레이커(closed/open/half-open) 상태 관리.
// 원본: eh-universe-web/packages/quill-engine/src/ari-engine.ts

// ============================================================
// PART 1 — Types
// ============================================================

export interface ARIState {
  provider: string;
  score: number;           // 0-100
  errorCount: number;
  successCount: number;
  lastErrorAt: number;
  circuitState: 'closed' | 'open' | 'half-open';
  circuitOpenedAt: number;
  halfOpenSuccessStreak: number;
  emaHistory: number[];    // last 10 scores
}

export interface ARIReport {
  providers: Array<{
    provider: string;
    score: number;
    circuitState: string;
    errorCount: number;
    successCount: number;
    available: boolean;
  }>;
  bestProvider: string | null;
  timestamp: number;
}

// ============================================================
// PART 2 — Constants
// ============================================================

const CIRCUIT_OPEN_THRESHOLD = 30;
const CIRCUIT_COOLDOWN_MS = 60_000;
const HALF_OPEN_SUCCESS_REQUIRED = 2;
const EMA_HISTORY_SIZE = 10;
const EMA_ALPHA = 0.3;
const LATENCY_GOOD_MS = 2_000;
const LATENCY_BAD_MS = 15_000;

// ============================================================
// PART 3 — ARI Manager
// ============================================================

function createDefaultState(provider: string): ARIState {
  return {
    provider,
    score: 70,
    errorCount: 0,
    successCount: 0,
    lastErrorAt: 0,
    circuitState: 'closed',
    circuitOpenedAt: 0,
    halfOpenSuccessStreak: 0,
    emaHistory: [70],
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export class ARIManager {
  private states: Map<string, ARIState> = new Map();

  private getState(provider: string): ARIState {
    let s = this.states.get(provider);
    if (!s) {
      s = createDefaultState(provider);
      this.states.set(provider, s);
    }
    return s;
  }

  /** AI 호출 결과 반영 (성공/실패 + 지연시간) */
  updateAfterCall(provider: string, success: boolean, latencyMs: number): void {
    const s = this.getState(provider);

    if (success) {
      s.successCount++;
      const latencyPenalty = this.calcLatencyPenalty(latencyMs);
      const rawDelta = 10 - latencyPenalty;
      const newRaw = clamp(s.score + rawDelta, 0, 100);
      s.score = this.applyEMA(s, newRaw);

      if (s.circuitState === 'half-open') {
        s.halfOpenSuccessStreak++;
        if (s.halfOpenSuccessStreak >= HALF_OPEN_SUCCESS_REQUIRED) {
          s.circuitState = 'closed';
          s.halfOpenSuccessStreak = 0;
        }
      }
    } else {
      s.errorCount++;
      s.lastErrorAt = Date.now();
      const newRaw = clamp(s.score - 20, 0, 100);
      s.score = this.applyEMA(s, newRaw);

      if (s.circuitState === 'half-open') {
        s.circuitState = 'open';
        s.circuitOpenedAt = Date.now();
        s.halfOpenSuccessStreak = 0;
      }

      if (s.circuitState === 'closed' && s.score < CIRCUIT_OPEN_THRESHOLD) {
        s.circuitState = 'open';
        s.circuitOpenedAt = Date.now();
      }
    }
  }

  /** 후보 중 가장 건강한 프로바이더 선택 */
  getBestProvider(candidates: string[]): string {
    if (candidates.length === 0) {
      throw new Error('No provider candidates supplied to getBestProvider');
    }

    for (const c of candidates) {
      this.tickCircuitBreaker(c);
    }

    const available = candidates
      .filter((c) => this.isAvailable(c))
      .sort((a, b) => this.getState(b).score - this.getState(a).score);

    if (available.length > 0) return available[0];

    const sorted = [...candidates].sort(
      (a, b) => this.getState(b).score - this.getState(a).score,
    );
    return sorted[0];
  }

  /** 프로바이더 사용 가능 여부 */
  isAvailable(provider: string): boolean {
    this.tickCircuitBreaker(provider);
    return this.getState(provider).circuitState !== 'open';
  }

  /** 전체 진단 리포트 */
  getReport(): ARIReport {
    const entries = Array.from(this.states.values()).map((s) => ({
      provider: s.provider,
      score: Math.round(s.score * 10) / 10,
      circuitState: s.circuitState,
      errorCount: s.errorCount,
      successCount: s.successCount,
      available: s.circuitState !== 'open',
    }));

    const available = entries.filter((e) => e.available);
    const best = available.length > 0
      ? available.reduce((a, b) => (a.score >= b.score ? a : b)).provider
      : null;

    return { providers: entries, bestProvider: best, timestamp: Date.now() };
  }

  /** 프로바이더 상태 초기화 */
  reset(provider: string): void {
    this.states.set(provider, createDefaultState(provider));
  }

  getScore(provider: string): number {
    return this.getState(provider).score;
  }

  getCircuitState(provider: string): 'closed' | 'open' | 'half-open' {
    this.tickCircuitBreaker(provider);
    return this.getState(provider).circuitState;
  }

  private calcLatencyPenalty(latencyMs: number): number {
    if (latencyMs <= LATENCY_GOOD_MS) return 0;
    if (latencyMs >= LATENCY_BAD_MS) return 8;
    return ((latencyMs - LATENCY_GOOD_MS) / (LATENCY_BAD_MS - LATENCY_GOOD_MS)) * 8;
  }

  private applyEMA(state: ARIState, newRaw: number): number {
    const history = state.emaHistory;
    const prev = history.length > 0 ? history[history.length - 1] : newRaw;
    const ema = EMA_ALPHA * newRaw + (1 - EMA_ALPHA) * prev;
    const clamped = clamp(ema, 0, 100);
    history.push(clamped);
    if (history.length > EMA_HISTORY_SIZE) history.shift();
    return clamped;
  }

  private tickCircuitBreaker(provider: string): void {
    const s = this.getState(provider);
    if (s.circuitState === 'open') {
      if (Date.now() - s.circuitOpenedAt >= CIRCUIT_COOLDOWN_MS) {
        s.circuitState = 'half-open';
        s.halfOpenSuccessStreak = 0;
      }
    }
  }
}

// ============================================================
// PART 4 — Singleton & Dynamic Router
// ============================================================

export const ariManager = new ARIManager();

/** 건강한 프로바이더로 동적 라우팅 */
export function routeToHealthiest(task: string, providers: string[]): string {
  if (providers.length === 0) {
    throw new Error(`routeToHealthiest: no providers for task "${task}"`);
  }
  if (providers.length === 1) return providers[0];
  return ariManager.getBestProvider(providers);
}
