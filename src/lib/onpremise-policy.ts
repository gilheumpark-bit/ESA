/**
 * Server-side on-premise target policy.
 * User input may select only an origin explicitly configured by the deployer.
 */

const ALLOWLIST_ENV = 'ONPREMISE_ALLOWED_ORIGINS';
const ALWAYS_BLOCKED_HOSTS = new Set([
  '0.0.0.0',
  '169.254.169.254',
  '[::]',
]);

export interface OnpremiseTargetValidation {
  ok: boolean;
  normalizedUrl?: string;
  reason?: string;
}

function normalizeOrigin(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

function configuredOrigins(rawAllowlist: string | undefined): Set<string> {
  const origins = new Set<string>();
  for (const value of rawAllowlist?.split(',') ?? []) {
    const origin = normalizeOrigin(value);
    if (origin) origins.add(origin);
  }
  return origins;
}

export function validateOnpremiseTarget(
  serverUrl: string,
  rawAllowlist: string | undefined = process.env[ALLOWLIST_ENV],
): OnpremiseTargetValidation {
  let parsed: URL;
  try {
    parsed = new URL(serverUrl);
  } catch {
    return { ok: false, reason: '유효하지 않은 서버 URL 형식' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, reason: 'http/https URL만 허용됩니다.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'URL 사용자 정보는 허용되지 않습니다.' };
  }
  if (ALWAYS_BLOCKED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return { ok: false, reason: '메타데이터·와일드카드 주소는 허용되지 않습니다.' };
  }

  const allowlist = configuredOrigins(rawAllowlist);
  if (allowlist.size === 0) {
    return {
      ok: false,
      reason: `${ALLOWLIST_ENV} 배포 허용목록이 설정되지 않았습니다.`,
    };
  }

  if (!allowlist.has(parsed.origin.toLowerCase())) {
    return {
      ok: false,
      reason: `배포 허용목록에 없는 On-Premise origin입니다: ${parsed.origin}`,
    };
  }

  return {
    ok: true,
    normalizedUrl: parsed.toString().replace(/\/+$/, ''),
  };
}
