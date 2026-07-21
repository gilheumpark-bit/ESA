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

import { useState, useEffect } from 'react';
import type { SafetyCheckItem, SafetyAnalysisResult, RiskLevel } from '@/engine/safety/types';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  ShieldCheck,
  Siren,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 서브 컴포넌트
// ═══════════════════════════════════════════════════════════════════════════════

const RISK_BADGE: Record<RiskLevel, { label: string; style: string }> = {
  critical: { label: '즉시 조치',  style: 'bg-red-600/20 text-red-400 border-red-700' },
  high:     { label: '높음',       style: 'bg-orange-600/20 text-orange-400 border-orange-700' },
  medium:   { label: '보통',       style: 'bg-yellow-600/20 text-yellow-300 border-yellow-700' },
  low:      { label: '낮음',       style: 'bg-green-600/20 text-green-400 border-green-700' },
};

const OVERALL_RISK_HEADER: Record<RiskLevel, { bg: string; icon: LucideIcon; label: string }> = {
  critical: { bg: 'bg-red-950/50 border-red-600', icon: Siren, label: '즉시 조치 필요' },
  high: { bg: 'bg-orange-950/50 border-orange-500', icon: TriangleAlert, label: '위험도 높음' },
  medium: { bg: 'bg-yellow-950/50 border-yellow-600', icon: Zap, label: '위험도 보통' },
  low: { bg: 'bg-green-950/30 border-green-700', icon: ShieldCheck, label: '위험도 낮음' },
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
          type="button"
          onClick={() => onToggle(item.id)}
          aria-label={checked ? '완료 취소' : '완료 표시'}
          className={`mt-0.5 w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-all ${
            checked
              ? 'bg-green-600 border-green-600'
              : 'border-[var(--color-border)] hover:border-green-500'
          }`}
        >
          {checked && <Check size={13} className="text-white" aria-hidden="true" />}
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
                type="button"
                onClick={() => setShowAlt(v => !v)}
                className="inline-flex items-center gap-1 text-[11px] text-[var(--color-primary)] hover:underline"
              >
                {showAlt
                  ? <><ChevronUp size={12} aria-hidden="true" /> 대안 숨기기</>
                  : <><ChevronDown size={12} aria-hidden="true" /> 즉시 대안 보기</>}
              </button>
              {showAlt && (
                <div className="mt-1.5 flex gap-2 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 p-2 text-xs text-[var(--color-text-primary)]">
                  <Lightbulb size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{item.alternative}</span>
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
  /**
   * 체크된 항목 id 목록이 바뀔 때 부모에 알린다.
   * 작업 완료 영수증의 이행률 산출에 쓰인다 — 전달하지 않으면
   * 완료 기록에 이행 항목이 빈 채로 남는다.
   */
  onCheckedChange?: (checkedIds: string[]) => void;
  /**
   * 부모가 보관 중인 체크 상태 초기값 (bug M3). 이 컴포넌트는 모니터링 단계로
   * 이동하면 언마운트됐다가 되돌아올 때 재마운트되는데, 빈 Set 으로 초기화하면
   * mount effect 가 onCheckedChange([]) 를 방출해 이미 이행한 항목 기록을
   * 0 으로 오염시킨다. 부모 값을 seed 로 받아 왕복해도 상태가 보존되게 한다.
   */
  initialCheckedIds?: string[];
}

export function SafetyCheckList({ analysis, className = '', onCheckedChange, initialCheckedIds }: SafetyCheckListProps) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initialCheckedIds ?? []));

  // 체크 상태를 부모에 올려보낸다. setState 업데이터 안에서 부르면 렌더 중에
  // 부모 상태를 바꾸게 되므로 effect로 분리한다.
  useEffect(() => {
    onCheckedChange?.([...checked]);
  }, [checked, onCheckedChange]);

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
  const RiskIcon = header.icon;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 종합 위험도 요약 */}
      <div className={`rounded-xl border p-4 ${header.bg}`}>
        <div className="flex items-center gap-2 mb-2">
          <RiskIcon size={20} aria-hidden="true" />
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
