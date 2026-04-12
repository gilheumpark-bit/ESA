'use client';

/**
 * ESVA Verification Report Component
 * ------------------------------------
 * 사용자에게 보이는 검증 보고서 UI.
 * 빨간줄(오류) / 노란줄(경고) / 초록줄(적합) 마킹 포함.
 *
 * PART 1: Report header (등급 배지 + 요약)
 * PART 2: Verification markings (빨강/노랑/초록)
 * PART 3: Team results detail
 * PART 4: Debate log
 * PART 5: Cost estimate
 * PART 6: Action bar (다운로드/공유)
 */

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  ChevronDown,
  ChevronUp,
  FileText,
  Download,
  Users,
  Scale,
  Calculator,
  Shield,
} from 'lucide-react';
import ESVAVerifiedBadge from './ESVAVerifiedBadge';
import type {
  ESVAVerifiedReport,
  VerificationMarking,
  MarkingSeverity,
  TeamResult,
  DebateResult,
} from '@/agent/teams/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 0 — Helpers
// ═══════════════════════════════════════════════════════════════════════════════

const SEVERITY_CONFIG: Record<MarkingSeverity, {
  icon: typeof XCircle;
  color: string;
  bg: string;
  border: string;
  label: string;
}> = {
  error:   { icon: XCircle,       color: '#ef4444', bg: '#fef2f2', border: '#fecaca', label: '오류' },
  warning: { icon: AlertTriangle, color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', label: '경고' },
  info:    { icon: Info,          color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', label: '정보' },
  success: { icon: CheckCircle2,  color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0', label: '적합' },
};

const TEAM_ICONS: Record<string, typeof Shield> = {
  'TEAM-SLD': FileText,
  'TEAM-LAYOUT': Calculator,
  'TEAM-STD': Scale,
  'TEAM-CONSENSUS': Users,
};

const TEAM_NAMES: Record<string, string> = {
  'TEAM-SLD': '계통도팀',
  'TEAM-LAYOUT': '평면도팀',
  'TEAM-STD': '규정질의팀',
  'TEAM-CONSENSUS': '합의+출력팀',
};

// ═══════════════════════════════════════════════════════════════════════════════

interface Props {
  report: ESVAVerifiedReport;
  onExport?: (format: 'pdf' | 'excel') => void;
}

export default function VerificationReport({ report, onExport }: Props) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    markings: true,
    teams: false,
    debate: false,
  });

  const toggle = (key: string) =>
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const markings = report.markings ?? [];
  const errorCount = markings.filter(m => m.severity === 'error').length;
  const warnCount = markings.filter(m => m.severity === 'warning').length;
  const passCount = markings.filter(m => m.severity === 'success').length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ═══ PART 1: Header ═══ */}
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          {/* 배지 */}
          <ESVAVerifiedBadge
            grade={report.grade}
            score={report.compositeScore}
            verdict={report.verdict}
            reportId={report.reportId}
            size="lg"
          />

          {/* 요약 */}
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">
              {report.projectName}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {report.projectType} | {new Date(report.createdAt).toLocaleDateString('ko-KR')}
            </p>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              {report.summary.textKo}
            </p>

            {/* 카운터 바 */}
            <div className="mt-4 flex flex-wrap gap-3">
              <CounterChip icon={XCircle} color="#ef4444" count={errorCount} label="오류" />
              <CounterChip icon={AlertTriangle} color="#f59e0b" count={warnCount} label="경고" />
              <CounterChip icon={CheckCircle2} color="#10b981" count={passCount} label="적합" />
              <CounterChip icon={Calculator} color="#6366f1" count={report.summary.totalCalculations} label="계산" />
            </div>

            {/* 적용 기준 */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {report.summary.appliedStandards.map(std => (
                <span
                  key={std}
                  className="rounded-full bg-[var(--bg-tertiary)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]"
                >
                  {std}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ PART 2: Verification Markings ═══ */}
      <CollapsibleSection
        title="검증 마킹"
        subtitle={`${errorCount} 오류 / ${warnCount} 경고 / ${passCount} 적합`}
        icon={Shield}
        expanded={expandedSections.markings}
        onToggle={() => toggle('markings')}
      >
        <div className="space-y-2">
          {markings
            .sort((a, b) => {
              const order: MarkingSeverity[] = ['error', 'warning', 'info', 'success'];
              return order.indexOf(a.severity) - order.indexOf(b.severity);
            })
            .map(marking => (
              <MarkingRow key={marking.id} marking={marking} />
            ))}
        </div>
      </CollapsibleSection>

      {/* ═══ PART 3: Team Results ═══ */}
      <CollapsibleSection
        title="팀별 분석 결과"
        subtitle={`${report.teamResults.length}개 팀`}
        icon={Users}
        expanded={expandedSections.teams}
        onToggle={() => toggle('teams')}
      >
        <div className="space-y-4">
          {report.teamResults.map(tr => (
            <TeamResultCard key={tr.teamId} result={tr} />
          ))}
        </div>
      </CollapsibleSection>

      {/* ═══ PART 4: Debate Log ═══ */}
      {report.debateResults.length > 0 && (
        <CollapsibleSection
          title="팀 간 토론/합의 기록"
          subtitle={`${report.debateResults.length}건`}
          icon={Scale}
          expanded={expandedSections.debate}
          onToggle={() => toggle('debate')}
        >
          <div className="space-y-3">
            {report.debateResults.map((dr, i) => (
              <DebateCard key={i} debate={dr} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* ═══ PART 6: Action Bar ═══ */}
      <div className="flex justify-center gap-3 pb-8">
        <button
          onClick={() => onExport?.('pdf')}
          className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
        >
          <Download size={16} />
          PDF 다운로드
        </button>
        <button
          onClick={() => onExport?.('excel')}
          className="flex items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] px-6 py-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <Download size={16} />
          Excel 다운로드
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

function CounterChip({
  icon: Icon,
  color,
  count,
  label,
}: {
  icon: typeof XCircle;
  color: string;
  count: number;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
      style={{ backgroundColor: `${color}10`, color }}
    >
      <Icon size={14} />
      {count} {label}
    </span>
  );
}

function CollapsibleSection({
  title,
  subtitle,
  icon: Icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  icon: typeof Shield;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-primary)] overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-[var(--bg-secondary)]"
      >
        <Icon size={20} className="shrink-0 text-[var(--color-primary)]" />
        <div className="flex-1">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
          <span className="ml-2 text-xs text-[var(--text-tertiary)]">{subtitle}</span>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {expanded && <div className="border-t border-[var(--border-default)] px-6 py-4">{children}</div>}
    </div>
  );
}

function MarkingRow({ marking }: { marking: VerificationMarking }) {
  const config = SEVERITY_CONFIG[marking.severity];
  const Icon = config.icon;

  return (
    <div
      className="flex items-start gap-3 rounded-lg border p-3"
      style={{
        backgroundColor: config.bg,
        borderColor: config.border,
      }}
    >
      <Icon size={18} style={{ color: config.color }} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: config.color }}>
            {config.label}
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">{marking.location}</span>
        </div>
        <p className="mt-0.5 text-sm text-[var(--text-primary)]">{marking.message}</p>
        {marking.detail && (
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{marking.detail}</p>
        )}
        {marking.suggestedFix && (
          <p className="mt-1 text-xs font-medium text-[var(--color-primary)]">
            → {marking.suggestedFix}
          </p>
        )}
        <div className="mt-1 flex gap-2">
          {marking.calculatedValue && (
            <span className="rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-mono">
              계산값: {marking.calculatedValue}
            </span>
          )}
          {marking.limitValue && (
            <span className="rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-mono">
              기준: {marking.limitValue}
            </span>
          )}
          {marking.standardRef && (
            <span className="rounded bg-white/60 px-1.5 py-0.5 text-[10px] font-mono">
              {marking.standardRef}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamResultCard({ result }: { result: TeamResult }) {
  const Icon = TEAM_ICONS[result.teamId] ?? Shield;
  const name = TEAM_NAMES[result.teamId] ?? result.teamId;

  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] p-4">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-[var(--color-primary)]" />
        <span className="text-sm font-semibold text-[var(--text-primary)]">{name}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${
          result.success
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        }`}>
          {result.success ? '성공' : '실패'}
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
          {result.durationMs}ms | 신뢰도 {Math.round(result.confidence * 100)}%
        </span>
      </div>

      {result.calculations && result.calculations.length > 0 && (
        <div className="mt-3 space-y-1">
          {result.calculations.slice(0, 5).map(calc => (
            <div key={calc.id} className="flex items-center gap-2 text-xs">
              {calc.compliant
                ? <CheckCircle2 size={12} className="text-green-500" />
                : <XCircle size={12} className="text-red-500" />}
              <span className="text-[var(--text-secondary)]">{calc.label}:</span>
              <span className="font-mono font-medium text-[var(--text-primary)]">
                {calc.value} {calc.unit}
              </span>
              {calc.standardRef && (
                <span className="text-[var(--text-tertiary)]">({calc.standardRef})</span>
              )}
            </div>
          ))}
        </div>
      )}

      {result.error && (
        <p className="mt-2 text-xs text-red-500">{result.error}</p>
      )}
    </div>
  );
}

function DebateCard({ debate }: { debate: DebateResult }) {
  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] p-4">
      <div className="flex items-center gap-2">
        <Scale size={16} className="text-[var(--color-primary)]" />
        <span className="text-sm font-semibold text-[var(--text-primary)]">{debate.topic}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${
          debate.finalConsensus
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        }`}>
          {debate.finalConsensus ? '합의 완료' : '합의 실패'}
        </span>
      </div>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">
        {debate.totalRounds}라운드 토론 | 참여: {debate.participatingTeams.join(', ')}
      </p>
      <p className="mt-1 text-sm text-[var(--text-primary)]">
        결론: {debate.finalPosition}
      </p>
      {debate.dissenterReport && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          {debate.dissenterReport}
        </p>
      )}
    </div>
  );
}
