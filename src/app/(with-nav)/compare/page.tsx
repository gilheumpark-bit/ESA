'use client';

/**
 * Comparison Mode Page — /compare
 *
 * PART 1: Types & constants
 * PART 2: Scenario input form
 * PART 3: Main page component with URL sync
 * PART 4: Multi-standard comparison (KEC vs NEC vs IEC)
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  GitCompareArrows,
  Plus,
  Trash2,
  Calculator,
  Loader2,
  Share2,
} from 'lucide-react';
import ComparisonTable, { type Scenario } from '@/components/ComparisonTable';
import type { CalcResult } from '@/engine/standards/types';
import type { Receipt } from '@/engine/receipt/types';
import type { ExtendedParamDef } from '@/components/CalculatorForm';
import { compareVoltageDropLimits, type ComparisonReport } from '@/engine/chain/standard-comparator';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Constants
// ═══════════════════════════════════════════════════════════════════════════════

const CALCULATOR_OPTIONS: { value: string; label: string; params: ExtendedParamDef[] }[] = [
  {
    value: 'voltage-drop',
    label: '전압 강하 계산',
    params: [
      { name: 'voltage', type: 'number', unit: 'V', description: '공급 전압', defaultValue: 380 },
      { name: 'current', type: 'number', unit: 'A', description: '부하 전류' },
      { name: 'length', type: 'number', unit: 'm', description: '전선 길이' },
      { name: 'crossSection', type: 'number', unit: 'mm\u00B2', description: '전선 단면적' },
      { name: 'powerFactor', type: 'number', unit: '', description: '역률', defaultValue: 0.85, step: 0.01 },
    ],
  },
  {
    value: 'cable-sizing',
    label: '케이블 사이징',
    params: [
      { name: 'current', type: 'number', unit: 'A', description: '설계 전류' },
      { name: 'ambientTemp', type: 'number', unit: '\u00B0C', description: '주위 온도', defaultValue: 30 },
      { name: 'groupingFactor', type: 'number', unit: '', description: '다조 보정계수', defaultValue: 1, step: 0.01 },
    ],
  },
  {
    value: 'transformer-capacity',
    label: '변압기 용량 선정',
    params: [
      { name: 'totalLoad', type: 'number', unit: 'kW', description: '총 부하 용량' },
      { name: 'demandFactor', type: 'number', unit: '', description: '수용률', defaultValue: 0.7, step: 0.01 },
      { name: 'growthFactor', type: 'number', unit: '', description: '장래 증설 계수', defaultValue: 1.25, step: 0.05 },
      { name: 'powerFactor', type: 'number', unit: '', description: '역률', defaultValue: 0.85, step: 0.01 },
    ],
  },
  {
    value: 'short-circuit',
    label: '단락 전류 계산',
    params: [
      { name: 'voltage', type: 'number', unit: 'V', description: '계통 전압', defaultValue: 380 },
      { name: 'transformerCapacity', type: 'number', unit: 'kVA', description: '변압기 용량' },
      { name: 'impedancePercent', type: 'number', unit: '%', description: '%임피던스', defaultValue: 5, step: 0.1 },
    ],
  },
];

const SCENARIO_LABELS = ['A안', 'B안', 'C안', 'D안'];

interface ScenarioState {
  label: string;
  inputs: Record<string, string>;
  result: CalcResult | null;
  receipt: Receipt | null;
  isLoading: boolean;
  error: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Scenario Input Form
// ═══════════════════════════════════════════════════════════════════════════════

function ScenarioForm({
  scenario,
  params,
  index,
  onInputChange,
  onCalculate,
  onRemove,
  canRemove,
}: {
  scenario: ScenarioState;
  params: ExtendedParamDef[];
  index: number;
  onInputChange: (idx: number, key: string, val: string) => void;
  onCalculate: (idx: number) => void;
  onRemove: (idx: number) => void;
  canRemove: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{scenario.label}</h3>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="rounded p-1 text-[var(--text-tertiary)] transition-colors hover:text-red-500"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {params.map((p) => (
          <div key={p.name}>
            <label className="mb-1 block text-xs text-[var(--text-tertiary)]">
              {p.description ?? p.name}
              {p.unit && ` (${p.unit})`}
            </label>
            <input
              type="number"
              value={scenario.inputs[p.name] ?? ''}
              onChange={(e) => onInputChange(index, p.name, e.target.value)}
              step={p.step ?? 'any'}
              placeholder={p.defaultValue != null ? String(p.defaultValue) : ''}
              className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onCalculate(index)}
        disabled={scenario.isLoading}
        className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary)] text-xs font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
      >
        {scenario.isLoading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Calculator size={14} />
        )}
        계산
      </button>

      {scenario.error && (
        <p className="mt-2 text-xs text-red-500">{scenario.error}</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

function createEmptyScenario(label: string, params: ExtendedParamDef[]): ScenarioState {
  const inputs: Record<string, string> = {};
  for (const p of params) {
    inputs[p.name] = p.defaultValue != null ? String(p.defaultValue) : '';
  }
  return { label, inputs, result: null, receipt: null, isLoading: false, error: null };
}

export default function ComparePage() {
  const [selectedCalc, setSelectedCalc] = useState(CALCULATOR_OPTIONS[0].value);
  const [scenarios, setScenarios] = useState<ScenarioState[]>([]);

  const calcOption = useMemo(
    () => CALCULATOR_OPTIONS.find((c) => c.value === selectedCalc) ?? CALCULATOR_OPTIONS[0],
    [selectedCalc],
  );

  // Read URL params on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const calcParam = params.get('calc');
    if (calcParam) {
      const found = CALCULATOR_OPTIONS.find((c) => c.value === calcParam);
      if (found) {
        setSelectedCalc(found.value);

        // Parse scenario data from URL
        const newScenarios: ScenarioState[] = [];
        for (const key of ['a', 'b', 'c', 'd']) {
          const raw = params.get(key);
          if (raw) {
            try {
              const parsed = JSON.parse(decodeURIComponent(raw));
              const label = SCENARIO_LABELS[newScenarios.length] ?? `${key.toUpperCase()}안`;
              newScenarios.push({
                label,
                inputs: parsed,
                result: null,
                receipt: null,
                isLoading: false,
                error: null,
              });
            } catch {
              // Skip invalid data
            }
          }
        }

        if (newScenarios.length >= 2) {
          setScenarios(newScenarios);
          return;
        }
      }
    }

    // Default: 2 scenarios
    setScenarios([
      createEmptyScenario('A안', calcOption.params),
      createEmptyScenario('B안', calcOption.params),
    ]);
  }, []);

  // Reset scenarios when calculator changes
  const handleCalcChange = useCallback(
    (value: string) => {
      setSelectedCalc(value);
      const opt = CALCULATOR_OPTIONS.find((c) => c.value === value) ?? CALCULATOR_OPTIONS[0];
      setScenarios([
        createEmptyScenario('A안', opt.params),
        createEmptyScenario('B안', opt.params),
      ]);
    },
    [],
  );

  const handleInputChange = useCallback(
    (idx: number, key: string, val: string) => {
      setScenarios((prev) =>
        prev.map((s, i) =>
          i === idx ? { ...s, inputs: { ...s.inputs, [key]: val } } : s,
        ),
      );
    },
    [],
  );

  const handleCalculate = useCallback(
    async (idx: number) => {
      setScenarios((prev) =>
        prev.map((s, i) =>
          i === idx ? { ...s, isLoading: true, error: null } : s,
        ),
      );

      try {
        // Parse inputs
        const scenario = scenarios[idx];
        const parsedInputs: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(scenario.inputs)) {
          const num = parseFloat(v);
          parsedInputs[k] = isNaN(num) ? v : num;
        }

        const res = await fetch('/api/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ calculatorId: selectedCalc, inputs: parsedInputs }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Calculation failed (${res.status})`);
        }

        const data = await res.json();

        setScenarios((prev) =>
          prev.map((s, i) =>
            i === idx
              ? { ...s, result: data.result, receipt: data.receipt, isLoading: false }
              : s,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setScenarios((prev) =>
          prev.map((s, i) =>
            i === idx ? { ...s, isLoading: false, error: msg } : s,
          ),
        );
      }
    },
    [scenarios, selectedCalc],
  );

  const handleAddScenario = useCallback(() => {
    if (scenarios.length >= 4) return;
    const label = SCENARIO_LABELS[scenarios.length] ?? `${scenarios.length + 1}안`;
    setScenarios((prev) => [...prev, createEmptyScenario(label, calcOption.params)]);
  }, [scenarios.length, calcOption.params]);

  const handleRemoveScenario = useCallback((idx: number) => {
    setScenarios((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((s, i) => ({ ...s, label: SCENARIO_LABELS[i] ?? s.label }));
    });
  }, []);

  const handleShare = useCallback(() => {
    const params = new URLSearchParams();
    params.set('calc', selectedCalc);
    const keys = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < scenarios.length; i++) {
      params.set(keys[i], encodeURIComponent(JSON.stringify(scenarios[i].inputs)));
    }
    const url = `${window.location.origin}/compare?${params.toString()}`;
    history.replaceState(null, '', `/compare?${params.toString()}`);
    navigator.clipboard.writeText(url).then(
      () => alert('공유 링크가 복사되었습니다'),
      () => prompt('공유 링크:', url),
    );
  }, [selectedCalc, scenarios]);

  // Build comparison data
  const comparisonScenarios: Scenario[] = useMemo(
    () =>
      scenarios.map((s) => ({
        label: s.label,
        inputs: Object.fromEntries(
          Object.entries(s.inputs).map(([k, v]) => {
            const n = parseFloat(v);
            return [k, isNaN(n) ? v : n];
          }),
        ),
        result: s.result?.result ?? s.result ?? null,
        receipt: s.receipt,
      })),
    [scenarios],
  );

  const hasAnyResult = scenarios.some((s) => s.result !== null);

  // Build param labels and units from calc params
  const paramLabels = useMemo(
    () => Object.fromEntries(calcOption.params.map((p) => [p.name, p.description ?? p.name])),
    [calcOption.params],
  );
  const paramUnits = useMemo(
    () => Object.fromEntries(calcOption.params.filter((p) => p.unit).map((p) => [p.name, p.unit!])),
    [calcOption.params],
  );

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      {/* Header */}
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <GitCompareArrows size={28} className="text-[var(--color-primary)]" />
            비교 계산
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            A/B/C/D 시나리오 비교 분석
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Calculator selector + actions */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <select
            value={selectedCalc}
            onChange={(e) => handleCalcChange(e.target.value)}
            className="h-10 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm font-medium text-[var(--text-primary)]"
          >
            {CALCULATOR_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          {scenarios.length < 4 && (
            <button
              type="button"
              onClick={handleAddScenario}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              <Plus size={16} />
              시나리오 추가
            </button>
          )}

          <button
            type="button"
            onClick={handleShare}
            className="ml-auto flex h-10 items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            <Share2 size={16} />
            공유
          </button>
        </div>

        {/* Side-by-side forms */}
        <div className={`mb-6 grid gap-4 ${
          scenarios.length === 2 ? 'grid-cols-2' :
          scenarios.length === 3 ? 'grid-cols-3' :
          'grid-cols-4'
        }`}>
          {scenarios.map((s, i) => (
            <ScenarioForm
              key={i}
              scenario={s}
              params={calcOption.params}
              index={i}
              onInputChange={handleInputChange}
              onCalculate={handleCalculate}
              onRemove={handleRemoveScenario}
              canRemove={scenarios.length > 2}
            />
          ))}
        </div>

        {/* Comparison table */}
        {hasAnyResult && (
          <div>
            <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
              비교 결과
            </h2>
            <ComparisonTable
              scenarios={comparisonScenarios}
              paramLabels={paramLabels}
              paramUnits={paramUnits}
            />
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
              * 규격 기준에 따라 PASS/FAIL이 판정됩니다. 녹색 배경은 추천 방안을 나타냅니다.
            </p>
          </div>
        )}
        {/* 다국가 기준 비교 섹션 */}
        <div className="mt-8 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-6">
          <h2 className="mb-4 text-lg font-bold text-[var(--text-primary)]">
            다국가 전압강하 기준 비교
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-left text-xs text-[var(--text-tertiary)]">
                  <th className="pb-2 pr-4">기준</th>
                  <th className="pb-2 pr-4">국가</th>
                  <th className="pb-2 pr-4">전압강하 허용치</th>
                  <th className="pb-2 pr-4">조항</th>
                  <th className="pb-2">비고</th>
                </tr>
              </thead>
              <tbody>
                {compareVoltageDropLimits().entries.map((entry, i) => (
                  <tr key={i} className="border-b border-[var(--border-default)] last:border-0">
                    <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">{entry.standard}</td>
                    <td className="py-2 pr-4 text-[var(--text-secondary)]">{entry.country}</td>
                    <td className="py-2 pr-4 font-mono text-[var(--color-primary)]">{entry.vdLimit}%</td>
                    <td className="py-2 pr-4 text-xs text-[var(--text-tertiary)]">{entry.clause}</td>
                    <td className="py-2 text-xs text-[var(--text-tertiary)]">{entry.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
