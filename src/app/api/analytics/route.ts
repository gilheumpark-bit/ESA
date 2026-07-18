// ============================================================
// /api/analytics — Client telemetry ingestion endpoint
// ============================================================
// Receives batched AnalyticsEvent[] from `lib/analytics.ts` (sendBeacon).
// Logs to stdout → Vercel captures into queryable logs.
//
// Wired in R4-mapping audit (2026-05-12): lib/analytics.ts:106 was beaconing
// to a 404. The buffer/localStorage fallback already covered the data loss,
// but the server-side aggregation hook was missing.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { apiLog } from '@/lib/api-logger';

// Body cap — analytics beacons should be tiny (event batch ≤ 50 events × ~200 bytes ≈ 10KB).
// Match `/api/error-report` and `/api/vitals` (both unauthenticated public beacons).
const MAX_REQUEST_SIZE = 10_000;

// Allowed event categories (mirrors `EventCategory` in lib/analytics.ts).
// Used to validate payloads server-side so we don't ingest arbitrary strings.
const ALLOWED_CATEGORIES = new Set([
  'calc', 'search', 'sld', 'report', 'nav', 'auth', 'export', 'error', 'engagement',
]);

interface RawEvent {
  category?: unknown;
  action?: unknown;
  label?: unknown;
  value?: unknown;
  metadata?: unknown;
  timestamp?: unknown;
  sessionId?: unknown;
  variant?: unknown;
}

interface IngestedEvent {
  category: string;
  action: string;
  label: string | null;
  value: number | null;
  timestamp: number;
  sessionId: string;
}

/**
 * Validate and normalize a single event.
 * Drops events with unknown category or missing required fields.
 */
function sanitizeEvent(raw: RawEvent): IngestedEvent | null {
  const category = typeof raw.category === 'string' ? raw.category : '';
  if (!ALLOWED_CATEGORIES.has(category)) return null;

  const action = typeof raw.action === 'string' && raw.action.length > 0 && raw.action.length <= 100
    ? raw.action
    : null;
  if (!action) return null;

  const sessionId = typeof raw.sessionId === 'string' && raw.sessionId.length > 0 && raw.sessionId.length <= 64
    ? raw.sessionId
    : null;
  if (!sessionId) return null;

  const timestamp = typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp)
    ? raw.timestamp
    : Date.now();

  const label = typeof raw.label === 'string' && raw.label.length <= 200 ? raw.label : null;
  const value = typeof raw.value === 'number' && Number.isFinite(raw.value) ? raw.value : null;

  return { category, action, label, value, timestamp, sessionId };
}

export async function POST(req: NextRequest) {
  // Same-origin guard — unauthenticated public beacon must reject cross-origin.
  const origin = req.headers.get('origin') || req.headers.get('referer') || '';
  const host = req.headers.get('host') || '';
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return new NextResponse(null, { status: 403 });
      }
    } catch {
      return new NextResponse(null, { status: 403 });
    }
  }

  const ip = getClientIp(req.headers);

  const rl = checkRateLimit(ip, 'default');
  if (!rl.allowed) {
    return new NextResponse(null, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfter ?? 60) },
    });
  }

  try {
    const raw = await req.text();
    if (raw.length > MAX_REQUEST_SIZE) {
      return NextResponse.json({ error: 'body_too_large' }, { status: 413 });
    }

    const body = JSON.parse(raw) as { events?: RawEvent[] };
    if (!Array.isArray(body.events)) {
      return new NextResponse(null, { status: 400 });
    }

    // Cap the batch — clients shouldn't send more than 50 per beacon.
    const events = body.events.slice(0, 50).map(sanitizeEvent).filter((e): e is IngestedEvent => e !== null);

    // Log each event as a structured stdout line (Vercel captures into searchable logs).
    for (const e of events) {
      apiLog({
        level: 'info',
        event: 'client_telemetry',
        route: '/api/analytics',
        ip,
        meta: {
          category: e.category,
          action: e.action,
          label: e.label,
          value: e.value,
          ts: e.timestamp,
          sessionId: e.sessionId,
        },
      });
    }

    // 204 No Content — sendBeacon doesn't read the response anyway.
    return new NextResponse(null, { status: 204 });
  } catch {
    // Silent — telemetry must never throw to the client.
    return new NextResponse(null, { status: 400 });
  }
}

// IDENTITY_SEAL: PART-1 | role=analytics ingestion | inputs=event batch | outputs=structured logs
