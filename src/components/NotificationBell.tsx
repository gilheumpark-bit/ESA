'use client';

/**
 * ESVA Notification Bell Component
 * ---------------------------------
 * Bell icon with unread count badge, dropdown with recent notifications.
 * Click → mark as read + navigate to link.
 *
 * PART 1: Types & state
 * PART 2: Fetch logic
 * PART 3: Dropdown UI
 * PART 4: Main component
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & State
// ═══════════════════════════════════════════════════════════════════════════════

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  standard_update: '규격 개정',
  keyword_news: '키워드 뉴스',
  cert_dday: '자격증 D-day',
  calc_complete: '계산 완료',
  project_invite: '프로젝트 초대',
  community_answer: '커뮤니티 답변',
  system: '시스템',
};

const TYPE_COLORS: Record<string, string> = {
  standard_update: 'bg-blue-100 text-blue-700',
  keyword_news: 'bg-green-100 text-green-700',
  cert_dday: 'bg-orange-100 text-orange-700',
  calc_complete: 'bg-purple-100 text-purple-700',
  project_invite: 'bg-pink-100 text-pink-700',
  community_answer: 'bg-teal-100 text-teal-700',
  system: 'bg-gray-100 text-gray-700',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Fetch Logic
// ═══════════════════════════════════════════════════════════════════════════════

function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?userId=${user.uid}&pageSize=10`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {
      // Silently fail — notifications are non-critical
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: id }),
      });
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user?.uid) return;
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, markAll: true }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  }, [user?.uid]);

  useEffect(() => {
    fetchNotifications();
    // Poll every 60 seconds
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, refresh: fetchNotifications };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Time Formatting
// ═══════════════════════════════════════════════════════════════════════════════

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return '방금 전';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}일 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
        aria-label={`알림 ${unreadCount > 0 ? `(${unreadCount}개 읽지 않음)` : ''}`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] shadow-xl sm:w-96">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">알림</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--color-primary)] hover:bg-[var(--bg-secondary)]"
              >
                <CheckCheck size={14} />
                모두 읽음
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
                알림이 없습니다
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`flex gap-3 border-b border-[var(--border-default)] px-4 py-3 transition-colors last:border-b-0 ${
                    n.read
                      ? 'bg-transparent'
                      : 'bg-blue-50/50 dark:bg-blue-950/20'
                  } cursor-pointer hover:bg-[var(--bg-secondary)]`}
                  onClick={() => {
                    if (!n.read) markAsRead(n.id);
                    if (n.link) window.location.href = n.link;
                    setOpen(false);
                  }}
                >
                  {/* Unread dot */}
                  <div className="mt-1.5 shrink-0">
                    {n.read ? (
                      <Check size={12} className="text-[var(--text-tertiary)]" />
                    ) : (
                      <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          TYPE_COLORS[n.type] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {TYPE_LABELS[n.type] ?? n.type}
                      </span>
                      <span className="text-[11px] text-[var(--text-tertiary)]">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {n.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">
                      {n.body}
                    </p>
                    {n.link && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--color-primary)]">
                        <ExternalLink size={10} />
                        자세히 보기
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
