/**
 * ESVA Verified Badge
 * -------------------
 * 검증 완료 인증 마크. 등급별 색상 + 점수 표시.
 */

import type { VerifiedGrade, ReportVerdict } from '@/agent/teams/types';

interface Props {
  grade: VerifiedGrade;
  score: number;
  verdict: ReportVerdict;
  reportId: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const GRADE_COLORS: Record<VerifiedGrade, { bg: string; border: string; text: string }> = {
  'A+': { bg: '#059669', border: '#047857', text: '#ffffff' },
  'A':  { bg: '#10b981', border: '#059669', text: '#ffffff' },
  'B+': { bg: '#3b82f6', border: '#2563eb', text: '#ffffff' },
  'B':  { bg: '#60a5fa', border: '#3b82f6', text: '#ffffff' },
  'C':  { bg: '#f59e0b', border: '#d97706', text: '#ffffff' },
  'D':  { bg: '#ef4444', border: '#dc2626', text: '#ffffff' },
  'F':  { bg: '#991b1b', border: '#7f1d1d', text: '#ffffff' },
};

const VERDICT_LABEL: Record<ReportVerdict, { ko: string; icon: string }> = {
  PASS:        { ko: '적합', icon: '✓' },
  CONDITIONAL: { ko: '조건부', icon: '△' },
  FAIL:        { ko: '부적합', icon: '✗' },
};

const SIZES = {
  sm: { badge: 'w-20 h-20', text: 'text-xs', grade: 'text-lg' },
  md: { badge: 'w-28 h-28', text: 'text-sm', grade: 'text-2xl' },
  lg: { badge: 'w-36 h-36', text: 'text-base', grade: 'text-3xl' },
};

export default function ESVAVerifiedBadge({
  grade,
  score,
  verdict,
  reportId,
  size = 'md',
  className = '',
}: Props) {
  const colors = GRADE_COLORS[grade];
  const verdictInfo = VERDICT_LABEL[verdict];
  const sz = SIZES[size];

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      {/* 원형 배지 */}
      <div
        className={`${sz.badge} relative flex flex-col items-center justify-center rounded-full border-4 shadow-lg`}
        style={{
          backgroundColor: colors.bg,
          borderColor: colors.border,
          color: colors.text,
        }}
      >
        {/* 등급 */}
        <span className={`${sz.grade} font-black leading-none`}>{grade}</span>
        {/* 점수 */}
        <span className={`${sz.text} font-bold opacity-90`}>{score}점</span>
      </div>

      {/* ESVA Verified 라벨 */}
      <div className="mt-2 flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
          <circle cx="12" cy="12" r="10" stroke={colors.bg} strokeWidth="2" />
          <path
            d="M8 12l3 3 5-5"
            stroke={colors.bg}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className={`${sz.text} font-bold`} style={{ color: colors.bg }}>
          ESVA Verified
        </span>
      </div>

      {/* 판정 */}
      <span
        className={`mt-1 rounded-full px-3 py-0.5 ${sz.text} font-medium`}
        style={{
          backgroundColor: `${colors.bg}15`,
          color: colors.bg,
        }}
      >
        {verdictInfo.icon} {verdictInfo.ko}
      </span>

      {/* 보고서 ID */}
      <span className="mt-1 font-mono text-[10px] text-[var(--text-tertiary)]">
        {reportId}
      </span>
    </div>
  );
}
