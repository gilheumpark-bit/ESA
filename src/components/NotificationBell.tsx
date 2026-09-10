'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureResource } from '@/hooks/useFeatureResource';
import { featureAuthenticatedFetch } from '@/lib/feature-auth';
import { FeatureRequestError, isRecord, requireRecord, requireArray, requestFeatureJson, relativeActivityTime } from '@/lib/feature-request';
import { safeFeatureLink } from '@/lib/feature-output';

interface NotificationItem { id: string; type: string; title: string; body: string; link?: string; read: boolean; createdAt: string }
const LABELS: Record<string, string> = { standard_update: '규격 개정', keyword_news: '키워드 뉴스', cert_dday: '자격증 D-day',
  calc_complete: '계산 완료', project_invite: '프로젝트 초대', community_answer: '커뮤니티 답변', system: '시스템' };
function decode(value: unknown) {
  const body = requireRecord(value);
  const notifications = requireArray(body.notifications, (item): item is NotificationItem => isRecord(item)
    && ['id', 'type', 'title', 'body', 'createdAt'].every((key) => typeof item[key] === 'string')
    && typeof item.read === 'boolean' && (item.link === undefined || typeof item.link === 'string'), 50);
  if (!Number.isSafeInteger(body.unreadCount) || Number(body.unreadCount) < 0) throw new FeatureRequestError('읽지 않은 알림 수를 확인하지 못했습니다.');
  return { notifications, unreadCount: Number(body.unreadCount) };
}

function AccountNotifications({ uid }: { uid: string }) {
  const [open, setOpen] = useState(false), [mutationError, setMutationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const active = useRef<AbortController | null>(null), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const load = useCallback((signal: AbortSignal) => requestFeatureJson(`/api/notifications?userId=${encodeURIComponent(uid)}&pageSize=10`,
    { signal }, decode, featureAuthenticatedFetch), [uid]);
  const resource = useFeatureResource(`notifications:${uid}`, load);
  const reload = resource.reload;
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, 60_000);
    return () => { clearInterval(timer); active.current?.abort(); };
  }, [reload]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const mark = async (id?: string) => {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; setSaving(true); setMutationError(null);
    try {
      await requestFeatureJson('/api/notifications', { method: 'PATCH', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { userId: uid, notificationId: id } : { userId: uid, markAll: true }) },
      (value) => { if (requireRecord(value).success !== true) throw new FeatureRequestError('읽음 처리를 확인하지 못했습니다.'); return true; }, featureAuthenticatedFetch);
      if (!controller.signal.aborted) reload();
    } catch (error) { if (!controller.signal.aborted) setMutationError(error instanceof Error ? error.message : '읽음 처리 실패'); }
    finally { if (!controller.signal.aborted) setSaving(false); if (active.current === controller) active.current = null; }
  };
  const count = resource.data?.unreadCount;
  const error = mutationError ?? resource.error;
  return <div ref={root} className="relative">
    <button ref={trigger} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={panelId}
      aria-label={`알림${count ? ` (${count}개 읽지 않음)` : resource.error ? ' (조회 실패)' : ''}`}
      className="relative flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] focus-visible:outline-2">
      <Bell size={20} aria-hidden="true" />
      {Boolean(count) && <span className="absolute right-0 top-0 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">{count! > 99 ? '99+' : count}</span>}
    </button>
    {open && <section id={panelId} aria-label="알림 목록" className="fixed right-3 top-16 z-50 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] shadow-xl sm:absolute sm:right-0 sm:top-full sm:mt-2">
      <header className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-2">
        <h2 className="text-sm font-semibold">알림</h2>
        <div className="flex gap-2">
          {Boolean(count) && <button type="button" disabled={saving || resource.loading} onClick={() => void mark()} className="flex min-h-11 items-center gap-1 rounded px-2 text-xs disabled:opacity-50"><CheckCheck size={15} />모두 읽음</button>}
          <button type="button" onClick={() => { setOpen(false); trigger.current?.focus(); }} className="min-h-11 rounded px-2 text-xs">닫기</button>
        </div>
      </header>
      {error && <div className="border-b border-[var(--border-default)] p-3"><p role="alert" className="text-sm text-[var(--drawing-error-text)]">{error}</p>
        <button type="button" disabled={saving} onClick={() => { setMutationError(null); reload(); }} className="mt-2 min-h-11 rounded border px-3 text-sm">다시 불러오기</button>
      </div>}
      <div className="max-h-[60vh] overflow-y-auto">
        {resource.loading ? <p role="status" className="p-6 text-sm">알림을 확인하고 있습니다.</p>
          : !resource.error && !resource.data?.notifications.length ? <p className="p-6 text-sm">알림이 없습니다</p>
            : <ul>{resource.data?.notifications.map((item) => {
              const link = safeFeatureLink(item.link);
              return <li key={item.id} className="border-b border-[var(--border-default)] p-4 last:border-0">
                <p className="text-xs text-[var(--text-secondary)]">{LABELS[item.type] ?? '알림'} · {relativeActivityTime(item.createdAt)} · {item.read ? '읽음' : '읽지 않음'}</p>
                <h3 className="mt-1 break-words text-sm font-semibold">{item.title}</h3>
                <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">{item.body}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {!item.read && <button type="button" disabled={saving || resource.loading} onClick={() => void mark(item.id)} className="min-h-11 rounded border px-3 text-xs disabled:opacity-50">읽음 처리</button>}
                  {link && (link.startsWith('/') ? <Link href={link} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center gap-1 rounded border px-3 text-xs">내용 열기</Link>
                    : <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 rounded border px-3 text-xs">외부 원문 열기<ExternalLink size={12} aria-hidden="true" /></a>)}
                </div>
              </li>;
            })}</ul>}
      </div>
      <p className="border-t border-[var(--border-default)] px-4 py-2 text-xs text-[var(--text-secondary)]">최근 10건 · 인앱 알림입니다. 이메일·푸시 발송 여부와는 다릅니다.</p>
    </section>}
  </div>;
}
export default function NotificationBell() {
  const { user } = useAuth();
  return user ? <AccountNotifications key={user.uid} uid={user.uid} /> : null;
}
