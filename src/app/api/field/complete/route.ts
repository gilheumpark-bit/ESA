/**
 * POST /api/field/complete
 *
 * 작업 완료 신고 API
 * - SHA-256 해시 감사 영수증 생성
 * - 관리자 알림 발송 (existing notifications system)
 *
 * PART 1: 요청 타입
 * PART 2: 핸들러
 */

import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { withApiHandler } from '@/lib/api/api-handler';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 요청 타입
// ═══════════════════════════════════════════════════════════════════════════════

interface FieldCompleteRequest {
  sessionId: string;
  workSite: string;
  workerCount: number;
  supervisorIds: string[];        // 알림 수신자 ID
  checklistDone: string[];        // 완료된 체크 항목 ID 목록
  checklistTotal: number;
  completedAt: string;            // ISO string
  note?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 핸들러
// ═══════════════════════════════════════════════════════════════════════════════

export const POST = withApiHandler(
  { rateLimit: 'calculate', checkOrigin: true },
  async (req: NextRequest, ctx) => {
    const body = await req.json() as FieldCompleteRequest;

    const {
      sessionId,
      workSite,
      workerCount,
      supervisorIds,
      checklistDone,
      checklistTotal,
      completedAt,
      note,
    } = body;

    if (!sessionId || !workSite || !completedAt) {
      return ctx.error('ESA-4001', '필수 항목 누락: sessionId, workSite, completedAt', 400);
    }

    // ── SHA-256 감사 영수증 생성
    const payload = JSON.stringify({
      sessionId,
      workSite: ctx.sanitize(workSite),
      workerCount,
      checklistDone: checklistDone.sort(), // 결정론적 정렬
      checklistTotal,
      completedAt,
    });

    const hash = createHash('sha256').update(payload).digest('hex');

    const receipt = {
      hash,
      algorithm: 'SHA-256',
      payload: JSON.parse(payload),
      completionRate: checklistTotal > 0 ? Math.round((checklistDone.length / checklistTotal) * 100) : 0,
      issuedAt: new Date().toISOString(),
      standard: '2026-04-16 기준 산업안전보건법 시행규칙',
      disclaimer: '본 영수증은 데이터 무결성을 증명하며, 법적 책임의 대체 수단이 아닙니다.',
    };

    // ── 관리자 알림 발송 (in-app 알림 시스템 활용) — Promise.allSettled로 실패 추적
    const notifResult: { sent: number; failed: number } = { sent: 0, failed: 0 };
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

    const notifPromises = (supervisorIds ?? []).map(async (supervisorId) => {
      const res = await fetch(`${baseUrl}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal': 'field-complete' },
        body: JSON.stringify({
          userId: supervisorId,
          type: 'system',
          title: `[현장 완료] ${ctx.sanitize(workSite)}`,
          message: `작업자 ${workerCount}명 전원 이상 없음, 작업 종료. 영수증 SHA-256: ${hash.slice(0, 12)}…${note ? ` / ${ctx.sanitize(note)}` : ''}`,
          metadata: { hash, sessionId },
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} — supervisorId=${supervisorId}`);
      }
    });

    const results = await Promise.allSettled(notifPromises);
    for (const r of results) {
      if (r.status === 'fulfilled') {
        notifResult.sent++;
      } else {
        notifResult.failed++;
        console.error('[field/complete] 알림 발송 실패:', r.reason instanceof Error ? r.reason.message : r.reason);
      }
    }

    return ctx.ok({
      receipt,
      notifications: notifResult,
      message: `작업 완료 신고 완료. 관리자 ${notifResult.sent}명 알림 발송.`,
    });
  },
);
