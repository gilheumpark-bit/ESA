/**
 * ESVA Admin Dashboard API
 * -------------------------
 * Returns tenant overview: user count, calculation count,
 * recent audit log entries, and usage statistics.
 *
 * Attempts to read from Supabase. Falls back to mock data
 * when the database is unavailable or tables do not yet exist.
 *
 * PART 1: Types
 * PART 2: Mock fallback data
 * PART 3: Supabase queries
 * PART 4: GET handler
 */

import { applyRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-id-token';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface AdminDashboardResponse {
  success: boolean;
  data: AdminDashboardData;
  /** true면 Supabase 미연결 → 데모 데이터 표시 중 */
  isDemo: boolean;
}

export interface AdminDashboardData {
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
  };
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
    delta: string;
  }[];
  counts: {
    userCount: number;
    calculationCount: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Mock fallback data
// ═══════════════════════════════════════════════════════════════════════════════

function getMockData(): AdminDashboardData {
  return {
    tenant: {
      id: 'tenant_001',
      name: 'ESVA Enterprise',
      domain: 'company.com',
      plan: 'Enterprise',
      maxUsers: 50,
      currentUsers: 23,
      features: ['sso', 'audit_log', 'api_access', 'custom_llm', 'dedicated_support', 'custom_calculators'],
      ssoType: 'oidc',
      ssoIssuer: 'https://login.microsoftonline.com/tenant-id',
    },
    users: [
      { id: '1', name: '김철수', email: 'chulsoo@company.com', role: 'admin', lastLogin: '2026-04-05' },
      { id: '2', name: '이영희', email: 'younghee@company.com', role: 'user', lastLogin: '2026-04-04' },
      { id: '3', name: '박지성', email: 'jisung@company.com', role: 'user', lastLogin: '2026-04-03' },
    ],
    auditLog: [
      { id: '1', userId: 'user1', action: 'calc.execute', resource: 'voltage-drop', createdAt: '2026-04-05T10:30:00Z', ip: '192.168.1.100' },
      { id: '2', userId: 'user2', action: 'search.query', resource: 'KEC 전압강하', createdAt: '2026-04-05T10:15:00Z', ip: '192.168.1.101' },
      { id: '3', userId: 'user1', action: 'auth.login', resource: 'sso', createdAt: '2026-04-05T09:00:00Z', ip: '192.168.1.100' },
      { id: '4', userId: 'user3', action: 'calc.export', resource: 'cable-sizing', createdAt: '2026-04-04T17:45:00Z', ip: '192.168.1.102' },
      { id: '5', userId: 'user2', action: 'project.create', resource: '신축공사 프로젝트', createdAt: '2026-04-04T14:20:00Z', ip: '192.168.1.101' },
    ],
    auditTotalPages: 3,
    usage: [
      { label: '이번 달 계산 횟수', value: '2,847', delta: '+12%' },
      { label: '활성 사용자', value: '23', delta: '+3' },
      { label: 'API 호출', value: '15,392', delta: '+8%' },
      { label: '저장 용량', value: '4.2 GB', delta: '+0.3 GB' },
    ],
    counts: {
      userCount: 23,
      calculationCount: 2847,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Supabase queries (best-effort)
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchLiveData(): Promise<AdminDashboardData | null> {
  try {

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) return null;

    // Dynamic import to avoid build failures when supabase is not configured
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // User count — try profiles table, fall back to auth.users is not accessible via client
    const { count: userCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // Calculation count from calculation_receipts
    const { count: calcCount } = await supabase
      .from('calculation_receipts')
      .select('*', { count: 'exact', head: true });

    // Recent audit log entries (latest 20)
    const { data: auditRows } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    // Users list (from profiles)
    const { data: userRows } = await supabase
      .from('profiles')
      .select('id, display_name, email, role, last_sign_in')
      .order('last_sign_in', { ascending: false })
      .limit(50);

    const mock = getMockData();

    return {
      tenant: mock.tenant, // Tenant config is not in DB yet — keep mock
      users: userRows?.map(u => ({
        id: u.id,
        name: u.display_name ?? u.email?.split('@')[0] ?? 'Unknown',
        email: u.email ?? '',
        role: u.role ?? 'user',
        lastLogin: u.last_sign_in ?? '',
      })) ?? mock.users,
      auditLog: auditRows?.map(r => ({
        id: r.id,
        userId: r.user_id ?? r.userId ?? '',
        action: r.action ?? '',
        resource: r.resource ?? '',
        resourceId: r.resource_id ?? undefined,
        details: r.details ?? undefined,
        ip: r.ip ?? undefined,
        createdAt: r.created_at ?? '',
      })) ?? mock.auditLog,
      auditTotalPages: mock.auditTotalPages,
      usage: mock.usage, // Usage stats require aggregation — keep mock for now
      counts: {
        userCount: userCount ?? mock.counts.userCount,
        calculationCount: calcCount ?? mock.counts.calculationCount,
      },
    };
  } catch {
    // Any Supabase error → fall back to mock
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — GET handler
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  // ── Auth: require valid Firebase JWT ──
  const authHeader = request.headers.get('Authorization') ?? request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const decoded = await verifyIdToken(token);
    if (!decoded?.uid) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }

  const liveData = await fetchLiveData();
  const data = liveData ?? getMockData();

  return NextResponse.json({
    ok: true,
    source: liveData ? 'database' : 'mock',
    data,
  });
}
