/**
 * ESVA In-Memory Sliding Window Rate Limiter
 * ------------------------------------------
 * No Redis required. Profiles for search, calculate, chat.
 * Lazy cleanup every 5 minutes.
 */

import { isIP } from 'node:net';

// ─── PART 1: Types & Config ──────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

export interface RateLimitProfile {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
}

export const RATE_LIMIT_PROFILES: Record<string, RateLimitProfile> = {
  search:     { maxRequests: 30, windowMs: 60_000 },
  calculate:  { maxRequests: 60, windowMs: 60_000 },
  chat:       { maxRequests: 20, windowMs: 60_000 },
  community:  { maxRequests: 30, windowMs: 60_000 },
  export:     { maxRequests: 10, windowMs: 60_000 },
  ocr:        { maxRequests: 10, windowMs: 60_000 },
  sld:        { maxRequests: 10, windowMs: 60_000 },
  // 한 작업을 페이지 단위로 체크포인트하는 내부 실행/재개 호출.
  // 작업 생성 자체는 위의 낮은 sld 한도를 계속 적용한다.
  'sld-job':  { maxRequests: 120, windowMs: 60_000 },
  'share-password': { maxRequests: 5, windowMs: 15 * 60_000 },
  dxf:        { maxRequests: 20, windowMs: 60_000 },
  notarize:   { maxRequests: 5,  windowMs: 60_000 },
  admin:      { maxRequests: 30, windowMs: 60_000 },
  default:    { maxRequests: 60, windowMs: 60_000 },
} as const;

// ─── PART 2: Storage ─────────────────────────────────────────

interface BucketEntry {
  timestamps: number[];
}

/**
 * Key format: `${ip}:${profile}`
 * Value: array of request timestamps within the window.
 */
const store = new Map<string, BucketEntry>();

/**
 * A hostile client can rotate spoofed/ephemeral addresses faster than lazy
 * cleanup runs. Keep the process-local fallback bounded; production-wide
 * enforcement still belongs at the trusted reverse proxy or a shared store.
 */
const MAX_BUCKETS = 10_000;

let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes

// ─── PART 3: Core Logic ──────────────────────────────────────

function getKey(ip: string, profile: string): string {
  return `${ip}:${profile}`;
}

function getBoundedKey(ip: string, profile: string): string {
  const requestedKey = getKey(ip, profile);
  if (store.has(requestedKey) || store.size < MAX_BUCKETS) return requestedKey;

  const overflowKey = `__overflow__:${profile}`;
  if (!store.has(overflowKey)) {
    // Make one slot for the shared overflow bucket. Once present, any further
    // unknown clients share its limit instead of growing memory without bound.
    const oldestKey = store.keys().next().value as string | undefined;
    if (oldestKey) store.delete(oldestKey);
  }
  return overflowKey;
}

function pruneExpired(entry: BucketEntry, windowMs: number, now: number): void {
  const cutoff = now - windowMs;
  // Find first valid index with binary-ish scan (timestamps are monotonic)
  let firstValid = 0;
  while (firstValid < entry.timestamps.length && entry.timestamps[firstValid] < cutoff) {
    firstValid++;
  }
  if (firstValid > 0) {
    entry.timestamps.splice(0, firstValid);
  }
}

function lazyCleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const maxWindow = Math.max(...Object.values(RATE_LIMIT_PROFILES).map(p => p.windowMs));
  const cutoff = now - maxWindow;

  for (const [key, entry] of store) {
    // Remove entries where all timestamps are expired
    if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < cutoff) {
      store.delete(key);
    }
  }
}

/**
 * Check if a request is allowed under the rate limit.
 *
 * @param ip - Client IP address
 * @param profile - Rate limit profile name (search, calculate, chat, default)
 * @returns Rate limit result with allowed flag, remaining count, and retry-after seconds
 */
export function checkRateLimit(
  ip: string,
  profile: string = 'default',
): RateLimitResult {
  lazyCleanup();

  const config = RATE_LIMIT_PROFILES[profile] ?? RATE_LIMIT_PROFILES.default;
  const key = getBoundedKey(ip, profile);
  const now = Date.now();

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  pruneExpired(entry, config.windowMs, now);

  const currentCount = entry.timestamps.length;

  if (currentCount >= config.maxRequests) {
    // Calculate when the oldest request in the window will expire
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = (oldestInWindow + config.windowMs) - now;
    const retryAfter = Math.ceil(Math.max(retryAfterMs, 1000) / 1000);

    return {
      allowed: false,
      remaining: 0,
      retryAfter,
    };
  }

  // Record this request
  entry.timestamps.push(now);

  return {
    allowed: true,
    remaining: config.maxRequests - currentCount - 1,
  };
}

// ─── PART 4: IP Extraction ───────────────────────────────────

/**
 * Extract a client IP only from a header owned by the configured trusted edge.
 * Unconfigured self-hosted deployments share a fail-closed bucket instead of
 * trusting caller-controlled forwarding headers.
 */
export function getClientIp(headers: Headers): string {
  if (process.env.VERCEL === '1') {
    const vercelIp = headers.get('x-vercel-forwarded-for')?.trim();
    if (vercelIp && isValidIp(vercelIp)) return vercelIp;
  }

  const configuredHeader = process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (configuredHeader && /^x-[a-z0-9-]{1,63}$/.test(configuredHeader)) {
    const configuredIp = headers.get(configuredHeader)?.trim();
    if (configuredIp && isValidIp(configuredIp)) return configuredIp;
  }

  return 'untrusted-client';
}

/** Basic IP validation (IPv4 or IPv6). */
function isValidIp(ip: string): boolean {
  return isIP(ip) !== 0;
}

// ─── PART 5: Helpers ─────────────────────────────────────────

/**
 * API Route에서 1줄로 rate-limit 적용하는 래퍼.
 * 차단 시 429 Response를 반환, 통과 시 null.
 *
 * @example
 * const blocked = applyRateLimit(request, 'calculate');
 * if (blocked) return blocked;
 */
export function applyRateLimit(
  request: { headers: Headers },
  profile: string = 'default',
): globalThis.Response | null {
  const ip = getClientIp(request.headers);
  const result = checkRateLimit(ip, profile);
  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'ESVA-9429', message: 'Too many requests', retryAfter: result.retryAfter },
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(result.retryAfter ?? 60),
        },
      },
    );
  }
  return null;
}

/** Reset the rate limit store (useful for testing). */
export function resetRateLimits(): void {
  store.clear();
  lastCleanup = Date.now();
}

/** Get current store size (for monitoring). */
export function getRateLimitStoreSize(): number {
  return store.size;
}
