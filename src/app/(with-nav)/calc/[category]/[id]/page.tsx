'use client';

/**
 * Individual Calculator Page — Dynamic route /calc/[category]/[id]
 *
 * PART 1: Calculator param definitions → moved to @/lib/calculator-params.ts
 * PART 2: Result display component
 * PART 3: Action buttons
 * PART 4: Main page component
 */

import { use, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  FileDown,
  FileSpreadsheet,
  Share2,
  RotateCcw,
  ArrowRight,
  Calculator,
  AlertTriangle,
  Info,
  Link2,
} from 'lucide-react';
import CalculatorForm from '@/components/CalculatorForm';
import ReceiptCard from '@/components/ReceiptCard';
import CalcResultGauge from '@/components/CalcResultGauge';
import CalcProgressDAG from '@/components/CalcProgressDAG';
import StandardRefPanel from '@/components/StandardRefPanel';
import Breadcrumb from '@/components/Breadcrumb';
import { useCalculator } from '@/hooks/useCalculator';
import { CALCULATOR_PARAMS, CALCULATOR_NAMES, LINKED_CALCS } from '@/lib/calculator-params';


// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Result Display
// ═══════════════════════════════════════════════════════════════════════════════

function ResultDisplay({
  receipt,
  onExportPdf,
  onExportExcel,
  onShare,
  onReset,
  linkedCalcs,
}: {
  receipt: NonNullable<ReturnType<typeof useCalculator>['receipt']>;
  onExportPdf: () => void;
  onExportExcel: () => void;
  onShare: () => void;
  onReset: () => void;
  linkedCalcs: { id: string; category: string; label: string }[];
}) {
  // 게이지 데이터 추출 (전압강하/허용전류 등 기준값이 있는 경우)
  const gaugeData = (() => {
    const r = receipt.result;
    if (!r || r.value == null || typeof r.value !== 'number') return null;
    const unit = r.unit ?? '';
    // 전압강하 → 기준 3%
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (unit === '%' && (receipt as any).calculatorId?.includes('voltage')) {
      return { value: r.value, unit: '%', limit: 3, label: '전압강하', standardRef: 'KEC 232.52', direction: 'below' as const };
    }
    return null;
  })();

  return (
    <div className="space-y-4">
      {/* 게이지 시각화 (기준값이 있는 계산기만) */}
      {gaugeData && (
        <div className="mb-2">
          <CalcResultGauge {...gaugeData} />
        </div>
      )}

      {/* Receipt card (full view) */}
      <ReceiptCard receipt={receipt} variant="full" />

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onExportPdf}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <FileDown size={16} />
          PDF
        </button>
        <button
          type="button"
          onClick={onExportExcel}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <FileSpreadsheet size={16} />
          Excel
        </button>
        <button
          type="button"
          onClick={onShare}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <Share2 size={16} />
          공유
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <RotateCcw size={16} />
          재계산
        </button>

        {/* Linked calculators */}
        {linkedCalcs.map((lc) => (
          <Link
            key={lc.id}
            href={`/calc/${lc.category}/${lc.id}`}
            className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
          >
            <ArrowRight size={16} />
            {lc.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function CalculatorPage({
  params,
}: {
  params: Promise<{ category: string; id: string }>;
}) {
  const { category, id } = use(params);
  const calcMeta = CALCULATOR_NAMES[id];
  const calcParams = CALCULATOR_PARAMS[id];
  const linked = LINKED_CALCS[id] ?? [];

  const { execute, result: _result, receipt, isLoading, error, reset } = useCalculator(id);

  // ═══════════════════════════════════════════════════════════════════════════
  // URL Parameter Support — read on mount, write on calculate
  // ═══════════════════════════════════════════════════════════════════════════

  /** Read initial values from URL searchParams for pre-filling form */
  const urlDefaults = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    const params = new URLSearchParams(window.location.search);
    if (params.toString() === '') return undefined;

    const defaults: Record<string, unknown> = {};
    for (const p of calcParams ?? []) {
      const raw = params.get(p.name);
      if (raw !== null) {
        if (p.type === 'number') {
          const n = Number(raw);
          if (!isNaN(n)) defaults[p.name] = n;
        } else if (p.type === 'boolean') {
          defaults[p.name] = raw === 'true' || raw === '1';
        } else {
          defaults[p.name] = raw;
        }
      }
    }
    return Object.keys(defaults).length > 0 ? defaults : undefined;
  }, [calcParams]);

  /** Sync current inputs to URL via replaceState */
  const syncUrlParams = useCallback(
    (values: Record<string, unknown>) => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams();
      for (const [key, val] of Object.entries(values)) {
        if (val !== undefined && val !== null && val !== '') {
          params.set(key, String(val));
        }
      }
      const qs = params.toString();
      const newUrl = qs
        ? `${window.location.pathname}?${qs}`
        : window.location.pathname;
      history.replaceState(null, '', newUrl);
    },
    [],
  );

  /** Share button copies URL with current params */
  const handleShareWithParams = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(
      () => alert('계산기 링크가 복사되었습니다 (입력값 포함)'),
      () => prompt('공유 링크:', url),
    );
  }, []);

  const handleSubmit = useCallback(
    (values: Record<string, unknown>) => {
      syncUrlParams(values);
      execute(values);
    },
    [execute, syncUrlParams],
  );

  const handleExportPdf = useCallback(async () => {
    if (!receipt) return;
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt, format: 'pdf' }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      // Fallback: use browser print
      window.print();
    }
  }, [receipt]);

  const handleExportExcel = useCallback(async () => {
    if (!receipt) return;
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt, format: 'excel' }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ESVA_${receipt.calcId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: generate CSV client-side
      try {
        const lines: string[] = ['항목,값,단위'];
        if (receipt.inputs) {
          for (const [key, val] of Object.entries(receipt.inputs)) {
            lines.push(`${key},${String(val)},`);
          }
        }
        if (receipt.result) {
          lines.push(`결과,${receipt.result.value},${receipt.result.unit}`);
        }
        for (const step of receipt.steps ?? []) {
          lines.push(`Step ${step.step}: ${step.title},${step.value},${step.unit}`);
        }
        const csvBlob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const csvUrl = URL.createObjectURL(csvBlob);
        const a = document.createElement('a');
        a.href = csvUrl;
        a.download = `ESVA_${receipt.calcId}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(csvUrl);
      } catch {
        alert('내보내기에 실패했습니다.');
      }
    }
  }, [receipt]);

  const handleShare = useCallback(async () => {
    if (!receipt) return;
    const url = `${window.location.origin}/receipt/${receipt.id}`;
    try {
      await navigator.clipboard.writeText(url);
      alert('공유 링크가 복사되었습니다');
    } catch {
      prompt('공유 링크:', url);
    }
  }, [receipt]);

  if (!calcMeta || !calcParams) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)]">
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold text-[var(--text-primary)]">
            계산기를 찾을 수 없습니다
          </h1>
          <p className="mb-4 text-[var(--text-secondary)]">ID: {id}</p>
          <Link href="/calc" className="text-[var(--color-primary)] hover:underline">
            계산기 목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      {/* Header */}
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <Breadcrumb items={[
            { label: 'ESVA', href: '/' },
            { label: '계산기', href: '/calc' },
            { label: category },
            { label: calcMeta.name },
          ]} />
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <Calculator size={28} className="text-[var(--color-primary)]" />
            {calcMeta.name}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{calcMeta.nameEn}</p>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          {/* Left: Form */}
          <div>
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
              <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
                입력값
              </h2>
              <CalculatorForm
                params={calcParams}
                onSubmit={handleSubmit}
                isLoading={isLoading}
                error={error}
                initialValues={urlDefaults}
              />
            </div>

            {/* Share with params */}
            <button
              type="button"
              onClick={handleShareWithParams}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              <Link2 size={14} />
              입력값 포함 링크 복사
            </button>

            {/* Info note */}
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-[var(--bg-tertiary)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>
                KEC/NEC/IEC 기준에 따라 계산됩니다. 실무 적용 시
                반드시 전문가 검증을 거치세요.
              </span>
            </div>
          </div>

          {/* Right: Result */}
          <div className="space-y-4">
            {/* DAG 진행 표시 */}
            <CalcProgressDAG
              currentStage={isLoading ? 'calculate' : receipt ? 'done' : 'idle'}
            />

            {receipt ? (
              <>
                <ResultDisplay
                  receipt={receipt}
                  onExportPdf={handleExportPdf}
                  onExportExcel={handleExportExcel}
                  onShare={handleShare}
                  onReset={reset}
                  linkedCalcs={linked}
                />

                {/* 참조 기준서 패널 */}
                {receipt.standardsUsed && receipt.standardsUsed.length > 0 && (
                  <StandardRefPanel
                    refs={receipt.standardsUsed.map((s: string) => ({ clause: s }))}
                    standardName={receipt.appliedStandard}
                  />
                )}
              </>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-primary)] p-12 text-center">
                <div>
                  <Calculator size={48} className="mx-auto mb-3 text-[var(--text-tertiary)]" />
                  <p className="text-sm text-[var(--text-tertiary)]">
                    입력값을 넣고 &ldquo;계산하기&rdquo;를 누르세요
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 rounded-lg bg-[var(--bg-tertiary)] p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
            <div className="text-xs leading-relaxed text-[var(--text-tertiary)]">
              <p className="mb-1 font-medium">면책조항</p>
              <p>
                본 계산 결과는 참고용이며, 법적 효력이 없습니다.
                ESVA 계산기는 공학적 추정치를 제공하며, 실제 설계 및 시공에는
                관련 법규와 전문가의 검증이 필요합니다. 계산 결과의 정확성에 대한
                책임은 사용자에게 있습니다.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
