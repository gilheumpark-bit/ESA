/**
 * ESVA CORS Middleware Helper
 * ──────────────────────────
 * Route-aware CORS handling for API endpoints.
 *
 * PART 1: Origin configuration
 * PART 2: Route policies
 * PART 3: handleCORS (preflight) & addCORSHeaders
 */

import { getOptionalEnv } from '@/lib/env';

// ─── PART 1: Origin Configuration ───────────────────────────────

function getAllowedOrigins(): string[] {
  const raw = getOptionalEnv('NEXT_PUBLIC_ALLOWED_ORIGINS');
  if (!raw) {
    const appUrl = getOptionalEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')!;
    return [appUrl];
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export const ALLOWED_ORIGINS: string[] = getAllowedOrigins();

// ─── PART 2: Route Policies ─────────────────────────────────────

/** Routes that allow cross-origin requests. */
const CROSS_ORIGIN_ROUTES = [
  '/api/calculate',
  '/api/convert',
  '/api/autocomplete',
];

/** Routes restricted to same-origin only. */
const SAME_ORIGIN_ROUTES = [
  '/api/chat',
  '/api/checkout',
];

function isCrossOriginAllowed(pathname: string): boolean {
  return CROSS_ORIGIN_ROUTES.some((route) => pathname.startsWith(route));
}

function isSameOriginOnly(pathname: string): boolean {
  return SAME_ORIGIN_ROUTES.some((route) => pathname.startsWith(route));
}

function isOriginAllowed(origin: string): boolean {
  return ALLOWED_ORIGINS.includes(origin);
}

// ─── PART 3: handleCORS & addCORSHeaders ────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  'Access-Control-Max-Age': '86400',
};

/**
 * Handle OPTIONS preflight requests.
 * Returns a Response if this is a preflight request, or null otherwise.
 */
export function handleCORS(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;

  const origin = request.headers.get('Origin') ?? '';
  const url = new URL(request.url);

  // Same-origin routes: deny cross-origin preflight
  if (isSameOriginOnly(url.pathname) && origin && !isOriginAllowed(origin)) {
    return new Response(null, { status: 403 });
  }

  const allowOrigin = resolveAllowOrigin(url.pathname, origin);

  return new Response(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      'Access-Control-Allow-Origin': allowOrigin,
    },
  });
}

/**
 * Add CORS headers to an existing response based on the request.
 */
export function addCORSHeaders(response: Response, request: Request): Response {
  const origin = request.headers.get('Origin') ?? '';
  const url = new URL(request.url);

  // Same-origin routes: no cross-origin headers if origin is not allowed
  if (isSameOriginOnly(url.pathname) && origin && !isOriginAllowed(origin)) {
    return response;
  }

  const allowOrigin = resolveAllowOrigin(url.pathname, origin);

  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowOrigin);
  headers.set('Access-Control-Allow-Methods', CORS_HEADERS['Access-Control-Allow-Methods']);
  headers.set('Access-Control-Allow-Headers', CORS_HEADERS['Access-Control-Allow-Headers']);

  // Vary on Origin to avoid cache poisoning
  headers.set('Vary', 'Origin');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function resolveAllowOrigin(pathname: string, origin: string): string {
  // Cross-origin routes: reflect the origin if it's in the allowed list, else '*'
  if (isCrossOriginAllowed(pathname)) {
    return origin && isOriginAllowed(origin) ? origin : '*';
  }

  // Default: reflect if allowed, else same-origin only
  if (origin && isOriginAllowed(origin)) {
    return origin;
  }
  return ALLOWED_ORIGINS[0] ?? '*';
}
