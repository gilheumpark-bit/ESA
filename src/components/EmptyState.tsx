'use client';

/**
 * EmptyState — 빈 상태 가이드
 * ----------------------------
 * "데이터 없음" 대신 행동 유도 CTA + 예시 자동채우기.
 * history, dashboard, projects 등에서 공용.
 */

import Link from 'next/link';
import { Calculator, Search, FileText, ArrowRight, Sparkles } from 'lucide-react';

interface QuickAction {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: typeof Calculator;
}

interface Props {
  /** 타이틀 (예: "계산 이력이 없습니다") */
  title: string;
  /** 설명 */
  description: string;
  /** 빠른 시작 액션들 */
  actions?: QuickAction[];
  /** 예시 자동채우기 */
  examples?: { label: string; onClick: () => void }[];
  /** 아이콘 */
  icon?: typeof Calculator;
  className?: string;
}

export default function EmptyState({
  title,
  description,
  actions,
  examples,
  icon: Icon = Sparkles,
  className = '',
}: Props) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 ${className}`}>
      {/* 아이콘 */}
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-tertiary)]">
        <Icon size={28} className="text-[var(--text-tertiary)]" />
      </div>

      {/* 텍스트 */}
      <h3 className="mb-1 text-lg font-bold text-[var(--text-primary)]">{title}</h3>
      <p className="mb-6 max-w-sm text-center text-sm text-[var(--text-tertiary)]">{description}</p>

      {/* 빠른 시작 액션 */}
      {actions && actions.length > 0 && (
        <div className="mb-6 flex flex-wrap justify-center gap-2">
          {actions.map((action, i) => {
            const ActionIcon = action.icon ?? ArrowRight;
            if (action.href) {
              return (
                <Link
                  key={i}
                  href={action.href}
                  className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
                >
                  <ActionIcon size={16} />
                  {action.label}
                </Link>
              );
            }
            return (
              <button
                key={i}
                onClick={action.onClick}
                className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
              >
                <ActionIcon size={16} />
                {action.label}
              </button>
            );
          })}
        </div>
      )}

      {/* 예시 자동채우기 */}
      {examples && examples.length > 0 && (
        <div className="w-full max-w-md">
          <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
            예시로 시작하기
          </p>
          <div className="grid gap-1.5">
            {examples.map((ex, i) => (
              <button
                key={i}
                onClick={ex.onClick}
                className="flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2.5 text-left text-sm text-[var(--text-secondary)] transition-all hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] hover:shadow-sm"
              >
                <Sparkles size={14} className="shrink-0 text-[var(--color-accent)]" />
                {ex.label}
                <ArrowRight size={12} className="ml-auto shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Presets — 자주 쓰는 빈 상태
// ═══════════════════════════════════════════════════════════════════════════════

export function EmptyHistory({ onExample }: { onExample?: (calcId: string) => void }) {
  return (
    <EmptyState
      icon={Calculator}
      title="계산 이력이 없습니다"
      description="계산기를 실행하면 이력이 자동으로 저장됩니다. 예시로 시작해보세요."
      actions={[
        { label: '계산기 바로가기', href: '/calc', icon: Calculator },
      ]}
      examples={[
        { label: '전압강하 계산 (380V, 100A, 50m, 35sq)', onClick: () => onExample?.('voltage-drop') },
        { label: '케이블 선정 (200A, 3상, XLPE)', onClick: () => onExample?.('cable-sizing') },
        { label: '차단기 선정 (부하 150A)', onClick: () => onExample?.('breaker-sizing') },
      ]}
    />
  );
}

export function EmptyDashboard() {
  return (
    <EmptyState
      icon={Search}
      title="아직 활동 데이터가 없습니다"
      description="계산기를 실행하거나 기준서를 검색하면 대시보드가 채워집니다."
      actions={[
        { label: '첫 계산 시작', href: '/calc', icon: Calculator },
        { label: 'AI 검색 시작', href: '/search', icon: Search },
      ]}
    />
  );
}

export function EmptyProjects() {
  return (
    <EmptyState
      icon={FileText}
      title="프로젝트가 없습니다"
      description="프로젝트를 만들어 계산 결과와 보고서를 체계적으로 관리하세요."
      actions={[
        { label: '새 프로젝트 만들기', icon: FileText },
      ]}
    />
  );
}
