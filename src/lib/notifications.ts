/**
 * ESVA Notification System
 * -------------------------
 * User notifications for standard updates, keyword news,
 * cert D-day alerts, calc completions, and community events.
 *
 * PART 1: Types
 * PART 2: CRUD operations (durable Supabase; ephemeral fallback is non-production only)
 * PART 3: Preference management
 */

import { randomUUID } from 'crypto';
import { ensureUserProfile, getSupabaseAdmin } from '@/lib/supabase';
import { allowEphemeralStorage } from '@/lib/storage-policy';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

export type NotificationType =
  | 'standard_update'   // 규격 개정
  | 'keyword_news'      // 키워드 뉴스
  | 'cert_dday'         // 자격증 D-day
  | 'calc_complete'     // 계산 완료
  | 'project_invite'    // 프로젝트 초대
  | 'community_answer'  // 커뮤니티 답변
  | 'system';           // 시스템 공지

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  metadata?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface NotificationPreference {
  userId: string;
  standardUpdates: boolean;
  keywordNews: boolean;
  certAlerts: boolean;
  calcComplete: boolean;
  communityAnswers: boolean;
  email: boolean;
  push: boolean;
}

export interface NotificationQueryOptions {
  unreadOnly?: boolean;
  type?: NotificationType;
  page?: number;
  pageSize?: number;
}

export interface NotificationQueryResult {
  notifications: Notification[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — CRUD Operations
// ═══════════════════════════════════════════════════════════════════════════════

const NOTIF_TABLE = 'notifications';
const PREF_TABLE = 'notification_preferences';

/** Development/test-only ephemeral store. Production never reports this as persisted. */
const memoryNotifications = new Map<string, Notification[]>();
const memoryPreferences = new Map<string, NotificationPreference>();

function requireEphemeralStorage(operation: string): void {
  if (!allowEphemeralStorage()) {
    throw new Error(`알림 ${operation} 저장소를 사용할 수 없습니다.`);
  }
}

function getSupabaseClientSafe() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return getSupabaseAdmin();
  } catch {
    return null;
  }
}

/**
 * Create a new notification.
 */
export async function createNotification(
  n: Omit<Notification, 'id' | 'read' | 'createdAt'>,
): Promise<Notification> {
  const notification: Notification = {
    ...n,
    link: normalizeInternalLink(n.link),
    id: randomUUID(),
    read: false,
    createdAt: new Date().toISOString(),
  };

  const client = getSupabaseClientSafe();
  if (client) {
    try {
      await ensureUserProfile(n.userId);
      const { error } = await client.from(NOTIF_TABLE).insert({
        id: notification.id,
        user_id: notification.userId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        link: notification.link ?? null,
        metadata: notification.metadata ?? {},
        read: false,
        created_at: notification.createdAt,
      });
      if (error) throw error;
      return notification;
    } catch {
      requireEphemeralStorage('생성');
    }
  }

  requireEphemeralStorage('생성');
  const userNotifs = memoryNotifications.get(n.userId) ?? [];
  userNotifs.unshift(notification);
  if (userNotifs.length > 500) userNotifs.length = 500;
  memoryNotifications.set(n.userId, userNotifs);

  return notification;
}

/**
 * Get notifications for a user.
 */
export async function getUserNotifications(
  userId: string,
  opts: NotificationQueryOptions = {},
): Promise<NotificationQueryResult> {
  const { page = 1, pageSize = 20 } = opts;

  const client = getSupabaseClientSafe();
  if (client) {
    try {
      let query = client
        .from(NOTIF_TABLE)
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (opts.unreadOnly) query = query.eq('read', false);
      if (opts.type) query = query.eq('type', opts.type);

      const from = (page - 1) * pageSize;
      query = query.range(from, from + pageSize - 1);

      const { data, count, error } = await query;

      if (!error && data) {
        // Get unread count
        const { count: unreadCount, error: unreadError } = await client
          .from(NOTIF_TABLE)
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('read', false);

        if (unreadError) throw unreadError;
        return {
          notifications: data.map(mapDbToNotification),
          total: count ?? 0,
          unreadCount: unreadCount ?? 0,
          page,
          pageSize,
        };
      }
      if (error) throw error;
    } catch {
      requireEphemeralStorage('조회');
    }
  }

  requireEphemeralStorage('조회');
  let entries = memoryNotifications.get(userId) ?? [];
  const totalUnread = entries.filter(e => !e.read).length;

  if (opts.unreadOnly) entries = entries.filter(e => !e.read);
  if (opts.type) entries = entries.filter(e => e.type === opts.type);

  const total = entries.length;
  const start = (page - 1) * pageSize;
  const paged = entries.slice(start, start + pageSize);

  return {
    notifications: paged,
    total,
    unreadCount: totalUnread,
    page,
    pageSize,
  };
}

