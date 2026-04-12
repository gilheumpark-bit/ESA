'use client';

/**
 * ReceiptCard Component — Calculation receipt display
 *
 * PART 1: Types and helpers
 * PART 2: Judgment badge sub-component
 * PART 3: Steps accordion sub-component
 * PART 4: Compact card view (for list)
 * PART 5: Full receipt view (for detail page)
 */

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Calendar,
  Shield,
  Hash,
  Copy,
  Check,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import LaTeX from '@/components/LaTeX';
import type { Receipt } from '@/engine/receipt/types';
import type { CalcStep } from '@/engine/calculators/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Helpers
// ═══════════════════════════════════════════════════════════════════════════════

interface ReceiptCardProps {
  receipt: Receipt;
  variant?: 'compact' | 'full';
  className?: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Judgment Badge
// ═══════════════════════════════════════════════════════════════════════════════

function JudgmentBadge({ judgment }: { judgment: Receipt['result']['judgment'] }) {
  if (!judgment) return null;

  const config = judgment.pass
    ? {
        bg: 'bg-emerald-50 dark:bg-emerald-900/30',
        text: 'text-emerald-700 dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-800',
        label: 'PASS',
      }
    : judgment.severity === 'warning'
      ? {
          bg: 'bg-amber-50 dark:bg-amber-900/30',
          text: 'text-amber-700 dark:text-amber-400',
          border: 'border-amber-200 dark:border-amber-800',
          label: 'WARNING',
        }
      : {
          bg: 'bg-red-50 dark:bg-red-900/30',
          text: 'text-red-700 dark:text-red-400',
          border: 'border-red-200 dark:border-red-800',
          label: 'FAIL',
        };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full border px-3 py-1
        text-xs font-bold tracking-wider
        ${config.bg} ${config.text} ${config.border}
      `}
    >
      {!judgment.pass && <AlertTriangle size={12} />}
      {config.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Steps Accordion
// ═══════════════════════════════════════════════════════════════════════════════

function StepsAccordion({ steps }: { steps: CalcStep[] }) {
  const [isOpen, setIsOpen] = useState(false);

  if (steps.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--border-default)]">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
      >
        <span>풀이 과정 ({steps.length}단계)</span>
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {isOpen && (
        <div className="border-t border-[var(--border-default)] divide-y divide-[var(--border-default)]">
          {steps.map((step) => (
            <div key={step.step} className="px-4 py-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] font-bold text-white">
                  {step.step}
                </span>
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {step.title}
                </span>
              </div>
              {/* LaTeX formula */}
              <div className="mb-1">
                <LaTeX formula={step.formula} display className="text-sm" />
              </div>
              <div className="flex items-baseline gap-1 text-sm">
                <span className="font-semibold text-[var(--text-primary)]">
                  = {step.value}
                </span>
                <span className="text-[var(--text-tertiary)]">{step.unit}</span>
                {step.standardRef && (
                  <span className="ml-2 text-xs text-[var(--text-tertiary)]">
                    [{step.standardRef}]
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Compact Card
// ═══════════════════════════════════════════════════════════════════════════════

function CompactCard({ receipt, className }: { receipt: Receipt; className: string }) {
  return (
    <div
      className={`
        rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)]
        p-4 transition-shadow hover:shadow-md
        ${className}
      `}
    >
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {receipt.calcId}
          </h3>
          <span className="text-xs text-[var(--text-tertiary)]">
            {receipt.appliedStandard} | {formatDate(receipt.calculatedAt)}
          </span>
        </div>
        <JudgmentBadge judgment={receipt.result.judgment} />
      </div>

      {/* Result */}
      <div className="mb-2 flex items-baseline gap-1">
        <span className="text-2xl font-bold text-[var(--color-primary)]">
          {typeof receipt.result.value === 'number'
            ? receipt.result.value.toLocaleString('ko-KR', { maximumFractionDigits: 4 })
            : receipt.result.value}
        </span>
        <span className="text-sm text-[var(--text-secondary)]">
          {receipt.result.unit}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-tertiary)]">
        <span className="flex items-center gap-1">
          <Shield size={12} />
          {receipt.isStandardCurrent ? '현행' : '구판'}
        </span>
        <span className="flex items-center gap-1">
          <Hash size={12} />
          {receipt.receiptHash.slice(0, 8)}...
        </span>
        <span className="flex items-center gap-1">
          <FileText size={12} />
          v{receipt.engineVersion}
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — Full Receipt View
// ═══════════════════════════════════════════════════════════════════════════════

function FullCard({ receipt, className }: { receipt: Receipt; className: string }) {
  const [hashCopied, setHashCopied] = useState(false);

  const copyHash = async () => {
    await navigator.clipboard.writeText(receipt.receiptHash);
    setHashCopied(true);
    setTimeout(() => setHashCopied(false), 2000);
  };

  return (
    <div
      className={`
        receipt-container rounded-xl border border-[var(--border-default)]
        bg-[var(--bg-primary)] p-6
        ${className}
      `}
    >
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            {receipt.calcId}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              {formatDate(receipt.calculatedAt)}
            </span>
            <span>{receipt.appliedStandard} ({receipt.standardVersion})</span>
            <span>{receipt.countryCode} / {receipt.unitSystem}</span>
          </div>
        </div>
        <JudgmentBadge judgment={receipt.result.judgment} />
      </div>

      {/* Primary result */}
      <div className="mb-6 rounded-lg bg-[var(--bg-secondary)] p-4 text-center">
        <span className="block text-sm text-[var(--text-tertiary)]">계산 결과</span>
        <span className="block text-4xl font-bold text-[var(--color-primary)]">
          {typeof receipt.result.value === 'number'
            ? receipt.result.value.toLocaleString('ko-KR', { maximumFractionDigits: 4 })
            : receipt.result.value}
        </span>
        <span className="text-lg text-[var(--text-secondary)]">
          {receipt.result.unit}
        </span>
        {receipt.result.judgment && (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {receipt.result.judgment.message}
          </p>
        )}
      </div>

      {/* Formula */}
      <div className="mb-4">
        <h3 className="mb-2 text-sm font-medium text-[var(--text-tertiary)]">공식</h3>
        <div className="overflow-x-auto rounded-lg bg-[var(--bg-tertiary)] px-4 py-3">
          <LaTeX formula={receipt.formulaUsed} display />
        </div>
      </div>

      {/* Input parameters */}
      <div className="mb-4">
        <h3 className="mb-2 text-sm font-medium text-[var(--text-tertiary)]">입력값</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="pb-2 text-left font-medium text-[var(--text-tertiary)]">파라미터</th>
                <th className="pb-2 text-right font-medium text-[var(--text-tertiary)]">값</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(receipt.inputs).map(([key, val]) => (
                <tr key={key} className="border-b border-[var(--border-default)]">
                  <td className="py-2 text-[var(--text-primary)]">{key}</td>
                  <td className="py-2 text-right font-mono text-[var(--text-secondary)]">
                    {String(val)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Steps */}
      <div className="mb-4">
        <StepsAccordion steps={receipt.steps} />
      </div>

      {/* Standards used */}
      {receipt.standardsUsed.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-medium text-[var(--text-tertiary)]">참조 기준</h3>
          <div className="flex flex-wrap gap-2">
            {receipt.standardsUsed.map((std) => (
              <span
                key={std}
                className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              >
                {std}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {receipt.warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle size={14} />
            주의사항
          </h3>
          <ul className="space-y-1">
            {receipt.warnings.map((w, i) => (
              <li key={i} className="text-sm text-amber-600 dark:text-amber-300">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Integrity hash */}
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
        <Hash size={14} className="shrink-0 text-[var(--text-tertiary)]" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text-secondary)]">
          SHA-256: {receipt.receiptHash}
        </span>
        <button
          type="button"
          onClick={copyHash}
          className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--color-primary)]"
          aria-label="해시 복사"
        >
          {hashCopied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-tertiary)]">
        <span>엔진 v{receipt.engineVersion}</span>
        <span>난이도: {receipt.difficultyLevel}</span>
        <span>
          기준 상태:{' '}
          {receipt.isStandardCurrent ? (
            <span className="text-emerald-600">현행</span>
          ) : (
            <span className="text-amber-600">구판</span>
          )}
        </span>
        {receipt.standardVerifiedAt && (
          <span>검증일: {receipt.standardVerifiedAt}</span>
        )}
      </div>

      {/* Disclaimer */}
      <div className="mt-4 rounded-lg bg-[var(--bg-secondary)] p-3">
        <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
          {receipt.disclaimerText}
        </p>
        <span className="mt-1 block text-[10px] text-[var(--text-tertiary)]">
          면책조항 버전: {receipt.disclaimerVersion}
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════════════════

export default function ReceiptCard({
  receipt,
  variant = 'compact',
  className = '',
}: ReceiptCardProps) {
  if (variant === 'full') {
    return <FullCard receipt={receipt} className={className} />;
  }
  return <CompactCard receipt={receipt} className={className} />;
}
