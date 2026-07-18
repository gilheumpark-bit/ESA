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

/**
 * Parse an IPv4 host in ANY WHATWG-permitted form to a 32-bit integer:
 * dotted-decimal (127.0.0.1), integer (2130706433), hex (0x7f.0.0.1),
 * octal (0177.0.0.1), and shortened forms (127.1). Returns null for
 * anything that is not a valid IPv4 literal (e.g. real domain names).
 */
function flexibleIpv4ToInt(host: string): number | null {
  const parts = host.split('.');
  if (parts.length === 0 || parts.length > 4) return null;

  const numbers: number[] = [];
  for (const part of parts) {
    if (part.length === 0) return null;
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(part)) {
      n = parseInt(part.slice(2), 16);
    } else if (/^0[0-7]+$/.test(part)) {
      n = parseInt(part, 8);
    } else if (/^[0-9]+$/.test(part)) {
      n = parseInt(part, 10);
    } else {
      return null; // 문자가 섞이면 IPv4가 아님 (도메인)
    }
    if (!Number.isFinite(n) || n < 0) return null;
    numbers.push(n);
  }

  // 마지막을 제외한 모든 옥텟은 0~255 범위여야 함
  for (let i = 0; i < numbers.length - 1; i++) {
    if (numbers[i] > 255) return null;
  }
  // 마지막 옥텟은 남은 바이트 수만큼의 범위를 차지할 수 있음
  const remainingBytes = 4 - (numbers.length - 1);
  const maxLast = Math.pow(256, remainingBytes) - 1;
  const last = numbers[numbers.length - 1];
  if (last > maxLast) return null;

  let ipInt = last;
  for (let i = 0; i < numbers.length - 1; i++) {
    ipInt += numbers[i] * Math.pow(256, 3 - i);
  }
  return ipInt >>> 0;
}

function isPrivateOrReservedIPv4Int(n: number): boolean {
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

function isPrivateOrReservedIPv4(ip: string): boolean {
  const n = flexibleIpv4ToInt(ip);
  if (n === null) return true;
  return isPrivateOrReservedIPv4Int(n);
}

/**
 * IPv6 리터럴(대괄호 제거된 형태)이 사설/예약 대역인지 판정.
 * loopback(::1), unspecified(::), ULA(fc00::/7), link-local(fe80::/10),
 * IPv4-mapped/embedded(::ffff:*) 를 모두 차단한다.
 */
function isBlockedIpv6(rawInner: string): boolean {
  const addr = rawInner.toLowerCase();

  if (addr === '::1' || addr === '::') return true;

  // IPv4-mapped/embedded (::ffff:169.254.169.254, ::ffff:a9fe:a9fe 등)은
  // IPv4 공간을 IPv6로 우회하는 형태이므로 일괄 차단
  if (addr.includes('::ffff:') || addr.startsWith('::ffff:')) return true;
  const v4Embedded = addr.match(/((?:\d{1,3}\.){3}\d{1,3})$/);
  if (v4Embedded && isPrivateOrReservedIPv4(v4Embedded[1])) return true;

  // 첫 hextet 접두사로 ULA / link-local 판정
  const firstHextet = addr.startsWith('::') ? '0' : (addr.split(':')[0] || '');
  if (/^f[cd]/.test(firstHextet)) return true;      // ULA fc00::/7
  if (/^fe[89ab]/.test(firstHextet)) return true;   // link-local fe80::/10

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

  // IPv6 리터럴 ([...]): loopback/ULA/link-local/IPv4-mapped 차단
  if (host.startsWith('[') && host.endsWith(']')) {
    if (isBlockedIpv6(host.slice(1, -1))) {
      return { ok: false, reason: '사설/로컬 주소로의 요청은 허용되지 않습니다.' };
    }
    return { ok: true, href: parsed.href };
  }

  // IPv4 (dotted-decimal / integer / hex / octal 모든 형식 정규화 후 판정)
  const ipv4Int = flexibleIpv4ToInt(host);
  if (ipv4Int !== null) {
    if (isPrivateOrReservedIPv4Int(ipv4Int)) {
      return { ok: false, reason: '사설/로컬 주소로의 요청은 허용되지 않습니다.' };
    }
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
