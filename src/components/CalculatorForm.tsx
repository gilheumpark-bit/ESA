'use client';

/**
 * CalculatorForm Component — Dynamic form from ParamDef[]
 *
 * PART 1: Types and constants
 * PART 2: Individual field renderers
 * PART 3: Submit-value assembly (pure, testable)
 * PART 4: Main form component with validation
 */

import { useState, useCallback, useId, useRef, type FormEvent } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { getSafetyProfile } from '@engine/constants/safety-factors';
import { IMPERIAL_LENGTH_KEYS, IMPERIAL_TEMP_KEYS } from '@engine/conversion/imperial-adapter';
import { Calculator, Loader2, AlertCircle, ChevronDown, Plus, Trash2 } from 'lucide-react';
import type { ParamDef } from '@/engine/standards/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types & Constants
// ═══════════════════════════════════════════════════════════════════════════════

interface CalculatorFormProps {
  params: ExtendedParamDef[];
  onSubmit: (values: Record<string, unknown>) => void;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
  /** Initial values to pre-fill (e.g. from URL params) */
  initialValues?: Record<string, unknown>;
  /** compact: defaultValue 있는 필드를 '고급 옵션'으로 접음. full: 전체 표시(기본) */
  mode?: 'full' | 'compact';
}

/** Extended ParamDef with enum options, array support, and UI metadata. */
export interface ExtendedParamDef extends Omit<ParamDef, 'type'> {
  type: 'number' | 'string' | 'boolean' | 'array';
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: unknown;
  required?: boolean;
  placeholder?: string;
  /** For type:'array' — the per-row sub-fields. */
  itemSchema?: ExtendedParamDef[];
  /** For type:'array' — minimum rows required (default 1). */
  minItems?: number;
  /** For type:'array' — initial row count (default = minItems). */
  defaultItems?: number;
  /**
   * For type:'array' with a single-field itemSchema — submit a bare primitive
   * array (e.g. number[]) instead of an array of objects. e.g. individualMaxDemands: number[].
   */
  flatten?: boolean;
}

/** One row of an array field: sub-field name → raw value. */
type ArrayRow = Record<string, string | boolean>;
/** A form field's raw state value. */
type FieldValue = string | boolean | ArrayRow[];

