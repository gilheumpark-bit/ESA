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

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, type UserTier } from '@/contexts/AuthContext';
import {
  useSettings,
  COUNTRY_LABELS,
  type Country,
} from '@/hooks/useSettings';
import { LANG_LABELS, SUPPORTED_LANGS, type Lang } from '@/lib/i18n';

// =============================================================================
// PART 1 — Constants & Helpers
// =============================================================================

const TIER_BADGES: Record<UserTier, { label: string; color: string }> = {
  free: { label: 'Free', color: 'bg-gray-500' },
  pro: { label: 'Pro', color: 'bg-blue-600' },
  team: { label: 'Team', color: 'bg-green-600' },
  enterprise: { label: 'Enterprise', color: 'bg-purple-600' },
};

const COUNTRY_OPTIONS = Object.entries(COUNTRY_LABELS) as [Country, string][];

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
    <SectionCard title="Language / 언어">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SUPPORTED_LANGS.map((lang) => (
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
    <SectionCard title="Country / Standard">
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
        Bring Your Own Key -- ESVA never stores your keys on our servers.
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
        {tier !== 'enterprise' && (
          <a
            href="/api/checkout"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Upgrade
          </a>
        )}
      </div>
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
