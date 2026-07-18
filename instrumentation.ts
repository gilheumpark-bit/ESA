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
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
