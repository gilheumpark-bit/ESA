// ============================================================
// Next.js instrumentation hook — registers runtime config
// ============================================================
// Called once at boot per runtime. Routes to the correct Sentry config
// based on NEXT_RUNTIME so we don't bundle Node-specific code into edge
// and vice versa.
//
// DSN-gating inside each config keeps this safe to ship with no env var.
// ============================================================

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    // 부팅 시 1회 환경변수 계약 확인. 배포를 막지 않고 누락된 키 '이름'만 남긴다.
    // 값은 절대 기록하지 않는다.
    try {
      const { validateEnv } = await import('./src/lib/env');
      const result = validateEnv();
      if (!result.valid) {
        console.error(`[ESVA env] 필수 환경변수 누락: ${result.missing.join(', ')}`);
      }
    } catch (error) {
      console.error(
        '[ESVA env] 환경변수 검증을 실행하지 못했습니다:',
        error instanceof Error ? error.message : 'unknown',
      );
    }
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
