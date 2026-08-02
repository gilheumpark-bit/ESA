import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedUser } from '@/lib/auth-helpers';
import { applyRateLimit } from '@/lib/rate-limit';
import { ensureUserProfile, getUserTier } from '@/lib/supabase';
import { claimProjectInvitations } from '@/lib/collaboration';
import { OPEN_BETA, OPEN_BETA_TIER } from '@/lib/tier-gate';
import { withRequestLog } from '@/lib/api/with-request-log';

async function GET__impl(request: NextRequest) {
  const blocked = applyRateLimit(request, 'default');
  if (blocked) return blocked;

  const user = await extractVerifiedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  await ensureUserProfile(user.uid, user.email);
  if (user.email && user.emailVerified === true) {
    await claimProjectInvitations(user.uid, user.email);
  }
  // OPEN_BETA 면 화면 게이트가 보는 등급도 함께 연다. 여기서 원본 등급을
  // 그대로 돌려주면 API 는 통과하는데 화면만 「엔터프라이즈 전용」으로 막혀
  // 스위치가 절반만 닿는다(실측 2026-08-01).
  const tier = OPEN_BETA ? OPEN_BETA_TIER : await getUserTier(user.uid);
  return NextResponse.json(
    { success: true, data: { tier } },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  );
}

export const GET = withRequestLog(GET__impl);
