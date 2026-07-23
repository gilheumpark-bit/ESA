'use client';

/**
 * ESVA Settings Page
 * -----------------
 * User preferences: Profile, Language, Country, BYOK keys link, Plan & Billing.
 *
 * PART 1: Constants & helpers
 * PART 2: Section components
 * PART 3: Main page component
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, type UserTier } from '@/contexts/AuthContext';
import {
  useSettings,
  COUNTRY_LABELS,
  CALCULATION_COUNTRIES,
  type Country,
} from '@/hooks/useSettings';
import { LANG_LABELS, RESPONSE_LANGS, type Lang } from '@/lib/i18n';
import { Server } from 'lucide-react';

// =============================================================================
// PART 1 — Constants & Helpers
// =============================================================================

const TIER_BADGES: Record<UserTier, { label: string; color: string }> = {
  free: { label: 'Free', color: 'bg-gray-500' },
  pro: { label: 'Pro', color: 'bg-blue-600' },
  team: { label: 'Team', color: 'bg-green-600' },
  enterprise: { label: 'Enterprise', color: 'bg-purple-600' },
};

const COUNTRY_OPTIONS = CALCULATION_COUNTRIES.map(
  (country) => [country, COUNTRY_LABELS[country]] as [Country, string],
);

// =============================================================================
// PART 2 — Section Components
// =============================================================================

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ProfileSection({
  email,
  tier,
}: {
  email: string;
  tier: UserTier;
}) {
  const badge = TIER_BADGES[tier];
  return (
    <SectionCard title="Profile">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
          {email.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{email}</p>
          <span
            className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium text-white ${badge.color}`}
          >
            {badge.label}
          </span>
        </div>
      </div>
    </SectionCard>
  );
}

function LanguageSection({
  current,
  onChange,
}: {
  current: Lang;
  onChange: (lang: Lang) => void;
}) {
  return (
    <SectionCard title="AI 답변·계산서 언어">
      <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
        AI 답변과 계산서 문구에 적용됩니다. 화면 메뉴는 현재 한국어로 제공됩니다.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RESPONSE_LANGS.map((lang) => (
          <button
            key={lang}
            onClick={() => onChange(lang)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              current === lang
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400'
            }`}
          >
            {LANG_LABELS[lang]}
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

function CountrySection({
  current,
  onChange,
}: {
  current: Country;
  onChange: (country: Country) => void;
}) {
  return (
    <SectionCard title="계산 기준 국가 / 표준">
      <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
        내장 안전계수와 단위 변환이 검증 배선된 기준만 선택할 수 있습니다. 다른 국가 비교는 다국가 비교 도구에서 확인하세요.
      </p>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value as Country)}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
      >
        {COUNTRY_OPTIONS.map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </SectionCard>
  );
}

function BYOKSection() {
  return (
    <SectionCard title="API Keys (BYOK)">
      <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
        Bring Your Own Key — encrypted in this browser; sent transiently through ESVA for provider calls and not persisted server-side.
      </p>
      <Link
        href="/settings/byok"
        className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        Manage API Keys
        <span aria-hidden="true">&rarr;</span>
      </Link>
    </SectionCard>
  );
}

function PlanSection({ tier }: { tier: UserTier }) {
  const badge = TIER_BADGES[tier];
  const [upgrading, setUpgrading] = useState(false);
  const [managing, setManaging] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [billingEnabled, setBillingEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/billing/status', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as { data?: { enabled?: boolean; plans?: string[] } };
        if (active) {
          setBillingEnabled(Boolean(response.ok && body.data?.enabled && body.data.plans?.includes('pro_monthly')));
        }
      })
      .catch(() => { if (active) setBillingEnabled(false); });
    return () => { active = false; };
  }, []);

  const handleUpgrade = async () => {
    setUpgradeError(null);
    if (!billingEnabled) {
      setUpgradeError('결제 기능이 현재 비활성화되어 있습니다.');
      return;
    }
    setUpgrading(true);
    try {
      const { getIdToken } = await import('@/lib/firebase');
      const token = await getIdToken();
      if (!token) {
        window.location.assign('/login');
        return;
      }
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: 'pro_monthly' }),
      });
      const json = await res.json().catch(() => null);
      if (res.status === 503) {
        setUpgradeError('결제 시스템이 아직 활성화되지 않았습니다.');
        return;
      }
      if (!res.ok || !json?.success || !json?.data?.url) {
        setUpgradeError(json?.error?.message ?? `결제 세션 생성 실패 (${res.status})`);
        return;
      }
      window.location.assign(json.data.url);
    } catch {
      setUpgradeError('네트워크 오류 — 잠시 후 다시 시도해 주세요.');
    } finally {
      setUpgrading(false);
    }
  };

  const handleManageSubscription = async () => {
    setUpgradeError(null);
    setManaging(true);
    try {
      const { getIdToken } = await import('@/lib/firebase');
      const token = await getIdToken();
      if (!token) {
        window.location.assign('/login');
        return;
      }
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success || !body?.data?.url) {
        setUpgradeError(body?.error?.message ?? `구독 관리 페이지 생성 실패 (${response.status})`);
        return;
      }
      window.location.assign(body.data.url);
    } catch {
      setUpgradeError('네트워크 오류 — 잠시 후 다시 시도해 주세요.');
    } finally {
      setManaging(false);
    }
  };

  return (
    <SectionCard title="Plan & Billing">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Current plan
          </p>
          <span
            className={`inline-block mt-1 rounded-full px-3 py-1 text-sm font-semibold text-white ${badge.color}`}
          >
            {badge.label}
          </span>
        </div>
        {tier === 'free' && billingEnabled === true && (
          <button
            type="button"
            onClick={handleUpgrade}
            disabled={upgrading || billingEnabled !== true}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {upgrading ? '결제 페이지 여는 중…' : 'Pro 구독 시작'}
          </button>
        )}
        {tier !== 'free' && tier !== 'enterprise' && billingEnabled === true && (
          <button
            type="button"
            onClick={handleManageSubscription}
            disabled={managing}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {managing ? '구독 정보 여는 중…' : '구독 관리'}
          </button>
        )}
      </div>
      {billingEnabled === null && (
        <p className="mt-3 text-sm text-zinc-500" role="status">결제 기능 상태 확인 중…</p>
      )}
      {billingEnabled === false && (
        <p className="mt-3 text-sm text-zinc-500">
          결제 기능이 비활성화되어 있습니다. 현재 화면에서는 카드 정보나 결제 요청을 받지 않습니다.
        </p>
      )}
      {upgradeError && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {upgradeError}
        </p>
      )}
    </SectionCard>
  );
}

// =============================================================================
// PART 3 — Main Page Component
// =============================================================================

export default function SettingsPage() {
  const router = useRouter();
  const { user, tier, loading: authLoading } = useAuth();
  const { language, country, setLanguage, setCountry, loaded } = useSettings();

  // 비인증 사용자 → /login 리다이렉트
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  // 로딩 중
  if (authLoading || !loaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  // 리다이렉트 대기
  if (!user) return null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Settings
      </h1>

      <div className="flex flex-col gap-6">
        <ProfileSection email={user.email ?? 'unknown'} tier={tier} />
        <LanguageSection current={language} onChange={setLanguage} />
        <CountrySection current={country} onChange={setCountry} />
        <BYOKSection />
        <SectionCard title="On-Premise AI 서버">
          <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
            관리자가 허용한 자체 AI 서버에 연결합니다. 실제 데이터 경로와 운영 비용은 배포 환경 정책을 확인하세요.
          </p>
          <Link
            href="/settings/onpremise"
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <Server size={16} aria-hidden="true" />
            On-Premise 설정
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </SectionCard>
        <PlanSection tier={tier} />

        {/* Quick links */}
        <SectionCard title="바로가기">
          <div className="flex flex-wrap gap-2">
            <Link href="/history" className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-secondary)]">계산 이력</Link>
            <Link href="/dashboard" className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-secondary)]">대시보드</Link>
            {tier === 'enterprise' && (
              <Link href="/admin" className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-secondary)]">관리자</Link>
            )}
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
