// ============================================================
// Sentry — Server (Node) runtime config
// ============================================================
// DSN-gated: only initializes when SENTRY_DSN is set.
// API routes + server components send errors here via logger.ts.
// ============================================================

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    release: process.env.NEXT_PUBLIC_BUILD_ID,
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
  });
}
