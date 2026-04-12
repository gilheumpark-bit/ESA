'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Search, Calculator, FileText, Camera, BarChart3,
  Users, FolderOpen, Shield, Globe, Cpu,
  BookOpen, ArrowUpRight, Zap, Activity,
} from 'lucide-react';
import ESVALogo from '@/components/ESVALogo';

// ── 실시간 카운터 훅 ──
function useCountUp(target: number, duration = 1200) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      function tick(now: number) {
        const progress = Math.min((now - start) / duration, 1);
        setCount(Math.floor(progress * target));
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);
  return { count, ref };
}

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsLoading(true);
    window.location.href = `/search?q=${encodeURIComponent(query.trim())}`;
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); },
    [handleSearch],
  );

  const calcCounter = useCountUp(56);
  const articleCounter = useCountUp(62);
  const termCounter = useCountUp(151);

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]" suppressHydrationWarning>

      {/* ═══ Hero — 전기 엔지니어 전용 느낌 ═══ */}
      <section className="relative overflow-hidden border-b border-[var(--border-default)]">
        {/* 전기 그래디언트 배경 — 파란 전류 느낌 */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute left-1/4 top-0 h-[400px] w-[400px] rounded-full opacity-[0.06] blur-[80px]"
            style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />
          <div className="absolute right-1/4 top-10 h-[300px] w-[300px] rounded-full opacity-[0.04] blur-[80px]"
            style={{ background: 'radial-gradient(circle, #f59e0b, transparent)' }} />
        </div>

        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pb-14 pt-16 sm:pt-24">
          <div className="animate-fade-in-up">
            <ESVALogo size="lg" />
          </div>

          {/* 전기 도메인 시그널 — 핵심 차별화 */}
          <div className="animate-fade-in-up mt-3 flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 py-1" style={{ animationDelay: '60ms' }}>
            <Activity size={12} className="text-emerald-500" />
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">
              KEC 2021 · NEC 2023 · IEC 60364 최신 반영
            </span>
          </div>

          <h1 className="animate-fade-in-up mt-5 text-center text-xl font-bold leading-tight text-[var(--text-primary)] sm:text-2xl" style={{ animationDelay: '100ms' }}>
            전기 설계의 <span className="gradient-text-primary">검색·계산·검증</span>을<br className="sm:hidden" /> 하나로
          </h1>

          <p className="animate-fade-in-up mt-2 text-center text-[13px] leading-relaxed text-[var(--text-tertiary)]" style={{ animationDelay: '140ms' }}>
            AI가 추정하지 않습니다. 모든 수치는 Tool이 계산하고, 기준서가 검증합니다.
          </p>

          {/* Search */}
          <div className="mt-7 w-full max-w-lg animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] px-4 py-2.5 shadow-sm transition-all focus-within:border-[var(--color-primary)] focus-within:ring-4 focus-within:ring-[var(--color-primary)]/10">
              <Search className="mr-3 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="전압강하, KEC 232, 케이블 선정..."
                className="min-h-[36px] flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-tertiary)]"
                autoFocus
                enterKeyHint="search"
                aria-label="검색어"
              />
              <button onClick={handleSearch} disabled={isLoading}
                className="ml-2 shrink-0 rounded-lg bg-[var(--color-primary)] px-4 py-1.5 text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50">
                검색
              </button>
            </div>

            <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
              {QUICK_TAGS.map(tag => (
                <button key={tag} onClick={() => setQuery(tag)}
                  className="rounded-md border border-[var(--border-default)] px-2 py-0.5 text-[10px] text-[var(--text-tertiary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]">
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Live Stats Bar — 전기 버티컬 시그널 ═══ */}
      <section className="border-b border-[var(--border-default)] bg-[var(--bg-secondary)]">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-8 px-4 py-3 sm:gap-16">
          <div ref={calcCounter.ref} className="text-center">
            <span className="text-lg font-bold text-[var(--color-primary)]">{calcCounter.count}+</span>
            <span className="ml-1 text-[11px] text-[var(--text-tertiary)]">계산기</span>
          </div>
          <div className="h-4 w-px bg-[var(--border-default)]" />
          <div ref={articleCounter.ref} className="text-center">
            <span className="text-lg font-bold text-[var(--color-primary)]">{articleCounter.count}</span>
            <span className="ml-1 text-[11px] text-[var(--text-tertiary)]">KEC 조항</span>
          </div>
          <div className="h-4 w-px bg-[var(--border-default)]" />
          <div ref={termCounter.ref} className="text-center">
            <span className="text-lg font-bold text-[var(--color-primary)]">{termCounter.count}</span>
            <span className="ml-1 text-[11px] text-[var(--text-tertiary)]">전기 용어</span>
          </div>
          <div className="hidden h-4 w-px bg-[var(--border-default)] sm:block" />
          <div className="hidden text-center sm:block">
            <span className="text-lg font-bold text-emerald-500">±0.01%</span>
            <span className="ml-1 text-[11px] text-[var(--text-tertiary)]">정확도</span>
          </div>
        </div>
      </section>

      {/* ═══ Bento Grid ═══ */}
      <section className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-[auto_auto]">

          {/* 계산기 — hero card */}
          <Link href="/calc" className="card-interactive group relative col-span-1 overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5 sm:col-span-2 sm:row-span-2">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-blue-500/[0.06] blur-2xl" />
            <div className="relative">
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bento-icon-blue" suppressHydrationWarning>
                <Calculator size={22} className="text-white" />
              </div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">전기 계산기</h3>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">KEC/NEC/IEC 기준 56개 검증 계산기</p>
              <div className="mt-4 grid grid-cols-2 gap-1.5">
                {['전압강하', '케이블 선정', '차단기 선정', '단락전류', '변압기 용량', '접지저항', '역률 보정', '조도 계산'].map(c => (
                  <span key={c} className="rounded-lg bg-[var(--bg-secondary)] px-2 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors group-hover:bg-blue-50 group-hover:text-blue-700 dark:group-hover:bg-blue-900/20 dark:group-hover:text-blue-300">
                    {c}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)]">
                전체 56개 <ArrowUpRight size={12} />
              </div>
            </div>
          </Link>

          {/* AI 검색 */}
          <Link href="/search" className="card-interactive group overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bento-icon-purple" suppressHydrationWarning>
              <Search size={18} className="text-white" />
            </div>
            <h3 className="text-[13px] font-bold text-[var(--text-primary)]">AI 법규 검색</h3>
            <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">법규·표·조항을 정밀 검색<br />출처 추적 + Receipt</p>
          </Link>

          {/* SLD */}
          <Link href="/tools/sld" className="card-interactive group overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bento-icon-orange" suppressHydrationWarning>
              <FileText size={18} className="text-white" />
            </div>
            <h3 className="text-[13px] font-bold text-[var(--text-primary)]">도면 분석</h3>
            <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">AI Vision · DXF · PDF<br />토폴로지 그래프</p>
          </Link>

          {/* OCR */}
          <Link href="/tools/ocr" className="card-interactive group overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bento-icon-emerald" suppressHydrationWarning>
              <Camera size={18} className="text-white" />
            </div>
            <h3 className="text-[13px] font-bold text-[var(--text-primary)]">OCR 명판 인식</h3>
            <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">명판 촬영 → 스펙 추출<br />계산기 자동 연결</p>
          </Link>

          {/* 기준서 */}
          <Link href="/standards" className="card-interactive group overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-400 shadow-lg" suppressHydrationWarning>
              <BookOpen size={18} className="text-white" />
            </div>
            <h3 className="text-[13px] font-bold text-[var(--text-primary)]">기준서 62조항</h3>
            <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">KEC/NEC/IEC<br />교차참조 + 허용전류표</p>
          </Link>

        </div>
      </section>

      {/* ═══ 전문 도구 ═══ */}
      <section className="border-t border-[var(--border-default)] bg-[var(--bg-secondary)]">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">전문 도구</h2>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {PRO_TOOLS.map(({ icon: Icon, title, href, badge }) => (
              <Link key={href} href={href}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2.5 text-[12px] font-medium text-[var(--text-primary)] transition-all duration-200 hover:border-[var(--color-primary)] hover:shadow-sm">
                <Icon size={14} className="shrink-0 text-[var(--text-tertiary)]" />
                <span className="truncate">{title}</span>
                {badge && <span className="ml-auto shrink-0 rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-[9px] font-bold text-white">{badge}</span>}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 핵심 원칙 — 버티컬 AI 차별화 ═══ */}
      <section className="border-t border-[var(--border-default)]">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="grid gap-6 sm:grid-cols-3">
            {PRINCIPLES.map(({ icon: Icon, title, desc, cssClass }) => (
              <div key={title} className="text-center">
                <div className={`mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${cssClass}`} suppressHydrationWarning>
                  <Icon size={18} className="text-white" />
                </div>
                <h3 className="text-[13px] font-bold text-[var(--text-primary)]">{title}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-tertiary)]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

const QUICK_TAGS = ['전압강하 계산', '케이블 선정', 'KEC 232조', '단락전류', 'AWG→mm²'];

const PRO_TOOLS = [
  { icon: BarChart3, title: '대시보드', href: '/dashboard', badge: undefined },
  { icon: Globe, title: '다국가 비교', href: '/compare', badge: 'NEW' },
  { icon: FolderOpen, title: '프로젝트', href: '/projects', badge: undefined },
  { icon: Users, title: '커뮤니티', href: '/community', badge: undefined },
  { icon: Search, title: '용어사전', href: '/glossary', badge: undefined },
  { icon: Shield, title: 'BYOK', href: '/settings/byok', badge: undefined },
  { icon: Cpu, title: '현장 모드', href: '/mobile', badge: undefined },
  { icon: BarChart3, title: '계산 이력', href: '/history', badge: undefined },
  { icon: Calculator, title: '역률 보정', href: '/calc?q=역률', badge: undefined },
  { icon: Calculator, title: '조도 계산', href: '/calc?q=조도', badge: undefined },
] as const;

const PRINCIPLES = [
  {
    icon: Zap,
    title: 'AI는 추정하지 않습니다',
    desc: '모든 수치는 결정론적 엔진이 계산합니다. LLM은 변수 추출만 담당합니다.',
    cssClass: 'bento-icon-orange',
  },
  {
    icon: BookOpen,
    title: '기준서가 근거입니다',
    desc: '모든 판정은 KEC/NEC/IEC 조항에 의해 결정됩니다. 출처 없는 답변은 차단됩니다.',
    cssClass: 'bento-icon-blue',
  },
  {
    icon: Activity,
    title: '투명하게 검증합니다',
    desc: '수식 전개 과정, 적용 조항, Receipt 해시가 모든 결과에 포함됩니다.',
    cssClass: 'bento-icon-emerald',
  },
] as const;
