'use client';

/**
 * ESVA Login Page
 * ---------------
 * Google sign-in with Firebase, ESVA branding, benefits list.
 * Redirects to / (or previous page) after successful login.
 *
 * PART 1: Benefits data
 * PART 2: Login page component
 */

import { useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calculator, Receipt, Brain, Loader2 } from 'lucide-react';
import ESVALogo from '@/components/ESVALogo';
import { useAuth } from '@/contexts/AuthContext';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Benefits Data
// ═══════════════════════════════════════════════════════════════════════════════

const BENEFITS = [
  {
    icon: Calculator,
    text: '56개 전기 계산기 무료',
    sub: 'KEC, NEC, IEC 기준 지원',
  },
  {
    icon: Receipt,
    text: '영수증 저장/공유',
    sub: 'AI 답변의 출처와 검증 기록',
  },
  {
    icon: Brain,
    text: 'BYOK AI 검색',
    sub: '나의 API 키로 무제한 AI 검색',
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Login Page
// ═══════════════════════════════════════════════════════════════════════════════

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, error, signIn } = useAuth();

  const returnTo = searchParams.get('from') ?? '/';

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      router.replace(returnTo);
    }
  }, [user, loading, router, returnTo]);

  const handleGoogleSignIn = useCallback(async () => {
    try {
      await signIn();
      // AuthContext will update user state, triggering redirect via useEffect
    } catch {
      // Error is handled by AuthContext and displayed below
    }
  }, [signIn]);

  // Show nothing while checking auth state (prevents flash)
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
        <Loader2 size={32} className="animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  // Already logged in — redirect in progress
  if (user) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)] px-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-8 shadow-sm">
          {/* Branding */}
          <div className="mb-8 text-center">
            <div className="mb-3">
              <ESVALogo size="lg" className="justify-center" />
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              The Engineer&apos;s Search Engine for Vertical AI
            </p>
          </div>

          {/* Benefits */}
          <div className="mb-8 space-y-4">
            {BENEFITS.map(({ icon: Icon, text, sub }) => (
              <div key={text} className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                  <Icon size={18} className="text-[var(--color-primary)]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {text}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Google sign-in button */}
          <button
            onClick={handleGoogleSignIn}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] shadow-sm transition-all hover:border-[var(--border-hover)] hover:shadow-md active:scale-[0.98]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
                fill="#EA4335"
              />
            </svg>
            Google로 로그인
          </button>

          {/* Error message */}
          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-[var(--color-error)] dark:bg-red-900/20">
              {error}
            </p>
          )}

          {/* Skip */}
          <p className="mt-6 text-center text-xs text-[var(--text-tertiary)]">
            로그인 없이도 계산기를 사용할 수 있습니다.{' '}
            <button
              onClick={() => router.replace(returnTo)}
              className="text-[var(--color-primary)] underline-offset-2 hover:underline"
            >
              건너뛰기
            </button>
          </p>
        </div>

        {/* Footer note */}
        <p className="mt-4 text-center text-xs text-[var(--text-tertiary)]">
          로그인 시{' '}
          <a href="/terms" className="underline underline-offset-2">
            이용약관
          </a>{' '}
          및{' '}
          <a href="/privacy" className="underline underline-offset-2">
            개인정보처리방침
          </a>
          에 동의합니다.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
          <Loader2 size={32} className="animate-spin text-[var(--color-primary)]" />
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
