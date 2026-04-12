/**
 * ESVA App Footer
 * ---------------
 * Minimal footer with legal links and BYOK tagline.
 */

import Link from 'next/link';
import { Zap } from 'lucide-react';

const FOOTER_LINKS = [
  { href: '/terms', label: '이용약관' },
  { href: '/privacy', label: '개인정보처리방침' },
  { href: '/disclaimer', label: '면책조항' },
  { href: '/contact', label: '문의' },
] as const;

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border-default)] bg-[var(--bg-secondary)]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Links row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {FOOTER_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Bottom row */}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
            <Zap size={14} className="text-[var(--color-accent)]" />
            <span>ESVA &copy; {new Date().getFullYear()}</span>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            Powered by BYOK &mdash; Your keys, your AI
          </p>
        </div>
      </div>
    </footer>
  );
}
