import type { ESVAVerifiedReport } from '@/agent/teams/types';

// Ownerless v1 entries (`esva-report-<id>`) are deliberately not migrated:
// hashes prove content, not ownership. Only new writes or an owner-filtered
// API read establish scope.
function key(id: string, uid: string | null): string {
  const scope = uid === null ? 'anonymous' : `user:${encodeURIComponent(uid)}`;
  return `esva-report-v2:${scope}:${encodeURIComponent(id)}`;
}

// This checks local cache partitioning only, never API authorization or a JWT
// signature. The token is the Firebase token already sent on the successful request.
function requestMatchesScope(token: string | null, uid: string | null): boolean {
  if (token === null) return uid === null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return false;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: unknown };
    return typeof claims.sub === 'string' && claims.sub.length > 0 && claims.sub === uid;
  } catch { return false; }
}

export function cacheReport(report: ESVAVerifiedReport, uid: string | null, requestToken?: string | null): void {
  if (typeof window === 'undefined') return;
  if (requestToken !== undefined && !requestMatchesScope(requestToken, uid)) return;
  try { sessionStorage.setItem(key(report.reportId, uid), JSON.stringify({ uid, report })); }
  catch { /* The verified server copy can still be used when storage is full. */ }
}

export function getCachedReport(id: string, uid: string | null): ESVAVerifiedReport | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key(id, uid));
    if (!raw) return null;
    const entry = JSON.parse(raw) as { uid?: string | null; report?: ESVAVerifiedReport };
    return entry.uid === uid && entry.report?.reportId === id ? entry.report : null;
  } catch { return null; }
}

export function removeCachedReport(id: string, uid: string | null): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(key(id, uid)); }
  catch { /* Storage may be unavailable. */ }
}
