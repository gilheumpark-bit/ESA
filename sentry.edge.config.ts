// ============================================================
// Sentry — Edge runtime config (middleware / edge routes)
// ============================================================
// DSN-gated: only initializes when SENTRY_DSN is set.
// Lower sample rate than server since edge invocations are higher-volume.
// ============================================================

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.05,
    release: process.env.NEXT_PUBLIC_BUILD_ID,
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
  });
}
