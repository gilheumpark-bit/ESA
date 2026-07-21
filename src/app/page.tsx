'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus, Search, Calculator, BookOpen, FileText, SlidersHorizontal,
  ArrowUpDown, Camera, ArrowUp, ShieldCheck, LogIn,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { analyzeCalcIntent, type CalcIntentResult } from '@/lib/calc-intent-bridge';
import InlineCalcResult from '@/components/InlineCalcResult';
import { CALCULATOR_COUNT } from '@/engine/calculators/count';

// ── AX 최종안 홈 — 검색 우선 콘솔 (좌측 레일 + 중앙 히어로 + 영수증 사상) ──
// 디자인 정본: 핸드오프 ESVA AX 최종안.dc.html "AX 홈-데스크톱".
// 색은 전부 토큰(globals.css AX 팔레트)만 사용 → 다크모드 자동. 무발명: 계산기
// 수는 실제 카운트(CALCULATOR_COUNT), 표기 수치는 도메인 실값으로만.

/** 좌측 레일 — 목적별 진입. active는 현재 화면(홈=새 질문). */
const RAIL_ITEMS: Array<{ icon: LucideIcon; href: string; label: string; active?: boolean }> = [
  { icon: Plus, href: '/', label: '새 질문', active: true },
  { icon: Search, href: '/search', label: '검색' },
  { icon: Calculator, href: '/calc', label: '계산기' },
  { icon: BookOpen, href: '/standards', label: '기준서' },
  { icon: FileText, href: '/tools/sld', label: '도면 분석' },
];

/** 히어로 예시 질의 — 클릭 시 실제 라우팅(계산 의도 자동 감지). */
const EXAMPLES: Array<{ icon: LucideIcon; text: string; tail?: string }> = [
  { icon: ArrowUpDown, text: '380V 50kW 100m 전압강하 검토', tail: '↗' },
  { icon: FileText, text: 'KEC 232.3.9 전압강하 조항 원문과 예외' },
  { icon: Camera, text: '변압기 명판 촬영 → 스펙 추출 → 용량 검증' },
];

/** 3기둥 — 제품 사상(무발명·조항판정·영수증). */
const PILLARS = [
  { numeral: 'Ⅰ', title: '결정론적 계산', desc: `${CALCULATOR_COUNT}개 순수함수 엔진 · ±0.01% · LLM은 변수 추출만` },
  { numeral: 'Ⅱ', title: '조항 기반 판정', desc: '기준서 조항 · 출처 없는 답변은 가드레일이 차단' },
  { numeral: 'Ⅲ', title: '검증 영수증', desc: 'SHA-256 봉인 · 모든 결과 재현·감사 가능' },
] as const;

