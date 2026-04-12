// ============================================================
// ESVA API Logger — Structured JSON logging for API routes
// ============================================================
// Vercel captures stdout as structured logs automatically.
// 원본: eh-universe-web/src/lib/api-logger.ts

interface LogEntry {
  level: 'info' | 'warn' | 'error';
  event: string;
  route: string;
  ip?: string;
  provider?: string;
  model?: string;
  requestId?: string;
  durationMs?: number;
  status?: number;
  error?: string;
  /** ESVA 확장: 계산기 ID, 법규 조항 등 */
  meta?: Record<string, unknown>;
  timestamp: string;
}

/** 구조화된 JSON 로그를 stdout/stderr로 출력 (Vercel 자동 캡처) */
export function apiLog(entry: Omit<LogEntry, 'timestamp'>): void {
  const log: LogEntry = { ...entry, timestamp: new Date().toISOString() };
  if (entry.level === 'error') {
    console.error(JSON.stringify(log));
  } else {
    console.log(JSON.stringify(log));
  }
}

/** API 라우트 소요 시간 측정 타이머 */
export function createRequestTimer() {
  const start = Date.now();
  return {
    elapsed: () => Date.now() - start,
  };
}
