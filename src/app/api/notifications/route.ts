/**
 * ESVA Notifications API
 * ----------------------
 * GET: list user notifications (paginated)
 * PATCH: mark read (single or all)
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import {
  getUserNotifications,
  markRead,
  markAllRead,
  type NotificationType,
} from '@/lib/notifications';
import { verifyIdToken } from '@/lib/firebase-id-token';

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

    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);
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
    const message = err instanceof Error ? err.message : 'Failed to fetch notifications';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
      await markRead(notificationId);
      return NextResponse.json({ success: true, message: 'Notification marked as read' });
    }

    return NextResponse.json(
      { error: 'Provide notificationId or { userId, markAll: true }' },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update notification';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
