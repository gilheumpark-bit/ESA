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


/** Map engine categories to display categories */
function buildCategories(): CategoryMeta[] {
  // Static category definitions with mapped calculators — 56 total across 12 categories
  const categories: CategoryMeta[] = [
    {
      id: 'power',
      name: '전력기초',
      nameEn: 'Power Basics',
      icon: Zap,
      description: '단상/3상 전력, 역률, 피상전력 계산',
      color: 'from-blue-500 to-blue-600',
      calculators: [
        { id: 'single-phase-power', name: '단상 전력 계산', nameEn: 'Single-Phase Power', difficulty: 'basic', category: 'power' },
        { id: 'three-phase-power', name: '3상 전력 계산', nameEn: 'Three-Phase Power', difficulty: 'basic', category: 'power' },
        { id: 'power-factor', name: '역률 계산', nameEn: 'Power Factor', difficulty: 'basic', category: 'power' },
        { id: 'reactive-power', name: '무효전력 보상 계산', nameEn: 'Reactive Power Compensation', difficulty: 'intermediate', category: 'power' },
        { id: 'demand-diversity', name: '수용률/부등률 계산', nameEn: 'Demand & Diversity Factor', difficulty: 'intermediate', category: 'power' },
        { id: 'max-demand', name: '최대수요전력 계산', nameEn: 'Maximum Demand', difficulty: 'intermediate', category: 'power' },
        { id: 'power-loss', name: '전력 손실 계산', nameEn: 'Power Loss', difficulty: 'advanced', category: 'power' },
      ],
    },
    {
      id: 'voltage-drop',
      name: '전압강하',
      nameEn: 'Voltage Drop',
      icon: ArrowDownUp,
      description: '전압강하율, 케이블 길이별 전압 손실',
      color: 'from-amber-500 to-amber-600',
      calculators: [
        { id: 'voltage-drop', name: '전압 강하 계산', nameEn: 'Voltage Drop', difficulty: 'intermediate', category: 'voltage-drop' },
        { id: 'three-phase-vd', name: '3상 전압강하', nameEn: 'Three-Phase VD', difficulty: 'intermediate', category: 'voltage-drop' },
        { id: 'complex-voltage-drop', name: '임피던스 기반 전압강하', nameEn: 'Complex VD', difficulty: 'advanced', category: 'voltage-drop' },
        { id: 'busbar-vd', name: '부스바 전압강하', nameEn: 'Busbar VD', difficulty: 'advanced', category: 'voltage-drop' },
        { id: 'country-compare-vd', name: '국가별 전압강하 비교', nameEn: 'Country Compare VD', difficulty: 'advanced', category: 'voltage-drop' },
      ],
    },
    {
      id: 'cable',
      name: '케이블',
      nameEn: 'Cable Sizing',
      icon: Cable,
      description: '허용전류, 케이블 선정, 보정계수',
      color: 'from-orange-500 to-orange-600',
      calculators: [
        { id: 'cable-sizing', name: '케이블 사이징', nameEn: 'Cable Sizing', difficulty: 'advanced', category: 'cable' },
        { id: 'awg-converter', name: 'AWG↔mm² 변환', nameEn: 'AWG Converter', difficulty: 'basic', category: 'cable' },
        { id: 'ampacity-compare', name: '허용전류 비교', nameEn: 'Ampacity Compare', difficulty: 'intermediate', category: 'cable' },
        { id: 'cable-impedance', name: '케이블 임피던스', nameEn: 'Cable Impedance', difficulty: 'intermediate', category: 'cable' },
      ],
    },
    {
      id: 'transformer',
      name: '변압기',
      nameEn: 'Transformer',
      icon: Gauge,
      description: '변압기 용량 선정, 부하 계산',
      color: 'from-purple-500 to-purple-600',
      calculators: [
        { id: 'transformer-capacity', name: '변압기 용량 선정', nameEn: 'Transformer Capacity', difficulty: 'intermediate', category: 'transformer' },
        { id: 'transformer-loss', name: '변압기 손실', nameEn: 'Transformer Loss', difficulty: 'intermediate', category: 'transformer' },
        { id: 'transformer-efficiency', name: '변압기 효율', nameEn: 'Transformer Efficiency', difficulty: 'intermediate', category: 'transformer' },
        { id: 'impedance-voltage', name: '임피던스 전압', nameEn: 'Impedance Voltage', difficulty: 'intermediate', category: 'transformer' },
        { id: 'inrush-current', name: '돌입전류', nameEn: 'Inrush Current', difficulty: 'advanced', category: 'transformer' },
        { id: 'parallel-operation', name: '병렬운전', nameEn: 'Parallel Operation', difficulty: 'advanced', category: 'transformer' },
      ],
    },
    {
      id: 'protection',
      name: '보호협조',
      nameEn: 'Protection',
      icon: Shield,
      description: '단락전류, 차단기 선정, 보호 협조',
      color: 'from-red-500 to-red-600',
      calculators: [
        { id: 'short-circuit', name: '단락 전류 계산', nameEn: 'Short-Circuit Current', difficulty: 'advanced', category: 'protection' },
        { id: 'breaker-sizing', name: '차단기 선정', nameEn: 'Breaker Sizing', difficulty: 'intermediate', category: 'protection' },
        { id: 'earth-fault', name: '지락 전류', nameEn: 'Earth Fault', difficulty: 'advanced', category: 'protection' },
        { id: 'rcd-sizing', name: '누전차단기 선정', nameEn: 'RCD Sizing', difficulty: 'intermediate', category: 'protection' },
        { id: 'relay-basic', name: '과전류 계전기', nameEn: 'Overcurrent Relay', difficulty: 'advanced', category: 'protection' },
      ],
    },
    {
      id: 'grounding',
      name: '접지',
      nameEn: 'Grounding',
      icon: CircleDot,
      description: '접지저항, 접지봉 설계, 등전위 본딩',
      color: 'from-emerald-500 to-emerald-600',
      calculators: [
        { id: 'ground-resistance', name: '접지 저항 계산', nameEn: 'Ground Resistance', difficulty: 'intermediate', category: 'grounding' },
        { id: 'ground-conductor', name: '접지 도체', nameEn: 'Grounding Conductor', difficulty: 'intermediate', category: 'grounding' },
        { id: 'equipotential-bonding', name: '등전위 본딩', nameEn: 'Equipotential Bonding', difficulty: 'advanced', category: 'grounding' },
        { id: 'lightning-protection', name: '피뢰 시스템', nameEn: 'Lightning Protection', difficulty: 'advanced', category: 'grounding' },
      ],
    },
    {
      id: 'motor',
      name: '전동기',
      nameEn: 'Motor',
      icon: Cog,
      description: '전동기 기동, 역률 보상, 인버터',
      color: 'from-slate-500 to-slate-600',
      calculators: [
        { id: 'motor-capacity', name: '전동기 용량', nameEn: 'Motor Capacity', difficulty: 'intermediate', category: 'motor' },
        { id: 'starting-current', name: '기동전류', nameEn: 'Starting Current', difficulty: 'intermediate', category: 'motor' },
        { id: 'motor-efficiency', name: '전동기 효율', nameEn: 'Motor Efficiency', difficulty: 'intermediate', category: 'motor' },
        { id: 'inverter-capacity', name: '인버터 용량', nameEn: 'Inverter Capacity', difficulty: 'intermediate', category: 'motor' },
        { id: 'motor-pf-correction', name: '역률 보상', nameEn: 'Motor PF Correction', difficulty: 'advanced', category: 'motor' },
        { id: 'braking-resistor', name: '제동 저항기', nameEn: 'Braking Resistor', difficulty: 'advanced', category: 'motor' },
      ],
    },
    {
      id: 'renewable',
      name: '신재생/ESS',
      nameEn: 'Renewable & ESS',
      icon: Sun,
      description: '태양광, 풍력, ESS 용량 계산',
      color: 'from-yellow-500 to-yellow-600',
      calculators: [
        { id: 'solar-generation', name: '태양광 발전량 계산', nameEn: 'Solar PV Generation', difficulty: 'basic', category: 'renewable' },
        { id: 'battery-capacity', name: '배터리 용량 계산', nameEn: 'Battery Capacity (ESS)', difficulty: 'basic', category: 'renewable' },
        { id: 'solar-cable', name: '태양광 DC 케이블', nameEn: 'Solar Cable', difficulty: 'intermediate', category: 'renewable' },
        { id: 'pcs-capacity', name: 'PCS 용량', nameEn: 'PCS Capacity', difficulty: 'intermediate', category: 'renewable' },
        { id: 'grid-connect', name: '계통 연계', nameEn: 'Grid Connection', difficulty: 'intermediate', category: 'renewable' },
      ],
    },
    {
      id: 'substation',
      name: '수변전',
      nameEn: 'Substation',
      icon: Building,
      description: '수변전 설비 설계, 부하 분석',
      color: 'from-indigo-500 to-indigo-600',
      calculators: [
        { id: 'substation-capacity', name: '수변전 용량', nameEn: 'Substation Capacity', difficulty: 'intermediate', category: 'substation' },
        { id: 'ct-sizing', name: 'CT 선정', nameEn: 'CT Sizing', difficulty: 'intermediate', category: 'substation' },
        { id: 'vt-sizing', name: 'VT 선정', nameEn: 'VT Sizing', difficulty: 'intermediate', category: 'substation' },
        { id: 'surge-arrester', name: '피뢰기 선정', nameEn: 'Surge Arrester', difficulty: 'intermediate', category: 'substation' },
      ],
    },
    {
      id: 'lighting',
      name: '조명',
      nameEn: 'Lighting',
      icon: Lightbulb,
      description: '조도 계산, 조명 설계',
      color: 'from-cyan-500 to-cyan-600',
      calculators: [
        { id: 'illuminance', name: '조도 계산', nameEn: 'Illuminance', difficulty: 'basic', category: 'lighting' },
        { id: 'energy-saving', name: '에너지 절감', nameEn: 'Energy Saving', difficulty: 'basic', category: 'lighting' },
        { id: 'ups-capacity', name: 'UPS 용량', nameEn: 'UPS Capacity', difficulty: 'intermediate', category: 'lighting' },
        { id: 'emergency-generator', name: '비상 발전기', nameEn: 'Emergency Generator', difficulty: 'intermediate', category: 'lighting' },
      ],
    },
    {
      id: 'global',
      name: '글로벌',
      nameEn: 'Global',
      icon: Globe,
      description: 'NEC/IEC/IEEE 기준별 비교',
      color: 'from-teal-500 to-teal-600',
      calculators: [
        { id: 'temp-correction', name: '온도 보정', nameEn: 'Temp Correction', difficulty: 'basic', category: 'global' },
        { id: 'ampacity-global-compare', name: '글로벌 허용전류', nameEn: 'Global Ampacity', difficulty: 'intermediate', category: 'global' },
        { id: 'awg-converter-full', name: '통합 변환', nameEn: 'Full Converter', difficulty: 'basic', category: 'global' },
        { id: 'frequency-compare', name: '주파수 비교', nameEn: 'Frequency Compare', difficulty: 'basic', category: 'global' },
        { id: 'nec-load-calc', name: 'NEC 부하 계산', nameEn: 'NEC Load Calc', difficulty: 'intermediate', category: 'global' },
      ],
    },
    {
      id: 'ai',
      name: 'AI특화',
      nameEn: 'AI-Powered',
      icon: Brain,
      description: 'AI 기반 설계 최적화, 자동 검증',
      color: 'from-pink-500 to-pink-600',
      calculators: [
        { id: 'token-cost', name: '토큰 비용', nameEn: 'Token Cost', difficulty: 'basic', category: 'ai' },
      ],
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
          <h3 className="font-semibold text-[var(--text-primary)]">{category.name}</h3>
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
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="계산기 검색 (예: 전압강하, cable, breaker)"
              className="h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--color-primary)]"
            />
          </div>
        </div>
      </header>

      {/* Grid */}
      <main className="mx-auto max-w-7xl px-4 py-6">
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
      </main>
    </div>
  );
}
