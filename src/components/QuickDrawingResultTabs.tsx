'use client';

import { useRef, type KeyboardEvent } from 'react';

export const QUICK_DRAWING_RESULT_TAB_IDS = [
  'summary',
  'devices',
  'connections',
  'calculations',
  'review',
] as const;

export type QuickDrawingResultTab = (typeof QUICK_DRAWING_RESULT_TAB_IDS)[number];
export type QuickDrawingResultCounts = Record<Exclude<QuickDrawingResultTab, 'summary'>, number>;

const TAB_LABELS: Record<QuickDrawingResultTab, string> = {
  summary: '요약',
  devices: '기기',
  connections: '결선',
  calculations: '계산',
  review: '검토',
};

export function quickDrawingResultTabId(tab: QuickDrawingResultTab) {
  return `quick-drawing-result-tab-${tab}`;
}

export function quickDrawingResultPanelId(tab: QuickDrawingResultTab) {
  return `quick-drawing-result-panel-${tab}`;
}

interface QuickDrawingResultTabsProps {
  activeTab: QuickDrawingResultTab;
  counts: QuickDrawingResultCounts;
  onTabChange: (tab: QuickDrawingResultTab) => void;
}

/** 빠른 도면 결과를 한 화면의 다섯 관점으로 전환하는 WAI-ARIA 탭 목록. */
export function QuickDrawingResultTabs({
  activeTab,
  counts,
  onTabChange,
}: QuickDrawingResultTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activateAt = (index: number) => {
    const nextTab = QUICK_DRAWING_RESULT_TAB_IDS[index];
    if (!nextTab) return;
    onTabChange(nextTab);
    tabRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % QUICK_DRAWING_RESULT_TAB_IDS.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + QUICK_DRAWING_RESULT_TAB_IDS.length) % QUICK_DRAWING_RESULT_TAB_IDS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = QUICK_DRAWING_RESULT_TAB_IDS.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    activateAt(nextIndex);
  };

  return (
    <div className="min-w-0 max-w-full">
      <p className="mb-1 text-right text-[11px] text-[var(--text-tertiary)] sm:hidden">
        항목을 좌우로 밀어 더 볼 수 있습니다.
      </p>
      <div className="w-full min-w-0 max-w-full overflow-x-auto border-b border-[var(--border-default)] [scrollbar-width:thin]">
        <div
          role="tablist"
          aria-label="도면 분석 결과 항목"
          aria-orientation="horizontal"
          className="flex min-w-[430px] items-end sm:min-w-0"
        >
          {QUICK_DRAWING_RESULT_TAB_IDS.map((tab, index) => {
            const selected = tab === activeTab;
            const count = tab === 'summary' ? null : counts[tab];

            return (
              <button
                key={tab}
                ref={(node) => { tabRefs.current[index] = node; }}
                id={quickDrawingResultTabId(tab)}
                type="button"
                role="tab"
                aria-label={count === null ? TAB_LABELS[tab] : `${TAB_LABELS[tab]} ${count}`}
                aria-selected={selected}
                aria-controls={quickDrawingResultPanelId(tab)}
                tabIndex={selected ? 0 : -1}
                onClick={() => onTabChange(tab)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={`min-h-11 flex-1 touch-manipulation whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-[border-color,color,background-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary)] ${
                  selected
                    ? 'border-[var(--color-primary)] bg-[var(--bg-secondary)] text-[var(--color-primary)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>{TAB_LABELS[tab]}</span>
                {count !== null && (
                  <span className="ml-1 font-[family-name:var(--font-mono)] text-xs tabular-nums">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
