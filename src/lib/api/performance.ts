/**
 * Performance Monitoring Middleware
 * ----------------------------------
 * API 응답 시간 추적 + slow query 감지 + 메트릭 수집.
 *
 * 사용법:
 *   const perf = startPerf('calculate');
 *   // ... work ...
 *   perf.end({ calcId: 'voltage-drop' });
 */

import { log } from '@/lib/logger';

const SLOW_THRESHOLD_MS = 5000; // 5초 이상 = slow query

interface PerfContext {
  route: string;
  startTime: number;
  /** 작업 완료 + 로깅 */
  end: (meta?: Record<string, unknown>) => number;
  /** 중간 체크포인트 */
  checkpoint: (label: string) => void;
}

/** 성능 추적 시작 */
export function startPerf(route: string): PerfContext {
  const startTime = Date.now();
  const checkpoints: { label: string; elapsed: number }[] = [];

  return {
    route,
    startTime,
    checkpoint(label: string) {
      checkpoints.push({ label, elapsed: Date.now() - startTime });
    },
    end(meta?: Record<string, unknown>): number {
      const durationMs = Date.now() - startTime;
      const level = durationMs > SLOW_THRESHOLD_MS ? 'warn' : 'info';

      log[level]('perf', `${route} ${durationMs}ms${durationMs > SLOW_THRESHOLD_MS ? ' [SLOW]' : ''}`, {
        durationMs,
        checkpoints: checkpoints.length > 0 ? checkpoints : undefined,
        ...meta,
      });

      return durationMs;
    },
  };
}

/** API 응답 헤더에 성능 정보 추가 */
export function perfHeaders(durationMs: number): Record<string, string> {
  return {
    'X-Response-Time': `${durationMs}ms`,
    'Server-Timing': `total;dur=${durationMs}`,
  };
}