interface FieldError {
  field: string;
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Field Renderers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 화면에 적는 단위는 **엔진이 실제로 그렇게 읽을 단위**여야 한다.
 *
 * 계산 실행기는 국가 프로파일이 Imperial 이면 입력을 피트·°F 로 간주해 SI 로
 * 환산한다(engine/conversion/imperial-adapter). 그런데 이 폼은 항상 정의된 SI
 * 라벨을 그대로 보여줬다. 그래서 국가를 USA(NEC)로 둔 사용자가 "전선 길이
 * (편도)(m)" 를 보고 50 을 넣으면 엔진은 50 ft = 15.24 m 로 계산했다.
 *
 * 실측(2026-07-26): 같은 입력(380V 100A 50 35mm² Cu 3상 0.9)의 전압강하가
 * KR/JP/INT 4.14V ↔ US 1.26V. 3.286배 = 1/0.3048 — 정확히 피트 해석이고,
 * 과소평가라 실제로는 한도를 넘는 회로가 PASS 로 나온다.
 *
 * 판단 기준은 **단위 문자열이 아니라 파라미터 이름**이다. 어댑터는 이름으로
 * 골라 변환하므로, 단위가 'm' 이라도 그 목록에 없으면 변환되지 않는다. 그런
 * 칸의 라벨을 ft 로 바꾸면 사용자가 피트로 넣고 엔진이 미터로 읽는 **반대
 * 방향** 오류가 난다 — 실측상 단위 'm' 13개 중 4개(rodLength·spacing·
 * buildingHeight·leadLength)와 '°C' 7개 중 3개가 그 경우였다.
 *
 * 전력(kW→HP)은 어댑터가 `_powerUnit === 'HP'` 일 때만 변환하는데 폼은 그 값을
 * 보내지 않는다 — 그래서 여기서도 바꾸지 않는다.
 */
function displayUnit(param: ExtendedParamDef, imperial: boolean): string | undefined {
  const unit = param.unit;
  if (!unit || !imperial) return unit;
  if (unit === 'm' && (IMPERIAL_LENGTH_KEYS as readonly string[]).includes(param.name)) return 'ft';
  if (unit === '°C' && (IMPERIAL_TEMP_KEYS as readonly string[]).includes(param.name)) return '°F';
  return unit;
}

/**
 * 이 브라우저의 기준 국가가 Imperial 프로파일인가.
 *
 * 계산 실행기가 국가 프로파일에서 단위계를 정하므로(engine/constants/
 * safety-factors), 화면도 같은 출처를 봐야 라벨과 해석이 어긋나지 않는다.
 */
function useImperialUnits(): boolean {
  const { country } = useSettings();
  return getSafetyProfile(country as Parameters<typeof getSafetyProfile>[0]).unitSystem === 'Imperial';
}

function FieldLabel({ param, htmlFor, imperial = false }: { param: ExtendedParamDef; htmlFor?: string; imperial?: boolean }) {
  const unit = displayUnit(param, imperial);
  const content = (
    <>
      {param.description || param.name}
      {unit && (
        <span className="ml-1 font-normal text-[var(--text-tertiary)]">({unit})</span>
      )}
    </>
  );
  const className = 'mb-1.5 block text-sm font-medium text-[var(--text-primary)]';
  return htmlFor
    ? <label htmlFor={htmlFor} className={className}>{content}</label>
    : <div className={className}>{content}</div>;
}

const INPUT_CLS = (error?: string) => `
  h-10 w-full rounded-lg border bg-[var(--bg-primary)] px-3
  text-sm text-[var(--text-primary)] outline-none transition-colors
  placeholder:text-[var(--text-tertiary)]
  focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]
  ${error ? 'border-[var(--color-error)]' : 'border-[var(--border-default)]'}
`;

function NumberField({
  param, value, onChange, error, hideLabel, inputId,
}: {
  param: ExtendedParamDef; value: string; onChange: (val: string) => void; error?: string; hideLabel?: boolean; inputId: string;
}) {
  const imperial = useImperialUnits();
  const errorId = `${inputId}-error`;
  return (
    <div>
      {!hideLabel && <FieldLabel param={param} htmlFor={inputId} imperial={imperial} />}
      <div className="relative">
        <input
          id={inputId}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={param.min}
          max={param.max}
          /**
           * step 은 값의 유효성 제약이 아니라 스피너 증감폭 의도였는데, HTML5 는
           * 이것을 검증에 쓴다. 그리고 그 격자의 기준점은 `min` 이다 — min=0.01,
           * step=0.05 면 유효값이 0.01·0.06·…·0.56·0.61 이 되어 조명률 0.6 이나
           * 보수율 0.8 같은 표준값이 브라우저에서 거부된다. 거부되면 폼 제출이
           * **조용히** 막히고(React 검증 전에 차단되므로 오류 문구도 안 뜬다)
           * 사용자는 "계산하기가 안 먹는다"만 겪는다.
           *
           * 실측(2026-07-25): 7개 파라미터가 **자기 기본값부터** 거부돼 단락전류·
           * 아크플래시·조도·UPS·배터리·제동저항기 6종이 아무것도 건드리지 않고
           * 눌러도 제출 0회였다.
           *
           * 여기서 다루는 값은 전부 연속량이므로 격자에 맞출 이유가 없다. 범위
           * 제약(min·max)은 그대로 유효하다.
           */
          step="any"
          placeholder={param.placeholder ?? `${param.description || param.name} 입력`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`${INPUT_CLS(error)} pr-12`}
        />
        {displayUnit(param, imperial) && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--text-tertiary)]">
            {displayUnit(param, imperial)}
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} className="mt-1 flex items-center gap-1 text-xs text-[var(--color-error)]">
          <AlertCircle size={12} />{error}
        </p>
      )}
    </div>
  );
}

