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

import { useState, useCallback } from 'react';
import { useFeatureResource } from '@/hooks/useFeatureResource';
import { featureAuthenticatedFetch } from '@/lib/feature-auth';
import { FeatureRequestError, requestFeatureJson, requireRecord, requireArray, isRecord, unwrapFeatureResponse } from '@/lib/feature-request';
import { featureCsv } from '@/lib/feature-output';
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
import { OPEN_BETA } from '@/lib/tier-gate';

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
        {/* 요금제 봉인(OPEN_BETA) 중에는 플랜·온보딩 표현을 쓰지 않는다 —
            제출본에서 결제 체계를 노출하지 않기로 한 결정을 화면이 따른다. */}
        {OPEN_BETA
          ? 'SSO 등 테넌트 설정은 ESVA 관리팀이 구성합니다.'
          : '플랜·SSO 등 테넌트 설정은 엔터프라이즈 온보딩 시 ESVA 관리팀이 구성합니다.'}
      </p>
    </div>
  );
}

function TenantSection({ tenant }: { tenant: TenantInfo | null }) {
  if (!tenant) return <TenantNotConfigured />;
  return (
    <div className="min-w-0 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <InfoCard label="조직명" value={tenant.name} />
        <InfoCard label="도메인" value={tenant.domain} />
        <InfoCard label="플랜" value={tenant.plan} />
        <InfoCard label="사용자" value={`${tenant.currentUsers} / ${tenant.maxUsers}`} />
      </div>

      <div className="rounded-xl border border-[var(--border-default)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">활성화된 기능</h2>
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
    <div className="min-w-0 space-y-4">
      <div className="rounded-xl border border-[var(--border-default)] p-4">
        <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">SSO 설정</h2>

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
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">SSO 배포 상태</h2>
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

function decodeAudit(value: unknown) {
  const body = requireRecord(unwrapFeatureResponse(value));
  const entries = requireArray(body.entries, (row): row is AuditRow => isRecord(row)
    && ['id','userId','action','resource','createdAt'].every((key) => typeof row[key] === 'string')
    && (row.ip === undefined || typeof row.ip === 'string'), 20);
  if (!Number.isSafeInteger(body.totalPages) || Number(body.totalPages) < 1 || !Number.isSafeInteger(body.totalCount)) throw new FeatureRequestError('감사로그 페이지 정보가 올바르지 않습니다.');
  return { entries, totalPages: Number(body.totalPages), totalCount: Number(body.totalCount) };
}

function AuditLogSection({
  entries: _initialEntries,
}: {
  entries: AuditRow[];
  totalPages: number;
}) {
  const { user } = useAuth();
  const [actionFilter, setActionFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const params = new URLSearchParams({ page: String(page), action: actionFilter, search: searchQuery });
  const query = params.toString();
  const loader = useCallback((signal: AbortSignal) => requestFeatureJson(`/api/admin/audit?${query}`, { signal }, decodeAudit, featureAuthenticatedFetch), [query]);
  const resource = useFeatureResource(user ? `audit:${user.uid}:${query}` : null, loader);
  const entries = resource.data?.entries ?? [];
  const filtered = entries;
  const totalPages = resource.data?.totalPages ?? 1;
  const pageEntries = entries;
  const [exportError, setExportError] = useState<string | null>(null);
  const handleExportCSV = useCallback(async () => {
    if (resource.loading || resource.error || !resource.data) return;
    setExporting(true);
    try {
      // \uD604\uC7AC \uD544\uD130\u00B7\uAC80\uC0C9\uC774 \uC801\uC6A9\uB41C \uACB0\uACFC \uC804\uCCB4\uB97C \uB0B4\uBCF4\uB0B8\uB2E4 (bug L8: \uD544\uD130 \uBB34\uC2DC \uC218\uC815).
      setExportError(null);
      const csv = featureCsv(['Timestamp', 'User', 'Action', 'Resource', 'IP'], filtered.map((entry) =>
        [entry.createdAt, entry.userId, entry.action, entry.resource, entry.ip ?? '']));
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setExportError('CSV를 내보내지 못했습니다. 다시 시도해 주세요.'); } finally {
      setExporting(false);
    }
  }, [filtered, resource.loading, resource.error, resource.data]);

  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">서버의 감사로그 전체를 페이지별로 조회합니다. CSV는 현재 조회 페이지의 {entries.length}건만 포함합니다.</p>
      {exportError && <p role="alert" className="text-sm text-[var(--drawing-error-text)]">{exportError}</p>}
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="리소스 검색..."
            aria-label="감사로그 리소스 검색"
            maxLength={200}
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Filter size={14} className="text-[var(--text-tertiary)]" />
          <select
            aria-label="감사로그 액션"
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
          disabled={exporting || resource.loading || Boolean(resource.error) || !entries.length}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
        >
          <Download size={14} />
          현재 페이지 CSV 내보내기
        </button>
      </div>

      {resource.loading && <p role="status" className="p-3 text-sm">감사로그를 조회하고 있습니다.</p>}
      {resource.error && <div className="p-3"><p role="alert" className="text-sm text-[var(--drawing-error-text)]">{resource.error}</p><button type="button" onClick={resource.reload} className="mt-2 min-h-11 rounded-lg border px-3">다시 시도</button></div>}
      {/* Table */}
      <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-xl border border-[var(--border-default)]">
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
            {!resource.loading && !resource.error && !entries.length && <tr><td colSpan={5} className="p-6 text-center">조회 조건에 맞는 감사로그가 없습니다.</td></tr>}
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[var(--text-tertiary)]">
          {resource.data ? `현재 ${filtered.length}건 / 전체 ${resource.data.totalCount}건` : '조회 결과 미확인'}
        </span>
        <div className="flex items-center gap-2">
          <button
            aria-label="이전 감사로그 페이지"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || resource.loading || Boolean(resource.error)}
            className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {page} / {totalPages}
          </span>
          <button
            aria-label="다음 감사로그 페이지"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || resource.loading || Boolean(resource.error)}
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
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('tenant');
  const loader = useCallback((signal: AbortSignal) => requestFeatureJson('/api/admin', { signal }, (value) => {
    const envelope = requireRecord(value);
    if (envelope.ok !== true || envelope.source !== 'database') throw new FeatureRequestError('관리 데이터 저장소를 확인하지 못했습니다. 임의의 값은 표시하지 않습니다.');
    const data = requireRecord(envelope.data);
    if (!Array.isArray(data.users) || !Array.isArray(data.auditLog) || !Array.isArray(data.usage) || !isRecord(data.counts)
      || (data.tenant !== null && !isRecord(data.tenant))) throw new FeatureRequestError('관리자 응답 형식 오류');
    return data as unknown as AdminData;
  }, featureAuthenticatedFetch), []);
  const resource = useFeatureResource(authLoading || !user ? null : `admin:${user.uid}`, loader);
  const data = resource.data ?? null, loading = authLoading || resource.loading;
  const dataSource: 'database' | 'unavailable' = data ? 'database' : 'unavailable';
  const loadError = resource.error;

  // Server role determines access; a subscription is not an admin credential.
  if (!authLoading && (!user || resource.status === 401 || resource.status === 403)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <AlertCircle size={48} className="mx-auto text-[var(--text-tertiary)]" />
        {/*
          예전 문구는 「Enterprise 플랜 사용자만 접근할 수 있습니다」였다. 부정확하다 —
          이 화면 뒤의 관리자 API 는 요금제가 아니라 `role === 'admin'` 을 확인한다
          (`api/admin/route.ts` checkAdminRole). 플랜을 사서 관리자가 되지는 않는다.
          권한 부족을 요금제 탓으로 말하면 사용자는 결제하러 간다.
        */}
        <h1 className="mt-4 text-xl font-bold text-[var(--text-primary)]">
          접근 권한 없음
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          관리자 대시보드는 관리자 권한이 부여된 계정만 접근할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl px-4 py-8">
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
          {data?.tenant?.name ?? 'ESVA'} - 시스템 관리자
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
          <p>{loadError}</p><button type="button" onClick={resource.reload} className="mt-3 min-h-11 rounded-lg border px-4">다시 시도</button>
        </div>
      )}

      {/* Loaded state */}
      {!loading && data && (
        <>
          {/* Tabs */}
          <div className="mb-6 flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] p-1">
            {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                aria-pressed={activeTab === key}
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
