import Link from 'next/link';
import { Home, Calculator, Search } from 'lucide-react';
import ESVALogo from '@/components/ESVALogo';

/**
 * Custom 404 — Page Not Found
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-secondary)] px-4">
      {/* ESVA Logo */}
      <div className="mb-6">
        <ESVALogo size="lg" />
      </div>

      {/* 404 */}
      <h1 className="mb-2 text-6xl font-bold text-[var(--text-primary)]">404</h1>
      <p className="mb-8 text-lg text-[var(--text-secondary)]">
        페이지를 찾을 수 없습니다
      </p>

      {/* Quick links */}
      <div className="mb-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <Home size={16} />
          홈
        </Link>
        <Link
          href="/calc"
          className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <Calculator size={16} />
          계산기
        </Link>
        <Link
          href="/search"
          className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <Search size={16} />
          검색
        </Link>
      </div>

      {/* Footer note */}
      <p className="text-xs text-[var(--text-tertiary)]">
        URL을 다시 확인하시거나, 위 링크를 통해 이동하세요.
      </p>
    </div>
  );
}
