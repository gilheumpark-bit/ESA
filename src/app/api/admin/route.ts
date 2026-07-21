/**
 * ESVA Admin Dashboard API
 * -------------------------
 * Returns tenant overview: user count, calculation count,
 * recent audit log entries, and usage statistics.
 *
 * Reads verified data from Supabase and reports an explicit unavailable state
 * when the database is not configured.
 *
 * PART 1: Types
 * PART 2: Unavailable-state data
 * PART 3: Supabase queries
 * PART 4: GET handler
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-id-token';
import { getSupabaseAdmin } from '@/lib/supabase';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface AdminDashboardResponse {
  ok: boolean;
  /** 'database' = 실측값 / 'unavailable' = 저장소 미연결 */
  source: 'database' | 'unavailable';
  data: AdminDashboardData;
}

export interface AdminDashboardData {
  /** 테넌트 구성 — DB에 테넌트 테이블이 아직 없으므로 database 모드에서는 null */
  tenant: {
    id: string;
    name: string;
    domain: string;
    plan: string;
    maxUsers: number;
    currentUsers: number;
    features: string[];
    ssoType?: string;
    ssoIssuer?: string;
  } | null;
  users: {
    id: string;
    name: string;
    email: string;
    role: string;
    lastLogin: string;
  }[];
  auditLog: {
    id: string;
    userId: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: string;
    ip?: string;
    createdAt: string;
  }[];
  auditTotalPages: number;
  usage: {
    label: string;
    value: string;
    /** 증감 표시 — 집계원이 없는 database 모드에서는 생략 */
    delta?: string;
  }[];
  counts: {
    userCount: number | null;
    calculationCount: number | null;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Explicit unavailable state
// ═══════════════════════════════════════════════════════════════════════════════

function getUnavailableData(): AdminDashboardData {
  return {
    tenant: null,
    users: [],
    auditLog: [],
    auditTotalPages: 0,
    usage: [],
    counts: { userCount: null, calculationCount: null },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Supabase queries (best-effort)
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchLiveData(): Promise<AdminDashboardData | null> {
  try {

    const supabase = getSupabaseAdmin();

    // User count from the Firebase-synced application users table.
    const { count: userCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Calculation count from calculation_receipts
    const { count: calcCount } = await supabase
      .from('calculation_receipts')
      .select('*', { count: 'exact', head: true });

    // 핵심 테이블이 하나도 안 읽히면 DB 미준비 상태를 명시한다.
    // 목업 값을 실제 데이터처럼 반환하지 않는다.
    if (userCount == null && calcCount == null) return null;

    // Recent audit log entries (latest 20)
    const { data: auditRows } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    // Users list from the same identity source used by authorization.
    const { data: userRows } = await supabase
      .from('users')
      .select('id, nickname, email, role, last_sign_in')
      .order('last_sign_in', { ascending: false })
      .limit(50);

    // usage 타일: 실측 가능한 지표만 노출.
    // API 호출 수·저장 용량·월별 증감은 집계원이 없어 제외한다 (지어내지 않음).
    const usage: AdminDashboardData['usage'] = [];
    if (userCount != null) {
      usage.push({ label: '등록 사용자', value: userCount.toLocaleString('ko-KR') });
    }
    if (calcCount != null) {
      usage.push({ label: '누적 계산 수', value: calcCount.toLocaleString('ko-KR') });
    }

    return {
      tenant: null, // 테넌트 구성 테이블 미구축 — 목업으로 채우지 않는다
      users: userRows?.map(u => ({
        id: u.id,
        name: u.nickname ?? u.email?.split('@')[0] ?? 'Unknown',
        email: u.email ?? '',
        role: u.role ?? 'user',
        lastLogin: u.last_sign_in ?? '',
      })) ?? [],
      auditLog: auditRows?.map(r => ({
        id: r.id,
        userId: r.user_id ?? r.userId ?? '',
        action: r.action ?? '',
        resource: r.resource ?? '',
        resourceId: r.resource_id ?? undefined,
        details: r.details ?? undefined,
        ip: r.ip ?? undefined,
        createdAt: r.created_at ?? '',
      })) ?? [],
      auditTotalPages: 1, // 최신 20건 단일 페이지만 제공 — 가짜 페이지 수 금지
      usage,
      counts: {
        userCount: userCount ?? null,
        calculationCount: calcCount ?? null,
      },
    };
  } catch {
    // Supabase 오류는 명시적인 unavailable 상태로 전환한다.
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — GET handler
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Firebase UID와 동기화된 users 테이블에서 관리자 역할을 확인한다.
 */
async function checkAdminRole(uid: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('users')
      .select('role')
      .eq('id', uid)
      .single();
    return data?.role === 'admin';
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  // Per-route abuse limit.
  const blocked = applyRateLimit(request, 'default');
  if (blocked) return blocked;

  // ── Auth: require valid Firebase JWT ──
  const authHeader = request.headers.get('Authorization') ?? request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    if (!decoded?.uid) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }

  // ── Admin role 검증 ──
  const isAdmin = await checkAdminRole(uid);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
  }

  const liveData = await fetchLiveData();
  const data = liveData ?? getUnavailableData();

  const response: AdminDashboardResponse = {
    ok: true,
    source: liveData ? 'database' : 'unavailable',
    data,
  };
  return NextResponse.json(response);
}
