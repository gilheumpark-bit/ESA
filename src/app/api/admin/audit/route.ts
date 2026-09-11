import { NextRequest, NextResponse } from 'next/server';
import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { applyRateLimit } from '@/lib/rate-limit';
import { withRequestLog } from '@/lib/api/with-request-log';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function GET__impl(request: NextRequest) {
  const blocked = applyRateLimit(request, 'default');
  if (blocked) return blocked;
  const uid = await extractVerifiedUserId(request);
  if (!uid) return json({ success: false, error: { message: '로그인이 필요합니다.' } }, 401);
  try {
    const db = getSupabaseAdmin();
    const { data: member, error: roleError } = await db.from('users').select('role').eq('id', uid).single();
    if (roleError || member?.role !== 'admin') return json({ success: false, error: { message: '관리자 권한이 필요합니다.' } }, 403);
    const params = request.nextUrl.searchParams;
    const pageRaw = params.get('page') ?? '1';
    const page = /^\d{1,5}$/.test(pageRaw) ? Number(pageRaw) : 0;
    const action = params.get('action') ?? '', search = params.get('search') ?? '';
    if (page < 1 || page > 10000 || action.length > 80 || !/^[a-zA-Z0-9_.-]*$/.test(action)
      || search.length > 200 || /[\u0000-\u001f]/.test(search)) return json({ success: false, error: { message: '조회 조건을 확인해 주세요.' } }, 400);
    const pageSize = 20;
    let query = db.from('audit_log').select('id,user_id,action,resource,resource_id,ip,created_at', { count: 'exact' })
      .order('created_at', { ascending: false }).order('id', { ascending: false });
    if (action) query = query.eq('action', action);
    if (search.trim()) query = query.ilike('resource', `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`);
    const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
    if (error || data === null || !Number.isSafeInteger(count) || Number(count) < 0) return json({ success: false, error: { message: '감사로그 조회에 실패했습니다. 빈 목록으로 처리하지 않았습니다.' } }, 503);
    return json({ success: true, data: { entries: data.map((row) => ({ id: row.id, userId: row.user_id ?? '',
      action: row.action ?? '', resource: row.resource ?? '', resourceId: row.resource_id ?? undefined,
      ip: row.ip ?? undefined, createdAt: row.created_at ?? '' })), page, pageSize, totalCount: count,
      totalPages: Math.max(1, Math.ceil(Number(count) / pageSize)), scope: 'system-admin' } });
  } catch { return json({ success: false, error: { message: '감사로그 저장소를 사용할 수 없습니다.' } }, 503); }
}
export const GET = withRequestLog(GET__impl);
