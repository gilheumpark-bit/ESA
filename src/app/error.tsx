'use client';

/**
 * Custom 500 Error Page
 *
 * Next.js App Router error boundary.
 * Shows error details in dev mode only.
 */

import Link from 'next/link';
import { RotateCcw, Home } from 'lucide-react';
import ESVALogo from '@/components/ESVALogo';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-secondary)] px-4">
      {/* ESVA Logo */}
      <div className="mb-6">
        <ESVALogo size="lg" className="justify-center" />
      </div>

      {/* Error message */}
      <h1 className="mb-2 text-3xl font-bold text-[var(--text-primary)]">
        오류가 발생했습니다
      </h1>
      <p className="mb-6 text-center text-sm text-[var(--text-secondary)]">
        예기치 않은 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
      </p>

      {/* Action buttons */}
      <div className="mb-8 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
        >
          <RotateCcw size={16} />
          다시 시도
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <Home size={16} />
          홈으로
        </Link>
      </div>

      {/* Dev-only error details */}
      {isDev && (
        <div className="w-full max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <h2 className="mb-2 text-sm font-semibold text-red-700 dark:text-red-400">
            Error Details (dev only)
          </h2>
          <p className="mb-1 text-sm text-red-600 dark:text-red-300">
            {error.message}
          </p>
          {error.digest && (
            <p className="text-xs text-red-500 dark:text-red-400">
              Digest: {error.digest}
            </p>
          )}
          {error.stack && (
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-red-100 p-2 text-xs text-red-800 dark:bg-red-900/40 dark:text-red-300">
              {error.stack}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
