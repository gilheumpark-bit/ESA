'use client';

/**
 * InlineCalcResult -- 검색 결과 아래 인라인 계산 결과 표시
 *
 * PART 1: Types & constants
 * PART 2: Sub-components (LoadingSkeleton, ResultCard, MiniForm)
 * PART 3: Main component with state machine (Loading / Result / MiniForm)
 */

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import Link from 'next/link';
import {
  Zap,
  Check,
  X,
  ChevronDown,
  ExternalLink,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useCalculator } from '@/hooks/useCalculator';
import type { DetailedCalcResult, CalcStep } from '@/engine/calculators/types';
import type { ExtendedParamDef } from '@/components/CalculatorForm';

// =============================================================================
// PART 1 -- Types & Constants
// =============================================================================

interface InlineCalcResultProps {
  calculatorId: string;
  calculatorName: string;
  extractedParams: Record<string, unknown>;
  missingRequired: ExtendedParamDef[];
  missingOptional: ExtendedParamDef[];
  allParams: ExtendedParamDef[];
  canAutoExecute: boolean;
  onClose?: () => void;
}

type ViewState = 'loading' | 'result' | 'form';

/** 결과값에서 판정 정보 추출 */
function extractJudgment(result: DetailedCalcResult): {
  pass: boolean;
  message: string;
  standardRef?: string;
} {
  // 1순위: result.judgment (CalcResult base에서 상속)
  if (result.judgment) {
    return {
      pass: result.judgment.pass,
      message: result.judgment.message,
      standardRef: result.judgment.standardRef,
    };
  }

  // 2순위: additionalOutputs에 판정 정보가 있는 경우
  if (result.additionalOutputs) {
    const dropPercent = result.additionalOutputs['dropPercent']
      ?? result.additionalOutputs['voltageDropPercent'];
    if (dropPercent) {
      const pct = dropPercent.value;
      const pass = pct <= 3; // KEC 기준 3% 이하
      return {
        pass,
        message: pass
          ? `전압강하율 ${pct.toFixed(2)}% - KEC 허용범위 이내`
          : `전압강하율 ${pct.toFixed(2)}% - KEC 허용범위 초과 (3% 기준)`,
        standardRef: 'KEC 232.3',
      };
    }
  }

  // 3순위: source 태그에서 기준 참조
  const firstSource = result.source?.[0];

  return {
    pass: true,
    message: '계산 완료',
    standardRef: firstSource
      ? `${firstSource.standard} ${firstSource.clause}`
      : undefined,
  };
}

/** 결과값 포맷팅 (주 출력 + 부가 정보) */
function formatPrimaryValue(result: DetailedCalcResult): {
  display: string;
  subtitle?: string;
} {
  const val = result.value;
  if (val === null || val === undefined) {
    return { display: '-' };
  }

  const numVal = typeof val === 'number' ? val : parseFloat(String(val));
  if (Number.isNaN(numVal)) {
    return { display: String(val) };
  }

  // 부가 퍼센트 정보 추출
  const dropPct = result.additionalOutputs?.['dropPercent']
    ?? result.additionalOutputs?.['voltageDropPercent'];

  const display = `${numVal.toFixed(2)}${result.unit}`;
  const subtitle = dropPct ? `(${dropPct.value.toFixed(2)}%)` : undefined;

  return { display, subtitle };
}

// =============================================================================
// PART 2 -- Sub-components
// =============================================================================

/** 로딩 스켈레톤 */
function LoadingSkeleton({ calculatorName }: { calculatorName: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin text-[var(--color-primary)]" />
        <span className="text-sm font-medium text-[var(--text-secondary)]">
          {calculatorName} 계산 중...
        </span>
      </div>
      <div className="space-y-2">
        <div className="h-8 w-3/4 animate-pulse rounded-lg bg-[var(--bg-tertiary)]" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--bg-tertiary)]" />
      </div>
    </div>
  );
}

