'use client';

/**
 * CalculatorForm Component — Dynamic form from ParamDef[]
 *
 * PART 1: Types and constants
 * PART 2: Individual field renderers
 * PART 3: Main form component with validation
 */

import { useState, useCallback, type FormEvent } from 'react';
import { Calculator, Loader2, AlertCircle } from 'lucide-react';
import type { ParamDef } from '@/engine/standards/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Constants
// ═══════════════════════════════════════════════════════════════════════════════

interface CalculatorFormProps {
  params: ParamDef[];
  onSubmit: (values: Record<string, unknown>) => void;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
  /** Initial values to pre-fill (e.g. from URL params) */
  initialValues?: Record<string, unknown>;
}

/** Extended ParamDef with enum options for select fields */
export interface ExtendedParamDef extends ParamDef {
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: unknown;
  required?: boolean;
  placeholder?: string;
}

interface FieldError {
  field: string;
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Field Renderers
// ═══════════════════════════════════════════════════════════════════════════════

function NumberField({
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
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
        {param.name}
        {param.unit && (
          <span className="ml-1 font-normal text-[var(--text-tertiary)]">
            ({param.unit})
          </span>
        )}
      </label>
      {param.description && (
        <p className="mb-1.5 text-xs text-[var(--text-tertiary)]">
          {param.description}
        </p>
      )}
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={param.min}
          max={param.max}
          step={param.step ?? 'any'}
          placeholder={param.placeholder ?? `${param.name} 입력`}
          className={`
            h-10 w-full rounded-lg border bg-[var(--bg-primary)] px-3 pr-12
            text-sm text-[var(--text-primary)] outline-none transition-colors
            placeholder:text-[var(--text-tertiary)]
            focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]
            ${error ? 'border-[var(--color-error)]' : 'border-[var(--border-default)]'}
          `}
        />
        {param.unit && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--text-tertiary)]">
            {param.unit}
          </span>
        )}
      </div>
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-[var(--color-error)]">
          <AlertCircle size={12} />
          {error}
        </p>
      )}
    </div>
  );
}

function SelectField({
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
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">
        {param.name}
        {param.unit && (
          <span className="ml-1 font-normal text-[var(--text-tertiary)]">
            ({param.unit})
          </span>
        )}
      </label>
      {param.description && (
        <p className="mb-1.5 text-xs text-[var(--text-tertiary)]">
          {param.description}
        </p>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`
          h-10 w-full rounded-lg border bg-[var(--bg-primary)] px-3
          text-sm text-[var(--text-primary)] outline-none transition-colors
          focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]
          ${error ? 'border-[var(--color-error)]' : 'border-[var(--border-default)]'}
        `}
      >
        <option value="">선택하세요</option>
        {param.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-[var(--color-error)]">
          <AlertCircle size={12} />
          {error}
        </p>
      )}
    </div>
  );
}

function BooleanField({
  param,
  value,
  onChange,
}: {
  param: ExtendedParamDef;
  value: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`
          relative h-6 w-11 rounded-full transition-colors
          ${value ? 'bg-[var(--color-primary)]' : 'bg-[var(--border-default)]'}
        `}
      >
        <span
          className={`
            absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform
            ${value ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
      <div>
        <span className="text-sm font-medium text-[var(--text-primary)]">
          {param.name}
        </span>
        {param.description && (
          <p className="text-xs text-[var(--text-tertiary)]">{param.description}</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Main Form
// ═══════════════════════════════════════════════════════════════════════════════

export default function CalculatorForm({
  params,
  onSubmit,
  isLoading = false,
  error,
  className = '',
  initialValues,
}: CalculatorFormProps) {
  const extParams = params as ExtendedParamDef[];

  // Initialize form state from defaults, then overlay initialValues (e.g. from URL)
  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {};
    for (const p of extParams) {
      // Check initialValues first, then defaultValue
      const urlVal = initialValues?.[p.name];
      if (p.type === 'boolean') {
        initial[p.name] = urlVal != null ? Boolean(urlVal) : (p.defaultValue as boolean) ?? false;
      } else {
        initial[p.name] = urlVal != null ? String(urlVal) : (p.defaultValue != null ? String(p.defaultValue) : '');
      }
    }
    return initial;
  });

  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  const updateValue = useCallback((name: string, val: string | boolean) => {
    setValues((prev) => ({ ...prev, [name]: val }));
    setFieldErrors((prev) => prev.filter((e) => e.field !== name));
  }, []);

  const validate = useCallback((): boolean => {
    const errors: FieldError[] = [];

    for (const param of extParams) {
      const raw = values[param.name];

      if (param.type === 'number') {
        const strVal = raw as string;
        if (param.required !== false && strVal.trim() === '') {
          errors.push({ field: param.name, message: '필수 입력 항목입니다' });
          continue;
        }
        if (strVal.trim() !== '') {
          const num = parseFloat(strVal);
          if (isNaN(num)) {
            errors.push({ field: param.name, message: '유효한 숫자를 입력하세요' });
          } else if (param.min !== undefined && num < param.min) {
            errors.push({ field: param.name, message: `최소값: ${param.min}` });
          } else if (param.max !== undefined && num > param.max) {
            errors.push({ field: param.name, message: `최대값: ${param.max}` });
          }
        }
      }

      if (param.type === 'string' && param.options) {
        const strVal = raw as string;
        if (param.required !== false && !strVal) {
          errors.push({ field: param.name, message: '항목을 선택하세요' });
        }
      }
    }

    setFieldErrors(errors);
    return errors.length === 0;
  }, [extParams, values]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      // Convert string values to numbers where appropriate
      const parsed: Record<string, unknown> = {};
      for (const param of extParams) {
        const raw = values[param.name];
        if (param.type === 'number') {
          const str = raw as string;
          parsed[param.name] = str.trim() === '' ? undefined : parseFloat(str);
        } else if (param.type === 'boolean') {
          parsed[param.name] = raw as boolean;
        } else {
          parsed[param.name] = raw as string;
        }
      }

      onSubmit(parsed);
    },
    [validate, extParams, values, onSubmit],
  );

  return (
    <form onSubmit={handleSubmit} className={`space-y-4 ${className}`}>
      {extParams.map((param) => {
        const fieldError = fieldErrors.find((e) => e.field === param.name)?.message;

        if (param.type === 'boolean') {
          return (
            <BooleanField
              key={param.name}
              param={param}
              value={values[param.name] as boolean}
              onChange={(v) => updateValue(param.name, v)}
            />
          );
        }

        if (param.type === 'string' && param.options) {
          return (
            <SelectField
              key={param.name}
              param={param}
              value={values[param.name] as string}
              onChange={(v) => updateValue(param.name, v)}
              error={fieldError}
            />
          );
        }

        return (
          <NumberField
            key={param.name}
            param={param}
            value={values[param.name] as string}
            onChange={(v) => updateValue(param.name, v)}
            error={fieldError}
          />
        );
      })}

      {/* API error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-error)] bg-red-50 px-3 py-2 text-sm text-[var(--color-error)] dark:bg-red-900/20">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={isLoading}
        className="
          flex h-12 w-full items-center justify-center gap-2 rounded-xl
          bg-[var(--color-primary)] text-sm font-semibold text-white
          transition-colors hover:bg-[var(--color-primary-hover)]
          disabled:cursor-not-allowed disabled:opacity-60
        "
      >
        {isLoading ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            계산 중...
          </>
        ) : (
          <>
            <Calculator size={18} />
            계산하기
          </>
        )}
      </button>
    </form>
  );
}
