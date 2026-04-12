'use client';

/**
 * DrawingOverlay — 도면 위 검증 마킹 오버레이
 * ---------------------------------------------
 * 도면 이미지 위에 빨강/노랑/초록 마킹을 오버레이.
 * 각 마킹은 클릭 시 상세 정보 표시.
 */

import { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, X } from 'lucide-react';
import type { VerificationMarking, MarkingSeverity } from '@/agent/teams/types';

interface Props {
  /** 도면 이미지 URL (base64 or URL) */
  imageUrl?: string;
  /** 도면 크기 (px) */
  width?: number;
  height?: number;
  /** 검증 마킹 목록 */
  markings: VerificationMarking[];
  className?: string;
}

const SEVERITY_COLORS: Record<MarkingSeverity, { bg: string; border: string; icon: typeof XCircle }> = {
  error:   { bg: '#ef4444', border: '#dc2626', icon: XCircle },
  warning: { bg: '#f59e0b', border: '#d97706', icon: AlertTriangle },
  info:    { bg: '#3b82f6', border: '#2563eb', icon: AlertTriangle },
  success: { bg: '#10b981', border: '#059669', icon: CheckCircle2 },
};

export default function DrawingOverlay({
  imageUrl,
  width = 800,
  height = 600,
  markings,
  className = '',
}: Props) {
  const [selectedMarking, setSelectedMarking] = useState<VerificationMarking | null>(null);

  // 마킹 위치 시뮬레이션 (실제 도면에서는 componentId 기반 좌표 매핑)
  const getMarkingPosition = (marking: VerificationMarking, index: number) => {
    // 실제 구현 시: marking.componentId → topology graph → 좌표
    // 현재: 균등 분배
    const cols = 4;
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      x: 80 + col * (width - 160) / (cols - 1),
      y: 80 + row * 120,
    };
  };

  const errorCount = markings.filter(m => m.severity === 'error').length;
  const warnCount = markings.filter(m => m.severity === 'warning').length;
  const passCount = markings.filter(m => m.severity === 'success').length;

  return (
    <div className={`relative overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-secondary)] ${className}`}>
      {/* 범례 */}
      <div className="absolute left-3 top-3 z-10 flex gap-2">
        {errorCount > 0 && (
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
            {errorCount} 오류
          </span>
        )}
        {warnCount > 0 && (
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
            {warnCount} 경고
          </span>
        )}
        {passCount > 0 && (
          <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
            {passCount} 적합
          </span>
        )}
      </div>

      {/* 도면 영역 */}
      <div className="relative" style={{ width, height, maxWidth: '100%', aspectRatio: `${width}/${height}` }}>
        {/* 배경 (도면 이미지 또는 플레이스홀더) */}
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="도면" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[var(--bg-tertiary)]">
            <div className="text-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mx-auto mb-2 text-[var(--text-tertiary)]">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1" opacity="0.3" />
                <line x1="9" y1="3" x2="9" y2="21" stroke="currentColor" strokeWidth="1" opacity="0.3" />
                <line x1="15" y1="3" x2="15" y2="21" stroke="currentColor" strokeWidth="1" opacity="0.3" />
              </svg>
              <p className="text-xs text-[var(--text-tertiary)]">도면 미업로드<br />마킹 위치는 시뮬레이션</p>
            </div>
          </div>
        )}

        {/* 마킹 오버레이 */}
        {markings.map((marking, i) => {
          const pos = getMarkingPosition(marking, i);
          const config = SEVERITY_COLORS[marking.severity];
          const Icon = config.icon;

          return (
            <button
              key={marking.id}
              className="absolute z-10 flex items-center gap-1 rounded-lg border-2 px-2 py-1 text-[10px] font-bold text-white shadow-lg transition-transform hover:scale-110"
              style={{
                left: `${(pos.x / width) * 100}%`,
                top: `${(pos.y / height) * 100}%`,
                transform: 'translate(-50%, -50%)',
                backgroundColor: config.bg,
                borderColor: config.border,
              }}
              onClick={() => setSelectedMarking(marking)}
            >
              <Icon size={12} />
              <span className="max-w-[80px] truncate">{marking.location}</span>
            </button>
          );
        })}

        {/* 연결선 (오류 간) */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`}>
          {markings.filter(m => m.severity === 'error').map((m, i, arr) => {
            if (i === 0) return null;
            const prev = getMarkingPosition(arr[i - 1], markings.indexOf(arr[i - 1]));
            const curr = getMarkingPosition(m, markings.indexOf(m));
            return (
              <line
                key={`line-${i}`}
                x1={prev.x} y1={prev.y} x2={curr.x} y2={curr.y}
                stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.4"
              />
            );
          })}
        </svg>
      </div>

      {/* 상세 팝업 */}
      {selectedMarking && (
        <div className="absolute bottom-3 left-3 right-3 z-20 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4 shadow-xl">
          <button
            onClick={() => setSelectedMarking(null)}
            className="absolute right-2 top-2 rounded-full p-1 hover:bg-[var(--bg-secondary)]"
          >
            <X size={14} />
          </button>
          <div className="flex items-start gap-2">
            {(() => {
              const Icon = SEVERITY_COLORS[selectedMarking.severity].icon;
              return <Icon size={16} style={{ color: SEVERITY_COLORS[selectedMarking.severity].bg }} className="mt-0.5 shrink-0" />;
            })()}
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{selectedMarking.message}</p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{selectedMarking.location}</p>
              {selectedMarking.detail && (
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">{selectedMarking.detail}</p>
              )}
              {selectedMarking.calculatedValue && (
                <span className="mt-1 inline-block rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 font-mono text-[10px]">
                  계산값: {selectedMarking.calculatedValue}
                </span>
              )}
              {selectedMarking.suggestedFix && (
                <p className="mt-1.5 text-xs font-medium text-[var(--color-primary)]">
                  → {selectedMarking.suggestedFix}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
