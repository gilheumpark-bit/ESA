// ============================================================
// Sentry — Client (browser) runtime config
// ============================================================
// DSN-gated: only initializes when NEXT_PUBLIC_SENTRY_DSN is set.
// Without DSN, Sentry SDK becomes a no-op (captureException still callable).
// This is the missing piece that wires lib/logger.ts:reportError() → live Sentry.
// ============================================================

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Lower traces sample rate in production to control cost; full sampling in dev.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Send release tag so issues are bucketed per deploy.
    release: process.env.NEXT_PUBLIC_BUILD_ID,
    environment: process.env.NODE_ENV,
    // PII scrubbing — never send raw user input strings as bag-of-words.
    sendDefaultPii: false,
  });
}
