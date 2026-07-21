/**
 * ESVA Notifications API
 * ----------------------
 * GET: list user notifications (paginated)
 * PATCH: mark read (single or all)
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import {
  createNotification,
  getUserNotifications,
  markRead,
  markAllRead,
  type NotificationType,
} from '@/lib/notifications';
import { verifyIdToken } from '@/lib/firebase-id-token';

const VALID_TYPES: NotificationType[] = [
  'standard_update', 'keyword_news', 'cert_dday', 'calc_complete',
  'project_invite', 'community_answer', 'system',
];

/** Authorization 헤더에서 Firebase JWT를 검증하고 uid를 반환 */
async function authenticateRequest(
  req: NextRequest,
): Promise<{ uid: string } | NextResponse> {
  const authHeader =
    req.headers.get('Authorization') ?? req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
    );
  }
  try {
    const decoded = await verifyIdToken(token);
    if (!decoded?.uid) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const blocked = applyRateLimit(req, 'default');
    if (blocked) return blocked;

    // ── Auth: require valid Firebase JWT ──
    const auth = await authenticateRequest(req);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = req.nextUrl;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    // ── 요청자가 본인의 알림만 조회 가능 ──
    if (userId !== auth.uid) {
      return NextResponse.json(
        { error: 'Forbidden: cannot access another user\'s notifications' },
        { status: 403 },
      );
    }

    // 페이지네이션 NaN·음수·과대 가드(버그 사냥 수리): 미검증 시 range(NaN,NaN)/
    // 음수 오프셋으로 PostgREST 500, 과대 pageSize로 대량 조회. community와 동일 규율.
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10) || 20), 50);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const type = searchParams.get('type') as NotificationType | null;

    const result = await getUserNotifications(userId, {
      page,
      pageSize,
      unreadOnly,
      type: type ?? undefined,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[ESVA Notifications GET]', err);
    return NextResponse.json({ error: '알림을 불러오지 못했습니다.' }, { status: 500 });
  }
}

// ─── POST: 알림 생성 (내부 서버 → 서버 또는 인증된 클라이언트) ─────────────

export async function POST(req: NextRequest) {
  try {
    const blocked = applyRateLimit(req, 'default');
    if (blocked) return blocked;

    // 내부 서버 간 호출은 공유 시크릿으로 인증. 이전의 고정 문자열('field-complete')은
    // 누구나 헤더에 넣을 수 있어 JWT를 우회하고 임의 userId 앞 알림을 주입할 수 있었다.
    // 시크릿 미설정 시 내부 우회를 비활성화하고 항상 JWT를 요구한다(fail-closed).
    const internalSecret = process.env.INTERNAL_API_SECRET;
    const isInternal = !!internalSecret &&
      req.headers.get('x-internal-secret') === internalSecret;
    let authenticatedUid: string | null = null;

    if (!isInternal) {
      const auth = await authenticateRequest(req);
      if (auth instanceof NextResponse) return auth;
      authenticatedUid = auth.uid;
    }

    const body = await req.json() as {
      userId: string;
      type: NotificationType;
      title: string;
      message?: string;
      link?: string;
      metadata?: Record<string, unknown>;
    };

    const { userId, type, title, message, link, metadata } = body;

    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return NextResponse.json({ error: 'userId 필수' }, { status: 400 });
    }
    if (authenticatedUid && userId !== authenticatedUid) {
      return NextResponse.json(
        { error: 'Forbidden: cannot create a notification for another user' },
        { status: 403 },
      );
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'title 필수' }, { status: 400 });
    }
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `잘못된 type. 가능: ${VALID_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    const notification = await createNotification({
      userId,
      type,
      title,
      body: message ?? '',
      link: link ?? undefined,
      metadata: metadata ?? {},
    });

    return NextResponse.json({ success: true, notification });
  } catch (err) {
    console.error('[ESVA Notifications POST]', err);
    return NextResponse.json({ error: '알림을 생성하지 못했습니다.' }, { status: 500 });
  }
}

// ─── PATCH: 읽음 처리 ────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    // Rate limiting on PATCH as well
    const blocked = applyRateLimit(req, 'default');
    if (blocked) return blocked;

    // ── Auth: require valid Firebase JWT ──
    const auth = await authenticateRequest(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { notificationId, userId, markAll } = body as {
      notificationId?: string;
      userId?: string;
      markAll?: boolean;
    };

    // userId 필수 검증
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return NextResponse.json(
        { error: 'userId is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    // ── 요청자가 본인의 알림만 수정 가능 ──
    if (userId !== auth.uid) {
      return NextResponse.json(
        { error: 'Forbidden: cannot modify another user\'s notifications' },
        { status: 403 },
      );
    }

    if (markAll) {
      await markAllRead(userId);
      return NextResponse.json({ success: true, message: 'All notifications marked as read' });
    }

    if (notificationId && typeof notificationId === 'string') {
      const updated = await markRead(notificationId, userId);
      if (!updated) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, message: 'Notification marked as read' });
    }

    return NextResponse.json(
      { error: 'Provide notificationId or { userId, markAll: true }' },
      { status: 400 },
    );
  } catch (err) {
    console.error('[ESVA Notifications PATCH]', err);
    return NextResponse.json({ error: '알림 상태를 변경하지 못했습니다.' }, { status: 500 });
  }
}
