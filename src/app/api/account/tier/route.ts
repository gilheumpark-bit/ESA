import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedUser } from '@/lib/auth-helpers';
import { applyRateLimit } from '@/lib/rate-limit';
import { ensureUserProfile, getUserTier } from '@/lib/supabase';
import { claimProjectInvitations } from '@/lib/collaboration';

export async function GET(request: NextRequest) {
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
  const tier = await getUserTier(user.uid);
  return NextResponse.json(
    { success: true, data: { tier } },
    { headers: { 'Cache-Control': 'private, max-age=60' } },
  );
}