export default function HomePage() {
  const { user, signOut } = useAuth();
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [calcIntent, setCalcIntent] = useState<CalcIntentResult | null>(null);

  // 질의 실행 — 계산 의도면 인라인 계산, 아니면 검색 페이지. (기존 로직 보존)
  const runQuery = useCallback((raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setQuery(q);
    const intent = analyzeCalcIntent(q);
    if (intent.hasCalcIntent) {
      setCalcIntent(intent);
      return;
    }
    setIsLoading(true);
    window.location.href = `/search?q=${encodeURIComponent(q)}`;
  }, []);

  const handleSearch = useCallback(() => runQuery(query), [runQuery, query]);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); },
    [handleSearch],
  );

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]"
      suppressHydrationWarning
    >
      <div className="flex min-h-0 flex-1">
        {/* ═══ 좌측 레일 (64px) ═══ */}
        <nav className="flex w-16 flex-none flex-col items-center gap-2 border-r border-[var(--border-default)] bg-[var(--bg-secondary)] py-4">
          {/* 브랜드 마크 — 네이비 링 + 앰버 볼트 */}
          <Link href="/" aria-label="ESVA 홈" className="mb-3">
            <svg width="30" height="30" viewBox="0 0 40 40" fill="none" aria-hidden>
              <defs>
                <linearGradient id="rail-bolt" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#d97706" />
                  <stop offset="100%" stopColor="#b45309" />
                </linearGradient>
              </defs>
              <circle cx="20" cy="20" r="18" stroke="var(--color-primary)" strokeWidth="2.5" fill="none" />
              <path d="M22 6L12 22h7l-3 12 12-16h-7l3-12z" fill="url(#rail-bolt)" />
            </svg>
          </Link>

          {RAIL_ITEMS.map(({ icon: Icon, href, label, active }) => (
            <Link
              key={href}
              href={href}
              aria-label={label}
              title={label}
              className={
                active
                  ? 'flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--color-primary)] text-white'
                  : 'flex h-10 w-10 items-center justify-center rounded-[10px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]'
              }
            >
              <Icon size={18} strokeWidth={2} />
            </Link>
          ))}

          <div className="mt-auto flex flex-col items-center gap-2">
            <Link
              href="/settings"
              aria-label="설정"
              title="설정"
              className="flex h-10 w-10 items-center justify-center rounded-[10px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]"
            >
              <SlidersHorizontal size={18} strokeWidth={2} />
            </Link>
            {user ? (
              <button
                onClick={() => signOut()}
                aria-label="로그아웃"
                title={user.displayName || user.email || '로그아웃'}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--border-hover)] text-[13px] font-semibold text-[var(--text-secondary)]"
              >
                {(user.displayName ?? user.email ?? 'U').charAt(0).toUpperCase()}
              </button>
            ) : (
              <Link
                href="/login"
                aria-label="로그인"
                title="로그인"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--border-hover)] text-[var(--text-secondary)]"
              >
                <LogIn size={16} />
              </Link>
            )}
          </div>
        </nav>

        {/* ═══ 메인 ═══ */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 상단 바 — 내장 판본 배지 + 로그인 */}
          <div className="flex items-center gap-2.5 px-10 pt-5">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-hover)] bg-[var(--bg-secondary)] px-3.5 py-1 font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-secondary)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
              KEC 2021 · NEC 2023 · IEC 60364 · JIS C 0364
            </span>
            {user ? (
              <span className="ml-auto text-[13.5px] font-medium text-[var(--text-secondary)]">
                {user.displayName || user.email?.split('@')[0]}
              </span>
            ) : (
              <Link
                href="/login"
                className="ml-auto rounded-lg border border-[var(--border-hover)] px-5 py-2 text-[13.5px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                로그인
              </Link>
            )}
          </div>

          {/* 히어로 — 중앙 정렬 검색 우선 */}
          <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col justify-center px-6">
            <h1 className="text-center font-[family-name:var(--font-serif)] text-[40px] font-bold leading-[1.35] tracking-[-0.015em]">
              AI는 추정하지 않습니다.
            </h1>
            <p className="mt-3.5 text-center text-base leading-[1.75] text-[var(--text-secondary)]">
              모든 수치는 결정론적 엔진이 계산하고,<br />
              모든 판정은 기준서 조항이 결정합니다.
            </p>

            {/* 검색 카드 */}
            <div className="mt-10 rounded-2xl border border-[var(--border-hover)] bg-[var(--bg-primary)] p-[20px_22px] shadow-[0_4px_24px_rgba(28,27,23,0.06)]">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder='질문, 계산 조건, 조항 번호 — 무엇이든. 예: "3상 380V 50kW 부하, 케이블 100m 전압강하 검토"'
                aria-label="질의 입력"
                enterKeyHint="search"
                maxLength={500}
                autoFocus
                className="min-h-[36px] w-full bg-transparent text-[15.5px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
              />
              <div className="mt-3 flex items-center gap-2">
                <span className="rounded-full border border-[var(--border-hover)] bg-[var(--bg-secondary)] px-3.5 py-1.5 text-[12.5px] text-[var(--text-secondary)]">
                  ⚡ 자동 감지
                </span>
                {['검색', '계산', '검증'].map((m) => (
                  <span key={m} className="rounded-full border border-[var(--border-hover)] px-3.5 py-1.5 text-[12.5px] text-[var(--text-tertiary)]">
                    {m}
                  </span>
                ))}
                <span className="ml-auto inline-flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-tertiary)]">
                  <ShieldCheck size={12} />
                  Gemini 2.5 · BYOK
                </span>
                <button
                  onClick={handleSearch}
                  disabled={isLoading}
                  aria-label="질의 실행"
                  className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[var(--color-primary)] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <ArrowUp size={17} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* 계산 의도 인라인 결과 (기존 기능 보존) */}
            {calcIntent?.hasCalcIntent && calcIntent.calculatorId ? (
              <div className="mt-6">
                <InlineCalcResult
                  calculatorId={calcIntent.calculatorId}
                  calculatorName={calcIntent.calculatorName || '계산기'}
                  extractedParams={calcIntent.extractedParams}
                  missingRequired={calcIntent.missingRequired}
                  missingOptional={calcIntent.missingOptional}
                  allParams={calcIntent.allParams}
                  canAutoExecute={calcIntent.canAutoExecute}
                  onClose={() => setCalcIntent(null)}
                />
              </div>
            ) : (
              <>
                {/* 예시 질의 */}
                <div className="mt-6 flex flex-col">
                  {EXAMPLES.map(({ icon: Icon, text, tail }, i) => (
                    <button
                      key={text}
                      onClick={() => runQuery(text)}
                      className={`flex items-center gap-3 border-t border-[var(--border-default)] px-1 py-[13px] text-left text-sm text-[var(--text-primary)] transition-colors hover:text-[var(--color-accent)] ${
                        i === EXAMPLES.length - 1 ? 'border-b' : ''
                      }`}
                    >
                      <Icon size={15} strokeWidth={2} className="shrink-0 text-[var(--color-accent)]" />
                      <span className="min-w-0 flex-1 truncate">{text}</span>
                      {tail && <span className="text-[var(--text-tertiary)]">{tail}</span>}
                    </button>
                  ))}
                </div>

                {/* 3기둥 */}
                <div className="mt-8 grid grid-cols-3">
                  {PILLARS.map(({ numeral, title, desc }, i) => (
                    <div key={numeral} className={i < 2 ? 'border-r border-[var(--border-default)] px-6 first:pl-1' : 'px-6 pr-1'}>
                      <div className="font-[family-name:var(--font-serif)] text-base font-bold text-[var(--color-accent)]">{numeral}</div>
                      <div className="mt-1.5 text-[13.5px] font-bold">{title}</div>
                      <p className="mt-1 text-xs leading-[1.65] text-[var(--text-tertiary)]">{desc}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 최근 스레드 */}
          <div className="mx-auto w-full max-w-[808px] px-10 pb-6">
            <div className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-[var(--text-tertiary)]">최근 스레드</div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Link href="/history" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] px-4 py-3 transition-colors hover:border-[var(--border-hover)]">
                <div className="text-[13.5px] font-medium">변압기 500kVA 병렬 운전 조건</div>
                <div className="mt-0.5 text-[11.5px] text-[var(--text-tertiary)]">어제 · 적합 · 영수증 발행됨</div>
              </Link>
              <Link href="/history" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] px-4 py-3 transition-colors hover:border-[var(--border-hover)]">
                <div className="text-[13.5px] font-medium">접지저항 10Ω 설계 — Dwight 식</div>
                <div className="mt-0.5 text-[11.5px] text-[var(--text-tertiary)]">7월 16일 · 조건 2건 보류</div>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 상태 바 ═══ */}
      <div className="flex h-8 flex-none items-center gap-4 border-t border-[var(--border-default)] bg-[var(--bg-secondary)] px-5 font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-tertiary)]">
        <span className="inline-flex items-center gap-1.5 text-[var(--color-success)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
          운영 정상
        </span>
        <span>내장 판본 KEC 2021 · NEC 2023 · IEC 60364</span>
        <span className="hidden sm:inline">Gemini 2.5 · BYOK (AES-GCM 세션 암호화)</span>
        <span className="ml-auto hidden sm:inline">엔진 {CALCULATOR_COUNT}종</span>
      </div>
    </div>
  );
}
