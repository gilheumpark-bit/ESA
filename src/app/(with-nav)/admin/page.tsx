'use client';

/**
 * ESVA Enterprise Admin Dashboard
 * ---------------------------------
 * Tenant info, SSO config, user management, audit log viewer, usage stats.
 * Only accessible by enterprise tier users.
 *
 * PART 1: Types & constants
 * PART 2: Loading skeleton
 * PART 3: Section components
 * PART 4: Audit log table
 * PART 5: Helpers
 * PART 6: Main page (fetches from /api/admin)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Users,
  FileText,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Building2,
  Key,
  BarChart3,
  AlertCircle,
  Filter,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Constants
// ═══════════════════════════════════════════════════════════════════════════════

interface TenantInfo {
  id: string;
  name: string;
  domain: string;
  plan: string;
  maxUsers: number;
  currentUsers: number;
  features: string[];
  ssoType?: string;
  ssoIssuer?: string;
}

interface AuditRow {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: string;
  ip?: string;
  createdAt: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  lastLogin: string;
}

interface UsageStat {
  label: string;
  value: string;
  /** 증감 표시 — 실측 집계가 없는 database 모드에서는 생략됨 */
  delta?: string;
}

interface AdminData {
  /** database 모드에서는 테넌트 테이블 미구축으로 null */
  tenant: TenantInfo | null;
  users: UserRow[];
  auditLog: AuditRow[];
  auditTotalPages: number;
  usage: UsageStat[];
  counts: { userCount: number | null; calculationCount: number | null };
}

type AdminTab = 'tenant' | 'sso' | 'users' | 'audit' | 'usage';

const TAB_CONFIG: { key: AdminTab; label: string; icon: typeof Shield }[] = [
  { key: 'tenant', label: '테넌트 정보', icon: Building2 },
  { key: 'sso', label: 'SSO 설정', icon: Key },
  { key: 'users', label: '사용자 관리', icon: Users },
  { key: 'audit', label: '감사 로그', icon: FileText },
  { key: 'usage', label: '사용 통계', icon: BarChart3 },
];

const ACTION_LABELS: Record<string, string> = {
  'calc.execute': '계산 실행',
  'calc.export': '계산 내보내기',
  'search.query': '검색',
  'auth.login': '로그인',
  'auth.logout': '로그아웃',
  'project.create': '프로젝트 생성',
  'project.share': '프로젝트 공유',
  'notarize': 'IPFS 타임스탬프',
  'settings.change': '설정 변경',
  'ocr.recognize': 'OCR 인식',
  'sld.analyze': 'SLD 분석',
};

