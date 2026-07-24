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

/**
 * 로그 문자열에서 자격증명만 골라 지운다.
 *
 * `error` 와 `meta` 는 상류 예외 메시지·응답 본문을 그대로 받는 자리라
 * 공급자 키가 섞여 들어올 수 있다. 지금까지 유출이 없었던 것은 배선된 5개
 * 라우트가 그런 값을 안 넘겼기 때문이지 막는 장치가 있어서가 아니었다 —
 * 나머지 44개 라우트로 로깅을 넓히기 전에 계약을 먼저 건다.
 *
 * 접두사가 확실한 것만 지운다. 길이·엔트로피로 판단하면 이 저장소가 영수증으로
 * **의도적으로 남기는** SHA-256(64 hex)까지 삼켜 증거를 파괴한다. 과잉 마스킹은
 * 관측을 죽이는 또 다른 실패다.
 */
const SECRET_PATTERNS: RegExp[] = [
  /\b(sk-[A-Za-z0-9_-]{16,})/g,              // OpenAI
  /\b(sk_(?:live|test)_[A-Za-z0-9]{16,})/g,  // Stripe secret
  /\b(rk_(?:live|test)_[A-Za-z0-9]{16,})/g,  // Stripe restricted
  /\b(AIza[A-Za-z0-9_-]{20,})/g,             // Google / Gemini
  /\b(gsk_[A-Za-z0-9]{16,})/g,               // Groq
  /\b(xai-[A-Za-z0-9]{16,})/g,               // xAI
  /\b(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
  /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+)/g, // JWT
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
];

export function redactSecrets(value: string): string {
  let out = value;
  for (const re of SECRET_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, (m) => (/^bearer/i.test(m) ? 'Bearer [REDACTED]' : '[REDACTED]'));
  }
  return out;
}

function redactMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = typeof v === 'string' ? redactSecrets(v) : v;
  }
  return out;
}

/** 구조화된 JSON 로그를 stdout/stderr로 출력 (Vercel 자동 캡처) */
export function apiLog(entry: Omit<LogEntry, 'timestamp'>): void {
  const log: LogEntry = {
    ...entry,
    ...(entry.error !== undefined ? { error: redactSecrets(entry.error) } : {}),
    ...(entry.meta !== undefined ? { meta: redactMeta(entry.meta) } : {}),
    timestamp: new Date().toISOString(),
  };
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