/** 계산 단계 표시 (접이식) */
function StepsAccordion({ steps }: { steps: CalcStep[] }) {
  const [open, setOpen] = useState(false);

  if (steps.length === 0) return null;

  return (
    <div className="mt-3 border-t border-[var(--border-default)] pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
        계산 과정 ({steps.length}단계)
      </button>

      {open && (
        <ol className="mt-2 space-y-1.5 pl-4">
          {steps.map((s) => (
            <li key={s.step} className="text-xs text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">
                {s.step}. {s.title}
              </span>
              <span className="ml-1.5">
                = {s.value.toFixed(4)} {s.unit}
              </span>
              {s.standardRef && (
                <span className="ml-1 text-[var(--text-tertiary)]">
                  ({s.standardRef})
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** 결과 카드 (State A) */
function ResultCard({
  result,
  calculatorId,
  calculatorName,
  params,
  onClose,
}: {
  result: DetailedCalcResult;
  calculatorId: string;
  calculatorName: string;
  params: Record<string, unknown>;
  onClose?: () => void;
}) {
  const judgment = extractJudgment(result);
  const primary = formatPrimaryValue(result);

  // 상세 페이지 URL 생성 (쿼리 파라미터에 입력값 포함)
  const queryString = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const detailUrl = `/calc/${calculatorId}/${calculatorId}${queryString ? `?${queryString}` : ''}`;

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
      {/* 헤더 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-primary)] text-white">
            <Zap size={14} />
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {calculatorName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* 적합/부적합 배지 */}
          {judgment.pass ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              <Check size={10} />
              적합
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
              <X size={10} />
              부적합
            </span>
          )}
          {/* 닫기 */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-0.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              aria-label="닫기"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 주 결과값 */}
      <div className="mb-1 flex items-baseline gap-1.5">
        <span
          className={`text-2xl font-black ${
            judgment.pass
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {primary.display}
        </span>
        {primary.subtitle && (
          <span className="text-base font-semibold text-[var(--text-secondary)]">
            {primary.subtitle}
          </span>
        )}
      </div>

      {/* 판정 메시지 */}
      <p className="text-xs text-[var(--text-secondary)]">
        {judgment.message}
      </p>
      {judgment.standardRef && (
        <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
          {judgment.standardRef}
        </p>
      )}

      {/* 불확실성 표시 */}
      {result.uncertaintyRange && (
        <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
          불확실성: {result.uncertaintyRange.min.toFixed(2)} ~ {result.uncertaintyRange.max.toFixed(2)} {result.unit}
          {' '}({'\u00B1'}{result.uncertaintyRange.tolerancePercent}%)
        </p>
      )}

      {/* 경고 */}
      {result.warnings && result.warnings.length > 0 && (
        <div className="mt-2 space-y-1">
          {result.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
            >
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* 계산 과정 접이식 */}
      <StepsAccordion steps={result.steps} />

      {/* 상세 페이지 링크 */}
      <div className="mt-3 border-t border-[var(--border-default)] pt-3">
        <Link
          href={detailUrl}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary)] transition-colors hover:underline"
        >
          상세 계산기로 이동
          <ExternalLink size={12} />
        </Link>
      </div>
    </div>
  );
}

/** 미니 폼 필드 렌더러 */
function MiniField({
  param,
  value,
  onChange,
  error,
}: {
  param: ExtendedParamDef;
  value: string;
  onChange: (val: string) => void;
  error?: string;
}) {
  // Select 타입
  if (param.type === 'string' && param.options) {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-primary)]">
          {param.description ?? param.name}
          {param.unit && (
            <span className="ml-1 font-normal text-[var(--text-tertiary)]">
              ({param.unit})
            </span>
          )}
        </label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`
            h-9 w-full rounded-lg border bg-[var(--bg-primary)] px-2.5
            text-sm text-[var(--text-primary)] outline-none transition-colors
            focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]
            ${error ? 'border-[var(--color-error)]' : 'border-[var(--border-default)]'}
          `}
        >
          <option value="">선택</option>
          {param.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="mt-0.5 text-[10px] text-[var(--color-error)]">{error}</p>
        )}
      </div>
    );
  }

  // Number 타입 (기본)
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-primary)]">
        {param.description ?? param.name}
        {param.unit && (
          <span className="ml-1 font-normal text-[var(--text-tertiary)]">
            ({param.unit})
          </span>
        )}
      </label>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={param.min}
          max={param.max}
          step={param.step ?? 'any'}
          placeholder={param.placeholder ?? `${param.description || param.name} 입력`}
          className={`
            h-9 w-full rounded-lg border bg-[var(--bg-primary)] px-2.5 pr-10
            text-sm text-[var(--text-primary)] outline-none transition-colors
            placeholder:text-[var(--text-tertiary)]
            focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]
            ${error ? 'border-[var(--color-error)]' : 'border-[var(--border-default)]'}
          `}
        />
        {param.unit && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-[var(--text-tertiary)]">
            {param.unit}
          </span>
        )}
      </div>
      {error && (
        <p className="mt-0.5 text-[10px] text-[var(--color-error)]">{error}</p>
      )}
    </div>
  );
}

/** 미니 폼 (State B) */
function MiniForm({
  calculatorName,
  missingRequired,
  missingOptional,
  onSubmit,
  isLoading,
  error,
  onClose,
}: {
  calculatorName: string;
  missingRequired: ExtendedParamDef[];
  missingOptional: ExtendedParamDef[];
  onSubmit: (values: Record<string, unknown>) => void;
  isLoading: boolean;
  error: string | null;
  onClose?: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of [...missingRequired, ...missingOptional]) {
      init[p.name] = p.defaultValue != null ? String(p.defaultValue) : '';
    }
    return init;
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateValue = useCallback((name: string, val: string) => {
    setValues((prev) => ({ ...prev, [name]: val }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    for (const param of missingRequired) {
      const raw = values[param.name] ?? '';
      if (param.type === 'number') {
        if (raw.trim() === '') {
          errors[param.name] = '필수 입력';
          continue;
        }
        const num = parseFloat(raw);
        if (isNaN(num)) {
          errors[param.name] = '유효한 숫자 필요';
        } else if (param.min !== undefined && num < param.min) {
          errors[param.name] = `최소 ${param.min}`;
        } else if (param.max !== undefined && num > param.max) {
          errors[param.name] = `최대 ${param.max}`;
        }
      }
      if (param.type === 'string' && param.options && !raw) {
        errors[param.name] = '선택 필요';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [missingRequired, values]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      const parsed: Record<string, unknown> = {};
      for (const param of [...missingRequired, ...missingOptional]) {
        const raw = values[param.name] ?? '';
        if (param.type === 'number') {
          parsed[param.name] = raw.trim() === '' ? undefined : parseFloat(raw);
        } else {
          parsed[param.name] = raw || undefined;
        }
      }

      onSubmit(parsed);
    },
    [validate, missingRequired, missingOptional, values, onSubmit],
  );

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
      {/* 헤더 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-primary)] text-white">
            <Zap size={14} />
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {calculatorName}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
            aria-label="닫기"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <p className="mb-3 text-xs text-[var(--text-secondary)]">
        추가 입력이 필요합니다. 아래 항목을 입력해 주세요.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* 필수 파라미터 */}
        {missingRequired.map((param) => (
          <MiniField
            key={param.name}
            param={param}
            value={values[param.name] ?? ''}
            onChange={(v) => updateValue(param.name, v)}
            error={fieldErrors[param.name]}
          />
        ))}

        {/* 고급 옵션 (선택 파라미터) */}
        {missingOptional.length > 0 && (
          <div className="border-t border-[var(--border-default)] pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              <ChevronDown
                size={14}
                className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
              />
              고급 옵션 ({missingOptional.length})
            </button>

            {showAdvanced && (
              <div className="mt-2 space-y-3">
                {missingOptional.map((param) => (
                  <MiniField
                    key={param.name}
                    param={param}
                    value={values[param.name] ?? ''}
                    onChange={(v) => updateValue(param.name, v)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* API 에러 */}
        {error && (
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-error)] bg-red-50 px-2.5 py-1.5 text-xs text-[var(--color-error)] dark:bg-red-900/20">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        {/* 제출 */}
        <button
          type="submit"
          disabled={isLoading}
          className="
            flex h-10 w-full items-center justify-center gap-2 rounded-xl
            bg-[var(--color-primary)] text-sm font-semibold text-white
            transition-colors hover:bg-[var(--color-primary-hover)]
            disabled:cursor-not-allowed disabled:opacity-60
          "
        >
          {isLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              계산 중...
            </>
          ) : (
            <>
              <Zap size={16} />
              계산하기
            </>
          )}
        </button>
      </form>
    </div>
  );
}

// =============================================================================
// PART 3 -- Main Component
// =============================================================================

export default function InlineCalcResult({
  calculatorId,
  calculatorName,
  extractedParams,
  missingRequired,
  missingOptional,
  allParams,
  canAutoExecute,
  onClose,
}: InlineCalcResultProps) {
  const { execute, result, isLoading, error, reset } = useCalculator(calculatorId);
  const [viewState, setViewState] = useState<ViewState>(
    canAutoExecute ? 'loading' : 'form',
  );
  const [mergedParams, setMergedParams] = useState<Record<string, unknown>>(extractedParams);

  // State A: 자동 실행 (canAutoExecute=true일 때 mount 시 실행)
  useEffect(() => {
    if (!canAutoExecute) return;

    // 기본값 병합
    const withDefaults: Record<string, unknown> = { ...extractedParams };
    for (const p of allParams) {
      const ext = p as ExtendedParamDef;
      if (withDefaults[p.name] === undefined && ext.defaultValue !== undefined) {
        withDefaults[p.name] = ext.defaultValue;
      }
    }

    setMergedParams(withDefaults);
    execute(withDefaults);
    // 마운트 시 1회만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 결과 도착 시 뷰 전환
  useEffect(() => {
    if (result && !isLoading) {
      setViewState('result');
    }
  }, [result, isLoading]);

  // 에러 발생 시 (자동 실행이었으면 폼으로 전환)
  useEffect(() => {
    if (error && !isLoading && viewState === 'loading') {
      setViewState('form');
    }
  }, [error, isLoading, viewState]);

  // 미니 폼 제출 핸들러
  const handleFormSubmit = useCallback(
    (formValues: Record<string, unknown>) => {
      // 기본값 병합: extractedParams + formValues + defaults
      const merged: Record<string, unknown> = { ...extractedParams };

      for (const p of allParams) {
        const ext = p as ExtendedParamDef;
        if (merged[p.name] === undefined && ext.defaultValue !== undefined) {
          merged[p.name] = ext.defaultValue;
        }
      }

      // 폼 입력값 덮어쓰기
      for (const [k, v] of Object.entries(formValues)) {
        if (v !== undefined) {
          merged[k] = v;
        }
      }

      setMergedParams(merged);
      setViewState('loading');
      execute(merged);
    },
    [extractedParams, allParams, execute],
  );

  // 닫기 핸들러
  const handleClose = useCallback(() => {
    reset();
    onClose?.();
  }, [reset, onClose]);

  // ---- 렌더링 ----

  // State C: 로딩
  if (isLoading) {
    return <LoadingSkeleton calculatorName={calculatorName} />;
  }

  // State A: 결과 표시
  if (result) {
    return (
      <ResultCard
        result={result}
        calculatorId={calculatorId}
        calculatorName={calculatorName}
        params={mergedParams}
        onClose={handleClose}
      />
    );
  }

  // State B: 미니 폼
  return (
    <MiniForm
      calculatorName={calculatorName}
      missingRequired={missingRequired}
      missingOptional={missingOptional}
      onSubmit={handleFormSubmit}
      isLoading={isLoading}
      error={error}
      onClose={handleClose}
    />
  );
}
