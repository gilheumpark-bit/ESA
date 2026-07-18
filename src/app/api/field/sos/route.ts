/**
 * POST /api/field/sos
 *
 * 데드맨 스위치 SOS 신호 수신 — 현장 무응답 긴급 알림
 *
 * 클라이언트(DeadManSwitch) → 이 라우트 → createNotification + console.error
 *
 * PART 1: 타입
 * PART 2: 핸들러
 */

import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/api/api-handler';
import { createNotification } from '@/lib/notifications';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 타입
// ═══════════════════════════════════════════════════════════════════════════════

interface SosRequest {
  sessionId: string;
  workSite?: string;
  sosTimestamp: number;
  workers?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 핸들러
// ═══════════════════════════════════════════════════════════════════════════════

export const POST = withApiHandler(
  { rateLimit: 'default', checkOrigin: true },
  async (req: NextRequest, ctx) => {
    const body = await req.json() as SosRequest;
    const { sessionId, workSite, sosTimestamp, workers } = body;

    if (!sessionId || typeof sessionId !== 'string') {
      return ctx.error('ESA-4001', 'sessionId 필수', 400);
    }
    if (typeof sosTimestamp !== 'number' || sosTimestamp <= 0) {
      return ctx.error('ESA-4001', 'sosTimestamp 필수 (Unix ms)', 400);
    }

    const isoTime = new Date(sosTimestamp).toISOString();
    const site = workSite ? ctx.sanitize(workSite) : '현장 미상';
    const workerStr = workers != null ? `${workers}명` : '인원 미상';

    // ── 시스템 알림 생성 (in-memory + Supabase 저장)
    const notification = await createNotification({
      userId: 'system-sos',   // 시스템 수신 채널 (추후 관리자 ID로 교체 가능)
      type: 'system',
      title: `🚨 SOS — ${site}`,
      body:
        `데드맨 스위치 SOS 발동 | ` +
        `현장: ${site} | 작업자: ${workerStr} | ` +
        `시각: ${isoTime} | 세션: ${sessionId}`,
      link: `/field?session=${sessionId}`,
    });

    // ── 서버 측 긴급 로그 (운영 모니터링/알람 연동 포인트)
    console.error(
      `[ESVA SOS] session=${sessionId} site="${site}" workers=${workerStr} time=${isoTime}`,
    );

    return ctx.ok({
      received: true,
      notificationId: notification.id,
      timestamp: isoTime,
      message: '긴급 신호 수신 완료 — 즉시 현장 확인 바랍니다.',
    });
  },
);
