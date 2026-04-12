/**
 * Adaptive Sandbox Timeout
 *
 * Dynamically adjusts timeout per sandbox based on historical latency.
 * Prevents premature timeouts on slow sandboxes and tightens limits
 * for consistently fast ones.
 *
 * PART 1: Types & Constants
 * PART 2: Rolling window tracker
 * PART 3: Adaptive timeout calculation
 * PART 4: Stats export
 */

// ---------------------------------------------------------------------------
// PART 1 — Types & Constants
// ---------------------------------------------------------------------------

export interface SandboxStats {
  p50: number;
  p95: number;
  failures: number;
  adaptedTimeout: number;
  sampleCount: number;
}

interface LatencyRecord {
  ms: number;
  failed: boolean;
  timestamp: number;
}

const DEFAULT_TIMEOUT_MS = 3000;
const FAST_THRESHOLD_P95 = 1000;   // p95 < 1s → sandbox is fast
const SLOW_THRESHOLD_P95 = 2500;   // p95 > 2.5s → sandbox is slow
const FAST_TIMEOUT_MS = 2000;
const SLOW_TIMEOUT_MS = 5000;
const FAILURE_BUFFER_MS = 1000;
const ROLLING_WINDOW_SIZE = 100;

// ---------------------------------------------------------------------------
// PART 2 — Rolling Window Tracker
// ---------------------------------------------------------------------------

export class AdaptiveTimeout {
  private windows: Map<string, LatencyRecord[]> = new Map();

  /**
   * Record a response latency for a sandbox.
   * @param sandboxId - Unique sandbox identifier
   * @param ms - Response time in milliseconds
   * @param failed - Whether the request failed/timed out
   */
  recordLatency(sandboxId: string, ms: number, failed: boolean = false): void {
    let window = this.windows.get(sandboxId);
    if (!window) {
      window = [];
      this.windows.set(sandboxId, window);
    }

    window.push({ ms, failed, timestamp: Date.now() });

    // 윈도우 크기 제한
    if (window.length > ROLLING_WINDOW_SIZE) {
      window.shift();
    }
  }

  // ---------------------------------------------------------------------------
  // PART 3 — Adaptive Timeout Calculation
  // ---------------------------------------------------------------------------

  /**
   * Get the adapted timeout for a sandbox.
   *
   * Logic:
   * - Default: 3000ms
   * - If historically fast (p95 < 1s): reduce to 2000ms
   * - If historically slow (p95 > 2.5s): extend to 5000ms
   * - If recently failed: add 1000ms buffer
   */
  getTimeout(sandboxId: string): number {
    const window = this.windows.get(sandboxId);

    // 이력 없으면 기본값
    if (!window || window.length < 5) {
      return DEFAULT_TIMEOUT_MS;
    }

    const durations = window.filter((r) => !r.failed).map((r) => r.ms);
    if (durations.length === 0) {
      // 전부 실패: 최대 타임아웃 + 버퍼
      return SLOW_TIMEOUT_MS + FAILURE_BUFFER_MS;
    }

    const p95 = percentile(durations, 95);
    const recentFailures = this.countRecentFailures(window);

    let timeout: number;

    if (p95 < FAST_THRESHOLD_P95) {
      timeout = FAST_TIMEOUT_MS;
    } else if (p95 > SLOW_THRESHOLD_P95) {
      timeout = SLOW_TIMEOUT_MS;
    } else {
      timeout = DEFAULT_TIMEOUT_MS;
    }

    // 최근 실패가 있으면 버퍼 추가
    if (recentFailures > 0) {
      timeout += FAILURE_BUFFER_MS;
    }

    return timeout;
  }

  /** Count failures in the last 10 records */
  private countRecentFailures(window: LatencyRecord[]): number {
    const recent = window.slice(-10);
    return recent.filter((r) => r.failed).length;
  }

  // ---------------------------------------------------------------------------
  // PART 4 — Stats Export
  // ---------------------------------------------------------------------------

  /**
   * Get timeout statistics for all tracked sandboxes.
   */
  getTimeoutStats(): Map<string, SandboxStats> {
    const stats = new Map<string, SandboxStats>();

    for (const [sandboxId, window] of this.windows) {
      const durations = window.filter((r) => !r.failed).map((r) => r.ms);
      const failures = window.filter((r) => r.failed).length;

      stats.set(sandboxId, {
        p50: percentile(durations, 50),
        p95: percentile(durations, 95),
        failures,
        adaptedTimeout: this.getTimeout(sandboxId),
        sampleCount: window.length,
      });
    }

    return stats;
  }

  /** Reset all tracking data. Useful for tests. */
  reset(): void {
    this.windows.clear();
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/** Singleton instance for application-wide usage */
export const adaptiveTimeout = new AdaptiveTimeout();
