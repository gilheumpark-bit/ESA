/**
 * ESA Review Report Badge
 * -------------------
 * 전문팀 검토 보고서 표식. 법적 인증이 아니라 보고서 등급·판정을 표시한다.
 */

import type { VerifiedGrade, ReportVerdict } from '@/agent/teams/types';
import { BadgeCheck, CheckCircle2, TriangleAlert, XCircle, type LucideIcon } from 'lucide-react';

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
  'B+': { bg: '#1e3a5f', border: '#16304f', text: '#ffffff' },
  'B':  { bg: '#2d5280', border: '#1e3a5f', text: '#ffffff' },
  'C':  { bg: '#f59e0b', border: '#d97706', text: '#ffffff' },
  'D':  { bg: '#ef4444', border: '#dc2626', text: '#ffffff' },
  'F':  { bg: '#991b1b', border: '#7f1d1d', text: '#ffffff' },
};

const VERDICT_LABEL: Record<ReportVerdict, { ko: string; icon: LucideIcon }> = {
  PASS: { ko: '검토 범위 내 적합', icon: CheckCircle2 },
  CONDITIONAL: { ko: '조건부·사람 검토 필요', icon: TriangleAlert },
  FAIL: { ko: '부적합 항목 발견', icon: XCircle },
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
  const VerdictIcon = verdictInfo.icon;
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

      {/* 검토 보고서 라벨 */}
      <div className="mt-2 flex items-center gap-1.5">
        <BadgeCheck size={14} className="shrink-0" style={{ color: colors.bg }} aria-hidden="true" />
        <span className={`${sz.text} font-bold`} style={{ color: colors.bg }}>
          ESA 검토 보고서
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
        <span className="inline-flex items-center gap-1">
          <VerdictIcon size={13} aria-hidden="true" /> {verdictInfo.ko}
        </span>
      </span>

      {/* 보고서 ID */}
      <span className="mt-1 font-mono text-[10px] text-[var(--text-tertiary)]">
        {reportId}
      </span>
    </div>
  );
}
