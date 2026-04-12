// ============================================================
// ESVA Fetch URL Guard — SSRF mitigation
// ============================================================
// Block private/local targets before fetch. Not a substitute for
// network-level egress controls.
// 원본: eh-universe-web/src/lib/fetch-url-guard.ts

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  'metadata',
]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

function isPrivateOrReservedIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true;
  // 10.0.0.0/8
  if ((n >>> 24) === 10) return true;
  // 172.16.0.0/12
  if ((n >>> 24) === 172) {
    const second = (n >>> 16) & 0xff;
    if (second >= 16 && second <= 31) return true;
  }
  // 192.168.0.0/16
  if ((n >>> 16) === 49320) return true;
  // 127.0.0.0/8
  if ((n >>> 24) === 127) return true;
  // 169.254.0.0/16 link-local
  if ((n >>> 16) === 0xa9fe) return true;
  // 0.0.0.0/8
  if ((n >>> 24) === 0) return true;
  // 100.64.0.0/10 CGNAT
  if (n >= 0x64400000 && n <= 0x647fffff) return true;
  return false;
}

export function assertUrlAllowedForFetch(rawUrl: string): { ok: true; href: string } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: '유효하지 않은 URL 형식입니다.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'http 또는 https URL만 허용됩니다.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: '허용되지 않는 호스트입니다.' };
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (isPrivateOrReservedIPv4(host)) {
      return { ok: false, reason: '사설/로컬 주소로의 요청은 허용되지 않습니다.' };
    }
  }

  if (host === '[::1]' || (host.startsWith('[') && host.includes('::1'))) {
    return { ok: false, reason: '사설/로컬 주소로의 요청은 허용되지 않습니다.' };
  }

  return { ok: true, href: parsed.href };
}

// ── URL 요청 속도 제한 ──

type Bucket = { count: number; windowStart: number };
const RATE: Map<string, Bucket> = new Map();
const MAX_REQ = 40;
const WINDOW_MS = 60_000;

export function rateLimitFetchUrl(clientKey: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let b = RATE.get(clientKey);
  if (!b || now - b.windowStart > WINDOW_MS) {
    b = { count: 0, windowStart: now };
    RATE.set(clientKey, b);
  }
  b.count += 1;
  if (b.count > MAX_REQ) {
    return { ok: false, retryAfterSec: Math.ceil((WINDOW_MS - (now - b.windowStart)) / 1000) || 1 };
  }
  return { ok: true };
}
