'use client';

/**
 * ESVA App Header / Navbar
 * ------------------------
 * Logo, search bar, navigation, auth controls, language, theme.
 * Responsive: hamburger menu on mobile (focus trap, Escape, focus restore).
 */

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Search,
  Calculator,
  Settings,
  Menu,
  X,
  LogIn,
  LogOut,
  ChevronDown,
  Zap,
  BookOpen,
  FileText,
  ClipboardCheck,
} from 'lucide-react';
import SearchBar from '@/components/SearchBar';
import ESVALogo from '@/components/ESVALogo';
import ThemeToggle from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/hooks/useSettings';
import { type Lang, SUPPORTED_LANGS } from '@/lib/i18n';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Constants
// ═══════════════════════════════════════════════════════════════════════════════

interface NavItem {
  href: string;
  label: string;
  icon: typeof Search;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/search', label: '검색', icon: Search },
  { href: '/calc', label: '계산기', icon: Calculator },
  { href: '/tools/sld', label: 'SLD 분석', icon: Zap },
  { href: '/standards', label: '기준서', icon: FileText },
  { href: '/glossary', label: '용어사전', icon: BookOpen },
  { href: '/report/demo', label: '검증보고서', icon: ClipboardCheck },
  { href: '/settings', label: '설정', icon: Settings },
];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Desktop Nav Links
// ═══════════════════════════════════════════════════════════════════════════════

function DesktopNav({ pathname }: { pathname: string }) {
  return (
    <nav className="hidden items-center gap-1 md:flex">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`
              flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors
              ${isActive
                ? 'bg-[var(--bg-tertiary)] text-[var(--color-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
              }
            `}
          >
            <Icon size={16} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Language select (shared)
// ═══════════════════════════════════════════════════════════════════════════════

function LangSelect({ className }: { className: string }) {
  const { language, setLanguage } = useSettings();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setLanguage(e.target.value as Lang);
    },
    [setLanguage],
  );

  return (
    <select
      value={language}
      onChange={handleChange}
      className={className}
      aria-label="Language"
    >
      {SUPPORTED_LANGS.map((lang) => (
        <option key={lang} value={lang}>
          {lang.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

function LangSwitcher() {
  return (
    <LangSelect className="hidden h-8 min-h-0 rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-1.5 text-xs font-medium text-[var(--text-secondary)] outline-none focus:border-[var(--color-primary)] sm:block" />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Mobile Menu (dialog, focus trap, Escape)
// ═══════════════════════════════════════════════════════════════════════════════

function MobileMenu({
  open,
  onClose,
  pathname,
  menuButtonRef,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const handlePanelClose = useCallback(() => {
    onClose();
    requestAnimationFrame(() => menuButtonRef.current?.focus());
  }, [onClose, menuButtonRef]);

  useEffect(() => {
    if (!open) return;

    const closeBtn = closeBtnRef.current;
    closeBtn?.focus();

    const panel = panelRef.current;
    if (!panel) return;
    const panelEl = panel;

    function getFocusables(): HTMLElement[] {
      return Array.from(
        panelEl.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select, input, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        handlePanelClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = getFocusables();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panelEl.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    panel.addEventListener('keydown', onKeyDown);
    return () => panel.removeEventListener('keydown', onKeyDown);
  }, [open, handlePanelClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] md:hidden" role="presentation">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={handlePanelClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute right-0 top-0 flex h-full w-[min(100%,20rem)] flex-col bg-[var(--bg-primary)] shadow-xl outline-none"
        tabIndex={-1}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
          <span id={titleId} className="text-sm font-semibold text-[var(--text-primary)]">
            메뉴
          </span>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={handlePanelClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)]"
            aria-label="메뉴 닫기"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={handlePanelClose}
                className={`
                  flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
                  ${isActive
                    ? 'bg-[var(--bg-tertiary)] text-[var(--color-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                  }
                `}
              >
                <Icon size={18} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="shrink-0 border-t border-[var(--border-default)] p-3 sm:hidden">
          <p className="mb-2 text-xs font-medium text-[var(--text-tertiary)]">언어 / Language</p>
          <LangSelect className="min-h-[44px] w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 text-sm font-medium text-[var(--text-secondary)] outline-none focus:border-[var(--color-primary)]" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — User Menu Dropdown
// ═══════════════════════════════════════════════════════════════════════════════

function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex min-h-[44px] min-w-0 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] sm:min-h-0"
      >
        <LogIn size={16} aria-hidden />
        <span className="sr-only sm:hidden">로그인</span>
        <span className="hidden sm:inline">로그인</span>
      </Link>
    );
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--bg-secondary)] sm:min-h-0"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt=""
            className="h-8 w-8 rounded-full sm:h-7 sm:w-7"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white sm:h-7 sm:w-7">
            {(user.displayName ?? user.email ?? 'U').charAt(0).toUpperCase()}
          </div>
        )}
        <ChevronDown size={14} className="text-[var(--text-tertiary)]" aria-hidden />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-[var(--z-dropdown)] mt-1 w-56 overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] py-1 shadow-lg"
          role="menu"
        >
          <div className="border-b border-[var(--border-default)] px-4 py-2.5">
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
              {user.displayName ?? 'User'}
            </p>
            <p className="truncate text-xs text-[var(--text-tertiary)]">
              {user.email}
            </p>
          </div>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
            role="menuitem"
          >
            <Settings size={16} aria-hidden />
            설정
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-[var(--color-error)] hover:bg-[var(--bg-secondary)]"
            role="menuitem"
          >
            <LogOut size={16} aria-hidden />
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6 — Main Header
// ═══════════════════════════════════════════════════════════════════════════════

export default function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-[var(--z-dropdown)] border-b border-[var(--border-default)] bg-[var(--bg-primary)]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-1.5 font-bold text-[var(--color-primary)]"
          >
            <ESVALogo size="sm" />
          </Link>

          <DesktopNav pathname={pathname} />

          <div className="mx-3 hidden max-w-xs flex-1 lg:block">
            <SearchBar size="sm" className="w-full" />
          </div>

          <div className="flex-1 md:hidden" />

          <ThemeToggle />

          <LangSwitcher />

          <UserMenu />

          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] md:hidden"
            aria-label="메뉴 열기"
            aria-expanded={mobileOpen}
          >
            <Menu size={22} aria-hidden />
          </button>
        </div>

        <div className="border-t border-[var(--border-default)] px-4 py-2 md:hidden">
          <SearchBar size="sm" className="w-full" />
        </div>
      </header>

      <MobileMenu
        open={mobileOpen}
        onClose={closeMobile}
        pathname={pathname}
        menuButtonRef={menuButtonRef}
      />
    </>
  );
}
