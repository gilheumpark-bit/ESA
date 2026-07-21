/** Authenticated field SOS event persistence and configured in-app escalation. */

import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/api/api-handler';
import { createNotification } from '@/lib/notifications';
import { extractVerifiedUser } from '@/lib/auth-helpers';
import { ensureUserProfile, getSupabaseAdmin } from '@/lib/supabase';

interface SosRequest {
  sessionId: string;
  workSite?: string;
  sosTimestamp: number;
  workers?: number;
}

function configuredRecipients(): string[] {
  return [...new Set((process.env.FIELD_SOS_RECIPIENT_UIDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean))].slice(0, 50);
}

export const POST = withApiHandler(
  { rateLimit: 'default', checkOrigin: true },
  async (req: NextRequest, ctx) => {
    const user = await extractVerifiedUser(req);
    if (!user) return ctx.error('ESVA-1001', '로그인이 필요합니다.', 401);

    const body = await req.json() as SosRequest;
    const { sessionId, workSite, sosTimestamp, workers } = body;
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(sessionId ?? '')) {
      return ctx.error('ESA-4001', '유효한 sessionId가 필요합니다.', 400);
    }
    const now = Date.now();
    if (!Number.isFinite(sosTimestamp) || sosTimestamp < now - 86_400_000 || sosTimestamp > now + 300_000) {
      return ctx.error('ESA-4001', 'SOS 시각이 허용 범위를 벗어났습니다.', 400);
    }
    if (workers !== undefined && (!Number.isInteger(workers) || workers < 0 || workers > 10_000)) {
      return ctx.error('ESA-4001', '작업자 수가 유효하지 않습니다.', 400);
    }

    const isoTime = new Date(sosTimestamp).toISOString();
    const site = workSite ? ctx.sanitize(workSite).slice(0, 200) : '현장 미상';
    await ensureUserProfile(user.uid, user.email);
    const admin = getSupabaseAdmin();
    const { data: event, error } = await admin
      .from('field_safety_events')
      .insert({
        user_id: user.uid,
        session_id: sessionId,
        event_type: 'sos',
        work_site: site,
        worker_count: workers ?? null,
        occurred_at: isoTime,
        payload: { source: 'dead-man-switch' },
      })
      .select('id')
      .single();
    if (error || !event) {
      throw new Error(`ESVA-7801: SOS 기록 저장 실패: ${error?.message ?? 'unknown error'}`);
    }

    const recipients = configuredRecipients();
    const notifications = await Promise.allSettled(recipients.map((recipientId) =>
      createNotification({
        userId: recipientId,
        type: 'system',
        title: `SOS — ${site}`,
        body: `데드맨 스위치 발동 | 작업자: ${workers ?? '미상'} | 시각: ${isoTime}`,
        link: `/field?session=${encodeURIComponent(sessionId)}`,
        metadata: { eventId: event.id, sessionId, actorUid: user.uid },
      }),
    ));
    const delivered = notifications.filter((result) => result.status === 'fulfilled').length;

    console.error(`[ESVA SOS] event=${event.id} session=${sessionId} actor=${user.uid} delivered=${delivered}`);
    return ctx.ok({
      recorded: true,
      eventId: event.id,
      timestamp: isoTime,
      channels: { inApp: delivered, sms: 0, email: 0, push: 0 },
      message: delivered > 0
        ? `SOS를 기록하고 설정된 관리자 ${delivered}명에게 인앱 알림을 보냈습니다. 외부 자동 신고는 없습니다.`
        : 'SOS는 기록됐지만 설정된 관리자 수신자가 없습니다. 비상 연락망으로 직접 연락하세요.',
    });
  },
);