function TextField({
  param, value, onChange, error, hideLabel, inputId,
}: {
  param: ExtendedParamDef; value: string; onChange: (val: string) => void; error?: string; hideLabel?: boolean; inputId: string;
}) {
  const imperial = useImperialUnits();
  const errorId = `${inputId}-error`;
  return (
    <div>
      {!hideLabel && <FieldLabel param={param} htmlFor={inputId} imperial={imperial} />}
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={param.placeholder ?? `${param.description || param.name} 입력`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={INPUT_CLS(error)}
      />
      {error && (
        <p id={errorId} className="mt-1 flex items-center gap-1 text-xs text-[var(--color-error)]">
          <AlertCircle size={12} />{error}
        </p>
      )}
    </div>
  );
}

function SelectField({
  param, value, onChange, error, hideLabel, inputId,
}: {
  param: ExtendedParamDef; value: string; onChange: (val: string) => void; error?: string; hideLabel?: boolean; inputId: string;
}) {
  const imperial = useImperialUnits();
  const errorId = `${inputId}-error`;
  return (
    <div>
      {!hideLabel && <FieldLabel param={param} htmlFor={inputId} imperial={imperial} />}
      <select
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={INPUT_CLS(error)}
      >
        <option value="">선택하세요</option>
        {param.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="mt-1 flex items-center gap-1 text-xs text-[var(--color-error)]">
          <AlertCircle size={12} />{error}
        </p>
      )}
    </div>
  );
}

function BooleanField({
  param, value, onChange, inputId,
}: {
  param: ExtendedParamDef; value: boolean; onChange: (val: boolean) => void; inputId: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        id={inputId}
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={param.description || param.name}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full transition-colors ${value ? 'bg-[var(--color-primary)]' : 'bg-[var(--border-default)]'}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
      <div>
        <span className="text-sm font-medium text-[var(--text-primary)]">{param.description || param.name}</span>
      </div>
    </div>
  );
}

/** Render a single sub-field inside an array row (label hidden — column header carries it). */
function RowField({
  sub, value, onChange, inputId,
}: {
  sub: ExtendedParamDef; value: string | boolean; onChange: (v: string | boolean) => void; inputId: string;
}) {
  if (sub.type === 'boolean') {
    return <BooleanField param={sub} value={value as boolean} onChange={(v) => onChange(v)} inputId={inputId} />;
  }
  if (sub.type === 'string' && sub.options) {
    return <SelectField param={sub} value={value as string} onChange={(v) => onChange(v)} hideLabel inputId={inputId} />;
  }
  if (sub.type === 'string') {
    return <TextField param={sub} value={value as string} onChange={(v) => onChange(v)} hideLabel inputId={inputId} />;
  }
  return <NumberField param={sub} value={value as string} onChange={(v) => onChange(v)} hideLabel inputId={inputId} />;
}

