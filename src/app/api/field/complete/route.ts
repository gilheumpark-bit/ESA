/** Authenticated field-completion receipt persistence and configured notification. */

import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { withApiHandler } from '@/lib/api/api-handler';
import { extractVerifiedUser } from '@/lib/auth-helpers';
import { ensureUserProfile, getSupabaseAdmin } from '@/lib/supabase';
import { createNotification } from '@/lib/notifications';

interface FieldCompleteRequest {
  sessionId: string;
  workSite: string;
  workerCount: number;
  checklistDone: string[];
  checklistTotal: number;
  completedAt: string;
  note?: string;
}

function configuredRecipients(): string[] {
  return [...new Set((process.env.FIELD_SOS_RECIPIENT_UIDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean))].slice(0, 50);
}

export const POST = withApiHandler(
  { rateLimit: 'calculate', checkOrigin: true },
  async (req: NextRequest, ctx) => {
    const user = await extractVerifiedUser(req);
    if (!user) return ctx.error('ESVA-1001', '로그인이 필요합니다.', 401);

    const body = await req.json() as FieldCompleteRequest;
    const { sessionId, workSite, workerCount, checklistDone, checklistTotal, completedAt, note } = body;
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(sessionId ?? '') || !workSite || !completedAt) {
      return ctx.error('ESA-4001', '필수 항목이 누락되었거나 sessionId가 유효하지 않습니다.', 400);
    }
    if (!Number.isInteger(workerCount) || workerCount < 0 || workerCount > 10_000) {
      return ctx.error('ESA-4001', '작업자 수가 유효하지 않습니다.', 400);
    }
    if (!Number.isInteger(checklistTotal) || checklistTotal < 0 || checklistTotal > 1_000 || !Array.isArray(checklistDone)) {
      return ctx.error('ESA-4001', '체크리스트 값이 유효하지 않습니다.', 400);
    }
    const completionMs = Date.parse(completedAt);
    if (!Number.isFinite(completionMs) || completionMs > Date.now() + 300_000) {
      return ctx.error('ESA-4001', '완료 시각이 유효하지 않습니다.', 400);
    }

    const safeSite = ctx.sanitize(workSite).slice(0, 200);
    const uniqueDone = [...new Set(checklistDone.filter((id): id is string => typeof id === 'string'))]
      .slice(0, checklistTotal)
      .sort();
    const payload = {
      actorUid: user.uid,
      sessionId,
      workSite: safeSite,
      workerCount,
      checklistDone: uniqueDone,
      checklistTotal,
      completedAt: new Date(completionMs).toISOString(),
    };
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

    await ensureUserProfile(user.uid, user.email);
    const admin = getSupabaseAdmin();
    const { data: event, error } = await admin
      .from('field_safety_events')
      .insert({
        user_id: user.uid,
        session_id: sessionId,
        event_type: 'completed',
        work_site: safeSite,
        worker_count: workerCount,
        occurred_at: payload.completedAt,
        receipt_hash: hash,
        payload,
      })
      .select('id, created_at')
      .single();
    if (error || !event) {
      throw new Error(`ESVA-7802: 작업 완료 기록 저장 실패: ${error?.message ?? 'unknown error'}`);
    }

    const receipt = {
      eventId: event.id,
      hash,
      algorithm: 'SHA-256',
      payload,
      completionRate: checklistTotal > 0 ? Math.round((uniqueDone.length / checklistTotal) * 100) : 0,
      issuedAt: event.created_at,
      disclaimer: '이 해시는 저장된 완료 기록의 변경 여부를 확인하는 값이며, 법적 책임이나 외부 공증을 대신하지 않습니다.',
    };

    const notifications = await Promise.allSettled(configuredRecipients().map((recipientId) =>
      createNotification({
        userId: recipientId,
        type: 'system',
        title: `현장 완료 — ${safeSite}`,
        body: `작업자 ${workerCount}명, 체크리스트 ${receipt.completionRate}% 완료. 기록 ${hash.slice(0, 12)}${note ? ` / ${ctx.sanitize(note).slice(0, 200)}` : ''}`,
        metadata: { eventId: event.id, hash, sessionId, actorUid: user.uid },
      }),
    ));
    const sent = notifications.filter((result) => result.status === 'fulfilled').length;
    const failed = notifications.length - sent;

    return ctx.ok({
      receipt,
      notifications: { sent, failed },
      message: sent > 0
        ? `작업 완료를 저장하고 관리자 ${sent}명에게 인앱 알림을 보냈습니다.`
        : '작업 완료를 저장했습니다. 설정된 관리자 수신자가 없어 알림은 보내지 않았습니다.',
    });
  },
);
