/** 에러 리포터 — 프로덕션 환경에서 클라이언트 에러 수집 */
export function initErrorReporter(): (() => void) | undefined {
  if (typeof window === 'undefined') return undefined;
  const handler = (e: ErrorEvent) => {
    console.error('[ESVA Error]', e.message, e.filename, e.lineno);
  };
  window.addEventListener('error', handler);
  return () => window.removeEventListener('error', handler);
}
