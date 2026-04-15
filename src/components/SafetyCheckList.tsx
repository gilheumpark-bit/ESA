'use client';

/**
 * ESVA 현장 안전 체크리스트 컴포넌트
 *
 * 룰 엔진 결과 → 카테고리별 체크리스트 UI
 * 항목별 확인 체크 + 대안 제시 ESA 톤
 *
 * PART 1: 서브 컴포넌트
 * PART 2: 메인 컴포넌트
 */

import { useState } from 'react';
import type { SafetyCheckItem, SafetyAnalysisResult, RiskLevel } from '@/engine/safety/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 서브 컴포넌트
// ═══════════════════════════════════════════════════════════════════════════════

const RISK_BADGE: Record<RiskLevel, { label: string; style: string }> = {
  critical: { label: '즉시 조치',  style: 'bg-red-600/20 text-red-400 border-red-700' },
  high:     { label: '높음',       style: 'bg-orange-600/20 text-orange-400 border-orange-700' },
  medium:   { label: '보통',       style: 'bg-yellow-600/20 text-yellow-300 border-yellow-700' },
  low:      { label: '낮음',       style: 'bg-green-600/20 text-green-400 border-green-700' },
};

const OVERALL_RISK_HEADER: Record<RiskLevel, { bg: string; icon: string; label: string }> = {
  critical: { bg: 'bg-red-950/50 border-red-600',    icon: '🚨', label: '즉시 조치 필요' },
  high:     { bg: 'bg-orange-950/50 border-orange-500', icon: '⚠️', label: '위험도 높음' },
  medium:   { bg: 'bg-yellow-950/50 border-yellow-600', icon: '⚡', label: '위험도 보통' },
  low:      { bg: 'bg-green-950/30 border-green-700', icon: '✅', label: '위험도 낮음' },
};

interface CheckItemRowProps {
  item: SafetyCheckItem;
  checked: boolean;
  onToggle: (id: string) => void;
}

function CheckItemRow({ item, checked, onToggle }: CheckItemRowProps) {
  const [showAlt, setShowAlt] = useState(false);
  const badge = RISK_BADGE[item.riskLevel];

  return (
    <div
      className={`rounded-lg border p-3 transition-all ${
        checked
          ? 'border-green-700/50 bg-green-950/20 opacity-60'
          : item.riskLevel === 'critical'
          ? 'border-red-700/60 bg-red-950/20'
          : 'border-[var(--color-border)] bg-[var(--color-surface)]'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* 체크박스 */}
        <button
          onClick={() => onToggle(item.id)}
          aria-label={checked ? '완료 취소' : '완료 표시'}
          className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-all ${
            checked
              ? 'bg-green-600 border-green-600'
              : 'border-[var(--color-border)] hover:border-green-500'
          }`}
        >
          {checked && <span className="text-white text-xs">✓</span>}
        </button>

        {/* 내용 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2 mb-1">
            <span className={`text-sm font-semibold ${checked ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)]'}`}>
              {item.title}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${badge.style}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">{item.description}</p>
          <p className="text-[10px] text-[var(--color-text-muted)]">{item.regulation}</p>

          {/* 대안 제시 */}
          {item.alternative && !checked && (
            <div className="mt-2">
              <button
                onClick={() => setShowAlt(v => !v)}
                className="text-[11px] text-[var(--color-primary)] hover:underline"
              >
                {showAlt ? '▲ 대안 숨기기' : '▼ 즉시 대안 보기 (ESA 제안)'}
              </button>
              {showAlt && (
                <div className="mt-1.5 p-2 rounded-lg bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 text-xs text-[var(--color-text-primary)]">
                  💡 {item.alternative}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 메인 컴포넌트
// ═══════════════════════════════════════════════════════════════════════════════

interface SafetyCheckListProps {
  analysis: SafetyAnalysisResult;
  className?: string;
}

export function SafetyCheckList({ analysis, className = '' }: SafetyCheckListProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 카테고리별 그룹
  const grouped = analysis.checkItems.reduce<Record<string, SafetyCheckItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category]!.push(item);
    return acc;
  }, {});

  const totalItems = analysis.checkItems.length;
  const doneItems = checked.size;
  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const header = OVERALL_RISK_HEADER[analysis.overallRisk];

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 종합 위험도 요약 */}
      <div className={`rounded-xl border p-4 ${header.bg}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">{header.icon}</span>
          <span className="font-bold text-[var(--color-text-primary)]">{header.label}</span>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)]">{analysis.summaryKo}</p>

        {/* 진행률 */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-[var(--color-text-secondary)] mb-1">
            <span>점검 진행률</span>
            <span className="font-semibold">{doneItems} / {totalItems} ({pct}%)</span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--color-surface-2)]">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* 카테고리별 체크리스트 */}
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h3 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2 px-1">
            {category}
          </h3>
          <div className="space-y-2">
            {items.map(item => (
              <CheckItemRow
                key={item.id}
                item={item}
                checked={checked.has(item.id)}
                onToggle={toggleItem}
              />
            ))}
          </div>
        </div>
      ))}

      {/* 적용 법령 */}
      {analysis.applicableRegulations.length > 0 && (
        <div className="rounded-lg border border-[var(--color-border)] p-3 bg-[var(--color-surface)]">
          <p className="text-xs font-semibold text-[var(--color-text-secondary)] mb-1.5">적용 법령</p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.applicableRegulations.map(reg => (
              <span key={reg} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                {reg}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
