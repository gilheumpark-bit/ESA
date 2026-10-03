'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { featureAuthenticatedFetch } from '@/lib/feature-auth';
import { FeatureRequestError, isRecord, requestFeatureJson, requireRecord } from '@/lib/feature-request';

export interface ShareLinkRow {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export type ShareLinkState = 'active' | 'expired' | 'revoked';

/** 회수가 만료보다 먼저다 — 회수한 링크는 기한이 남아 있어도 닫힌 것이다. */
export function shareLinkState(link: ShareLinkRow, now: number = Date.now()): ShareLinkState {
  if (link.revokedAt) return 'revoked';
  const expires = Date.parse(link.expiresAt);
  return Number.isFinite(expires) && expires > now ? 'active' : 'expired';
}

export function decodeShareLinks(value: unknown): ShareLinkRow[] {
  const links = requireRecord(value).links;
  if (!Array.isArray(links) || links.length > 100) throw new FeatureRequestError('공유 링크 목록 형식을 확인하지 못했습니다.');
  return links.map((raw) => {
    if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.created_at !== 'string' || typeof raw.expires_at !== 'string'
      || (raw.revoked_at !== null && typeof raw.revoked_at !== 'string')) {
      throw new FeatureRequestError('공유 링크 목록 형식을 확인하지 못했습니다.');
    }
    return { id: raw.id, createdAt: raw.created_at, expiresAt: raw.expires_at, revokedAt: raw.revoked_at };
  });
}

const STATE_LABEL: Record<ShareLinkState, string> = { active: '사용 중', expired: '만료됨', revoked: '회수됨' };

/**
 * 발급한 공유 링크를 보여 주고 회수한다. 링크를 만들 수만 있고 거둘 수 없으면
 * 잘못 보낸 링크를 막을 방법이 만료를 기다리는 것뿐이다.
 * `refreshKey` 가 바뀌면 다시 읽는다(새 링크를 만든 직후).
 */
export function ProjectShareLinks({ projectId, refreshKey }: { projectId: string; refreshKey: number }) {
  const [links, setLinks] = useState<ShareLinkRow[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const url = `/api/projects/${encodeURIComponent(projectId)}`;

  const patch = useCallback(<T,>(body: Record<string, unknown>, decode: (value: unknown) => T, signal: AbortSignal) =>
    requestFeatureJson(url, {
      method: 'PATCH', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }, decode, featureAuthenticatedFetch), [url]);

  useEffect(() => {
    const controller = new AbortController();
    patch({ action: 'listShareLinks' }, decodeShareLinks, controller.signal)
      .then((rows) => { if (!controller.signal.aborted) setLinks(rows); })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : '공유 링크 목록을 불러오지 못했습니다.');
      });
    return () => controller.abort();
  }, [patch, refreshKey]);
  useEffect(() => () => { request.current?.abort(); }, []);

  const revoke = async (linkId: string) => {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setPendingId(linkId);
    setError(null);
    try {
      await patch({ action: 'revokeShareLinks', linkId }, requireRecord, controller.signal);
      // 서버가 받아들인 뒤에만 화면을 바꾼다 — 목록을 다시 읽어 실제 상태를 보여 준다.
      const rows = await patch({ action: 'listShareLinks' }, decodeShareLinks, controller.signal);
      if (!controller.signal.aborted) setLinks(rows);
    } catch (revokeError) {
      if (!controller.signal.aborted) setError(revokeError instanceof Error ? revokeError.message : '공유 링크를 회수하지 못했습니다.');
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setPendingId(null);
    }
  };

  return (
    <section aria-label="발급한 공유 링크" className="mt-5 border-t border-[var(--border-default)] pt-4">
      <h4 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">발급한 링크</h4>
      {error && <p role="alert" className="mb-2 text-sm text-red-600">{error}</p>}
      {!links && !error && <p role="status" className="text-xs text-[var(--text-secondary)]">불러오는 중입니다.</p>}
      {links && links.length === 0 && <p className="text-xs text-[var(--text-secondary)]">아직 발급한 링크가 없습니다.</p>}
      {links && links.length > 0 && (
        <ul className="space-y-2">
          {links.map((link) => {
            const state = shareLinkState(link);
            return (
              <li key={link.id} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--bg-secondary)] p-2.5 text-xs">
                <div className="min-w-0 text-[var(--text-secondary)]">
                  <p className="font-medium text-[var(--text-primary)]">{STATE_LABEL[state]}</p>
                  <p>발급 {new Date(link.createdAt).toLocaleString('ko-KR')}</p>
                  <p>만료 {new Date(link.expiresAt).toLocaleString('ko-KR')}</p>
                </div>
                {state === 'active' && (
                  <button type="button" disabled={pendingId !== null} onClick={() => { void revoke(link.id); }}
                    className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1.5 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                    {pendingId === link.id ? '회수 중...' : '회수'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
