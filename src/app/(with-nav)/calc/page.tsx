'use client';

/**
 * Calculator Hub Page — Grid of calculator categories
 *
 * PART 1: Category metadata and types
 * PART 2: Category card component
 * PART 3: Calculator list item
 * PART 4: Main page with search/filter
 */

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Zap,
  ArrowDownUp,
  Cable,
  Gauge,
  Shield,
  CircleDot,
  Cog,
  Sun,
  Building,
  Lightbulb,
  Globe,
  Brain,
  Search,
  Calculator,
  ChevronRight,
} from 'lucide-react';
import type { DifficultyLevel } from '@/engine/calculators/types';
import { CALCULATOR_NAMES } from '@/lib/calculator-params';
import { CALCULATOR_CATALOG } from '@/lib/calculator-catalog';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Category Metadata
// ═══════════════════════════════════════════════════════════════════════════════

interface CategoryMeta {
  id: string;
  name: string;
  nameEn: string;
  icon: typeof Zap;
  description: string;
  color: string;
  calculators: {
    id: string;
    name: string;
    nameEn: string;
    difficulty: DifficultyLevel;
    category: string;
  }[];
}

const DIFFICULTY_CONFIG: Record<DifficultyLevel, { label: string; color: string }> = {
  basic: { label: '기초', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  intermediate: { label: '중급', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  advanced: { label: '고급', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};


/**
 * 그 분야에 속한 계산기 목록을 카탈로그에서 만든다.
 *
 * 이 페이지가 57종의 이름·분야·난이도를 통째로 인라인으로 들고 있었다. 같은
 * 표가 계산 기록에도 따로 있었고(10종), 그 사이가 벌어져 나머지 47종은 분야가
 * 'other' 로 빠졌다(실측 2026-07-26). 이름은 CALCULATOR_NAMES, 분야·난이도는
 * CALCULATOR_CATALOG 가 정본이다 — 화면은 그것을 읽기만 한다.
 */
function calculatorsIn(category: string): CategoryMeta['calculators'] {
  return Object.entries(CALCULATOR_CATALOG)
    .filter(([, meta]) => meta.category === category)
    .map(([id, meta]) => ({
      id,
      name: CALCULATOR_NAMES[id]?.name ?? id,
      nameEn: CALCULATOR_NAMES[id]?.nameEn ?? id,
      difficulty: meta.difficulty as DifficultyLevel,
      category,
    }));
}

/** Map engine categories to display categories */
function buildCategories(): CategoryMeta[] {
  // Static category definitions with mapped calculators.
  // Total here drifts from CALCULATOR_REGISTRY size (engine/calculators/count.ts);
  // tracked in BUG-008 — at least 1 registry calculator is not surfaced on this page.
  // The runtime `totalCalcs` reduces from `categories[].calculators.length` so the
  // displayed number always matches what this static map contains.
  const categories: CategoryMeta[] = [
    {
      id: 'power',
      name: '전력기초',
      nameEn: 'Power Basics',
      icon: Zap,
      description: '단상/3상 전력, 역률, 피상전력 계산',
      color: 'from-blue-500 to-blue-600',
      calculators: calculatorsIn('power'),
    },
    {
      id: 'voltage-drop',
      name: '전압강하',
      nameEn: 'Voltage Drop',
      icon: ArrowDownUp,
      description: '전압강하율, 케이블 길이별 전압 손실',
      color: 'from-amber-500 to-amber-600',
      calculators: calculatorsIn('voltage-drop'),
    },
    {
      id: 'cable',
      name: '케이블',
      nameEn: 'Cable Sizing',
      icon: Cable,
      description: '허용전류, 케이블 선정, 보정계수',
      color: 'from-orange-500 to-orange-600',
      calculators: calculatorsIn('cable'),
    },
    {
      id: 'transformer',
      name: '변압기',
      nameEn: 'Transformer',
      icon: Gauge,
      description: '변압기 용량 선정, 부하 계산',
      color: 'from-purple-500 to-purple-600',
      calculators: calculatorsIn('transformer'),
    },
    {
      id: 'protection',
      name: '보호협조',
      nameEn: 'Protection',
      icon: Shield,
      description: '단락전류, 차단기 선정, 보호 협조',
      color: 'from-red-500 to-red-600',
      calculators: calculatorsIn('protection'),
    },
    {
      id: 'grounding',
      name: '접지',
      nameEn: 'Grounding',
      icon: CircleDot,
      description: '접지저항, 접지봉 설계, 등전위 본딩',
      color: 'from-emerald-500 to-emerald-600',
      calculators: calculatorsIn('grounding'),
    },
    {
      id: 'motor',
      name: '전동기',
      nameEn: 'Motor',
      icon: Cog,
      description: '전동기 기동, 역률 보상, 인버터',
      color: 'from-slate-500 to-slate-600',
      calculators: calculatorsIn('motor'),
    },
    {
      id: 'renewable',
      name: '신재생/ESS',
      nameEn: 'Renewable & ESS',
      icon: Sun,
      description: '태양광, 풍력, ESS 용량 계산',
      color: 'from-yellow-500 to-yellow-600',
      calculators: calculatorsIn('renewable'),
    },
    {
      id: 'substation',
      name: '수변전',
      nameEn: 'Substation',
      icon: Building,
      description: '수변전 설비 설계, 부하 분석',
      color: 'from-indigo-500 to-indigo-600',
      calculators: calculatorsIn('substation'),
    },
    {
      id: 'lighting',
      name: '조명',
      nameEn: 'Lighting',
      icon: Lightbulb,
      description: '조도 계산, 조명 설계',
      color: 'from-cyan-500 to-cyan-600',
      calculators: calculatorsIn('lighting'),
    },
    {
      id: 'global',
      name: '글로벌',
      nameEn: 'Global',
      icon: Globe,
      description: 'NEC/IEC/IEEE 기준별 비교',
      color: 'from-teal-500 to-teal-600',
      calculators: calculatorsIn('global'),
    },
    {
      id: 'ai',
      name: 'AI특화',
      nameEn: 'AI-Powered',
      icon: Brain,
      description: 'AI 기반 설계 최적화, 자동 검증',
      color: 'from-pink-500 to-pink-600',
      calculators: calculatorsIn('ai'),
    },
  ];

  return categories;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Category Card
// ═══════════════════════════════════════════════════════════════════════════════

function CategoryCard({ category }: { category: CategoryMeta }) {
  const Icon = category.icon;
  const count = category.calculators.length;

  // Difficulty distribution
  const difficulties = category.calculators.reduce(
    (acc, c) => {
      acc[c.difficulty] = (acc[c.difficulty] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="card-interactive group rounded-2xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
      {/* Icon + name */}
      <div className="mb-3 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${category.color} text-white`}>
          <Icon size={20} />
        </div>
        <div>
          {/* 페이지 h1 바로 아래 절이므로 h2 다 — h3 로 두면 단계를 건너뛴다. */}
          <h2 className="font-semibold text-[var(--text-primary)]">{category.name}</h2>
          <span className="text-xs text-[var(--text-tertiary)]">{category.nameEn}</span>
        </div>
      </div>

      {/* Description */}
      <p className="mb-3 text-sm text-[var(--text-secondary)]">{category.description}</p>

      {/* Stats row */}
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
          {count > 0 ? `${count}개 계산기` : '준비 중'}
        </span>
        {Object.entries(difficulties).map(([level, num]) => (
          <span
            key={level}
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_CONFIG[level as DifficultyLevel].color}`}
          >
            {DIFFICULTY_CONFIG[level as DifficultyLevel].label} {num}
          </span>
        ))}
      </div>

      {/* Calculator links */}
      {count > 0 && (
        <ul className="space-y-1">
          {category.calculators.map((calc) => (
            <li key={calc.id}>
              <Link
                href={`/calc/${calc.category}/${calc.id}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--color-primary)]"
              >
                <Calculator size={14} className="shrink-0" />
                <span className="flex-1">{calc.name}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${DIFFICULTY_CONFIG[calc.difficulty].color}`}>
                  {DIFFICULTY_CONFIG[calc.difficulty].label}
                </span>
                <ChevronRight size={14} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {count === 0 && (
        <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-center text-xs text-[var(--text-tertiary)]">
          곧 추가 예정
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function CalcHubPage() {
  const [filter, setFilter] = useState('');
  // 이름·분야·난이도는 calculatorsIn 이 정본(CALCULATOR_NAMES·CALCULATOR_CATALOG)
  // 에서 채운다. 이 화면은 아이콘·색·설명 같은 표현만 들고 있다.
  const categories = useMemo(() => buildCategories(), []);

  const filteredCategories = useMemo(() => {
    if (!filter.trim()) return categories;
    const lower = filter.toLowerCase();
    return categories.filter(
      (cat) =>
        cat.name.toLowerCase().includes(lower) ||
        cat.nameEn.toLowerCase().includes(lower) ||
        cat.description.toLowerCase().includes(lower) ||
        cat.calculators.some(
          (c) =>
            c.name.toLowerCase().includes(lower) ||
            c.nameEn.toLowerCase().includes(lower) ||
            c.id.toLowerCase().includes(lower),
        ),
    );
  }, [categories, filter]);

  const totalCalcs = categories.reduce((sum, c) => sum + c.calculators.length, 0);

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      {/* Header */}
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="mb-4 flex items-center gap-3">
            <Link href="/" className="text-xl font-bold text-[var(--color-primary)]">
              ESVA
            </Link>
            <span className="text-[var(--text-tertiary)]">/</span>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">계산기</h1>
          </div>
          <p className="mb-4 text-sm text-[var(--text-secondary)]">
            전기공학 전문 계산기 {totalCalcs}개 | 12개 분야 | KEC/NEC/IEC 기준 기반
          </p>

          {/* Filter bar */}
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              aria-label="계산기 검색"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="계산기 검색 (예: 전압강하, cable, breaker)"
              className="h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--color-primary)]"
            />
          </div>
        </div>
      </header>

      {/* Grid */}
      <div className="mx-auto max-w-7xl px-4 py-6">
        {filteredCategories.length === 0 ? (
          <div className="py-16 text-center text-[var(--text-tertiary)]">
            &ldquo;{filter}&rdquo;에 해당하는 계산기가 없습니다
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredCategories.map((cat) => (
              <CategoryCard key={cat.id} category={cat} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
