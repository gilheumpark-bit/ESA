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

/** Other cached report copies, unreadable pre-scope keys first. */
function otherReportKeys(keep: string): string[] {
  const legacy: string[] = [];
  const scoped: string[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const entry = sessionStorage.key(index);
    if (!entry || entry === keep || !entry.startsWith('esva-report-')) continue;
    (entry.startsWith('esva-report-v2:') ? scoped : legacy).push(entry);
  }
  return [...legacy, ...scoped];
}

/**
 * A tab fills after a few large reports, and the review just paid for is the
 * one the user is waiting on. Earlier copies are removed one at a time until
 * it fits; if it never fits, every removed copy is put back.
 */
function storeWithEviction(target: string, value: string): boolean {
  const removed: Array<[string, string]> = [];
  try {
    for (const entry of otherReportKeys(target)) {
      const previous = sessionStorage.getItem(entry);
      if (previous === null) continue;
      sessionStorage.removeItem(entry);
      removed.push([entry, previous]);
      try {
        sessionStorage.setItem(target, value);
        return true;
      } catch { /* still too large: free the next copy */ }
    }
  } catch { /* storage unavailable: restore below */ }
  for (const [entry, previous] of removed) {
    try { sessionStorage.setItem(entry, previous); } catch { /* it fit before; nothing else to do */ }
  }
  return false;
}

/**
 * Keep a report for the account that requested it. Returns false when it was
 * not kept (request made under another account, or storage unavailable or too
 * small for it); team-review reports have no server copy, so callers must
 * surface that.
 */
export function cacheReport(report: ESVAVerifiedReport, uid: string | null, requestToken?: string | null): boolean {
  if (typeof window === 'undefined') return false;
  if (requestToken !== undefined && !requestMatchesScope(requestToken, uid)) return false;
  const target = key(report.reportId, uid);
  const value = JSON.stringify({ uid, report });
  try {
    sessionStorage.setItem(target, value);
    return true;
  } catch (error) {
    // Only a full tab is fixed by freeing space; a blocked store would lose
    // the removed copies without ever accepting the new one.
    return isQuotaError(error) && storeWithEviction(target, value);
  }
}

function isQuotaError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

function readScope(id: string, uid: string | null): ESVAVerifiedReport | null {
  const raw = sessionStorage.getItem(key(id, uid));
  if (!raw) return null;
  const entry = JSON.parse(raw) as { uid?: string | null; report?: ESVAVerifiedReport };
  return entry.uid === uid && entry.report?.reportId === id ? entry.report : null;
}

/** The viewer's own copy, then (signed in) anonymous work from this tab, as with receipts. */
export function getCachedReport(id: string, uid: string | null): ESVAVerifiedReport | null {
  if (typeof window === 'undefined') return null;
  try {
    return readScope(id, uid) ?? (uid === null ? null : readScope(id, null));
  } catch { return null; }
}

/** Drop the copy getCachedReport would return (own scope first, then anonymous). */
export function removeCachedReport(id: string, uid: string | null): void {
  if (typeof window === 'undefined') return;
  let scope = uid;
  try { if (uid !== null && readScope(id, uid) === null) scope = null; }
  catch { /* A malformed own-scope entry is the one to drop. */ }
  try { sessionStorage.removeItem(key(id, scope)); }
  catch { /* Storage may be unavailable. */ }
}
