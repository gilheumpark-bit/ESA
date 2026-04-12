// ============================================================
// ESVA Error Reporter — Lightweight client-side error tracking
// ============================================================
// Sends unhandled errors to /api/error-report (Vercel logs capture).
// No external service required. sendBeacon ensures delivery on unload.
// 원본: eh-universe-web/src/lib/error-reporter.ts

const MAX_REPORTS_PER_SESSION = 20;
let reportCount = 0;

interface ErrorReport {
  message: string;
  stack?: string;
  source?: string;
  url: string;
  userAgent: string;
  timestamp: string;
}

function sendReport(report: ErrorReport) {
  if (reportCount >= MAX_REPORTS_PER_SESSION) return;
  reportCount++;

  const payload = JSON.stringify(report);
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/error-report', payload);
  } else {
    fetch('/api/error-report', {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    }).catch(() => { /* best-effort */ });
  }
}

let _initialized = false;

/** 에러 리포터 초기화. cleanup 함수 반환. 중복 초기화 방지. */
export function initErrorReporter(): (() => void) | undefined {
  if (typeof window === 'undefined' || _initialized) return;
  _initialized = true;

  const onError = (event: ErrorEvent) => {
    sendReport({
      message: event.message || 'Unknown error',
      stack: event.error?.stack?.slice(0, 500),
      source: `${event.filename}:${event.lineno}:${event.colno}`,
      url: window.location.pathname,
      userAgent: navigator.userAgent.slice(0, 100),
      timestamp: new Date().toISOString(),
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    sendReport({
      message: reason?.message || String(reason).slice(0, 200),
      stack: reason?.stack?.slice(0, 500),
      source: 'unhandledrejection',
      url: window.location.pathname,
      userAgent: navigator.userAgent.slice(0, 100),
      timestamp: new Date().toISOString(),
    });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    _initialized = false;
  };
}
