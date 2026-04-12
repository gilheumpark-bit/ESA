/**
 * ESVA Notification System
 * -------------------------
 * User notifications for standard updates, keyword news,
 * cert D-day alerts, calc completions, and community events.
 *
 * PART 1: Types
 * PART 2: CRUD operations (Supabase with in-memory fallback)
 * PART 3: Preference management
 */

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

/** In-memory fallback */
const memoryNotifications = new Map<string, Notification[]>();
const memoryPreferences = new Map<string, NotificationPreference>();

function getSupabaseClientSafe() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require('@supabase/supabase-js');
    return createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
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
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    read: false,
    createdAt: new Date().toISOString(),
  };

  const client = getSupabaseClientSafe();
  if (client) {
    try {
      const { error } = await client.from(NOTIF_TABLE).insert({
        id: notification.id,
        user_id: notification.userId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        link: notification.link ?? null,
        read: false,
        created_at: notification.createdAt,
      });
      if (!error) return notification;
    } catch { /* fall through */ }
  }

  // In-memory fallback
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
        const { count: unreadCount } = await client
          .from(NOTIF_TABLE)
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('read', false);

        return {
          notifications: data.map(mapDbToNotification),
          total: count ?? 0,
          unreadCount: unreadCount ?? 0,
          page,
          pageSize,
        };
      }
    } catch { /* fall through */ }
  }

  // In-memory fallback
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
 * Mark a notification as read.
 */
export async function markRead(id: string): Promise<void> {
  const client = getSupabaseClientSafe();
  if (client) {
    try {
      const { error } = await client
        .from(NOTIF_TABLE)
        .update({ read: true })
        .eq('id', id);
      if (!error) return;
    } catch { /* fall through */ }
  }

  // In-memory fallback
  for (const [, notifs] of memoryNotifications) {
    const notif = notifs.find(n => n.id === id);
    if (notif) {
      notif.read = true;
      return;
    }
  }
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
      if (!error) return;
    } catch { /* fall through */ }
  }

  // In-memory fallback
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
        .single();

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
    } catch { /* fall through */ }
  }

  // In-memory / default
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
      await client.from(PREF_TABLE).upsert({
        user_id: userId,
        standard_updates: updated.standardUpdates,
        keyword_news: updated.keywordNews,
        cert_alerts: updated.certAlerts,
        calc_complete: updated.calcComplete,
        community_answers: updated.communityAnswers,
        email: updated.email,
        push: updated.push,
      });
    } catch { /* fall through */ }
  }

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
    link: (row.link as string) ?? undefined,
    read: row.read as boolean,
    createdAt: row.created_at as string,
  };
}
