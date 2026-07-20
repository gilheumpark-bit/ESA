'use client';

import { BadgeCheck, Calculator, Link2, ListChecks, ShieldAlert } from 'lucide-react';

import type { DrawingIntelligenceReport as DrawingReport } from '@/agent/report/drawing-intelligence-report';
import { buildEvidenceNumbers, describeEquipmentType } from '@/components/drawing-evidence-labels';
import { explainDrawingHold } from '@/components/drawing-report-copy';

interface DrawingIntelligenceReportProps {
  report: DrawingReport;
  activeIds?: readonly string[];
  onSelect?: (ids: string[]) => void;
}

const FIELD_LABELS: Record<string, string> = {
  voltage_V: '전압',
  current_A: '전류',
  power_kW: '유효전력',
  apparentPower_kVA: '피상전력',
  capacity_kVA: '용량',
  cableSize_mm2: '도체 단면적',
  cableLength_m: '케이블 길이',
  powerFactor: '역률',
  frequency_Hz: '주파수',
  safetyMargin_percent: '안전율',
  ctPrimary_A: 'CT 1차 정격',
  ctSecondary_A: 'CT 2차 정격',
};

const CALCULATOR_LABELS: Record<string, string> = {
  'voltage-drop': '전압강하',
  'breaker-sizing': '차단기 정격',
  'transformer-capacity': '변압기 용량',
  'ct-sizing': 'CT 정격',
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function confidence(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function selectionPressed(active: ReadonlySet<string>, ids: readonly string[]): boolean {
  return ids.length > 0 && ids.every((id) => active.has(id));
}

export function DrawingIntelligenceReport({
  report,
  activeIds = [],
  onSelect,
}: DrawingIntelligenceReportProps) {
  const active = new Set(activeIds);
  const numbers = buildEvidenceNumbers(report.symbols, report.lines);
  const symbolsById = new Map(report.symbols.map((item) => [item.id, item]));
  const counts = [...report.symbols.reduce<Map<string, typeof report.symbols>>((map, item) => {
    map.set(item.type, [...(map.get(item.type) ?? []), item]);
    return map;
  }, new Map())].sort(([left], [right]) => left.localeCompare(right));

  const evidenceLabel = (id: string): string => (
    numbers.symbols[id] ?? numbers.lines[id] ?? id
  );
  const symbolLabel = (id: string): string => {
    const item = symbolsById.get(id);
    if (!item) return evidenceLabel(id);
    return `${numbers.symbols[id]} · ${item.label?.trim() || describeEquipmentType(item.type)}`;
  };

  return (
    <div className="border border-[var(--border-default)] bg-[var(--bg-primary)]">
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-secondary)] px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-[var(--color-accent)]">
              SLD EVIDENCE REGISTER · V2
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">전체 도면 판독표</h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
              기호·선로·표기값을 번호로 고정하고 독립 심사의 전기적 논리, 계산, 제안을 같은 근거에 연결했습니다.
            </p>
          </div>
          {report.verified95 ? (
            <div
              aria-label="실도면 골든셋 95퍼센트 검증 통과"
              className="flex items-center gap-2 border border-[var(--color-success)] bg-emerald-50 px-3 py-2 text-sm font-semibold text-[var(--color-success)]"
            >
              <BadgeCheck size={17} aria-hidden="true" />
              실도면 검증 95%+
            </div>
          ) : (
            <div className="border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)]">
              실도면 성능 실증 미완료 · 기능 결과와 분리
            </div>
          )}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden border border-[var(--border-default)] bg-[var(--border-default)] sm:grid-cols-4">
          {[
            ['기기', `${report.symbols.length}개`],
            ['선로', `${report.lines.length}개`],
            ['연결관계', `${report.relations.length}개`],
            ['근거 연결률', `${Math.round(report.traceability * 100)}%`],
          ].map(([term, value]) => (
            <div key={term} className="bg-[var(--bg-primary)] px-4 py-3">
              <dt className="text-xs text-[var(--text-tertiary)]">{term}</dt>
              <dd className="mt-1 font-mono text-lg font-semibold text-[var(--text-primary)]">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section aria-labelledby="quantities-heading" className="border-b border-[var(--border-default)] px-5 py-6">
        <div className="mb-4 flex items-center gap-2">
          <ListChecks size={18} className="text-[var(--color-primary)]" aria-hidden="true" />
          <h3 id="quantities-heading" className="text-base font-semibold text-[var(--text-primary)]">기기 수량</h3>
        </div>
        {counts.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">확정 가능한 기기가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto border border-[var(--border-default)]">
            <table className="w-full min-w-[620px] border-collapse text-left text-sm">
              <thead className="bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)]">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-semibold">기기 종류</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">수량</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">도면 번호</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">평균 신뢰도</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {counts.map(([type, items]) => {
                  const ids = items.map((item) => item.id);
                  const average = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
                  return (
                    <tr key={type}>
                      <th scope="row" className="px-3 py-3 font-medium text-[var(--text-primary)]">{describeEquipmentType(type)}</th>
                      <td className="px-3 py-3 font-mono">{items.length}</td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          aria-pressed={selectionPressed(active, ids)}
                          onClick={() => onSelect?.(ids)}
                          className="min-h-11 text-left font-mono text-xs font-semibold text-[var(--color-primary)] underline decoration-dotted underline-offset-4"
                        >
                          {items.map((item) => numbers.symbols[item.id]).join(', ')}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-mono">{confidence(average)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="relations-heading" className="border-b border-[var(--border-default)] px-5 py-6">
        <div className="mb-4 flex items-center gap-2">
          <Link2 size={18} className="text-[var(--color-primary)]" aria-hidden="true" />
          <h3 id="relations-heading" className="text-base font-semibold text-[var(--text-primary)]">기기·선로 연결관계</h3>
        </div>
        {report.relations.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">확정 가능한 연결관계가 없습니다. 미확인 항목을 확인하세요.</p>
        ) : (
          <div className="overflow-x-auto border border-[var(--border-default)]">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)]">
                <tr>
                  <th scope="col" className="px-3 py-2.5">관계</th>
                  <th scope="col" className="px-3 py-2.5">시작 기기</th>
                  <th scope="col" className="px-3 py-2.5">선로</th>
                  <th scope="col" className="px-3 py-2.5">도착 기기</th>
                  <th scope="col" className="px-3 py-2.5">위치</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {report.relations.map((item, index) => {
                  const ids = unique([item.from, item.line, item.to, ...item.evidenceIds]);
                  return (
                    <tr key={item.id}>
                      <th scope="row" className="px-3 py-3 font-mono text-xs">R{String(index + 1).padStart(2, '0')}</th>
                      <td className="px-3 py-3">{symbolLabel(item.from)}</td>
                      <td className="px-3 py-3 font-mono">{evidenceLabel(item.line)}</td>
                      <td className="px-3 py-3">{symbolLabel(item.to)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          aria-pressed={selectionPressed(active, ids)}
                          onClick={() => onSelect?.(ids)}
                          className="min-h-11 font-semibold text-[var(--color-primary)] underline decoration-dotted underline-offset-4"
                        >
                          {item.page}페이지에서 보기
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="ratings-heading" className="border-b border-[var(--border-default)] px-5 py-6">
        <h3 id="ratings-heading" className="text-base font-semibold text-[var(--text-primary)]">판독된 정격·수치 체크리스트</h3>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">도면에 실제 표기되고 현재 근거로 연결된 값만 표시합니다.</p>
        {report.quantities.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">확정 가능한 표기값이 없습니다.</p>
        ) : (
          <div className="mt-4 overflow-x-auto border border-[var(--border-default)]">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead className="bg-[var(--bg-secondary)] text-xs text-[var(--text-secondary)]">
                <tr>
                  <th scope="col" className="px-3 py-2.5">항목</th>
                  <th scope="col" className="px-3 py-2.5">판독값</th>
                  <th scope="col" className="px-3 py-2.5">페이지</th>
                  <th scope="col" className="px-3 py-2.5">근거</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {report.quantities.map((item, index) => (
                  <tr key={`${item.evidenceId}:${item.field}:${index}`}>
                    <th scope="row" className="px-3 py-3 font-medium">{FIELD_LABELS[item.field] ?? item.field}</th>
                    <td className="px-3 py-3 font-mono font-semibold">{String(item.value)} {item.unit}</td>
                    <td className="px-3 py-3">{item.page}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        aria-pressed={active.has(item.evidenceId)}
                        onClick={() => onSelect?.([item.evidenceId])}
                        className="min-h-11 font-mono text-xs font-semibold text-[var(--color-primary)] underline decoration-dotted underline-offset-4"
                      >
                        {item.evidenceId}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid border-b border-[var(--border-default)] lg:grid-cols-2 lg:divide-x lg:divide-[var(--border-default)]">
        <section aria-labelledby="issues-heading" className="px-5 py-6">
          <h3 id="issues-heading" className="text-base font-semibold text-[var(--text-primary)]">문제 및 전기적 교차검증</h3>
          {report.issues.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">현재 근거에서 확정된 문제는 없습니다.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--border-default)] border-y border-[var(--border-default)]">
              {report.issues.map((item) => {
                const ids = unique(item.evidence.stableIds);
                return (
                  <li key={item.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="border border-[var(--color-warning)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-warning)]">{item.judgment}</span>
                      <span className="text-xs text-[var(--text-tertiary)]">{item.code}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">{item.message}</p>
                    {ids.length > 0 && (
                      <button type="button" aria-pressed={selectionPressed(active, ids)} onClick={() => onSelect?.(ids)} className="mt-2 min-h-11 text-xs font-semibold text-[var(--color-primary)] underline decoration-dotted underline-offset-4">
                        근거 {ids.map(evidenceLabel).join(', ')} 보기
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="dissent-heading" className="border-t border-[var(--border-default)] px-5 py-6 lg:border-t-0">
          <h3 id="dissent-heading" className="text-base font-semibold text-[var(--text-primary)]">독립 심사 이견</h3>
          {report.conflicts.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">현재 근거에 남은 독립 심사 이견이 없습니다.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--border-default)] border-y border-[var(--border-default)]">
              {report.conflicts.map((item) => {
                const ids = unique(item.graphEvidenceIds);
                return (
                  <li key={item.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="border border-[var(--color-error)] px-2 py-0.5 font-bold text-[var(--color-error)]">{item.status.toUpperCase()}</span>
                      <span className="text-[var(--text-tertiary)]">{item.topic} · {item.reasonCode}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">{item.message}</p>
                    {ids.length > 0 && (
                      <button type="button" aria-pressed={selectionPressed(active, ids)} onClick={() => onSelect?.(ids)} className="mt-2 min-h-11 text-xs font-semibold text-[var(--color-primary)] underline decoration-dotted underline-offset-4">
                        관련 근거 {ids.map(evidenceLabel).join(', ')} 보기
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="calculations-heading" className="border-b border-[var(--border-default)] px-5 py-6">
        <div className="flex items-center gap-2">
          <Calculator size={18} className="text-[var(--color-primary)]" aria-hidden="true" />
          <h3 id="calculations-heading" className="text-base font-semibold text-[var(--text-primary)]">근거 기반 계산</h3>
        </div>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">계산 실행과 설계 적합 판정은 구분됩니다. 자동 계산 결과는 담당 기술자 확인 전 HOLD입니다.</p>
        {report.calculations.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">현재 도면 근거만으로 실행 가능한 계산이 없습니다.</p>
        ) : (
          <div className="mt-4 grid gap-px border border-[var(--border-default)] bg-[var(--border-default)] md:grid-cols-2">
            {report.calculations.map((item) => {
              const ids = unique(item.inputEvidence.map((evidence) => evidence.evidenceId));
              const result = item.calculatorResult;
              return (
                <article key={item.id} className="bg-[var(--bg-primary)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-semibold text-[var(--text-primary)]">{CALCULATOR_LABELS[item.calculatorId] ?? item.calculatorId}</h4>
                    <span className="border border-[var(--color-warning)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-warning)]">{item.judgment}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-[var(--text-tertiary)]">{item.scopeKey}</p>
                  {result && result.value !== null && (
                    <p className="mt-3 font-mono text-lg font-semibold text-[var(--text-primary)]">{String(result.value)} {result.unit}</p>
                  )}
                  <button type="button" aria-pressed={selectionPressed(active, ids)} onClick={() => onSelect?.(ids)} className="mt-3 min-h-11 text-xs font-semibold text-[var(--color-primary)] underline decoration-dotted underline-offset-4">
                    입력 근거 {ids.join(', ')} 보기
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="recommendations-heading" className="border-b border-[var(--border-default)] px-5 py-6">
        <h3 id="recommendations-heading" className="text-base font-semibold text-[var(--text-primary)]">개선 제안</h3>
        {report.recommendations.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-secondary)]">현재 도면 근거로 확정할 수 있는 개선 제안이 없습니다.</p>
        ) : (
          <ol className="mt-4 divide-y divide-[var(--border-default)] border-y border-[var(--border-default)]">
            {report.recommendations.map((item, index) => (
              <li key={item.id} className="grid gap-3 py-4 md:grid-cols-[3rem_1fr_auto] md:items-start">
                <span className="font-mono text-sm font-semibold text-[var(--color-accent)]">P{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-[var(--text-primary)]">{item.title}</h4>
                    <span className="text-xs text-[var(--text-tertiary)]">영향 {item.impact}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{item.description}</p>
                </div>
                <button type="button" aria-pressed={selectionPressed(active, item.evidenceIds)} onClick={() => onSelect?.([...item.evidenceIds])} className="min-h-11 text-left text-xs font-semibold text-[var(--color-primary)] underline decoration-dotted underline-offset-4 md:text-right">
                  근거 {item.evidenceIds.map(evidenceLabel).join(', ')}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="holds-heading" className="bg-amber-50/50 px-5 py-6 dark:bg-amber-950/10">
        <div className="flex items-center gap-2">
          <ShieldAlert size={18} className="text-[var(--color-warning)]" aria-hidden="true" />
          <h3 id="holds-heading" className="text-base font-semibold text-[var(--text-primary)]">미확인·보류</h3>
        </div>
        {report.holds.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-secondary)]">보고서 계약상 보류 항목이 없습니다.</p>
        ) : (
          <ul className="mt-4 grid gap-px border border-amber-200 bg-amber-200 md:grid-cols-2 dark:border-amber-900 dark:bg-amber-900">
            {report.holds.map((code) => {
              const explanation = explainDrawingHold(code);
              return (
                <li key={code} className="bg-[var(--bg-primary)] p-4">
                  <p className="font-semibold text-[var(--text-primary)]">{explanation.title}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{explanation.detail}</p>
                  <p className="mt-2 font-mono text-[10px] text-[var(--text-tertiary)]">{code}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
