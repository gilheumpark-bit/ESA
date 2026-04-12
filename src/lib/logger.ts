/**
 * ESVA Logger + Error Reporter
 * ─────────────────────────────
 * Unified logging with structured JSON (production) / pretty-print (dev).
 * Optional Sentry integration for error reporting.
 *
 * PART 1: Log level configuration
 * PART 2: Structured logger
 * PART 3: Error reporter
 */

// ─── PART 1: Log Level Configuration ─────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

function getConfiguredLevel(): LogLevel {
  if (typeof process === 'undefined') return 'info';
  const envLevel = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (envLevel in LEVEL_PRIORITY) return envLevel as LogLevel;
  return 'info';
}

const IS_PROD =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getConfiguredLevel()];
}

// ─── PART 2: Structured Logger ───────────────────────────────────

interface LogEntry {
  level: LogLevel;
  ctx: string;
  msg: string;
  ts: string;
  data?: unknown;
}

function formatEntry(entry: LogEntry): string {
  if (IS_PROD) {
    // Structured JSON for production log aggregators
    return JSON.stringify({
      level: entry.level,
      ctx: entry.ctx,
      msg: entry.msg,
      ts: entry.ts,
      ...(entry.data !== undefined ? { data: entry.data } : {}),
    });
  }
  // Pretty-print for dev
  const prefix = entry.ctx ? `[${entry.ctx}]` : '';
  return `${entry.level.toUpperCase()} ${prefix} ${entry.msg}`;
}

function emit(level: LogLevel, ctx: string, msg: string, data?: unknown): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    ctx,
    msg,
    ts: new Date().toISOString(),
    data,
  };

  const formatted = formatEntry(entry);

  switch (level) {
    case 'debug':
      console.debug(formatted, ...(IS_PROD || data === undefined ? [] : [data]));
      break;
    case 'info':
      console.log(formatted, ...(IS_PROD || data === undefined ? [] : [data]));
      break;
    case 'warn':
      console.warn(formatted, ...(IS_PROD || data === undefined ? [] : [data]));
      break;
    case 'error':
      console.error(formatted, ...(IS_PROD || data === undefined ? [] : [data]));
      break;
    case 'fatal':
      console.error(formatted, ...(IS_PROD || data === undefined ? [] : [data]));
      break;
  }
}

export const log = {
  debug(ctx: string, msg: string, data?: unknown): void {
    emit('debug', ctx, msg, data);
  },
  info(ctx: string, msg: string, data?: unknown): void {
    emit('info', ctx, msg, data);
  },
  warn(ctx: string, msg: string, data?: unknown): void {
    emit('warn', ctx, msg, data);
  },
  error(ctx: string, msg: string, data?: unknown): void {
    emit('error', ctx, msg, data);
  },
  fatal(ctx: string, msg: string, data?: unknown): void {
    emit('fatal', ctx, msg, data);
  },
};

/** 도메인별 자식 로거 — ctx 자동 주입 */
export function createLogger(ctx: string) {
  return {
    debug: (msg: string, data?: unknown) => log.debug(ctx, msg, data),
    info: (msg: string, data?: unknown) => log.info(ctx, msg, data),
    warn: (msg: string, data?: unknown) => log.warn(ctx, msg, data),
    error: (msg: string, data?: unknown) => log.error(ctx, msg, data),
    fatal: (msg: string, data?: unknown) => log.fatal(ctx, msg, data),
  };
}

// ─── PART 3: Error Reporter ──────────────────────────────────────

interface ErrorContext {
  /** Where the error occurred (e.g., 'search-api', 'calculator') */
  source?: string;
  /** Additional metadata */
  extra?: Record<string, unknown>;
  /** User ID if available */
  userId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sentryCaptureException: ((err: unknown, ctx?: any) => string) | null = null;
let sentryInitAttempted = false;

async function ensureSentry(): Promise<boolean> {
  if (sentryInitAttempted) return sentryCaptureException !== null;
  sentryInitAttempted = true;

  try {
    const mod = await import('@sentry/nextjs');
    if (typeof mod.captureException === 'function') {
      sentryCaptureException = mod.captureException;
    }
  } catch {
    // Sentry not available — silent fallback
  }
  return sentryCaptureException !== null;
}

/**
 * Report an error to Sentry if configured, else console.error.
 * Non-blocking: errors in reporting itself are swallowed.
 */
export async function reportError(
  error: unknown,
  context?: ErrorContext,
): Promise<void> {
  // Always log to console
  const errMsg =
    error instanceof Error ? error.message : String(error);
  log.error(context?.source ?? 'unknown', errMsg, {
    stack: error instanceof Error ? error.stack : undefined,
    ...context?.extra,
  });

  // Try Sentry
  try {
    const hasSentry = await ensureSentry();
    if (hasSentry && sentryCaptureException) {
      sentryCaptureException(error, {
        tags: { source: context?.source },
        extra: { ...context?.extra, userId: context?.userId },
      });
    }
  } catch {
    // Reporting failure is non-fatal
  }
}

export default log;