function ArrayField({
  param, rows, onChange, error, inputId,
}: {
  param: ExtendedParamDef; rows: ArrayRow[]; onChange: (rows: ArrayRow[]) => void; error?: string; inputId: string;
}) {
  const imperial = useImperialUnits();
  const schema = param.itemSchema ?? [];
  const minItems = param.minItems ?? 1;

  const addRow = () => onChange([...rows, makeRow(schema)]);
  const removeRow = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const updateCell = (i: number, name: string, v: string | boolean) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [name]: v } : r)));

  return (
    <div>
      <FieldLabel param={param} imperial={imperial} />
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="rounded-lg border border-[var(--border-default)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-tertiary)]">#{i + 1}</span>
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={rows.length <= minItems}
                aria-label={`행 ${i + 1} 삭제`}
                className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--color-error)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {schema.map((sub) => {
                const rowInputId = `${inputId}-${i}-${sub.name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
                return (
                  <div key={sub.name}>
                    <label htmlFor={rowInputId} className="mb-1 block text-xs text-[var(--text-tertiary)]">
                      {sub.description || sub.name}{sub.unit ? ` (${sub.unit})` : ''}
                    </label>
                    <RowField
                      sub={sub}
                      inputId={rowInputId}
                      value={row[sub.name] ?? (sub.type === 'boolean' ? false : '')}
                      onChange={(v) => updateCell(i, sub.name, v)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 flex items-center gap-1 text-sm text-[var(--color-primary)] transition-colors hover:opacity-80"
      >
        <Plus size={14} /> 행 추가
      </button>
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-[var(--color-error)]">
          <AlertCircle size={12} />{error}
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Submit-value assembly (pure, testable)
// ═══════════════════════════════════════════════════════════════════════════════

/** Build a fresh array row from an item schema, using defaults. */
export function makeRow(schema: ExtendedParamDef[]): ArrayRow {
  const row: ArrayRow = {};
  for (const s of schema) {
    if (s.type === 'boolean') row[s.name] = (s.defaultValue as boolean) ?? false;
    else row[s.name] = s.defaultValue != null ? String(s.defaultValue) : '';
  }
  return row;
}

/** Parse a single scalar raw value per its param type. */
function parseScalar(param: ExtendedParamDef, raw: string | boolean): unknown {
  if (param.type === 'number') {
    const str = String(raw ?? '');
    return str.trim() === '' ? undefined : parseFloat(str);
  }
  if (param.type === 'boolean') return Boolean(raw);
  return raw as string;
}

/**
 * Assemble the submit payload from raw form state.
 * Numbers → parseFloat, arrays → object rows (or bare primitives when flatten).
 * Pure function so the form's data contract is unit-testable.
 */
export function assembleSubmitValues(
  params: ExtendedParamDef[],
  values: Record<string, FieldValue>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const param of params) {
    const raw = values[param.name];
    if (param.type === 'array') {
      const rows = (Array.isArray(raw) ? raw : []) as ArrayRow[];
      const schema = param.itemSchema ?? [];
      if (param.flatten && schema.length === 1) {
        const field = schema[0];
        out[param.name] = rows.map((r) => parseScalar(field, r[field.name])).filter((v) => v !== undefined);
      } else {
        out[param.name] = rows.map((r) => {
          const obj: Record<string, unknown> = {};
          for (const s of schema) obj[s.name] = parseScalar(s, r[s.name]);
          return obj;
        });
      }
    } else {
      out[param.name] = parseScalar(param, raw as string | boolean);
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Main Form
// ═══════════════════════════════════════════════════════════════════════════════

export default function CalculatorForm({
  params,
  onSubmit,
  isLoading = false,
  error,
  className = '',
  initialValues,
  mode = 'full',
}: CalculatorFormProps) {
  const extParams = params;
  const formId = useId().replace(/:/g, '');
  const formRef = useRef<HTMLFormElement>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // compact 모드: defaultValue 있는 필드 = 고급, 없는 필드 = 필수 (array는 항상 필수 표시)
  const requiredParams = mode === 'compact'
    ? extParams.filter((p) => p.type === 'array' || p.defaultValue === undefined)
    : extParams;
  const advancedParams = mode === 'compact'
    ? extParams.filter((p) => p.type !== 'array' && p.defaultValue !== undefined)
    : [];

  const [values, setValues] = useState<Record<string, FieldValue>>(() => {
    const initial: Record<string, FieldValue> = {};
    for (const p of extParams) {
      if (p.type === 'array') {
        const schema = p.itemSchema ?? [];
        const count = Math.max(p.defaultItems ?? p.minItems ?? 1, p.minItems ?? 1);
        initial[p.name] = Array.from({ length: count }, () => makeRow(schema));
        continue;
      }
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

  const updateValue = useCallback((name: string, val: FieldValue) => {
    setValues((prev) => ({ ...prev, [name]: val }));
    setFieldErrors((prev) => prev.filter((e) => e.field !== name));
  }, []);

  const validate = useCallback((): FieldError[] => {
    const errors: FieldError[] = [];

    for (const param of extParams) {
      const raw = values[param.name];

      if (param.type === 'array') {
        const rows = (Array.isArray(raw) ? raw : []) as ArrayRow[];
        const minItems = param.minItems ?? 1;
        if (rows.length < minItems) {
          errors.push({ field: param.name, message: `최소 ${minItems}개 항목이 필요합니다` });
          continue;
        }
        for (const s of param.itemSchema ?? []) {
          if (s.type === 'number' && s.required !== false) {
            const anyEmpty = rows.some((r) => String(r[s.name] ?? '').trim() === '');
            if (anyEmpty) {
              errors.push({ field: param.name, message: `모든 행의 "${s.description || s.name}"를 입력하세요` });
              break;
            }
          }
        }
        continue;
      }

      if (param.type === 'number') {
        const strVal = raw as string;
        if (param.required !== false && strVal.trim() === '') {
          errors.push({ field: param.name, message: '필수 입력 항목입니다' });
          continue;
        }
        if (strVal.trim() !== '') {
          const num = parseFloat(strVal);
          if (isNaN(num)) errors.push({ field: param.name, message: '유효한 숫자를 입력하세요' });
          else if (param.min !== undefined && num < param.min) errors.push({ field: param.name, message: `최소값: ${param.min}` });
          else if (param.max !== undefined && num > param.max) errors.push({ field: param.name, message: `최대값: ${param.max}` });
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
    // 불리언이 아니라 오류 목록을 돌려준다 — 호출부가 '어느 칸' 인지 알아야
    // 포커스를 옮길 수 있다.
    return errors;
  }, [extParams, values]);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const errors = validate();
      if (errors.length > 0) {
        /**
         * **조용히 거절하지 않는다.** 앞서는 제출이 막혀도 포커스가 버튼에
         * 그대로 남아, 스크린리더 사용자는 '계산하기' 를 눌러도 아무 소리도
         * 못 들었다(실측 2026-07-29: aria-invalid 3 개가 붙는데 포커스는
         * BUTTON 에 정지). 오류 칸으로 포커스를 옮기면 그 칸의 라벨과
         * aria-describedby 오류 문구가 그 자리에서 읽힌다.
         */
        const first = errors[0];
        const target = formRef.current?.querySelector<HTMLElement>(
          `#${CSS.escape(`${formId}-${first.field.replace(/[^a-zA-Z0-9_-]/g, '-')}`)}`,
        );
        target?.focus();
        return;
      }
      onSubmit(assembleSubmitValues(extParams, values));
    },
    [validate, extParams, values, onSubmit, formId],
  );

  const renderField = (param: ExtendedParamDef) => {
    const fieldError = fieldErrors.find((e) => e.field === param.name)?.message;
    const inputId = `${formId}-${param.name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

    if (param.type === 'array') {
      return (
        <ArrayField
          key={param.name}
          param={param}
          rows={(Array.isArray(values[param.name]) ? values[param.name] : []) as ArrayRow[]}
          onChange={(r) => updateValue(param.name, r)}
          error={fieldError}
          inputId={inputId}
        />
      );
    }

    if (param.type === 'boolean') {
      return (
        <BooleanField
          key={param.name}
          param={param}
          value={values[param.name] as boolean}
          onChange={(v) => updateValue(param.name, v)}
          inputId={inputId}
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
          inputId={inputId}
        />
      );
    }

    if (param.type === 'string') {
      return (
        <TextField
          key={param.name}
          param={param}
          value={values[param.name] as string}
          onChange={(v) => updateValue(param.name, v)}
          error={fieldError}
          inputId={inputId}
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
        inputId={inputId}
      />
    );
  };

  // noValidate: 브라우저 native 검증을 끈다. 안 끄면 min 위반(rangeUnderflow)
  // 에서 submit 이벤트 자체가 발화하지 않아(실측 2026-08-21: 음수 입력 후
  // 계산하기 → submitEventFired=false), 아래 handleSubmit 의 React 검증
  // —「최소값: X」인라인 문구 + 오류 칸 포커스 이동 — 이 **한 번도 돌지
  // 않는다.** 사용자는 제어 불가능한 브라우저 팝오버만 보거나, 버튼이 화면
  // 밖이면 아무것도 못 본다(구 BUG-014 의 실체). native 를 끄고 우리
  // 검증·문구·포커스가 전 경로를 소유하게 한다.
  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className={`space-y-4 ${className}`}>
      {/* 필수 필드 */}
      {requiredParams.map(renderField)}

      {/* 고급 옵션 (compact 모드에서 defaultValue 있는 필드) */}
      {advancedParams.length > 0 && (
        <div className="border-t border-[var(--border-default)] pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex w-full items-center gap-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ChevronDown size={16} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            고급 옵션 ({advancedParams.length}개)
          </button>
          {showAdvanced && <div className="mt-3 space-y-4">{advancedParams.map(renderField)}</div>}
        </div>
      )}

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
          <><Loader2 size={18} className="animate-spin" />계산 중...</>
        ) : (
          <><Calculator size={18} />계산하기</>
        )}
      </button>
    </form>
  );
}
