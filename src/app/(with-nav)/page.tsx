'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Search, Calculator, FileText, Camera, BarChart3, Globe, FolderOpen,
  Users, BookOpen, Shield, HardHat, Columns2, ClipboardCheck,
  ArrowUpDown, ArrowUp, ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { analyzeCalcIntent, type CalcIntentResult } from '@/lib/calc-intent-bridge';
import InlineCalcResult from '@/components/InlineCalcResult';
import { CALCULATOR_COUNT } from '@/engine/calculators/count';

// ── AX 최종안 홈 — 검색 우선 콘솔 ──
// 디자인 정본: 핸드오프 ESVA AX 최종안.dc.html. 좌측 레일 대신 공용 상단
// 헤더(with-nav)에 편입 — 홈만 다른 네비 패러다임이던 어색함을 없애고,
// 전 라우트 도달성(BYOK 포함·비로그인 접근)을 도구 행으로 복원한다.
// 색은 전부 토큰(globals.css AX 팔레트)만 → 다크모드 자동.

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

/** 도구 행 — 헤더 밖 라우트 전부 홈에서 도달 가능하게. BYOK는 비로그인도 사용. */
const TOOLS: Array<{ icon: LucideIcon; label: string; href: string }> = [
  { icon: Shield, label: 'BYOK 키 설정', href: '/settings/byok' },
  { icon: Camera, label: 'OCR 명판', href: '/tools/ocr' },
  { icon: Columns2, label: 'Studio', href: '/tools/studio' },
  { icon: HardHat, label: '현장 모드', href: '/mobile' },
  { icon: BarChart3, label: '대시보드', href: '/dashboard' },
  { icon: Globe, label: '다국가 비교', href: '/compare' },
  { icon: FolderOpen, label: '프로젝트', href: '/projects' },
  { icon: Users, label: '커뮤니티', href: '/community' },
  { icon: BookOpen, label: '용어사전', href: '/glossary' },
  { icon: ClipboardCheck, label: '계산 이력', href: '/history' },
];

export default function HomePage() {
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
    <div className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* ═══ 히어로 — 검색 우선 ═══ */}
      <section className="mx-auto w-full max-w-[760px] px-4 pb-4 pt-14 sm:px-6 sm:pt-20">
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-hover)] bg-[var(--bg-secondary)] px-3.5 py-1 font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-secondary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
            KEC 2021 · NEC 2023 · IEC 60364 · JIS C 0364
          </span>
        </div>

        <h1 className="mt-6 text-center font-[family-name:var(--font-serif)] text-[32px] font-bold leading-[1.35] tracking-[-0.015em] sm:text-[40px]">
          AI는 추정하지 않습니다.
        </h1>
        <p className="mt-3.5 text-center text-[15px] leading-[1.75] text-[var(--text-secondary)] sm:text-base">
          모든 수치는 결정론적 엔진이 계산하고,<br />
          모든 판정은 기준서 조항이 결정합니다.
        </p>

        {/* 검색 카드 */}
        <div className="mt-9 rounded-2xl border border-[var(--border-hover)] bg-[var(--bg-primary)] p-5 shadow-[0_4px_24px_rgba(28,27,23,0.06)]">
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
            className="min-h-[36px] w-full bg-transparent text-[15px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] sm:text-[15.5px]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--border-hover)] bg-[var(--bg-secondary)] px-3.5 py-1.5 text-[12.5px] text-[var(--text-secondary)]">
              ⚡ 자동 감지
            </span>
            {['검색', '계산', '검증'].map((m) => (
              <span key={m} className="hidden rounded-full border border-[var(--border-hover)] px-3.5 py-1.5 text-[12.5px] text-[var(--text-tertiary)] sm:inline">
                {m}
              </span>
            ))}
            {/* BYOK 상태 겸 입구 — 키 등록 페이지로 (비로그인도 사용 가능) */}
            <Link
              href="/settings/byok"
              className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-secondary)]"
              title="BYOK 키 설정"
            >
              <ShieldCheck size={12} />
              Gemini 2.5 · BYOK
            </Link>
            <button
              onClick={handleSearch}
              disabled={isLoading}
              aria-label="질의 실행"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[var(--color-primary)] text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:text-[var(--bg-primary)]"
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
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-0">
              {PILLARS.map(({ numeral, title, desc }, i) => (
                <div
                  key={numeral}
                  className={
                    i < 2
                      ? 'sm:border-r sm:border-[var(--border-default)] sm:px-6 sm:first:pl-1'
                      : 'sm:px-6 sm:pr-1'
                  }
                >
                  <div className="font-[family-name:var(--font-serif)] text-base font-bold text-[var(--color-accent)]">{numeral}</div>
                  <div className="mt-1.5 text-[13.5px] font-bold">{title}</div>
                  <p className="mt-1 text-xs leading-[1.65] text-[var(--text-tertiary)]">{desc}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ═══ 최근 스레드 ═══ */}
      <section className="mx-auto w-full max-w-[808px] px-4 pb-2 pt-8 sm:px-6">
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
      </section>

      {/* ═══ 도구 행 — 헤더 밖 라우트 도달성 (BYOK 포함) ═══ */}
      <section className="mx-auto w-full max-w-[808px] px-4 pb-10 pt-7 sm:px-6">
        <div className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-[var(--text-tertiary)]">도구</div>
        <div className="flex flex-wrap gap-2">
          {TOOLS.map(({ icon: Icon, label, href }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[var(--border-default)] bg-[var(--bg-primary)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--text-primary)]"
            >
              <Icon size={14} className="text-[var(--text-tertiary)]" />
              {label}
            </Link>
          ))}
        </div>
      </section>

      {/* ═══ 상태 바 ═══ */}
      <div className="flex h-8 items-center gap-4 overflow-x-auto border-t border-[var(--border-default)] bg-[var(--bg-secondary)] px-4 font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-tertiary)] sm:px-5">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[var(--color-success)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
          운영 정상
        </span>
        <span className="shrink-0">내장 판본 KEC 2021 · NEC 2023 · IEC 60364</span>
        <span className="hidden shrink-0 sm:inline">Gemini 2.5 · BYOK (AES-GCM 세션 암호화)</span>
        <span className="ml-auto hidden shrink-0 sm:inline">엔진 {CALCULATOR_COUNT}종</span>
      </div>
    </div>
  );
}
