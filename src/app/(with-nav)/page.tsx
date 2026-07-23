'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Search, FileText, Camera, BarChart3, Globe, FolderOpen,
  Users, BookOpen, Shield, HardHat, Columns2, ClipboardCheck,
  ArrowUpDown, ArrowUp, ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { analyzeCalcIntent, type CalcIntentResult } from '@/lib/calc-intent-bridge';
import InlineCalcResult from '@/components/InlineCalcResult';
import { CALCULATOR_COUNT } from '@/engine/calculators/count';

// 검색을 첫 진입점으로 두고 나머지 기능은 동일한 좌측 축에 정렬한다.

/** 히어로 예시 질의 — 클릭 시 실제 라우팅(계산 의도 자동 감지). */
const EXAMPLES: Array<{ icon: LucideIcon; text: string; tail?: string }> = [
  { icon: ArrowUpDown, text: '380V 50kW 100m 전압강하 검토', tail: '↗' },
  { icon: FileText, text: 'KEC 232.3.9 전압강하 조항 원문과 예외' },
  { icon: Camera, text: '변압기 명판 촬영 → 스펙 추출 → 용량 검증' },
];

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
    window.location.href = `/search?q=${encodeURIComponent(q)}&answer=1`;
  }, []);

  const handleSearch = useCallback(() => runQuery(query), [runQuery, query]);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); },
    [handleSearch],
  );

  return (
    <div className="flex flex-1 flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <section className="mx-auto w-full max-w-[808px] px-4 pb-4 pt-10 sm:px-6 sm:pt-14">
        <h1 className="sr-only">전기 엔지니어 검색</h1>
        <div className="rounded-xl border border-[var(--border-hover)] bg-[var(--bg-primary)] p-4 shadow-[0_4px_24px_rgba(28,27,23,0.06)] sm:p-5">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="질문, 계산 조건 또는 도면 검토 내용을 입력하세요"
            aria-label="질의 입력"
            enterKeyHint="search"
            maxLength={500}
            autoFocus
            className="min-h-[36px] w-full bg-transparent text-[15px] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] sm:text-[15.5px]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-hover)] bg-[var(--bg-secondary)] px-3.5 py-1.5 text-[12.5px] text-[var(--text-secondary)]">
              <Search size={13} aria-hidden="true" />
              자동 분류
            </span>
            {/* BYOK 상태 겸 입구 — 키 등록 페이지로 (비로그인도 사용 가능) */}
            <Link
              href="/settings/byok"
              className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-secondary)]"
              title="BYOK 키 설정"
            >
              <ShieldCheck size={12} />
              내 API 키 · BYOK
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
          </>
        )}
      </section>

      {/* ═══ 예시 작업 ═══ */}
      <section className="mx-auto w-full max-w-[808px] px-4 pb-2 pt-8 sm:px-6">
        <div className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-[var(--text-tertiary)]">예시 작업</div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <Link href="/history" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] px-4 py-3 transition-colors hover:border-[var(--border-hover)]">
            <div className="text-[13.5px] font-medium">변압기 500kVA 병렬 운전 조건</div>
            <div className="mt-0.5 text-[11.5px] text-[var(--text-tertiary)]">계산 이력에서 결과와 영수증 확인</div>
          </Link>
          <Link href="/history" className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] px-4 py-3 transition-colors hover:border-[var(--border-hover)]">
            <div className="text-[13.5px] font-medium">접지저항 10Ω 설계 — Dwight 식</div>
            <div className="mt-0.5 text-[11.5px] text-[var(--text-tertiary)]">계산 조건과 판정 근거 확인</div>
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
      <div className="mt-auto flex h-8 items-center gap-4 overflow-x-auto border-t border-[var(--border-default)] bg-[var(--bg-secondary)] px-4 font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-tertiary)] sm:px-5">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[var(--color-success)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
          내장 계산 엔진 준비
        </span>
        <span className="shrink-0">내장 판본 KEC 2021 · NEC 2023 · IEC 60364</span>
        <span className="hidden shrink-0 sm:inline">BYOK · AES-GCM 세션 암호화</span>
        <span className="ml-auto hidden shrink-0 sm:inline">엔진 {CALCULATOR_COUNT}종</span>
      </div>
    </div>
  );
}
