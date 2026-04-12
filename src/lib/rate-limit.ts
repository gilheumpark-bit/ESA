/**
 * ESVA In-Memory Sliding Window Rate Limiter
 * ------------------------------------------
 * No Redis required. Profiles for search, calculate, chat.
 * Lazy cleanup every 5 minutes.
 */

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

let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes

// ─── PART 3: Core Logic ──────────────────────────────────────

function getKey(ip: string, profile: string): string {
  return `${ip}:${profile}`;
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
  const key = getKey(ip, profile);
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
 * Extract client IP from request headers.
 * Checks standard proxy headers, falls back to '127.0.0.1'.
 */
export function getClientIp(headers: Headers): string {
  // Vercel / Cloudflare / standard proxies
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can be comma-separated; take the first (client IP)
    const first = forwarded.split(',')[0].trim();
    if (first && isValidIp(first)) return first;
  }

  const realIp = headers.get('x-real-ip');
  if (realIp && isValidIp(realIp)) return realIp;

  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp && isValidIp(cfIp)) return cfIp;

  return '127.0.0.1';
}

/** Basic IP validation (IPv4 or IPv6). */
function isValidIp(ip: string): boolean {
  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return true;
  // IPv6 (simplified check)
  if (ip.includes(':') && /^[0-9a-fA-F:]+$/.test(ip)) return true;
  return false;
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