const FEATURE_LABELS: Record<string, string> = {
  custom_llm: '커스텀 LLM',
  audit_log: '감사 로그',
  api_access: 'API 접근',
  sso: 'SSO 인증',
  on_premise: '온프레미스',
  dedicated_support: '전담 지원',
  custom_calculators: '커스텀 계산기',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Loading Skeleton
// ═══════════════════════════════════════════════════════════════════════════════

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-[var(--bg-secondary)] ${className ?? ''}`} />
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Tab bar skeleton */}
      <div className="flex gap-1 rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-9 w-28" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--border-default)] p-4">
            <SkeletonBlock className="mb-2 h-3 w-20" />
            <SkeletonBlock className="h-6 w-32" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--border-default)] p-4">
        <SkeletonBlock className="mb-4 h-4 w-24" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Section Components
// ═══════════════════════════════════════════════════════════════════════════════

function TenantNotConfigured() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center">
      <Building2 size={32} className="mx-auto text-[var(--text-tertiary)]" />
      <p className="mt-3 text-sm font-medium text-[var(--text-primary)]">
        테넌트 구성이 아직 없습니다
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        플랜·SSO 등 테넌트 설정은 엔터프라이즈 온보딩 시 ESVA 관리팀이 구성합니다.
      </p>
    </div>
  );
}

function TenantSection({ tenant }: { tenant: TenantInfo | null }) {
  if (!tenant) return <TenantNotConfigured />;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <InfoCard label="조직명" value={tenant.name} />
        <InfoCard label="도메인" value={tenant.domain} />
        <InfoCard label="플랜" value={tenant.plan} />
        <InfoCard label="사용자" value={`${tenant.currentUsers} / ${tenant.maxUsers}`} />
      </div>

      <div className="rounded-xl border border-[var(--border-default)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">활성화된 기능</h3>
        <div className="flex flex-wrap gap-2">
          {tenant.features.map(f => (
            <span
              key={f}
              className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700"
            >
              {FEATURE_LABELS[f] ?? f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SSOSection({ tenant }: { tenant: TenantInfo | null }) {
  if (!tenant) return <TenantNotConfigured />;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border-default)] p-4">
        <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">SSO 설정</h3>

        {tenant.ssoType ? (
          <div className="space-y-3">
            <InfoRow label="SSO 유형" value={tenant.ssoType.toUpperCase()} />
            {tenant.ssoIssuer && (
              <InfoRow label="Issuer URL" value={tenant.ssoIssuer} />
            )}
            <div className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
              SSO가 구성되어 있습니다. {tenant.domain} 도메인 사용자는 SSO로 로그인됩니다.
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
            SSO가 구성되지 않았습니다. 엔터프라이즈 지원팀에 문의하세요.
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[var(--border-default)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">SSO 배포 상태</h3>
        <p className="text-sm text-[var(--text-secondary)]">
          이 저장소에는 범용 SAML/OIDC 콜백 라우트가 포함되어 있지 않습니다. 위 값은
          테넌트 구성 인벤토리이며, 로그인 기능으로 활성화하려면 배포별 IdP 연동과 실제
          콜백 왕복 검증이 먼저 필요합니다.
        </p>
      </div>
    </div>
  );
}

function UsersSection({ users }: { users: UserRow[] }) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-default)] bg-[var(--bg-secondary)]">
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-tertiary)]">이름</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-tertiary)]">이메일</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-tertiary)]">역할</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-tertiary)]">최근 로그인</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id} className="border-b border-[var(--border-default)] last:border-b-0">
              <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{user.name}</td>
              <td className="px-4 py-3 text-[var(--text-secondary)]">{user.email}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {user.role === 'admin' ? '관리자' : '사용자'}
                </span>
              </td>
              <td className="px-4 py-3 text-[var(--text-tertiary)]">{user.lastLogin}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsageSection({ stats }: { stats: UsageStat[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {stats.map(stat => (
        <div
          key={stat.label}
          className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4"
        >
          <p className="text-xs font-medium text-[var(--text-tertiary)]">{stat.label}</p>
          <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{stat.value}</p>
          {stat.delta && <p className="mt-0.5 text-xs text-green-600">{stat.delta}</p>}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Audit Log Table
// ═══════════════════════════════════════════════════════════════════════════════

const AUDIT_PAGE_SIZE = 10;

function AuditLogSection({
  entries: initialEntries,
}: {
  entries: AuditRow[];
  totalPages: number;
}) {
  const [entries] = useState<AuditRow[]>(initialEntries);
  const [actionFilter, setActionFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const filtered = entries.filter(e => {
    if (actionFilter && e.action !== actionFilter) return false;
    if (searchQuery && !e.resource.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // \uD544\uD130/\uAC80\uC0C9 \uACB0\uACFC\uB97C \uD074\uB77C\uC774\uC5B8\uD2B8\uC5D0\uC11C \uD398\uC774\uC9C0 \uBD84\uD560\uD55C\uB2E4. \uC11C\uBC84\uB294 \uCD5C\uC2E0 20\uAC74\uC744 \uB2E8\uC77C
  // \uD398\uC774\uC9C0\uB85C\uB9CC \uC8FC\uBBC0\uB85C(auditTotalPages=1) \uAE30\uC874 \uD398\uC774\uC9C0\uB124\uC774\uC158\uC740 \uC8FD\uC5B4 \uC788\uC5C8\uB2E4 (bug M4).
  const totalPages = Math.max(1, Math.ceil(filtered.length / AUDIT_PAGE_SIZE));
  const pageEntries = filtered.slice((page - 1) * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE);

  // \uD544\uD130\u00B7\uAC80\uC0C9\uC774 \uBC14\uB00C\uBA74 1\uD398\uC774\uC9C0\uB85C \uB418\uB3CC\uB9B0\uB2E4 (\uBC94\uC704 \uBC16 \uD398\uC774\uC9C0 \uBC29\uC9C0).
  const handleExportCSV = useCallback(async () => {
    setExporting(true);
    try {
      // \uD604\uC7AC \uD544\uD130\u00B7\uAC80\uC0C9\uC774 \uC801\uC6A9\uB41C \uACB0\uACFC \uC804\uCCB4\uB97C \uB0B4\uBCF4\uB0B8\uB2E4 (bug L8: \uD544\uD130 \uBB34\uC2DC \uC218\uC815).
      const csv = filtered.map(e =>
        `"${e.createdAt}","${e.userId}","${e.action}","${e.resource}","${e.ip ?? ''}"`,
      ).join('\n');
      const header = '"Timestamp","User","Action","Resource","IP"\n';
      const blob = new Blob(['\uFEFF' + header + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="리소스 검색..."
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter size={14} className="text-[var(--text-tertiary)]" />
          <select
            value={actionFilter}
            onChange={e => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-2 text-xs"
          >
            <option value="">전체 액션</option>
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={exporting}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
        >
          <Download size={14} />
          CSV 내보내기
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-default)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-default)] bg-[var(--bg-secondary)]">
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-tertiary)]">시간</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-tertiary)]">사용자</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-tertiary)]">액션</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-tertiary)]">리소스</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-tertiary)]">IP</th>
            </tr>
          </thead>
          <tbody>
            {pageEntries.map(entry => (
              <tr key={entry.id} className="border-b border-[var(--border-default)] last:border-b-0">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--text-tertiary)]">
                  {new Date(entry.createdAt).toLocaleString('ko-KR')}
                </td>
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{entry.userId}</td>
                <td className="px-4 py-3">
                  <span className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{entry.resource}</td>
                <td className="px-4 py-3 text-xs text-[var(--text-tertiary)]">{entry.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-tertiary)]">
          {filtered.length}건 표시
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
      <p className="text-xs font-medium text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-28 shrink-0 text-[var(--text-tertiary)]">{label}</span>
      <span className="font-medium text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function AdminDashboard() {
  const { tier } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('tenant');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AdminData | null>(null);
  const [dataSource, setDataSource] = useState<'database' | 'unavailable'>('unavailable');
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch admin data from API on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchAdmin() {
      if (tier !== 'enterprise') {
        if (!cancelled) setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        // API는 Firebase JWT를 요구한다 — 대시보드 페이지와 동일한 토큰 패턴
        const { getIdToken } = await import('@/lib/firebase');
        const token = await getIdToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/admin', { headers });
        if (!res.ok) {
          const failure = await res.json().catch(() => null) as { error?: string } | null;
          throw new Error(failure?.error ?? `관리자 데이터 요청 실패 (${res.status})`);
        }
        const json = await res.json();

        if (!cancelled && json.ok) {
          const adminData = json.data as AdminData;
          setData(adminData);
          const source = json.source === 'database' ? 'database' : 'unavailable';
          setDataSource(source);
          if (source === 'unavailable') {
            setLoadError('관리 데이터 저장소가 연결되지 않았습니다. 임의의 데모 값은 표시하지 않습니다.');
          }
        }
      } catch (error) {
        if (!cancelled) {
          setData(null);
          setDataSource('unavailable');
          setLoadError(error instanceof Error ? error.message : '관리자 데이터를 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAdmin();
    return () => { cancelled = true; };
  }, [tier]);

  // Gate: enterprise only
  if (tier !== 'enterprise') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <AlertCircle size={48} className="mx-auto text-[var(--text-tertiary)]" />
        <h1 className="mt-4 text-xl font-bold text-[var(--text-primary)]">
          엔터프라이즈 전용 기능
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          관리자 대시보드는 Enterprise 플랜 사용자만 접근할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Shield size={24} className="text-[var(--color-primary)]" />
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            관리자 대시보드
          </h1>
          {loading && (
            <Loader2 size={16} className="animate-spin text-[var(--text-tertiary)]" />
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {data?.tenant?.name ?? 'ESVA'} - Enterprise 관리
          {dataSource === 'unavailable' && !loading && (
            <span className="ml-2 rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">
              저장소 미연결
            </span>
          )}
        </p>
      </div>

      {/* Loading state */}
      {loading && <DashboardSkeleton />}

      {!loading && loadError && (
        <div role="alert" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {loadError}
        </div>
      )}

      {/* Loaded state */}
      {!loading && data && (
        <>
          {/* Tabs */}
          <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-1">
            {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-[var(--bg-primary)] text-[var(--color-primary)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'tenant' && <TenantSection tenant={data.tenant} />}
          {activeTab === 'sso' && <SSOSection tenant={data.tenant} />}
          {activeTab === 'users' && <UsersSection users={data.users} />}
          {activeTab === 'audit' && (
            <AuditLogSection
              entries={data.auditLog}
              totalPages={data.auditTotalPages}
            />
          )}
          {activeTab === 'usage' && <UsageSection stats={data.usage} />}
        </>
      )}
    </div>
  );
}
