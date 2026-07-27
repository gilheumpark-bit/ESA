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
    return { ok: false, reason: 'URL 형식이 올바르지 않습니다.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'http 또는 https URL만 허용됩니다.' };
  }

  // **끝점(trailing dot)을 떼고 본다.** `localhost.` 는 FQDN 절대표기이고
  // DNS 는 `localhost` 와 같이 127.0.0.1 로 해석하는데, 문자열이 달라
  // 차단 목록을 그대로 빠져나갔다(2026-07-28 실측: 통과).
  const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: '허용되지 않는 호스트입니다.' };
  }

  // 십진수·8진수·16진수 표기(`2130706433`·`0x7f000001`·`127.1`)는 WHATWG URL
  // 파서가 점 4 자리로 정규화해 주므로 아래 검사에 그대로 걸린다.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (isPrivateOrReservedIPv4(host)) {
      return { ok: false, reason: '사설/로컬 주소로의 요청은 허용되지 않습니다.' };
    }
  }

  // IPv6 은 대괄호로 온다. `::1` 만 보고 있었는데 **IPv4-매핑 루프백**
  // `[::ffff:127.0.0.1]` 이 그대로 통과했다(2026-07-28 실측).
  if (host.startsWith('[') && host.endsWith(']')) {
    const v6 = host.slice(1, -1);
    // IPv4-매핑(`::ffff:0:0/96`) 안에 든 IPv4 를 꺼내 같은 기준으로 본다.
    //
    // URL 파서가 `[::ffff:127.0.0.1]` 을 **`[::ffff:7f00:1]` 로 정규화**한다 —
    // 점 표기로 찾으면 못 잡는다(그렇게 통과하고 있었다). 16 진 두 그룹을
    // 32 비트로 붙여 IPv4 로 되돌린다.
    const mapped = /^::ffff:(?:([\da-f]{1,4}):([\da-f]{1,4})|((?:\d{1,3}\.){3}\d{1,3}))$/.exec(v6);
    if (mapped) {
      const dotted = mapped[3] ?? ((n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'))(
        ((parseInt(mapped[1], 16) << 16) | parseInt(mapped[2], 16)) >>> 0,
      );
      if (isPrivateOrReservedIPv4(dotted)) {
        return { ok: false, reason: '사설/로컬 주소로의 요청은 허용되지 않습니다.' };
      }
    }
    // 루프백 · unique-local(fc00::/7) · link-local(fe80::/10) · 미지정(::)
    const compact = v6.replace(/^0+/, '');
    if (
      v6 === '::' || v6 === '::1' || compact === '::1'
      || /^f[cd][0-9a-f]{2}:/.test(v6)
      || /^fe[89ab][0-9a-f]:/.test(v6)
    ) {
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
