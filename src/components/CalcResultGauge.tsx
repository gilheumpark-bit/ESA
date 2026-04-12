'use client';

/**
 * CalcResultGauge — 계산 결과 시각화
 * ------------------------------------
 * 게이지 차트 + 기준선 + PASS/FAIL 배지.
 * 전압강하, 허용전류, 차단기 정격 등 모든 계산기에서 사용.
 *
 * Props:
 *   value: 계산값 (예: 2.8)
 *   unit: 단위 (예: "%")
 *   limit: 기준값 (예: 3.0)
 *   label: 항목명 (예: "전압강하")
 *   direction: 'below' = 기준 이하가 적합, 'above' = 기준 이상이 적합
 */

import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface Props {
  value: number;
  unit: string;
  limit: number;
  label: string;
  standardRef?: string;
  direction?: 'below' | 'above';
  className?: string;
}

export default function CalcResultGauge({
  value,
  unit,
  limit,
  label,
  standardRef,
  direction = 'below',
  className = '',
}: Props) {
  const isCompliant = direction === 'below' ? value <= limit : value >= limit;
  const ratio = direction === 'below'
    ? Math.min(value / limit, 1.5)
    : Math.min(limit / value, 1.5);
  const percentage = Math.min(ratio * 100, 150);

  // 색상: 초록(적합) → 노랑(경계) → 빨강(초과)
  const getColor = () => {
    if (isCompliant) {
      const margin = direction === 'below' ? (limit - value) / limit : (value - limit) / limit;
      if (margin > 0.2) return { bar: '#10b981', bg: '#ecfdf5', text: '#059669' }; // 여유
      return { bar: '#f59e0b', bg: '#fffbeb', text: '#d97706' }; // 경계
    }
    return { bar: '#ef4444', bg: '#fef2f2', text: '#dc2626' }; // 초과
  };

  const color = getColor();
  const displayPercent = Math.min(percentage / 1.5 * 100, 100);

  return (
    <div className={`rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4 ${className}`}>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isCompliant ? (
            <CheckCircle2 size={18} style={{ color: color.text }} />
          ) : (
            <XCircle size={18} style={{ color: color.text }} />
          )}
          <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
        </div>
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
          style={{ backgroundColor: color.bg, color: color.text }}
        >
          {isCompliant ? 'PASS' : 'FAIL'}
        </span>
      </div>

      {/* Value display */}
      <div className="mb-2 flex items-baseline gap-1">
        <span className="text-2xl font-black" style={{ color: color.text }}>
          {value.toFixed(2)}
        </span>
        <span className="text-sm text-[var(--text-tertiary)]">{unit}</span>
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">
          {direction === 'below' ? '허용' : '최소'}: {limit} {unit}
        </span>
      </div>

      {/* Gauge bar */}
      <div className="relative h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: `${color.bar}15` }}>
        {/* Value bar */}
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${displayPercent}%`,
            backgroundColor: color.bar,
          }}
        />
        {/* Limit line */}
        <div
          className="absolute top-0 h-full w-0.5 bg-[var(--text-primary)]"
          style={{
            left: `${(1 / 1.5) * 100}%`,
            opacity: 0.4,
          }}
        />
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
        <span>0 {unit}</span>
        <span className="flex items-center gap-1">
          <div className="h-2 w-0.5 bg-[var(--text-tertiary)] opacity-40" />
          기준 {limit} {unit}
        </span>
        <span>{(limit * 1.5).toFixed(1)} {unit}</span>
      </div>

      {/* Standard ref */}
      {standardRef && (
        <div className="mt-2 flex items-center gap-1">
          <AlertTriangle size={10} className="text-[var(--text-tertiary)]" />
          <span className="text-[10px] text-[var(--text-tertiary)]">{standardRef}</span>
        </div>
      )}
    </div>
  );
}

/**
 * 다중 게이지 — 계산 결과 대시보드
 */
export function CalcResultDashboard({
  results,
}: {
  results: {
    value: number;
    unit: string;
    limit: number;
    label: string;
    standardRef?: string;
    direction?: 'below' | 'above';
  }[];
}) {
  const passCount = results.filter(r =>
    (r.direction ?? 'below') === 'below' ? r.value <= r.limit : r.value >= r.limit
  ).length;
  const totalCount = results.length;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-3 rounded-lg bg-[var(--bg-secondary)] px-4 py-2">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={14} className="text-green-500" />
          <span className="text-xs font-medium text-[var(--text-secondary)]">{passCount} 적합</span>
        </div>
        <div className="flex items-center gap-1.5">
          <XCircle size={14} className="text-red-500" />
          <span className="text-xs font-medium text-[var(--text-secondary)]">{totalCount - passCount} 부적합</span>
        </div>
        <div className="ml-auto text-xs font-bold" style={{ color: passCount === totalCount ? '#10b981' : '#ef4444' }}>
          {Math.round((passCount / Math.max(totalCount, 1)) * 100)}%
        </div>
      </div>

      {/* Gauges */}
      <div className="grid gap-3 sm:grid-cols-2">
        {results.map((r, i) => (
          <CalcResultGauge key={i} {...r} />
        ))}
      </div>
    </div>
  );
}
