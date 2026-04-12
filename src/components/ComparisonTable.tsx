'use client';

/**
 * ComparisonTable Component — Side-by-side calculation comparison
 *
 * PART 1: Types
 * PART 2: Cell renderers
 * PART 3: Main table component
 */

import type { CalcResult } from '@/engine/standards/types';
import type { Receipt } from '@/engine/receipt/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface Scenario {
  /** Display label (e.g. "A안", "B안") */
  label: string;
  /** Input values snapshot */
  inputs: Record<string, unknown>;
  /** Calculation result */
  result: CalcResult | null;
  /** Full receipt (optional) */
  receipt?: Receipt | null;
}

interface ComparisonTableProps {
  /** 2-4 scenarios to compare */
  scenarios: Scenario[];
  /** Parameter labels map (key → display name) */
  paramLabels?: Record<string, string>;
  /** Parameter units map */
  paramUnits?: Record<string, string>;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Cell Renderers
// ═══════════════════════════════════════════════════════════════════════════════

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'number') {
    return Number.isInteger(val) ? String(val) : val.toFixed(4);
  }
  return String(val);
}

/** Find the "best" scenario index based on judgment pass */
function findBestIndex(scenarios: Scenario[]): number | null {
  const passIndices = scenarios
    .map((s, i) => (s.result?.judgment?.pass ? i : -1))
    .filter((i) => i >= 0);

  if (passIndices.length === 0) return null;
  // Among passing scenarios, first one is "best" (simplest heuristic)
  return passIndices[0];
}

function DiffCell({ values, bestIdx }: { values: string[]; bestIdx: number | null }) {
  // Find which values differ
  const unique = new Set(values);
  const allSame = unique.size <= 1;

  return (
    <>
      {values.map((val, i) => {
        let cellClass = 'px-3 py-2 text-sm text-center border-r border-[var(--border-default)] last:border-r-0';

        if (!allSame) {
          cellClass += ' bg-yellow-50 dark:bg-yellow-900/10';
        }
        if (i === bestIdx) {
          cellClass += ' font-semibold text-green-700 dark:text-green-400';
        }

        return (
          <td key={i} className={cellClass}>
            {val}
          </td>
        );
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Main Table
// ═══════════════════════════════════════════════════════════════════════════════

export default function ComparisonTable({
  scenarios,
  paramLabels = {},
  paramUnits = {},
  className = '',
}: ComparisonTableProps) {
  if (scenarios.length < 2 || scenarios.length > 4) {
    return (
      <p className="text-sm text-[var(--text-tertiary)]">
        비교에는 2~4개의 시나리오가 필요합니다.
      </p>
    );
  }

  // Collect all input parameter keys across scenarios
  const allParamKeys = Array.from(
    new Set(scenarios.flatMap((s) => Object.keys(s.inputs))),
  );

  const bestIdx = findBestIndex(scenarios);

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse overflow-hidden rounded-xl border border-[var(--border-default)]">
        {/* Header: scenario labels */}
        <thead>
          <tr className="bg-[var(--bg-tertiary)]">
            <th className="border-r border-[var(--border-default)] px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)]">
              항목
            </th>
            {scenarios.map((s, i) => (
              <th
                key={i}
                className={`border-r border-[var(--border-default)] px-4 py-3 text-center text-sm font-semibold last:border-r-0 ${
                  i === bestIdx
                    ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                    : 'text-[var(--text-primary)]'
                }`}
              >
                {s.label}
                {i === bestIdx && (
                  <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-xs dark:bg-green-900/30">
                    추천
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="bg-[var(--bg-primary)]">
          {/* Input rows */}
          {allParamKeys.map((key) => {
            const values = scenarios.map((s) => formatCellValue(s.inputs[key]));
            const label = paramLabels[key] ?? key;
            const unit = paramUnits[key];

            return (
              <tr key={key} className="border-t border-[var(--border-default)]">
                <td className="border-r border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-secondary)]">
                  {label}
                  {unit && (
                    <span className="ml-1 text-xs text-[var(--text-tertiary)]">({unit})</span>
                  )}
                </td>
                <DiffCell values={values} bestIdx={bestIdx} />
              </tr>
            );
          })}

          {/* Separator */}
          <tr>
            <td
              colSpan={scenarios.length + 1}
              className="border-t-2 border-[var(--border-default)] bg-[var(--bg-tertiary)] px-4 py-1.5 text-xs font-semibold text-[var(--text-tertiary)]"
            >
              결과
            </td>
          </tr>

          {/* Result value row */}
          <tr className="border-t border-[var(--border-default)]">
            <td className="border-r border-[var(--border-default)] px-4 py-2 text-sm font-medium text-[var(--text-primary)]">
              계산 결과
            </td>
            {scenarios.map((s, i) => {
              const val = s.result ? `${formatCellValue(s.result.value)} ${s.result.unit}` : '-';
              return (
                <td
                  key={i}
                  className={`border-r border-[var(--border-default)] px-3 py-2 text-center text-sm font-semibold last:border-r-0 ${
                    i === bestIdx ? 'text-green-700 dark:text-green-400' : 'text-[var(--text-primary)]'
                  }`}
                >
                  {val}
                </td>
              );
            })}
          </tr>

          {/* Judgment row */}
          <tr className="border-t border-[var(--border-default)]">
            <td className="border-r border-[var(--border-default)] px-4 py-2 text-sm font-medium text-[var(--text-primary)]">
              판정
            </td>
            {scenarios.map((s, i) => {
              const j = s.result?.judgment;
              if (!j) {
                return (
                  <td key={i} className="border-r border-[var(--border-default)] px-3 py-2 text-center text-sm text-[var(--text-tertiary)] last:border-r-0">
                    -
                  </td>
                );
              }

              const isPass = j.pass;
              return (
                <td
                  key={i}
                  className={`border-r border-[var(--border-default)] px-3 py-2 text-center text-sm font-semibold last:border-r-0 ${
                    isPass
                      ? 'bg-green-50 text-green-700 dark:bg-green-900/10 dark:text-green-400'
                      : 'bg-red-50 text-red-700 dark:bg-red-900/10 dark:text-red-400'
                  }`}
                >
                  {isPass ? 'PASS' : 'FAIL'}
                  <p className="mt-0.5 text-xs font-normal opacity-80">{j.message}</p>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