/**
 * Mark a notification as read only when it belongs to the given user.
 */
export async function markRead(id: string, userId: string): Promise<boolean> {
  const client = getSupabaseClientSafe();
  if (client) {
    try {
      const { data, error } = await client
        .from(NOTIF_TABLE)
        .update({ read: true })
        .eq('id', id)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    } catch {
      requireEphemeralStorage('수정');
    }
  }

  requireEphemeralStorage('수정');
  const notifs = memoryNotifications.get(userId) ?? [];
  const notif = notifs.find(n => n.id === id);
  if (notif) {
    notif.read = true;
    return true;
  }
  return false;
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllRead(userId: string): Promise<void> {
  const client = getSupabaseClientSafe();
  if (client) {
    try {
      const { error } = await client
        .from(NOTIF_TABLE)
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);
      if (error) throw error;
      return;
    } catch {
      requireEphemeralStorage('수정');
    }
  }

  requireEphemeralStorage('수정');
  const notifs = memoryNotifications.get(userId) ?? [];
  for (const n of notifs) n.read = true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Preference Management
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_PREFERENCES: Omit<NotificationPreference, 'userId'> = {
  standardUpdates: true,
  keywordNews: true,
  certAlerts: true,
  calcComplete: true,
  communityAnswers: true,
  email: false,
  push: false,
};

/**
 * Get notification preferences for a user.
 */
export async function getPreferences(userId: string): Promise<NotificationPreference> {
  const client = getSupabaseClientSafe();
  if (client) {
    try {
      const { data, error } = await client
        .from(PREF_TABLE)
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        return {
          userId,
          standardUpdates: data.standard_updates ?? true,
          keywordNews: data.keyword_news ?? true,
          certAlerts: data.cert_alerts ?? true,
          calcComplete: data.calc_complete ?? true,
          communityAnswers: data.community_answers ?? true,
          email: data.email ?? false,
          push: data.push ?? false,
        };
      }
      if (error) throw error;
      return { userId, ...DEFAULT_PREFERENCES };
    } catch {
      requireEphemeralStorage('환경설정 조회');
    }
  }

  requireEphemeralStorage('환경설정 조회');
  return memoryPreferences.get(userId) ?? { userId, ...DEFAULT_PREFERENCES };
}

/**
 * Update notification preferences.
 */
export async function updatePreferences(
  userId: string,
  prefs: Partial<Omit<NotificationPreference, 'userId'>>,
): Promise<NotificationPreference> {
  const current = await getPreferences(userId);
  const updated = { ...current, ...prefs };

  const client = getSupabaseClientSafe();
  if (client) {
    try {
      await ensureUserProfile(userId);
      const { error } = await client.from(PREF_TABLE).upsert({
        user_id: userId,
        standard_updates: updated.standardUpdates,
        keyword_news: updated.keywordNews,
        cert_alerts: updated.certAlerts,
        calc_complete: updated.calcComplete,
        community_answers: updated.communityAnswers,
        email: updated.email,
        push: updated.push,
      });
      if (error) throw error;
      return updated;
    } catch {
      requireEphemeralStorage('환경설정 저장');
    }
  }

  requireEphemeralStorage('환경설정 저장');
  memoryPreferences.set(userId, updated);
  return updated;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function mapDbToNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: row.type as NotificationType,
    title: row.title as string,
    body: row.body as string,
    link: normalizeInternalLink((row.link as string) ?? undefined),
    metadata: (row.metadata as Record<string, unknown>) ?? undefined,
    read: row.read as boolean,
    createdAt: row.created_at as string,
  };
}

function normalizeInternalLink(link?: string): string | undefined {
  if (!link || !link.startsWith('/') || link.startsWith('//')) return undefined;
  return link.slice(0, 2_048);
}
