import Link from 'next/link';
import {
  Plus, Search, Calculator, BookOpen, FileText, Sliders,
  Home, MessageSquare,
} from 'lucide-react';

// ── ESVA 브랜드 마크 (네이비 원 + 앰버 볼트) — 시안 그대로 ──
export function EsvaLogo({ size = 30 }: { size?: number }) {
  const gid = `ax-bolt-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="18" stroke="#1e3a5f" strokeWidth="2.5" fill="none" />
      <path d="M22 6L12 22h7l-3 12 12-16h-7l3-12z" fill={`url(#${gid})`} />
    </svg>
  );
}

// ── 좌측 아이콘 레일 (데스크톱) ──
const RAIL_ITEMS = [
  { key: 'new', label: '새 스레드', href: '/preview/ax', icon: Plus },
  { key: 'search', label: '검색', href: '/preview/ax', icon: Search },
  { key: 'calc', label: '계산기', href: '/preview/ax', icon: Calculator },
  { key: 'standards', label: '기준서', href: '/preview/ax', icon: BookOpen },
  { key: 'docs', label: '문서', href: '/preview/ax', icon: FileText },
] as const;

export function IconRail({ active = 'new' }: { active?: string }) {
  return (
    <nav
      aria-label="주 메뉴"
      className="ax-desktop-only"
      style={{
        width: 64, flex: 'none', borderRight: '1px solid var(--ax-line)',
        background: 'var(--ax-rail)', flexDirection: 'column', alignItems: 'center',
        padding: '16px 0', gap: 8,
      }}
    >
      <span style={{ marginBottom: 12 }}><EsvaLogo /></span>
      {RAIL_ITEMS.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          className="ax-rail-btn"
          aria-label={label}
          aria-current={active === key ? 'page' : undefined}
        >
          <Icon size={18} strokeWidth={2} />
        </Link>
      ))}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <button className="ax-rail-btn" aria-label="설정" type="button"><Sliders size={18} strokeWidth={2} /></button>
        <span
          aria-hidden="true"
          style={{
            width: 36, height: 36, borderRadius: '50%', background: '#d9d4c5',
            color: '#5c5849', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 600,
          }}
        >박</span>
      </div>
    </nav>
  );
}

// ── 하단 거버넌스 상태바 ──
export function StatusBar({ right, extra }: { right?: string; extra?: string }) {
  return (
    <div className="ax-statusbar ax-desktop-only">
      <span className="ax-status-ok"><span className="ax-dot" />운영 정상</span>
      <span>KEC 2021 DB v3.2</span>
      <span>Gemini 2.5 · BYOK (AES-GCM 세션 암호화)</span>
      {extra && <span>{extra}</span>}
      <span style={{ marginLeft: 'auto' }}>{right ?? '응답 p50 142ms'}</span>
      <span>v0.2.0</span>
    </div>
  );
}

// ── 모바일 하단 탭바 ──
const TABS = [
  { key: 'home', label: '홈', href: '/preview/ax', icon: Home },
  { key: 'threads', label: '스레드', href: '/preview/ax/answer', icon: MessageSquare },
  { key: 'calc', label: '계산기', href: '/preview/ax', icon: Calculator },
  { key: 'standards', label: '기준서', href: '/preview/ax', icon: BookOpen },
] as const;

export function MobileTabBar({ active = 'home' }: { active?: string }) {
  return (
    <nav
      aria-label="하단 탭"
      className="ax-mobile-only"
      style={{
        flex: 'none', borderTop: '1px solid var(--ax-line)', background: 'var(--ax-panel-2)',
        padding: '10px 8px calc(10px + env(safe-area-inset-bottom))',
      }}
    >
      {TABS.map(({ key, label, href, icon: Icon }) => (
        <Link key={key} href={href} className="ax-tab" aria-current={active === key ? 'page' : undefined}>
          <Icon size={20} strokeWidth={2} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

// ── 모바일 상태바 (축약) ──
export function MobileStatusBar() {
  return (
    <div
      className="ax-mobile-only ax-mono"
      style={{
        alignItems: 'center', gap: 12, padding: '8px 20px',
        borderTop: '1px solid var(--ax-line)', background: 'var(--ax-rail)',
        fontSize: 10, color: 'var(--ax-faint)',
      }}
    >
      <span className="ax-status-ok" style={{ gap: 5 }}>
        <span className="ax-dot" style={{ width: 5, height: 5 }} />정상
      </span>
      <span>KEC DB v3.2</span>
      <span style={{ marginLeft: 'auto' }}>BYOK 암호화</span>
    </div>
  );
}
